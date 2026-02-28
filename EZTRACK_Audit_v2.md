# EZTRACK Backend — Full Audit v2
**Date:** February 28, 2026  
**Scope:** All uploaded source files, cross-referenced against EZTRACK_Master_Audit.md  
**Simulation Basis:** 10,000 Daily Active Users (~50 active gyms, ~200 members/gym)  
**Roles:** Senior Backend Architect + Backend Security Engineer  

---

## Quick Reference: File Disposition

Before the deep-dive, here is the definitive answer on which files to keep, merge, or delete.

| File | Status | Reason |
|---|---|---|
| `core/aadhaar_crypto.py` | **KEEP** | Self-contained, correctly scoped |
| `core/audit_utils.py` | **KEEP** | Clean utility, used correctly |
| `core/cache.py` | **KEEP** | Well-designed |
| `core/config.py` | **KEEP** | Minimal, correct |
| `core/database.py` | **KEEP** | Needed, but has issues (see ARCH-NEW-01) |
| `core/date_utils.py` | **KEEP** | Well-implemented |
| `core/dependencies.py` | **KEEP** | RBAC logic is correct |
| `core/security.py` | **KEEP** | Minimal, correct |
| `core/storage.py` | **KEEP** | Well-abstracted |
| `models/all_models.py` | **KEEP** | Single model file is correct approach |
| `routers/auth.py` | **KEEP** | Significant improvements, still has gaps (see SEC-NEW) |
| `routers/members.py` | **KEEP** | But has new issues found in this audit |
| `routers/proteins.py` | **KEEP** | But has a dangerous double-commit (see ARCH-NEW-03) |
| `routers/invoices.py` | **KEEP** | |
| `routers/expenses.py` | **KEEP** | |
| `routers/dashboard.py` | **KEEP** | But has critical issues (see ARCH-NEW-02) |
| `routers/audit.py` | **KEEP** | |
| `routers/automation.py` | **KEEP** | |
| `routers/branch_details.py` | **KEEP** | |
| `routers/contacts.py` | **KEEP** | |
| `routers/pending.py` | **KEEP** | Largely redundant with invoices.py — merge candidate (see below) |
| `routers/settings.py` | **KEEP** | |
| `routers/staff.py` | **KEEP** | |
| `routers/terms.py` | **KEEP** | |
| `routers/whatsapp_templates.py` | **KEEP** | |
| `schemas/auth.py` | **KEEP** | |
| `schemas/branch_details.py` | **KEEP** | |
| `schemas/expense.py` | **KEEP** | |
| `schemas/invoice.py` | **KEEP** | |
| `schemas/member.py` | **KEEP** | |
| `schemas/pending.py` | **RENAME/SPLIT** | File is named `pending.py` but contains `ExternalContact` schemas — misleading. Split into `schemas/contact.py` and `schemas/payment.py` |
| `schemas/pricing.py` | **KEEP** | |
| `schemas/protein.py` | **KEEP** | |
| `schemas/settings.py` | **KEEP** | |
| `schemas/staff.py` | **KEEP** | |
| `schemas/terms.py` | **KEEP** | |
| `schemas/whatsapp.py` | **KEEP** | |
| `migrate.py` | **KEEP** | Dev/reset tool only — never run in production |
| `migration.py` | **DELETE** | Replaced entirely by Alembic. This file is a stopgap that already caused a type bug (DATE vs VARCHAR). It is now dead code and a liability. |
| `main.py` | **KEEP** | |

### Files to Merge

**`routers/pending.py` → merge into `routers/invoices.py`**  
`pending.py` is a thin wrapper that queries the same `Invoice` table with `status IN ('PENDING', 'PARTIAL')`. It duplicates the payment recording logic from `invoices.py` — including the same `PaymentEvent` append pattern — with subtle differences. Having two files that both write to `Invoice.paidAmount` and `PaymentEvent` creates a divergence risk. Consolidate into `invoices.py` under a `/pending` sub-prefix, or keep a single `GET /invoices?status=PENDING` filter. The current duplication already caused the two-path `paidAmount` drift documented as DATA-1 in the original audit, and the second path still exists in `pending.py:record_payment()`.

**`schemas/pending.py` → split into `schemas/contact.py` + `schemas/payment.py`**  
This file mixes `ExternalContact` schemas, `PendingBalance` schemas (dead code — the table was deprecated), and `PaymentRecord`. The `PendingBalance*` classes (`PendingBalanceBase`, `PendingBalanceCreate`, `PendingBalanceUpdate`, `PendingBalanceResponse`) reference a model that was removed. They should be deleted. The remainder should be in separate, correctly named files.

---

## Part 1 — Architecture & Scalability: NEW Issues Found

These are issues **not documented in the existing Master Audit** — found by examining the current source code.

---

### ARCH-NEW-01 — Async Engine is Configured But Never Used
**Severity:** HIGH  
**File:** `core/database.py`, `routers/dashboard.py`

The `async_engine` and `AsyncSessionLocal` are defined in `database.py`, and `get_async_db()` is exported. However, zero routers actually use `async def` + `Depends(get_async_db)`. The one place that needs it most — the SSE generator in `dashboard.py` — uses `asyncio.to_thread(_compute_stats_new_session, gym_id)` which opens a **third connection** (separate from the request-scoped session and the pool) on every SSE tick.

At 50 gyms simultaneously on the dashboard with a 60-second tick, that is 50 new connections per minute opened and closed outside the pool. `asyncio.to_thread` bypasses `pool_pre_ping` because the connection is not drawn from the pool — it is a fresh `SessionLocal()` created inside the thread.

**Fix:** Convert `_compute_stats_new_session` to use `get_async_db()` and make the SSE generator async-native. Or at minimum, draw the session from the pool by passing the scoped session through, not by opening a new one per tick.

---

### ARCH-NEW-02 — Dashboard Runs 9 Separate COUNT/SUM Queries Per Request
**Severity:** HIGH  
**File:** `routers/dashboard.py`, `_compute_stats()`

`_compute_stats()` fires 9 independent `SELECT COUNT/SUM` queries sequentially in one synchronous function. At 50 active gym dashboards with SSE, this function runs every 60 seconds per gym:

- 50 gyms × 9 queries × 60/3600 = **750 queries/hour baseline**
- Peaks when multiple staff open the dashboard simultaneously, because each SSE connection streams independently — there is **no deduplication of SSE connections per gym**

If 5 staff at the same gym all have the dashboard open, the same 9 queries run 5 times in parallel. The `GymDailySummary` table and its upsert logic exist precisely to avoid this, but `_compute_stats()` completely bypasses it — it queries live tables directly every time.

**Fix:** `_compute_stats()` should read from `GymDailySummary` when the row for today is fresh (< 5 minutes old). Only recompute live when stale or missing. The upsert to `GymDailySummary` should happen here, making SSE the write path — not just a read path.

---

### ARCH-NEW-03 — Double Commit in `proteins.py:sync_protein_quantity()`
**Severity:** MEDIUM  
**File:** `routers/proteins.py`

`sync_protein_quantity()` calls `db.commit()` internally. It is called inside larger operations (add lot, delete lot) that also call `db.commit()` after the helper returns. This means any lot operation performs **two commits** on the same session. The second commit is a no-op most of the time, but if an exception occurs between the two commits (e.g., during the second commit's flush), the lot write is committed but the enclosing transaction's other side effects (audit log, etc.) may not be.

More critically: the PostgreSQL trigger `trg_sync_protein_quantity` already handles `ProteinStock.Quantity` syncing at the DB level. `sync_protein_quantity()` is therefore **redundant dead code that also double-commits**. Delete it.

---

### ARCH-NEW-04 — `page_size=0` Bypass Returns All Members With No Guard
**Severity:** HIGH  
**File:** `routers/members.py`, `get_members()`

The code contains:

```python
if page_size > 0:
    page_size = min(page_size, 500)
```

This means passing `?page_size=0` bypasses the 500-record limit and returns every single member in the gym, loading them all into Python memory with full `map_member_response()` processing — including a **Fernet decrypt call per member** for the Aadhaar field. At 200 members/gym this means 200 individual decryption operations per request.

The comment says "for exports/bulk operations" but there is no authentication of intent, no `require_owner` gate, and no response size cap. Any STAFF member can call this. A gym with 5,000 legacy-imported members would return a 5MB+ response triggering 5,000 decrypt operations.

**Fix:** Remove the `page_size=0` escape hatch. Create a separate, explicitly gated export endpoint that streams results with a hard server-side limit and requires OWNER role.

---

### ARCH-NEW-05 — `search_duplicates` Compares Against Encrypted Aadhaar Ciphertext
**Severity:** HIGH — Silent Security and Correctness Bug  
**File:** `routers/members.py`, `search_duplicates()`

```python
if aadhaar:
    conditions.append(Member.Aadhaar == str(aadhaar))
```

`Member.Aadhaar` stores **Fernet ciphertext** (a random-IV base64 string, ~200 chars). The incoming `aadhaar` value from the client is the raw 12-digit number. These can never match. This line silently never finds duplicates by Aadhaar — the bug from the original BUG-4 fix was applied to `check_duplicates()` but **not to `search_duplicates()`**.

The correct approach: hash the incoming Aadhaar with `hash_aadhaar()` and compare against `Member.AadhaarHash`.

**Fix:**
```python
if aadhaar:
    conditions.append(Member.AadhaarHash == hash_aadhaar(str(aadhaar)))
```

---

### ARCH-NEW-06 — `members.py:map_member_response()` Recomputes Status Twice
**Severity:** LOW — Performance / Maintainability  
**File:** `routers/members.py`

`map_member_response()` calls `calculate_member_status()` (which computes status from `NextDuedate`) AND independently recomputes `MembershipStatus` in a separate block a few lines later. This is two status calculations per member per response, with slightly different logic (one uses `MembershipExpiryDate`, the other uses `NextDuedate` only). They can produce different results for the same member, and the second result overwrites the first into `m_dict['MembershipStatus']` while the first result goes into `m_dict['computed_status']`. There are now two different status fields in the response with potentially different values.

**Fix:** Delete the second block. Use `calculated_member_status()` as the single source of truth. Remove `MembershipStatus` from the response entirely — use `computed_status` only.

---

### ARCH-NEW-07 — GymSettings Cache Can Return Stale ORM Object After Session Close
**Severity:** MEDIUM  
**File:** `core/cache.py`

The cache stores the live `GymSettings` SQLAlchemy ORM object, not a plain dict or Pydantic model. When the DB session that loaded the object closes (which happens after the request ends, in `get_db`'s `finally` block), SQLAlchemy detaches the object. The next request that reads from the cache gets a **detached instance**. Accessing lazy-loaded relationships on it will raise `DetachedInstanceError`.

Currently `GymSettings` has no relationships, so this does not crash today. But if a relationship is added to `GymSettings` in the future (e.g., a `gym` backref is already declared), any cached access to `settings.gym.gymname` will raise `DetachedInstanceError` in production.

**Fix:** Cache a plain dict snapshot, not the ORM object:
```python
_settings_cache[gym_id] = {"data": {c.name: getattr(settings, c.name) for c in settings.__table__.columns}, "ts": datetime.now()}
```

---

### ARCH-NEW-08 — `migration.py` is Orphaned Dead Code and a Type Bomb
**Severity:** MEDIUM  
**File:** `migration.py`

This file adds columns using raw `ALTER TABLE` SQL with hardcoded types. It already caused the bug documented in the existing audit ("Migration adds ExpiryDate as VARCHAR(255) but model uses Date"). It is not idempotent beyond swallowing exceptions silently. It does not integrate with Alembic. It is not called from `main.py`. It is a script that was run manually during development and should be archived or deleted to prevent accidental re-execution with stale column definitions.

**Action:** Delete it. All schema evolution goes through Alembic from this point forward.

---

### ARCH-NEW-09 — `Invoice.paidAmount` Can Drift from `SUM(PaymentEvent.amount)` With No Reconciliation Guard
**Severity:** HIGH  
**File:** `routers/invoices.py`, `routers/pending.py`

The existing audit noted that `reconcile-payments` exists as an on-demand endpoint. However there is no **constraint or trigger** that keeps `Invoice.paidAmount` in sync with `SUM(PaymentEvent.amount)`. Two code paths still independently set `paidAmount` without inserting a `PaymentEvent`:

1. `create_invoice()` in `invoices.py` — sets `paidAmount = total` for `PAID` status with no `PaymentEvent`  
2. `bulk_create_invoices()` — inserts a `PaymentEvent` in the body but only after the `Invoice` is added with `new_invoice.paidAmount` already set, so if the `PaymentEvent` flush fails silently (no explicit `db.flush()` before commit), the invoice is committed with `paidAmount > 0` but no event

A PostgreSQL trigger on `Invoice` that fires `AFTER UPDATE OF paidAmount` to verify `paidAmount = SUM(PaymentEvent.amount)` would make this a hard guarantee instead of an aspirational comment. Without it, the reconcile endpoint will always have work to do.

---

### ARCH-NEW-10 — No Index on `RefreshToken.expiresAt` or Cleanup Job
**Severity:** MEDIUM  
**File:** `models/all_models.py`, `routers/auth.py`

`RefreshToken` table has indexes on `gymId` and `tokenHash` (unique), but no index on `expiresAt`. The `/refresh` endpoint filters:

```sql
WHERE tokenHash = ? AND isRevoked = FALSE AND expiresAt > NOW()
```

The `tokenHash` index makes this fast today, but the table will accumulate expired and revoked rows indefinitely. After 6 months at 1,000 logins/day, this table has 180,000+ rows, most of them stale. There is no cleanup job or TTL mechanism. The `isRevoked` filter combined with the `expiresAt` check means the index on `tokenHash` still works for individual lookups, but `_revoke_all_refresh_tokens()` (which does a `gymId` + `isRevoked=False` scan) will get slower over time.

**Fix:** Add a scheduled cleanup (e.g., a simple DELETE WHERE expiresAt < NOW() - interval '1 day' run weekly) and add `Index("ix_refresh_expires", "expiresAt")`.

---

## Part 2 — Security: NEW Vulnerabilities Found

These are issues **not documented in the existing Master Audit**.

---

### SEC-NEW-01 — Staff Login Has No Token With `userId` — Bypass Risk
**Severity:** CRITICAL  
**File:** `routers/auth.py`, `core/dependencies.py`

There is a full `POST /api/auth/login` endpoint for gym owners that returns a JWT with `gymId`. There is a `User` model for staff. But there is **no `POST /api/staff/login` endpoint**. Staff users can be created via `POST /api/staff`, but there is no documented or implemented way for them to log in and receive a JWT containing `userId`.

`get_caller_role()` in `dependencies.py` handles the `userId` path:
```python
if userId:
    user = db.query(User)...
```
But this code path is **unreachable** because no login endpoint ever puts `userId` into a JWT. This means all RBAC enforcement (`require_owner`, `require_owner_or_manager`) always falls through to the gym-owner token path and returns `("OWNER", gym.username)` for every valid token.

In practice, every staff account that somehow obtains a gym owner JWT has OWNER-level access. The RBAC system is implemented but non-functional because the issuance side is missing.

**Fix:** Add `POST /api/auth/staff-login` that issues a JWT with both `gymId` and `userId`. Without this, all role enforcement is security theater.

---

### SEC-NEW-02 — JWT Has No Audience (`aud`) or Issuer (`iss`) Claim
**Severity:** MEDIUM  
**File:** `core/security.py`, `create_access_token()`

The JWT is signed with `HS256` and contains `gymId`, `username`, and `exp`. It has no `aud` (audience) or `iss` (issuer) claim. If this API ever runs alongside another service that uses the same `JWT_SECRET_KEY` (e.g., a separate admin panel or microservice), a token issued by one service is valid for the other. `python-jose` does not enforce `aud` validation unless you explicitly pass `audience=` in `jwt.decode()`.

**Fix:**
```python
to_encode.update({"iss": "eztrack-api", "aud": "eztrack-client"})
# And in decode:
jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.ALGORITHM], audience="eztrack-client")
```

---

### SEC-NEW-03 — Rate Limiting Only on Auth Endpoints — All Business Endpoints Unprotected
**Severity:** HIGH  
**File:** `routers/auth.py`, all other routers

ARCH-10 added rate limiting to `/login` (10/min) and `/signup` (5/min) via slowapi. Every other endpoint — member create, invoice create, expense bulk-delete, image upload, protein bulk-create — has **zero rate limiting**. 

A valid JWT holder can:
- POST `/api/members` in a tight loop to exhaust `GymSubscription.maxMembers` checks  
- POST `/api/expenses/bulk-create` with 10,000 items in one request  
- POST `/api/invoices/bulk-create` endlessly (no per-request item count cap)  
- GET `/api/members?page_size=0` repeatedly (see ARCH-NEW-04)  
- Trigger 5,000 Fernet decrypt calls per request  

The connection pool increase (pool_size=50, max_overflow=100) buys headroom, but a single authenticated attacker — or a client-side bug causing an infinite retry loop — can exhaust it.

**Fix:** Apply slowapi globally as middleware for business endpoints: authenticated endpoints should have a limit of ~100/min/user (keyed on `gymId` from token, not IP). Image upload should be limited to 10/min.

---

### SEC-NEW-04 — `bulk_delete_expenses()` and `bulk_delete_invoices()` Use Raw Table Delete Without Ownership Verification per Row
**Severity:** HIGH  
**File:** `routers/expenses.py`, `routers/invoices.py`

Both bulk delete endpoints use SQLAlchemy Core `Table.delete().where(id.in_(ids) AND gymId == current_gym.id)`. The `gymId` check is correct. However, the `ids` list comes from the request body as a raw `list` with no size cap. A request body of `{"ids": ["uuid1", "uuid2", ..., "uuid100000"]}` will generate a `WHERE id IN (100000 values)` SQL clause. PostgreSQL has no theoretical limit on `IN` list length, but a 100,000-item `IN` clause will:

1. Transfer a large payload over the network to PostgreSQL  
2. Build a large query plan  
3. Hold a lock on the Expense table for the duration  

Additionally, `bulk_delete_invoices` uses `Invoice.__table__.update()` (soft delete) which is correct, but `bulk_delete_expenses` uses `Expense.__table__.delete()` — a **hard delete** with no soft-delete, no audit log, and no `MANAGER+` check on expenses. Expenses can be bulk-hard-deleted by any authenticated user.

**Fix:** Add `MAX_BULK_DELETE = 500` cap on both endpoints. Add `_rbac=Depends(require_owner_or_manager)` to `bulk_delete_expenses`. Log bulk deletes to `AuditLog`.

---

### SEC-NEW-05 — `staff.py:update_staff()` Accepts Raw `dict` — Partial Mass Assignment Risk
**Severity:** MEDIUM  
**File:** `routers/staff.py`, `update_staff()`

```python
def update_staff(user_id: str, data: dict, ...)
```

The endpoint accepts raw `dict`. While it applies a `safe_fields` allowlist:
```python
safe_fields = {"role", "permissions", "activeBranchId", "branchIds"}
```
...the fact that it iterates `data.items()` means any key not in `safe_fields` is silently ignored — which is safe. However, Pydantic validation is completely bypassed. The `role` field accepts any string: `data = {"role": "SUPERADMIN"}` would set `user.role = "SUPERADMIN"`. `ROLE_RANK.get("SUPERADMIN", 0)` returns 0, so this user would be treated as the lowest rank, but it is still data pollution. More critically, there is no check that a MANAGER cannot promote another user to OWNER.

**Fix:** Use a typed `UserUpdate` Pydantic schema with `role: Literal["OWNER", "MANAGER", "STAFF"]`. Add an explicit check: a MANAGER cannot set `role = "OWNER"`.

---

### SEC-NEW-06 — `whatsapp_templates.py:preview_template()` Does Not Validate Incoming Template Text
**Severity:** MEDIUM  
**File:** `routers/whatsapp_templates.py`, `preview_template()`

The `preview` endpoint accepts `messageTemplate` in the request body and renders it — but does **not** call `_validate_template_placeholders()` on the incoming template text. The `update_template` endpoint calls it (SEC-11 fix), but `preview` does not. An attacker can call `preview` with `{../../etc/passwd}` or deeply nested `{{{{{placeholder}}}}}` patterns to probe behavior without triggering the validation guard.

More practically, the `preview` endpoint will happily render any template text it receives, which could be used to probe the default variable values (`gymName`, `total`, etc.) that the backend injects — leaking information about gym configuration.

**Fix:** Add `_validate_template_placeholders(template_text)` at the top of `preview_template()`. Reject requests where the incoming template contains disallowed placeholders.

---

### SEC-NEW-07 — Signed URLs for Logos and Receipts Are Regenerated on Every API Response
**Severity:** MEDIUM — Information Exposure + Performance  
**File:** `routers/branch_details.py`, `_to_response()`

Every call to `GET /api/branch-details` calls `get_signed_url(b.logoUrl)` which makes a live API call to the storage backend (Supabase/R2/S3) to generate a presigned URL. This means:

1. Every branch detail response is **blocked on an external HTTP call** to the storage provider  
2. Signed URLs are single-use or short-lived — but they are embedded in JSON responses that may be cached by the frontend or by an intermediate proxy, which could serve a stale (expired) URL  
3. If the storage provider is slow or unavailable, all branch-detail responses hang  

The same pattern exists in `expenses.py` (receipt URL) and `members.py` (image URL, if the signed URL generation is called there).

**Fix:** The `_to_response()` helper should not call `get_signed_url()` synchronously. Store the storage key and let the frontend call a dedicated `GET /api/branch-details/logo` endpoint to get a fresh URL on demand. Or generate the URL lazily only when `?include_logo=true` is passed. The logo endpoint already exists — just don't embed it in every list response.

---

### SEC-NEW-08 — `AuditLog.ipAddress` Column Exists But Is Never Populated
**Severity:** LOW — Compliance Gap  
**File:** `models/all_models.py`, `core/audit_utils.py`

`AuditLog` has an `ipAddress` column. `log_audit()` accepts no `ip_address` parameter. Every audit log row has `ipAddress = NULL`. Under DPDP Act 2023 (India's data protection law), for entities handling Aadhaar-adjacent data, audit trails are expected to include the originating IP. A UIDAI inspection would find this field blank for all 2,500+ daily audit entries.

**Fix:** Pass `request: Request` into `log_audit()` and extract `request.client.host`. Propagate through the call chain. At minimum, document this as a known compliance gap.

---

### SEC-NEW-09 — `search_duplicates` and `check_duplicates` Accept Unauthenticated Role — No RBAC
**Severity:** LOW  
**File:** `routers/members.py`

Both duplicate-check endpoints are accessible to any authenticated gym token — including STAFF. They return full member records including phone numbers. While these endpoints serve a legitimate UX purpose (pre-submit duplicate warning), they leak sensitive member data (name, phone, masked Aadhaar) to the lowest-privilege role. A malicious STAFF member could use these endpoints as a search oracle: POST `{"Mobile": "9999999999"}` to enumerate which numbers are registered.

**Fix:** Limit response to `{id, Name, masked_phone}` for duplicate checks. Do not return full member objects.

---

### SEC-NEW-10 — No HTTPS Enforcement or HSTS Header
**Severity:** MEDIUM  
**File:** `main.py`

The application sets CORS and authentication but has no HTTPS enforcement at the FastAPI layer. No `Strict-Transport-Security` header is set. If the Nginx reverse proxy is misconfigured or if the app is deployed without TLS (e.g., in a hurried staging rollout), JWT tokens and Aadhaar-encrypted payloads flow over plain HTTP. Given that this application handles Aadhaar data, HTTPS is not optional — it is a legal requirement under the IT Act.

**Fix:** Add a middleware that sets `Strict-Transport-Security: max-age=63072000; includeSubDomains` on all responses. Add a startup check that warns if `DATABASE_URL` starts with `http://` or if `ALLOWED_ORIGINS` contains `http://` in production.

---

## Part 3 — Schema: NEW Issues Found

---

### SCH-NEW-01 — `ProteinStock.Year` and `ProteinStock.Month` Are Strings — Unparseable and Redundant
**Severity:** MEDIUM  
**File:** `models/all_models.py`, `ProteinStock`

`Year = Column(String)` and `Month = Column(String, e.g., "March")` exist on `ProteinStock`. These are used to group stock "by month of purchase" but:

1. They are strings — SQL cannot sort or aggregate them reliably  
2. `Month = "March"` is locale-dependent (Hindi-speaking staff might enter "मार्च")  
3. `Year = "2025"` is string-sorted, so "2025" > "2024" > "10" — sorting across year boundaries will eventually fail  
4. These fields duplicate information that would be correctly expressed as a `purchaseDate = Column(Date)` on `ProteinLot`, which already exists as `expiryDate`

There is no `createdAt` filter on `ProteinStock` for month-based grouping because `ProteinStock` is the product catalogue entry, not the purchase event. The lot-level `ProteinLot.createdAt` is the correct field to use for monthly grouping.

**Fix:** Remove `Year` and `Month` from `ProteinStock`. Add `purchaseDate = Column(Date)` to `ProteinLot`. Group inventory reports by `ProteinLot.purchaseDate`.

---

### SCH-NEW-02 — `Member.LastPaymentAmount` is `Integer` — Truncates Decimal Payments
**Severity:** MEDIUM  
**File:** `models/all_models.py`

`LastPaymentAmount = Column(Integer)` — this silently truncates decimal payments. A payment of ₹1,500.50 would be stored as ₹1,500. Given that GST is now supported (18% on ₹1,000 = ₹1,180 — no truncation issue, but 18% on ₹999 = ₹1,178.82 — truncated to ₹1,178), this is a data accuracy issue that will manifest when GST is enabled.

**Fix:** Change to `Column(MONEY)` (i.e., `Numeric(12,2)`).

---

### SCH-NEW-03 — `PricingConfig` Has No Unique Constraint for `configType='pt'` Plans
**Severity:** MEDIUM  
**File:** `models/all_models.py`, `PricingConfig`

Two partial unique indexes exist:
- `uq_pricing_member` for `configType = 'member'`
- `uq_pricing_protein` for `configType = 'protein'`

But there is **no unique constraint for `configType = 'pt'`** (Personal Training plans). The `routers/settings.py:update_pt_pricing_bulk()` uses SELECT+INSERT logic without any DB-level uniqueness guarantee. Concurrent requests to `POST /api/settings/pricing/pt-matrix/bulk` can create duplicate PT pricing rows.

**Fix:** Add:
```python
Index("uq_pricing_pt", "gymId", "configType", "planType", "periodType",
      unique=True, postgresql_where="\"configType\" = 'pt'"),
```

---

### SCH-NEW-04 — `GymDailySummary` Has No `isDeleted` Guard and No Tenant Isolation on Read
**Severity:** LOW  
**File:** `routers/dashboard.py`

`_compute_stats()` queries `Member` with `Member.isDeleted == False` — correct. But the income aggregates query `Invoice.isDeleted == False` only in some places. The `pending_balance` calculation:

```python
func.sum(Invoice.total - func.coalesce(Invoice.paidAmount, 0))
...Invoice.status.in_(["PENDING", "PARTIAL"]),
```

...does not filter `Invoice.isDeleted == False`. Soft-deleted invoices with `PENDING` status contribute to the pending balance shown on the dashboard. This is incorrect — a deleted invoice should not appear as a receivable.

**Fix:** Add `Invoice.isDeleted == False` to all dashboard invoice aggregates.

---

### SCH-NEW-05 — No Database-Level `CHECK` Constraints on Critical Enum Columns
**Severity:** MEDIUM

Several columns use string enums enforced only at the application layer:

- `Invoice.status`: `PENDING | PARTIAL | PAID` — no DB CHECK  
- `User.role`: `OWNER | MANAGER | STAFF` — no DB CHECK  
- `PaymentEvent.paymentMode`: `CASH | UPI | CARD | BANK` — no DB CHECK  
- `Invoice.paymentMode`: same  

Direct database writes (via `migrate.py`, Alembic scripts, admin tools, or the seed endpoint) can insert `status = "paid"` (lowercase) or `role = "Admin"` which will silently bypass all RBAC and filter logic at the application layer. The RBAC code does `ROLE_RANK.get(role, 0)` which returns 0 for any unrecognized role, effectively stripping access from a role that was set to a wrong value.

**Fix:** Add `CheckConstraint` at the model level:
```python
CheckConstraint("status IN ('PENDING', 'PARTIAL', 'PAID')", name="ck_invoice_status")
CheckConstraint("role IN ('OWNER', 'MANAGER', 'STAFF')", name="ck_user_role")
```

---

## Part 4 — Open Items from Existing Audit: Status Update

These were marked `OPEN` in the Master Audit. Current code confirms they are still open.

| ID | Issue | Code Confirmation | Updated Severity |
|---|---|---|---|
| **P9** | `Invoice.dueDate` timezone bug | `dueDate = Column(DateTime(timezone=True))` confirmed in `all_models.py`. `automation.py:get_overdue_payments()` compares `Invoice.dueDate < datetime.now()` (naive). `pending.py:get_overdue_balances()` does `Invoice.dueDate < today` (naive). Off by up to 5.5 hours in IST. | **HIGH — Fix before production** |
| **P11** | Dashboard alerts still O(N) | `get_alerts()` in `dashboard.py` (not shown in snippet but referenced) — needs verification. The `_compute_stats()` function uses SQL aggregates correctly. The *alerts* endpoint is a separate function. | **MEDIUM** |
| **P12** | `User.branchIds` JSON → `UserBranchAccess` table | Confirmed: `branchIds = Column(JSON)` still in `all_models.py`. Cannot query "which users can access branch X" in SQL. | **MEDIUM — Needed before multi-branch rollout** |
| **P13** | AuditLog partitioning not implemented | Confirmed: no `postgresql_partition_by` in current `AuditLog` model. At 2,500 writes/day × 365 days = 912,500 rows/year with no partitioning. | **MEDIUM — Plan now, not later** |
| **P14** | `maxStaff` and `maxBranches` not enforced | Confirmed: only `maxMembers` is checked. `GymSubscription.maxStaff` and `maxBranches` exist in the model but `routers/staff.py:create_staff()` and branch creation have no enforcement. | **LOW** |

---

## Part 5 — Write Amplification Analysis

At 10K DAU, these are the write-amplification patterns that will cause the most trouble:

**1. PaymentEvent + Invoice.paidAmount on every payment (acceptable)**  
Every payment writes one `PaymentEvent` row and one `Invoice` update. At 1,000 payments/day this is 2,000 writes. Fine.

**2. AuditLog on every member/invoice/expense mutation (high volume)**  
`log_audit()` is called on every CREATE/UPDATE/DELETE for 3 entity types. At 1,000 daily mutations × 1 audit row each = 1,000 audit writes/day baseline. These are insert-only and the table has good indexes. Acceptable now; needs partitioning at 6-12 months.

**3. `GymDailySummary` upsert on every SSE tick (dangerous)**  
The current code does NOT write to `GymDailySummary` on every SSE tick — `_compute_stats()` queries live tables. If this is ever changed to upsert to `GymDailySummary` on every tick, at 50 gyms × 1 upsert/60s = 50 writes/minute = 72,000 writes/day on a table with a unique index — which triggers index maintenance on every write. This is the pattern to avoid.

**4. ProteinStock.Quantity trigger on every ProteinLot write (acceptable)**  
The PostgreSQL trigger fires a single `UPDATE ProteinStock SET Quantity = SUM(...)` per lot operation. At 500 lot operations/day this is 500 trigger-induced updates. Fine.

**5. RefreshToken accumulation (slow-growing problem)**  
`_revoke_all_refresh_tokens()` is called on every login, marking old tokens `isRevoked = TRUE`. Old tokens are never deleted. At 100 logins/day × 7-day token lifespan, the table grows by ~700 rows/day. At one year: ~255,000 rows. The `gymId` + `isRevoked=False` scan gets progressively slower. Add a weekly cleanup job.

---

## Part 6 — Redundant Relationships

| Relationship | Issue |
|---|---|
| `Invoice.gymId` + `Invoice.branchId` + `Invoice.memberId` | A `memberId` already implies a `gymId` (member belongs to gym). The redundant `gymId` on Invoice is intentional for query efficiency, but creates a consistency risk: `invoice.gymId != invoice.member.gymId` is possible if a bug sets them differently. No CHECK constraint prevents this. Add: `CHECK (memberId IS NULL OR gymId = (SELECT gymId FROM Member WHERE id = memberId))` or enforce in code. |
| `PaymentEvent.gymId` + `PaymentEvent.invoiceId` | Same redundancy. `invoiceId` already implies `gymId`. The denormalized `gymId` is used for the index `ix_payment_gym`. This is acceptable for read performance, but needs the same consistency note. |
| `ProteinLot.gymId` + `ProteinLot.proteinId` | Covered by the existing DATA-3 fix. The cross-tenant check is in code, not in a DB constraint. |
| `Branch.gymId` on every entity | Correct and necessary for tenant isolation. Not truly redundant. |
| `GymSettings` 1:1 with `Gym` | The `gymId = unique=True` makes this a 1:1 relationship implemented as a separate table. This is fine for now, but 37 columns on `GymSettings` that are rarely read together suggests this table could eventually be split into `GymBillingSettings`, `GymNotificationSettings`, `GymStockSettings` — but not yet, premature for current scale. |

---

## Part 7 — Prioritized Action List

**Do immediately (before any production traffic):**

1. **SEC-NEW-01** — Add staff login endpoint. Without it, RBAC is non-functional.
2. **ARCH-NEW-05** — Fix Aadhaar search using `AadhaarHash`. Silent legal compliance bug.
3. **ARCH-NEW-04** — Remove `page_size=0` bypass or gate it behind `require_owner`.
4. **P9** — Fix `Invoice.dueDate` timezone comparison. Overdue detection is wrong today.
5. **SEC-NEW-04** — Add size cap to bulk delete endpoints and add `require_owner_or_manager` to `bulk_delete_expenses`.

**Sprint 2:**

6. **ARCH-NEW-01** — Fix SSE to use pooled sessions, not `SessionLocal()` per tick.
7. **ARCH-NEW-02** — Make `_compute_stats()` read from `GymDailySummary` when fresh.
8. **ARCH-NEW-03** — Delete `sync_protein_quantity()` (trigger already handles it).
9. **SEC-NEW-03** — Apply rate limiting to authenticated business endpoints.
10. **SCH-NEW-05** — Add `CHECK` constraints for enum columns.
11. **SEC-NEW-07** — Remove inline signed URL generation from list responses.
12. **ARCH-NEW-10** — Add `RefreshToken` cleanup job.

**Sprint 3 (architecture):**

13. **P12** — `UserBranchAccess` junction table to replace JSON `branchIds`.
14. **P13** — Alembic migration for `AuditLog` partitioning by month.
15. **SCH-NEW-01** — Remove `Year`/`Month` strings from `ProteinStock`.
16. **ARCH-NEW-07** — Cache plain dict in `core/cache.py`, not the ORM object.
17. **SEC-NEW-02** — Add `iss`/`aud` claims to JWT.
18. **ARCH-NEW-08** — Delete `migration.py`.

---

## Part 8 — Architecture Scorecard (Updated)

| Category | Previous Score | New Score | Delta | Key Change |
|---|---|---|---|---|
| Data Types | A | A | — | No regression |
| Indexing | A- | A- | — | No regression |
| Binary Storage | A | A | — | No regression |
| Query Efficiency | B+ | B | ↓ | SSE opens new sessions per tick (ARCH-NEW-01) |
| Write Atomicity | A- | B+ | ↓ | paidAmount drift paths still exist (ARCH-NEW-09) |
| Multi-Tenancy | A | A | — | No regression |
| Schema Normalization | B+ | B | ↓ | Year/Month strings, Integer LastPaymentAmount, no CHECK constraints |
| RBAC / Auth | B | D | ↓↓ | Staff login endpoint missing — RBAC is non-functional (SEC-NEW-01) |
| Scalability Architecture | B | B- | ↓ | page_size=0 bypass, no business-endpoint rate limiting |
| Audit / Compliance | C+ | C | ↓ | ipAddress never populated, Aadhaar search broken |
| Runtime Correctness | A | B+ | ↓ | Two new bugs found (ARCH-NEW-05, ARCH-NEW-06) |

**Verdict:** The previous audit resolved all critical infrastructure issues. This audit reveals the RBAC system is architecturally present but operationally non-functional — there is no staff login endpoint, meaning every token holder is effectively an OWNER. This is the single most critical finding. Fix SEC-NEW-01 before any staff accounts are created.

---

*Audit completed: February 28, 2026. Next review recommended after Sprint 2 delivery.*
