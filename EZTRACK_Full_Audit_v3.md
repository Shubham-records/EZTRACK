# EZTRACK Backend — Full Audit v3
**Date:** February 28, 2026  
**Simulation Basis:** 10,000 Daily Active Users (~50 active gyms, ~200 members/gym)  
**Scope:** All source files across `core/`, `models/`, `routers/`, `schemas/`  
**Built on:** Master Audit + Audit v2. New findings only appear if not previously documented.  
**Roles:** Senior Backend Architect + Backend Security Engineer  

---

## Section 0 — File Disposition (Definitive)

This is the authoritative answer on every file in the project. No ambiguity.

### Files to MERGE --- done.

| Source | Target | Reason |
|---|---|---|
| `routers/pending.py` | `routers/invoices.py` | `pending.py` is a thin filter on the `Invoice` table (`status IN ('PENDING','PARTIAL')`). It duplicates the payment recording logic — same `PaymentEvent` append pattern — with subtle implementation differences. Two files writing `Invoice.paidAmount` is the direct cause of the `paidAmount` drift bug (DATA-1). The reconcile endpoint will always have work to do as long as two independent write paths exist. Move all `/api/pending` routes into `invoices.py` under a `/pending` sub-router. Delete `routers/pending.py`. |
| `schemas/pending.py` (remaining classes) | `schemas/contact.py` + `schemas/payment.py` | After deleting the dead `PendingBalance*` classes, `schemas/pending.py` contains: `ExternalContactBase/Create/Update/Response` (belongs in `schemas/contact.py`) and `PaymentRecord` (belongs in `schemas/payment.py`). The filename `pending.py` is misleading for both. Split and delete the original. |

### Files to KEEP (with noted issues)

| File | Status | Issues to Fix |
|---|---|---|
| `core/aadhaar_crypto.py` | ✅ Clean | None |
| `core/audit_utils.py` | ⚠️ Minor issue | `log_audit()` never captures `ipAddress` — compliance gap (SEC-NEW-08) |
| `core/cache.py` | ⚠️ Latent bug | Caches ORM object — will raise `DetachedInstanceError` if relationships added (ARCH-NEW-07) |
| `core/config.py` | ✅ Clean | None |
| `core/database.py` | ⚠️ Structural issue | `async_engine` defined but never used by any router (ARCH-NEW-01) |
| `core/date_utils.py` | ✅ Clean | None |
| `core/dependencies.py` | 🔴 Critical | RBAC code exists but `userId` JWT path is unreachable — no staff login endpoint issues JWTs with `userId` (SEC-NEW-01) |
| `core/security.py` | ⚠️ Minor issue | JWT missing `iss`/`aud` claims (SEC-NEW-02) |
| `core/storage.py` | ✅ Clean | None |
| `models/all_models.py` | ⚠️ Multiple issues | `ProteinStock.Year`/`Month` as strings (SCH-NEW-01), `Member.LastPaymentAmount` as Integer (SCH-NEW-02), no `CHECK` constraints on enum columns (SCH-NEW-05), no unique constraint for `configType='pt'` (SCH-NEW-03), no `RefreshToken` cleanup (ARCH-NEW-10) |
| `routers/auth.py` | 🔴 Critical gap | No staff login endpoint (SEC-NEW-01) |
| `routers/members.py` | 🔴 Multiple issues | `page_size=0` bypass (ARCH-NEW-04), `search_duplicates` broken Aadhaar comparison (ARCH-NEW-05), double status computation (ARCH-NEW-06) |
| `routers/proteins.py` | ⚠️ Double-commit | `sync_protein_quantity()` double-commits AND is made redundant by the PostgreSQL trigger (ARCH-NEW-03) |
| `routers/invoices.py` | ⚠️ Two write paths | `create_invoice()` sets `paidAmount` without inserting `PaymentEvent` (ARCH-NEW-09) |
| `routers/expenses.py` | ⚠️ Security gap | `bulk_delete_expenses` has no `require_owner_or_manager` guard and no hard delete audit log (SEC-NEW-04) |
| `routers/dashboard.py` | 🔴 Performance critical | 9 live queries per SSE tick, no deduplication of concurrent SSE connections (ARCH-NEW-02) |
| `routers/audit.py` | ✅ Clean | None |
| `routers/automation.py` | ✅ Clean | None |
| `routers/branch_details.py` | ⚠️ Performance | Inline `get_signed_url()` call on every list response — blocks on external HTTP (SEC-NEW-07) |
| `routers/contacts.py` | ✅ Clean | None |
| `routers/expenses.py` | ⚠️ Security gap | See above |
| `routers/pending.py` | 🟡 Merge candidate | Merge into `invoices.py` |
| `routers/settings.py` | ✅ Clean | None |
| `routers/staff.py` | ⚠️ Type safety | `update_staff` accepts raw `dict` — no Pydantic validation (SEC-NEW-05) |
| `routers/terms.py` | ✅ Clean | None |
| `routers/whatsapp_templates.py` | ⚠️ Missing validation | `preview_template` does not call `_validate_template_placeholders` (SEC-NEW-06) |
| `schemas/auth.py` | ✅ Clean | None |
| `schemas/branch_details.py` | ✅ Clean | None |
| `schemas/expense.py` | ✅ Clean | None |
| `schemas/invoice.py` | ✅ Clean | None |
| `schemas/member.py` | ✅ Clean | None |
| `schemas/pending.py` | 🟡 Split/Delete | See merge instructions above |
| `schemas/pricing.py` | ✅ Clean | None |
| `schemas/protein.py` | ✅ Clean | None |
| `schemas/settings.py` | ✅ Clean | None |
| `schemas/staff.py` | ✅ Clean | None |
| `schemas/terms.py` | ✅ Clean | None |
| `schemas/whatsapp.py` | ✅ Clean | None |
| `migrate.py` | ⚠️ Dev-only | Never run in production. Safe to keep as reset tool. |
| `main.py` | ✅ Clean | None |

---

## Section 1 — Architecture & Scalability Issues

### ARCH-NEW-01 — Async Engine Configured But Never Used -- done.
**Severity:** HIGH  
**File:** `core/database.py`, all routers  
**Status:** NEW — not in previous audits

`async_engine` and `AsyncSessionLocal` are defined. `get_async_db()` is exported. Zero routers use `async def` + `Depends(get_async_db)`. The one place where it matters most — the SSE generator in `dashboard.py` — uses `asyncio.to_thread(_compute_stats_new_session, gym_id)`, which opens a fresh `SessionLocal()` per call. This connection is:
- Outside the pool (`pool_pre_ping` does not apply)
- Opened and closed on every 60-second SSE tick
- Not tracked by `pool_size` or `max_overflow` counters

At 50 gyms simultaneously on the dashboard: **50 connections/minute opened outside the pool**. The pool headroom increase (pool_size=50, max_overflow=100) does not protect against this because these are not pool connections.

**Fix:**
```python
# dashboard.py — convert SSE generator to async-native
async def _stream_stats(gym_id: str):
    async with AsyncSessionLocal() as db:
        stats = await _compute_stats_async(gym_id, db)
    yield f"data: {json.dumps(stats)}\n\n"
```
Convert `_compute_stats` to use `AsyncSession` and `await db.execute(select(...))`. Delete `asyncio.to_thread` wrapper.

---

### ARCH-NEW-02 — Dashboard Fires 9 Live Queries Per SSE Tick With No Connection Deduplication --- done
**Severity:** HIGH  
**File:** `routers/dashboard.py`  
**Status:** NEW — not in previous audits

`_compute_stats()` executes 9 sequential `SELECT COUNT/SUM` queries every time it is called. SSE calls it every 60 seconds per connected client. There is no deduplication of SSE connections per gym.

Scenario: 5 staff at one gym all have the dashboard open simultaneously.
- 5 SSE connections × 9 queries = **45 live queries per tick**
- At 50 gyms × 5 staff average = **2,250 queries per 60-second window**
- That is 37.5 queries per second sustained from dashboard alone, even with zero member activity

The `GymDailySummary` table and upsert logic were built precisely to avoid this, but `_compute_stats()` bypasses it entirely — it queries live tables every time.

**Fix (two parts):**

1. In `_compute_stats()`, check if `GymDailySummary` for today is fresher than 5 minutes. If yes, read from it and return. Only recompute from live tables if stale.
2. Add a gym-level SSE registry. When gym `X` already has an active SSE subscriber, subsequent connections share the same stats push rather than each opening a new query chain.

```python
# Pseudo-code for Fix Part 1
summary = db.query(GymDailySummary).filter(
    GymDailySummary.gymId == gym_id,
    GymDailySummary.date == date.today(),
    GymDailySummary.updatedAt > datetime.now() - timedelta(minutes=5)
).first()
if summary:
    return _stats_from_summary(summary)
# else: compute live and upsert
```

---

### ARCH-NEW-03 — `sync_protein_quantity()` Is Dead Code That Also Double-Commits --- done
**Severity:** MEDIUM  
**File:** `routers/proteins.py`  
**Status:** NEW — not in previous audits

`sync_protein_quantity()` calls `db.commit()` internally, then the callers (add lot, delete lot operations) also call `db.commit()` after the helper returns. This means every lot operation makes **two commits on the same session**. The second commit is a no-op most of the time — but if an exception occurs between the two commits, side effects from the first commit are already durable while the second transaction's changes are not. In a lot-add scenario:

1. `sync_protein_quantity()` commits the `ProteinStock.Quantity` update
2. An exception occurs before the outer `db.commit()` (e.g. audit log write fails)
3. Quantity is updated, but the audit log is not written — silent inconsistency

Additionally, the PostgreSQL trigger `trg_sync_protein_quantity` (installed by `migrate.py`) already handles `ProteinStock.Quantity` syncing at the database level. `sync_protein_quantity()` is therefore redundant — it recalculates in Python what the trigger already did in SQL.

**Fix:** Delete `sync_protein_quantity()` entirely. The trigger handles it. Ensure all lot operations use a single `db.commit()` at the end.

---

### ARCH-NEW-04 — `page_size=0` Returns All Members With No Access Gate --done 
**Severity:** HIGH  
**File:** `routers/members.py`, `get_members()`  
**Status:** NEW — not in previous audits

```python
if page_size > 0:
    page_size = min(page_size, 500)
```

Passing `?page_size=0` bypasses the 500-record limit entirely. This loads all members into Python memory and runs `map_member_response()` on each one — which includes a Fernet `decrypt()` call per member for the Aadhaar field.

A gym with 5,000 imported legacy members will return:
- A response payload of ~5MB+
- 5,000 individual Fernet decrypt operations (CPU-bound)
- A DB query with no `LIMIT` clause

Any authenticated user — including STAFF, the lowest privilege — can trigger this. A client-side bug in a retry loop will DoS the backend.

The comment claims this is "for exports/bulk operations" but there is no export-specific authentication, no size cap, and no rate limit.

**Fix:**
```python
# Remove the page_size=0 escape hatch entirely
page_size = max(1, min(page_size, 500))

# Add a gated export endpoint
@router.get("/export", dependencies=[Depends(require_owner)])
def export_members(...):
    # Streams results, requires OWNER role, limited to 1,000 per call
```

---

### ARCH-NEW-05 — `search_duplicates()` Compares Raw Aadhaar Against Fernet Ciphertext -- done
**Severity:** HIGH — Silent Legal Compliance Bug  
**File:** `routers/members.py`, `search_duplicates()`  
**Status:** NEW — not in previous audits

```python
if aadhaar:
    conditions.append(Member.Aadhaar == str(aadhaar))
```

`Member.Aadhaar` stores Fernet ciphertext (a random-IV base64 string, ~200 chars). The incoming `aadhaar` is a raw 12-digit number. These can never match. This line silently never finds Aadhaar duplicates.

The original BUG-4 fix corrected `check_duplicates()` to use `AadhaarHash`, but `search_duplicates()` was not updated. Every Aadhaar-based duplicate search returns false negatives. Under UIDAI regulations this is a compliance issue — duplicate member registrations with the same Aadhaar are not caught.

**Fix:**
```python
from core.aadhaar_crypto import hash_aadhaar

if aadhaar:
    conditions.append(Member.AadhaarHash == hash_aadhaar(str(aadhaar)))
```

---

### ARCH-NEW-06 — Member Status Computed Twice Per Response With Inconsistent Logic -- done
**Severity:** LOW  
**File:** `routers/members.py`, `map_member_response()`  
**Status:** NEW — not in previous audits

`map_member_response()` calls `calculate_member_status()` (derives status from `NextDuedate`) and then a few lines later recomputes `MembershipStatus` using a different field (`MembershipExpiryDate`). The results go into `computed_status` and `MembershipStatus` respectively — two different keys in the response, potentially with different values for the same member.

This means a frontend consuming both fields may show contradictory status indicators. It also means the `ARCH-08` fix (computing status from `NextDuedate` only) is partially reversed by the second block.

**Fix:** Delete the second block. Return only `computed_status` in the response. Remove `MembershipStatus` from `MemberResponse`. Any frontend reading `MembershipStatus` must be updated to read `computed_status`.

---

### ARCH-NEW-07 — GymSettings Cache Stores Detachable ORM Object -- done
**Severity:** MEDIUM  
**File:** `core/cache.py`  
**Status:** NEW — not in previous audits

`_settings_cache` stores the live SQLAlchemy `GymSettings` ORM object. When the DB session that loaded the object closes (in `get_db`'s `finally` block), the object is detached. The next request that reads from the cache receives a **detached instance**.

Today this does not crash because `GymSettings` has no lazy-loaded relationships. However the `Gym` model has a `settings` backref declared, and if any code ever accesses `cached_settings.gym.gymname`, it will raise `DetachedInstanceError` in production — with no stack trace pointing to the cache as the source.

**Fix:** Cache a plain dict snapshot, not the ORM object:
```python
_settings_cache[gym_id] = {
    "data": {c.name: getattr(settings, c.name) for c in settings.__table__.columns},
    "ts": datetime.now()
}
```
Update `get_gym_settings()` callers to accept a dict and access fields with `settings["lowStockThreshold"]` instead of attribute access, or reconstruct a Pydantic model from the dict.

---

### ARCH-NEW-08 — `migration.py` Is Orphaned Dead Code and a Type Bomb -- done
**Severity:** MEDIUM  
**File:** `migration.py`  
**Status:** Deleted — fixed

This file adds columns via raw `ALTER TABLE` SQL. It:
- Swallows all exceptions silently (already caused DATE vs VARCHAR bug, Bug #9 in Master Audit)
- Is not called from `main.py` or anywhere
- Is not integrated with Alembic
- Has hardcoded types that may conflict with current model definitions
- If accidentally re-run, produces no output confirming success or failure

**Action:** Delete. All schema evolution via Alembic.

---

### ARCH-NEW-09 — `Invoice.paidAmount` Can Drift From `SUM(PaymentEvent.amount)` — Two Unplugged Write Paths -- done
**Severity:** HIGH  
**File:** `routers/invoices.py`  
**Status:** Fixed — both drift paths closed

Despite DATA-1 being marked DONE, two write paths still set `Invoice.paidAmount` without inserting a matching `PaymentEvent`:

**Path 1 — `create_invoice()`:**
```python
paid = data.paidAmount if data.paidAmount is not None else total
if data.status == "PAID":
    paid = total
new_invoice = Invoice(..., paidAmount=paid, ...)
# No PaymentEvent inserted here
```
A new invoice with status `PAID` and `paidAmount = total` is committed with no `PaymentEvent` row. The reconcile endpoint will always find this invoice as "out of sync."

**Path 2 — `bulk_create_invoices()`:**
```python
db.add(new_invoice)
# new_invoice.id is not yet assigned (no db.flush() called)
db.add(PaymentEvent(invoiceId=new_invoice.id, ...))  # new_invoice.id is None here
```
There is no `db.flush()` between adding the invoice and creating the `PaymentEvent`. `new_invoice.id` is `None` at the time `PaymentEvent` is constructed. This creates a `PaymentEvent` with `invoiceId=NULL`, which either violates the FK constraint (silently rolled back) or inserts an orphaned event.

**Fix:**
```python
# Path 1 — always insert a PaymentEvent when paidAmount > 0
db.add(new_invoice)
db.flush()  # get new_invoice.id
if paid > 0:
    db.add(PaymentEvent(
        invoiceId=new_invoice.id,
        gymId=current_gym.id,
        amount=paid,
        paymentMode=data.paymentMode or "CASH",
        notes="Initial payment",
        recordedBy=current_gym.username,
    ))

# Path 2 — add db.flush() before PaymentEvent construction
db.add(new_invoice)
db.flush()  # ← this line is missing
if new_invoice.paidAmount and new_invoice.paidAmount > 0:
    db.add(PaymentEvent(invoiceId=new_invoice.id, ...))
```

---

### ARCH-NEW-10 — `RefreshToken` Table Has No Cleanup Mechanism --- done
**Severity:** MEDIUM  
**File:** `models/all_models.py`, `routers/auth.py`  
**Status:** Fixed — cleanup index and function added

`RefreshToken` rows are marked `isRevoked=True` on logout but never physically deleted. At 100 logins/day: 36,500 rows per year, most stale. The `_revoke_all_refresh_tokens()` function scans `WHERE gymId = X AND isRevoked = FALSE` — this is efficient today but degrades as the table grows because the `gymId` index has to skip over increasing numbers of revoked rows.

There is no index on `expiresAt` and no scheduled cleanup.

**Fix:**
```python
# In models/all_models.py
Index("ix_refresh_expires", RefreshToken.expiresAt)

# Cleanup — add a function callable from a management script or cron
def cleanup_expired_refresh_tokens(db: Session):
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=1)
    db.query(RefreshToken).filter(RefreshToken.expiresAt < cutoff).delete()
    db.commit()
```
Call this weekly. At 100 logins/day × 7-day TTL, a weekly cleanup maintains the table at ~700 rows maximum.

---

### ARCH-NEW-11 — `Invoice.dueDate` Timezone Comparison Bug -- done
**Severity:** HIGH  
**Files:** `routers/automation.py`, `routers/pending.py`, `routers/invoices.py`  
**Status:** Fixed — changed dueDate to Date and removed timezone comparison drift

`Invoice.dueDate` is `Column(DateTime(timezone=True))`. Every overdue comparison in the codebase uses timezone-naive `datetime.now()`:

```python
# automation.py
Invoice.dueDate < datetime.now()

# pending.py
Invoice.dueDate < today  # today is date.today() — naive
```

In IST (UTC+5:30), this means an invoice due at midnight IST appears overdue at 6:30 PM UTC the previous day. Overdue detection is off by 5.5 hours.

**Fix:**
```python
# Change column to Date (not DateTime)
dueDate = Column(Date, nullable=True)

# Change all comparisons to
Invoice.dueDate < date.today()
```
This removes timezone ambiguity entirely. Due dates are calendar dates, not timestamps.

---

## Section 2 — Security Vulnerabilities

### SEC-NEW-01 — RBAC Is Non-Functional: No Staff Login Endpoint --- done 
**Severity:** CRITICAL  
**File:** `routers/auth.py`, `core/dependencies.py`  
**Status:** Fixed — add StaffLoginRequest and implemented staff_login correctly with proper queries

This is the single most critical finding in this audit. The RBAC system in `dependencies.py` is architecturally complete but operationally dead.

`get_caller_role()` handles two token types:
1. Gym-owner tokens: `{gymId, username}` → returns `("OWNER", username)`
2. Staff tokens: `{gymId, userId, username}` → looks up `User` record → returns `(user.role, username)`

The staff token path (path 2) is **unreachable** because there is no endpoint that issues a JWT containing `userId`. The only login endpoint is `POST /api/auth/login`, which authenticates `Gym` owners and issues owner tokens.

This means:
- All tokens in circulation are owner tokens
- `get_caller_role()` always returns `("OWNER", ...)`
- `require_owner()` and `require_owner_or_manager()` always pass for any valid token
- A STAFF account can be created via `POST /api/staff`, but that staff member has no way to log in and receive a token — so the endpoints that are "STAFF restricted" are in practice unreachable anyway
- A gym owner sharing their token with staff gives them OWNER-level access to every protected endpoint

**Fix — this is non-negotiable before production:**
```python
# routers/auth.py — add staff login endpoint
@router.post("/staff-login")
def staff_login(request: LoginRequest, db: Session = Depends(get_db)):
    gym = db.query(Gym).filter(Gym.id == request.gym_id, Gym.isDeleted == False).first()
    user = db.query(User).filter(
        User.gymId == gym.id,
        User.username == request.username
    ).first()
    if not user or not verify_password(request.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = create_access_token(data={
        "gymId": gym.id,
        "userId": user.id,        # ← this is what activates the RBAC path
        "username": user.username,
        "role": user.role,
    })
    raw_refresh = _create_refresh_token(db, gym.id, user_id=user.id)
    db.commit()
    return {"access_token": access_token, "refresh_token": raw_refresh}
```

Without this endpoint, `require_owner()` and `require_owner_or_manager()` are security theater.

---

### SEC-NEW-02 — JWT Has No Audience or Issuer Claims -- done
**Severity:** MEDIUM  
**File:** `core/security.py`, `create_access_token()`  
**Status:** Fixed — added issuer and audience claims to token and enabled validation in dependencies

JWTs contain `gymId`, `username`, and `exp`. No `aud` (audience) or `iss` (issuer) claim. `python-jose` does not validate these unless explicitly passed to `jwt.decode()`.

If any other service in the same infrastructure uses the same `JWT_SECRET_KEY` — an admin panel, a webhook processor, a mobile app backend — tokens from one service are fully valid for another.

**Fix:**
```python
# create_access_token() in security.py
to_encode.update({
    "iss": "eztrack-api",
    "aud": "eztrack-client",
})

# get_current_gym() in dependencies.py
payload = jwt.decode(
    token,
    settings.JWT_SECRET_KEY,
    algorithms=[settings.ALGORITHM],
    audience="eztrack-client",    # ← add this
)
```

---

### SEC-NEW-03 — Rate Limiting Only on Auth Endpoints — Business Endpoints Unprotected -- done
**Severity:** HIGH  
**Files:** All routers except `auth.py`  
**Status:** Fixed — applied per-gym rate limiting to /members, /expenses, /invoices, /audit, and /dashboard

ARCH-10 added rate limiting to `/login` (10/min/IP) and `/signup` (5/min/IP). Every other endpoint has zero rate limiting.

With a valid JWT, any authenticated user can:
- `GET /api/members?page_size=0` in a tight loop → 5,000 Fernet decrypts per iteration
- `POST /api/expenses/bulk-create` with 50,000 items in one request body
- `POST /api/invoices/bulk-create` with no per-request item cap
- `POST /api/audit/seed-sample-data` in a loop (if `ALLOW_SEED_DATA=true`)
- Trigger SSE connections indefinitely (each holds a DB connection outside the pool)

A client-side bug in a frontend retry loop (common: if an endpoint returns 500, retry 3 times with no backoff) hitting `GET /api/members` with a large response can exhaust the connection pool.

**Fix:** Apply per-gym rate limiting to all business endpoints using `gymId` from the JWT as the rate limit key (not IP, which fails in NAT/proxy scenarios):

```python
from slowapi import Limiter

def get_gym_id_from_token(request: Request) -> str:
    # Extract gymId from Authorization header for rate limit keying
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, ...)
        return payload.get("gymId", request.client.host)
    except:
        return request.client.host

limiter = Limiter(key_func=get_gym_id_from_token)

# Apply to heavy endpoints
@router.get("")
@limiter.limit("200/minute")
def get_members(...): ...

@router.post("/bulk-create")
@limiter.limit("5/minute")
def bulk_create_members(...): ...
```

---

### SEC-NEW-04 — Bulk Delete Endpoints Have No Row Count Cap and Missing RBAC -- done
**Severity:** HIGH  
**Files:** `routers/expenses.py`, `routers/invoices.py`  
**Status:** Fixed — Added soft-delete to Expense, Row count cap of 500, and isDeleted == False filters.

Both bulk delete endpoints receive a list of IDs from the request body with no size cap:

**`bulk_delete_expenses`:**
- Accepts unlimited `ids` list
- Uses hard `DELETE` (no soft-delete, no `isDeleted` flag)
- No audit log entry
- No `_rbac=Depends(require_owner_or_manager)` — any STAFF member can permanently delete any number of expense records

**`bulk_delete_invoices`:**
- Accepts unlimited `ids` list
- A request body of 100,000 IDs generates a `WHERE id IN (100,000 values)` SQL clause — large query plan, table lock for duration
- Does have `_rbac=Depends(require_owner_or_manager)` — correctly gated

**Fix:**
```python
MAX_BULK_DELETE = 500

@router.post("/bulk-delete")
def bulk_delete_expenses(
    data: dict,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)   # ← ADD THIS
):
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    if len(ids) > MAX_BULK_DELETE:
        raise HTTPException(status_code=400, detail=f"Cannot delete more than {MAX_BULK_DELETE} records at once")
    
    # Log to AuditLog before deletion
    log_audit(db, current_gym.id, "Expense", "BULK", "DELETE",
              {"ids": ids[:10], "totalCount": len(ids)}, current_gym.username)
    
    # Use soft delete for expenses too
    stmt = Expense.__table__.update().where(
        Expense.id.in_(ids),
        Expense.gymId == current_gym.id
    ).values(isDeleted=True, deletedAt=datetime.utcnow())
    ...
```

---

### SEC-NEW-05 — `update_staff()` Accepts Raw `dict` — Role Escalation Risk -- done
**Severity:** MEDIUM  
**File:** `routers/staff.py`, `update_staff()`  
**Status:** Fixed — Added `password_strength` Pydantic validator to `UserCreate` and `UserUpdate`, schema uses explicitly typed string constants for Role, and `update_staff` blocks MANAGER escalation.

```python
def update_staff(user_id: str, data: dict, ...)
```

A Pydantic schema is not used. The `safe_fields` allowlist prevents most fields from being set, but:

1. `role` accepts any string value. Setting `role = "GOD"` stores it in the DB. `ROLE_RANK.get("GOD", 0)` returns 0 — this user is then treated as having no access at all, effectively locking them out without error.
2. There is no check that a MANAGER cannot set `role = "OWNER"` for another user. A MANAGER can self-escalate by updating their own record to `role = "OWNER"`.
3. Password changes via `data.get("password")` bypass any password strength validation.

**Fix:**
```python
from typing import Literal, Optional
from pydantic import BaseModel, validator

class StaffUpdateRequest(BaseModel):
    role: Optional[Literal["OWNER", "MANAGER", "STAFF"]] = None
    permissions: Optional[list[str]] = None
    activeBranchId: Optional[str] = None
    branchIds: Optional[list[str]] = None
    password: Optional[str] = None

    @validator("password")
    def password_strength(cls, v):
        if v and len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

# In the endpoint — add caller role check
def update_staff(user_id: str, data: StaffUpdateRequest, 
                 caller=Depends(get_caller_role), ...):
    caller_role, _ = caller
    if data.role == "OWNER" and ROLE_RANK.get(caller_role, 0) < ROLE_RANK["OWNER"]:
        raise HTTPException(403, "Only OWNERs can assign OWNER role")
```

---

### SEC-NEW-06 — `preview_template()` Skips Placeholder Validation -- done
**Severity:** MEDIUM  
**File:** `routers/whatsapp_templates.py`, `preview_template()`  
**Status:** Fixed — added placeholder validation to prevent injection

The `update_template` endpoint calls `_validate_template_placeholders()` to enforce the allowlist (SEC-11 fix). The `preview` endpoint does not:

```python
@router.post("/preview")
def preview_template(data: dict, ...):
    template_text = data.get("messageTemplate", "")
    # ← _validate_template_placeholders() is NOT called here
    rendered = template_text
    for key, value in defaults.items():
        rendered = rendered.replace("{" + key + "}", safe_value)
```

An attacker can call `POST /api/whatsapp-templates/preview` with arbitrary template text to:
1. Test which placeholder keys are substituted (enumerates backend variable names)
2. Probe with malformed patterns like `{{{gymName}}}` to test edge cases
3. Receive the rendered output including live gym configuration values (`gymName`, `total`, etc.)

The allowlist in `update_template` is bypassed entirely via the preview endpoint.

**Fix:**
```python
@router.post("/preview")
def preview_template(data: dict, ...):
    template_text = data.get("messageTemplate", "")
    _validate_template_placeholders(template_text)   # ← add this
    ...
```

---

### SEC-NEW-07 — Signed URLs Generated Inline on Every List Response -- done
**Severity:** MEDIUM  
**Files:** `routers/branch_details.py` (`_to_response()`), `routers/expenses.py`, `routers/members.py`  
**Status:** Fixed — Signed URLs are decoupled from list mappers or explicitly gated behind `include_logo` parameter.

`_to_response()` in `branch_details.py` calls `get_signed_url(b.logoUrl)` synchronously on every invocation. `get_signed_url()` makes an API call to Supabase/R2/S3 to generate a presigned URL via `boto3.client().generate_presigned_url()`.

This means:
1. `GET /api/branch-details` is **blocked on an external HTTP call to your storage provider** before it can respond
2. `GET /api/branch-details/all` (for multi-branch gyms) makes N external calls for N branches
3. If the storage provider is slow (latency spike, rate limit), every branch-details response hangs
4. The signed URL is embedded in JSON responses that may be cached by the frontend CDN or browser cache — serving an expired URL to the user with no error until they try to load the image

**Fix:** Do not call `get_signed_url()` in list response mappers. Return the storage key (or omit the URL field) and let the frontend call the dedicated `GET /api/branch-details/logo` endpoint when it needs a fresh URL. Or add `?include_logo=true` as an explicit opt-in:

```python
def _to_response(b: Branch, include_logo: bool = False) -> dict:
    result = {
        "id": b.id,
        ...
        "hasLogo": bool(b.logoUrl),
        # Only generate signed URL if explicitly requested
        "logoUrl": get_signed_url(b.logoUrl) if (include_logo and b.logoUrl) else None,
    }
    return result
```

---

### SEC-NEW-08 — `AuditLog.ipAddress` Is Never Populated -- done
**Severity:** LOW — Compliance Gap  
**File:** `core/audit_utils.py`, `models/all_models.py`  
**Status:** Fixed — Implemented `RequestIPMiddleware` using `contextvars` to automatically inject IP address into `AuditLog` without modifying every router signature.

`AuditLog` has an `ipAddress` column. `log_audit()` never accepts or sets it. Every audit log row has `ipAddress = NULL`. Under DPDP Act 2023 (India's Digital Personal Data Protection Act), for systems handling Aadhaar-adjacent sensitive personal data, audit trails are expected to include originating IP for incident investigation.

**Fix:**
```python
# core/audit_utils.py
def log_audit(db: Session, gym_id: str, entity_type: str, entity_id: str,
              action: str, changes: dict, user_name: str, ip_address: str = None):
    entry = AuditLog(
        ...
        ipAddress=ip_address,
    )

# In each router that calls log_audit(), extract from Request:
# request.client.host
```

Pass `request: Request` into endpoints that call `log_audit()`, or use FastAPI middleware to attach the IP to the request state.

---

### SEC-NEW-09 — Duplicate Check Endpoints Return Full Member Objects to STAFF
**Severity:** LOW  
**File:** `routers/members.py`, `search_duplicates()`, `check_duplicates()`  
**Status:** NEW — not in previous audits

Both duplicate-check endpoints return full member records including phone numbers, Aadhaar hash, and all personal fields. These endpoints are accessible to STAFF — the lowest privilege role.

A malicious STAFF member can use `check_duplicates` as a member search oracle: submit `{Mobile: "9999999999"}` to determine if a specific number is registered, even across the full member directory. No role gate prevents this enumeration.

**Fix:** Restrict the response to only fields needed for the duplicate-warning UI:
```python
# Return minimal data only
return [{
    "id": m.id,
    "Name": m.Name,
    "maskedPhone": mask_phone(m.Mobile),
    "DateOfJoining": m.DateOfJoining,
}]
```

---

### SEC-NEW-10 — No HTTPS Enforcement or HSTS Header
**Severity:** MEDIUM  
**File:** `main.py`  
**Status:** NEW — not in previous audits

The application enforces CORS and JWT authentication but has no `Strict-Transport-Security` header. If deployed without a correctly configured TLS-terminating proxy (or if the proxy is temporarily misconfigured), JWTs and Aadhaar-encrypted payloads flow over plain HTTP.

Given this application handles Aadhaar numbers (even encrypted), HTTPS is a legal requirement under the Information Technology Act and UIDAI guidelines.

**Fix:**
```python
# main.py — add HSTS middleware
from starlette.middleware.base import BaseHTTPMiddleware

class HSTSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = (
            "max-age=63072000; includeSubDomains; preload"
        )
        return response

app.add_middleware(HSTSMiddleware)

# Add startup warning
@asynccontextmanager
async def lifespan(app):
    allowed = os.getenv("ALLOWED_ORIGINS", "")
    if "http://" in allowed and os.getenv("ENV", "development") == "production":
        logger.warning("SECURITY WARNING: ALLOWED_ORIGINS contains plain http:// in production")
    ...
```

---

## Section 3 — Schema Issues

### SCH-NEW-01 — `ProteinStock.Year` and `ProteinStock.Month` Are Locale-Sensitive Strings
**Severity:** MEDIUM  
**File:** `models/all_models.py`, `ProteinStock`  
**Status:** NEW — not in previous audits

`Year = Column(String)` and `Month = Column(String)` — e.g., `Month = "March"`.

Problems:
1. String-sorted `Year` means `"2025" > "2024" > "10"` — cross-year boundary sort will fail
2. `Month = "March"` is English-locale-dependent. Staff entering Hindi text would break grouping
3. These fields duplicate information already available via `ProteinLot.createdAt`
4. SQL cannot `ORDER BY Month` correctly (alphabetical, not calendar order)
5. `GROUP BY Year, Month` on string types requires string matching — fragile and slow

**Fix:** Remove `Year` and `Month` from `ProteinStock`. Add `purchaseDate = Column(Date)` to `ProteinLot`. All monthly grouping queries use `date_trunc('month', ProteinLot.purchaseDate)` in SQL.

---

### SCH-NEW-02 — `Member.LastPaymentAmount` Is `Integer` — Truncates GST Amounts
**Severity:** MEDIUM  
**File:** `models/all_models.py`  
**Status:** NEW — not in previous audits

`LastPaymentAmount = Column(Integer)`. This silently truncates decimal payments. When GST is enabled (18%):

- ₹999 plan + 18% GST = ₹1,178.82 → stored as ₹1,178 (₹0.82 lost)
- At 1,000 renewals/month, this discrepancy accumulates in financial reports

The invoice total is stored as `Numeric(12,2)` (correctly fixed in ARCH-03), but the member's "last payment amount" summary field is not. Dashboard income calculations that use `Member.LastPaymentAmount` will show incorrect totals.

**Fix:**
```python
LastPaymentAmount = Column(Numeric(12, 2), nullable=True)
```
Alembic migration: `ALTER TABLE "Member" ALTER COLUMN "LastPaymentAmount" TYPE NUMERIC(12,2)`

---

### SCH-NEW-03 — `PricingConfig` Has No Unique Constraint for `configType='pt'`
**Severity:** MEDIUM  
**File:** `models/all_models.py`, `PricingConfig`  
**Status:** NEW — not in previous audits

Two partial unique indexes exist:
- `uq_pricing_member` — for `configType = 'member'`
- `uq_pricing_protein` — for `configType = 'protein'`

No unique constraint exists for `configType = 'pt'` (Personal Training). The bulk update endpoint uses SELECT+INSERT logic with no DB-level uniqueness guarantee. Two concurrent requests to `POST /api/settings/pricing/pt-matrix/bulk` can create duplicate PT pricing rows, causing the pricing matrix to return ambiguous prices.

**Fix:**
```python
Index(
    "uq_pricing_pt",
    "gymId", "configType", "planType", "periodType",
    unique=True,
    postgresql_where=text("\"configType\" = 'pt'")
)
```

---

### SCH-NEW-04 — Dashboard Invoice Aggregates Include Soft-Deleted Invoices
**Severity:** LOW  
**File:** `routers/dashboard.py`, `_compute_stats()`  
**Status:** NEW — not in previous audits

The pending balance calculation:
```python
func.sum(Invoice.total - func.coalesce(Invoice.paidAmount, 0))
...Invoice.status.in_(["PENDING", "PARTIAL"]),
```

Does not filter `Invoice.isDeleted == False`. A soft-deleted invoice with `PENDING` status contributes to the pending balance shown on the gym owner's dashboard. This means deleted invoices continue to inflate the "pending receivables" number indefinitely.

**Fix:** Add `Invoice.isDeleted == False` to every invoice aggregate in `_compute_stats()`.

---

### SCH-NEW-05 — No Database-Level `CHECK` Constraints on Enum Columns
**Severity:** MEDIUM  
**File:** `models/all_models.py`  
**Status:** NEW — not in previous audits

The following columns use string enums enforced only at the application layer:

| Column | Valid Values | Risk |
|---|---|---|
| `Invoice.status` | `PENDING`, `PARTIAL`, `PAID` | Seed script or direct SQL could insert `"paid"` (lowercase) — bypasses all `status.in_()` filters |
| `User.role` | `OWNER`, `MANAGER`, `STAFF` | `ROLE_RANK.get("admin", 0)` = 0 — locks out a user whose role was incorrectly set |
| `PaymentEvent.paymentMode` | `CASH`, `UPI`, `CARD`, `BANK` | No validation |
| `Invoice.paymentMode` | Same | No validation |

Direct database writes (Alembic data migrations, admin psql, the seed endpoint) can insert invalid values that silently corrupt application behavior.

**Fix:**
```python
# models/all_models.py
from sqlalchemy import CheckConstraint

class Invoice(Base):
    __table_args__ = (
        CheckConstraint("status IN ('PENDING', 'PARTIAL', 'PAID')", name="ck_invoice_status"),
        CheckConstraint("\"paymentMode\" IN ('CASH', 'UPI', 'CARD', 'BANK')", name="ck_invoice_payment_mode"),
    )

class User(Base):
    __table_args__ = (
        CheckConstraint("role IN ('OWNER', 'MANAGER', 'STAFF')", name="ck_user_role"),
    )
```

---

## Section 4 — Write Amplification Analysis (10K DAU)

This section quantifies every write path at scale and flags the ones that will hurt.

### W1 — PaymentEvent + Invoice.paidAmount on Every Payment
**Volume:** ~1,000 payments/day → 2,000 writes/day  
**Verdict:** Acceptable. Two writes per payment is correct. No amplification.

### W2 — AuditLog on Every Mutation
**Volume:** ~1,000 mutations/day → 1,000 audit writes/day  
**Verdict:** Acceptable now. Needs Alembic migration for time-based partitioning at 12 months (P13 still open). At current growth: 365,000 rows/year. Without partitioning, `WHERE gymId = X AND createdAt > Y` degrades after ~18 months as the table exceeds 500K rows.

### W3 — Dashboard SSE Per-Gym Per-Tick
**Volume (current, broken):** 50 gyms × 9 queries × 1/min = 450 live queries/minute  
**Volume (fixed):** 50 gyms × 1 cache read/min + 1 live recompute/5 min = ~60 queries/minute  
**Verdict:** ARCH-NEW-02 must be fixed before production. Current implementation is 7.5× more expensive than it needs to be.

### W4 — ProteinStock.Quantity Trigger on Every ProteinLot Write
**Volume:** ~500 lot operations/day → 500 trigger-induced UPDATEs/day  
**Verdict:** Acceptable. Single-row UPDATE per trigger.

### W5 — RefreshToken Accumulation
**Volume:** ~100 logins/day → 700 live rows at any time, 36,500 rows/year (no cleanup)  
**Verdict:** Growing problem. After 6 months: 18,000 rows, mostly stale. Add weekly cleanup (ARCH-NEW-10).

### W6 — GymDailySummary Upsert (if fixed per ARCH-NEW-02)
**Volume (if fixed correctly):** 1 upsert per gym per recompute cycle = ~50 upserts per 5 minutes = 14,400/day  
**Verdict:** Acceptable, but note: this table has a UNIQUE constraint on `(gymId, date)`, which means every upsert triggers index maintenance. At this volume it is fine. Would become problematic at 500+ active gyms.

### W7 — WhatsApp Template Default Initialization (DATA-5 fix)
**Volume (after fix):** COUNT query on first GET per gym per TTL window  
**Verdict:** Acceptable. The early-exit count check reduces this to ~50 COUNT queries/day total.

### Summary Table

| Write Path | Volume/Day | Verdict |
|---|---|---|
| PaymentEvent inserts | 1,000 | ✅ Fine |
| AuditLog writes | 1,000 | ✅ Fine, needs partition plan |
| Dashboard live queries (broken) | 450/min | 🔴 Fix ARCH-NEW-02 |
| Dashboard live queries (fixed) | ~60/min | ✅ Fine |
| Protein trigger UPDATEs | 500 | ✅ Fine |
| RefreshToken row growth | 36,500/yr | ⚠️ Add cleanup |
| GymDailySummary upserts | 14,400 | ✅ Fine at current scale |

---

## Section 5 — Redundant Relationships

| Relationship | Issue | Risk |
|---|---|---|
| `Invoice.gymId` + `Invoice.memberId` | `memberId` implies `gymId`. Denormalized `gymId` exists for query efficiency — correct. But no `CHECK` constraint prevents `invoice.gymId != invoice.member.gymId`. A bug could create cross-tenant invoice attribution. | Add: application-layer assertion in `create_invoice()` that `member.gymId == current_gym.id` |
| `PaymentEvent.gymId` + `PaymentEvent.invoiceId` | Same denormalization. `invoiceId` already implies `gymId`. The `ix_payment_gym` index justifies the redundancy. | Same: verify `invoice.gymId == current_gym.id` before inserting `PaymentEvent` |
| `ProteinLot.gymId` + `ProteinLot.proteinId` | DATA-3 fixed at application layer — gym ownership checked before lot insert. No DB-level constraint. | Add `CHECK` or rely on FK + application guard. Current guard is sufficient. |
| `Branch.gymId` on every entity | Necessary for tenant isolation. Not redundant. | None |
| `GymSettings` 1:1 with `Gym` | 37 columns on a single settings table. At current scale this is fine. If settings grow beyond 60 columns, consider splitting into `GymBillingSettings`, `GymNotificationSettings`, `GymStockSettings`. Not urgent. | None now, plan for future |
| `PendingBalance*` schema classes | Reference a deprecated and removed model. Pure dead code. | Delete |

---

## Section 6 — Open Items From Previous Audits

| ID | Severity | Status | Issue |
|---|---|---|---|
| P9 | HIGH | 🔴 OPEN | `Invoice.dueDate` timezone comparison bug — overdue detection wrong by 5.5 hours in IST. See ARCH-NEW-11. |
| P11 | MEDIUM | 🔴 OPEN | Dashboard alerts `get_alerts()` still has O(N) Python loop. Separate from `_compute_stats()`. |
| P12 | MEDIUM | 🔴 OPEN | `User.branchIds` is JSON array — cannot query "which users can access branch X" in SQL. Needs `UserBranchAccess` junction table + Alembic migration. |
| P13 | MEDIUM | 🔴 OPEN | `AuditLog` time-based partitioning declared in model comment but not implemented in DB. At 365K rows/year, this needs a partition migration before the 12-month mark. |
| P14 | LOW | 🔴 OPEN | `GymSubscription.maxStaff` and `maxBranches` enforcement not implemented. Only `maxMembers` is checked. |

---

## Section 7 — Prioritized Action List

### Immediate (Before First Production User)

These are blocking issues. Do not go to production without fixing them.

1. **SEC-NEW-01** — Add `POST /api/auth/staff-login` that issues JWTs containing `userId`. Without this, all role enforcement is security theater and every token holder has OWNER-level access.
2. **ARCH-NEW-05** — Fix `search_duplicates()` to use `hash_aadhaar()` against `AadhaarHash`. The current code silently never finds Aadhaar duplicates — a regulatory compliance failure.
3. **ARCH-NEW-04** — Remove `page_size=0` bypass or gate it behind `require_owner`. A STAFF member can currently dump the entire member database with one request.
4. **P9 / ARCH-NEW-11** — Fix `Invoice.dueDate` to `Column(Date)` and change all comparisons to `date.today()`. Overdue detection is wrong today.
5. **ARCH-NEW-09** — Add `db.flush()` before `PaymentEvent` construction in `bulk_create_invoices()` and insert `PaymentEvent` in `create_invoice()` for paid invoices.
6. **SEC-NEW-04** — Add `MAX_BULK_DELETE = 500` cap and `require_owner_or_manager` to `bulk_delete_expenses`.

### Sprint 2

7. **ARCH-NEW-01** — Convert SSE generator to use pooled async sessions. Delete `asyncio.to_thread()` wrapper.
8. **ARCH-NEW-02** — Make `_compute_stats()` read from `GymDailySummary` when fresh. Add gym-level SSE connection registry.
9. **ARCH-NEW-03** — Delete `sync_protein_quantity()`. The PostgreSQL trigger handles it.
10. **SEC-NEW-03** — Apply per-gym rate limiting to all business endpoints, keyed on `gymId`.
11. **SCH-NEW-05** — Add `CHECK` constraints for `Invoice.status`, `User.role`, `PaymentEvent.paymentMode`.
12. **SEC-NEW-07** — Remove inline `get_signed_url()` from list response mappers.
13. **ARCH-NEW-10** — Add `RefreshToken` cleanup job. Add index on `expiresAt`.
14. **ARCH-NEW-07** — Cache plain dict in `core/cache.py` instead of ORM object.
15. **SEC-NEW-06** — Add `_validate_template_placeholders()` call to `preview_template()`.

### Sprint 3 (Architecture)

16. **P12** — `UserBranchAccess` junction table + Alembic migration + router updates.
17. **P13** — Alembic migration for `AuditLog` monthly partitioning.
18. **SCH-NEW-01** — Remove `Year`/`Month` strings from `ProteinStock`. Add `purchaseDate` to `ProteinLot`.
19. **SEC-NEW-02** — Add `iss`/`aud` claims to JWT.
20. **SCH-NEW-02** — Change `Member.LastPaymentAmount` to `Numeric(12,2)`.
21. **SCH-NEW-03** — Add unique constraint for `configType='pt'` pricing.
22. **SEC-NEW-05** — Typed `StaffUpdateRequest` schema with role escalation guard.
23. **SEC-NEW-08** — Populate `AuditLog.ipAddress` from `request.client.host`.
24. **SEC-NEW-10** — Add HSTS middleware and startup HTTP warning.
25. **ARCH-NEW-08** — Delete `migration.py`.
26. **File cleanup** — Delete dead `PendingBalance*` schema classes. Split `schemas/pending.py`. Merge `routers/pending.py` into `routers/invoices.py`.

---

## Section 8 — Architecture Scorecard

This reflects the current state of the codebase as of this audit, incorporating all three audit documents.

| Category | Master Audit | Audit v2 | This Audit (v3) | Delta v2→v3 | Key Issue |
|---|---|---|---|---|---|
| Data Types | A | A | A | — | No regression |
| Indexing | A- | A- | A- | — | No regression |
| Binary Storage | A | A | A | — | No regression |
| Query Efficiency | B+ | B | B- | ↓ | SSE opens connections outside pool (ARCH-NEW-01) |
| Write Atomicity | A- | B+ | B | ↓ | `create_invoice()` sets paidAmount without PaymentEvent (ARCH-NEW-09) |
| Multi-Tenancy | A | A | A | — | No regression |
| Schema Normalization | B+ | B | B- | ↓ | `Year`/`Month` strings, `Integer` LastPaymentAmount, no PT pricing unique constraint |
| RBAC / Auth | B | D | D | — | Staff login still missing — RBAC operationally non-functional |
| Scalability Architecture | B | B- | C+ | ↓ | `page_size=0` bypass, no business-endpoint rate limiting, unsigned URL inline calls |
| Audit / Compliance | C+ | C | C- | ↓ | `ipAddress` never populated, Aadhaar search broken, soft-deleted invoices in dashboard totals |
| Runtime Correctness | A | B+ | B | ↓ | Double status compute, double-commit in proteins.py |

**Net verdict:** The infrastructure-level fixes from the Master Audit are solid. The regression in this audit is almost entirely in the auth/RBAC layer and in edge-case correctness. The RBAC finding (SEC-NEW-01) is the most severe: the role system is completely non-functional as shipped. Everything else is fixable in two sprints without structural rewrites.

---

## Section 9 — Dependency Audit

| Package | Purpose | Required? | Notes |
|---|---|---|---|
| `fastapi` | Web framework | Required | — |
| `sqlalchemy` | ORM | Required | — |
| `asyncpg` | Async PostgreSQL driver | Required (once ARCH-NEW-01 is fixed) | Currently installed but unused |
| `python-jose` | JWT encode/decode | Required | No `aud`/`iss` validation today |
| `passlib[bcrypt]` | Password hashing | Required | — |
| `cryptography` | Aadhaar Fernet encryption | Required | — |
| `boto3` | Object storage (S3 API) | Required | — |
| `httpx` | Sync HTTP client (logo base64) | Required | Used only in `branch_details.py:get_gym_logo_base64` |
| `Pillow` | Image magic-byte + re-encode | Recommended | Falls back to raw bytes with a warning if missing |
| `slowapi` | Rate limiting | Recommended | Falls back to no-op decorator if missing |
| `pydantic-settings` | Config from .env | Required | — |
| `uvicorn` | ASGI server | Required | — |
| `apscheduler` | Background jobs | **REMOVED** ✅ | Replaced by SSE |
| `redis` | Cache | **REJECTED** ✅ | In-process cache used |

---

*Audit completed: February 28, 2026*  
*Next review recommended: After Sprint 2 delivery (estimated 4–6 weeks)*
