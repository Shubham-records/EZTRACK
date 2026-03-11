# EZTRACK Backend Audit — 10,000 DAU Simulation

> **Date:** 2026-03-07
> **Scope:** Architecture, schema, security, scalability, file hygiene
> **Target Load:** 10,000 daily active users across ~200 gyms (50 concurrent)
> **Constraints:** No Redis, no Docker

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview at 10K DAU](#2-architecture-overview-at-10k-dau)
3. [Schema & Data Model Audit](#3-schema--data-model-audit)
4. [Bottleneck & Write Amplification Analysis](#4-bottleneck--write-amplification-analysis)
5. [Security Vulnerability Assessment](#5-security-vulnerability-assessment)
6. [File Cleanup & Consolidation](#6-file-cleanup--consolidation)
7. [Critical Bugs Found During Audit](#7-critical-bugs-found-during-audit)
8. [Recommended Schema Improvements](#8-recommended-schema-improvements)
9. [Priority Action Items](#9-priority-action-items)

---

## 1. Executive Summary

EZTRACK is a multi-tenant gym management SaaS API built on **FastAPI + SQLAlchemy + PostgreSQL** with a React frontend. The codebase demonstrates mature security practices (Fernet encryption, HMAC dedup, JWT family rotation, RBAC, audit logging) and sensible architectural decisions (SSE over WebSockets, append-only payment events, in-process caching).

**However, this audit uncovered:**

| Category | Critical | High | Medium | Low |
|---|---|---|---|---|
| **Bugs** | 1 | 2 | 3 | 1 |
| **Security** | 2 | 5 | 6 | 4 |
| **Scalability** | 0 | 3 | 5 | 2 |
| **Code Hygiene** | 0 | 0 | 2 | 5 |

**The single most critical finding:** `_compute_stats()` in `dashboard.py` is **missing its `return result` statement**, meaning the sync `/stats` endpoint always returns `None` (HTTP 200 with `null` body) while the async SSE path works correctly.

---

## 2. Architecture Overview at 10K DAU

### 2.1 Traffic Model Assumptions

| Metric | Value | Calculation |
|---|---|---|
| Total DAU | 10,000 | Given |
| Gyms | ~200 | Avg 50 members per gym |
| Peak concurrent users | ~500 | 5% of DAU |
| API requests/sec (peak) | ~50 | 500 users × 6 actions/min ÷ 60 |
| SSE streams (concurrent) | ~50 | 1 dashboard per gym |
| DB connections needed | ~30 | 50 RPS × 0.6s avg query time |
| DB connections configured | 20 + 40 overflow = 60 | `database.py` pool_size + max_overflow |

### 2.2 Architecture Strengths

| Feature | Implementation | Status |
|---|---|---|
| Multi-tenancy isolation | `gymId` filter on every query | ✅ Strong |
| JWT + RBAC | 3-tier (OWNER/MANAGER/STAFF) | ✅ Strong |
| Refresh token security | Family rotation + theft detection | ✅ Strong |
| Financial data integrity | `Numeric(12,2)` + append-only `PaymentEvent` | ✅ Strong |
| Aadhaar encryption | Fernet AES-128 + HMAC dedup hash | ✅ Strong |
| Object storage | S3-compatible (Supabase/R2/S3) | ✅ Strong |
| Image upload security | Magic byte validation + Pillow re-encode | ✅ Strong |
| Dashboard SSE dedup | `GymStreamManager` shares tick per gym | ✅ Strong |
| DB-level triggers | Quantity sync, JSON validation, FK validation | ✅ Strong |

### 2.3 Architecture Weaknesses

| Weakness | Impact at 10K DAU | Severity |
|---|---|---|
| No read replicas | All reads hit single primary | Medium |
| In-process cache only (`cache.py`) | Cache not shared across workers | Medium |
| Sync `get_db()` used in SSE-adjacent routes | Can block event loop under load | Medium |
| No connection health checks | Stale connections returned to pool | Low |
| No request ID / trace correlation | Hard to debug distributed issues | Low |

---

## 3. Schema & Data Model Audit

### 3.1 Model Inventory

| Model | Soft Delete | Audit Logged | gymId Indexed | Concerns |
|---|---|---|---|---|
| `Gym` | ✅ | N/A | PK | Hard-delete blocked by PG rule |
| `Member` | ✅ | ✅ | ✅ | `computed_status` CASE expression is good |
| `Invoice` | ✅ | ✅ | ✅ | — |
| `PaymentEvent` | N/A (append-only) | N/A | ✅ | Good: immutable ledger |
| `Expense` | ✅ | ✅ | ✅ | — |
| `ProteinStock` | ❌ **Hard delete** | Partial (price only) | ✅ | **Missing soft-delete** |
| `ProteinLot` | ❌ **Hard delete** | ❌ | ✅ | **Missing audit + soft-delete** |
| `User` (Staff) | ❌ **Hard delete** | ❌ | ✅ | **Missing audit logging** |
| `ExternalContact` | ✅ (via `isActive`) | ❌ | ✅ | — |
| `AuditLog` | N/A | N/A | ✅ | Partition-ready |
| `GymDailySummary` | N/A | N/A | ✅ | Cache table, good |
| `PricingConfig` | ✅ (via `isActive`) | ❌ | ✅ | — |
| `WhatsAppTemplate` | ✅ (via `isActive`) | ❌ | ✅ | — |
| `TermsAndConditions` | ✅ (via `isActive`) | ❌ | ✅ | — |
| `Branch` | ✅ (via `isActive`) | ❌ | ✅ | — |
| `RefreshToken` | N/A | N/A | ✅ | Needs periodic cleanup |
| `GymSubscription` | N/A | N/A | ✅ | — |

### 3.2 Redundant Relationships & Denormalization

| Issue | Tables | Analysis | Recommendation |
|---|---|---|---|
| `User.branchIds` (JSON) **AND** `UserBranchAccess` table | `User`, `UserBranchAccess` | Both exist: JSON for backward compat, junction table for normalization. DB trigger validates JSON against `Branch` table. | ⚠️ **Phase out JSON column** — rely only on `UserBranchAccess`. The JSON column is a maintenance trap; the trigger adds write overhead on every User INSERT/UPDATE. |
| `ProteinLot.gymId` duplicates `ProteinStock.gymId` | `ProteinLot`, `ProteinStock` | Denormalized for query efficiency. Explicit cross-tenant guard exists. | ✅ **Acceptable** — the denormalization avoids a JOIN for tenant filtering. Document the invariant. |
| `Invoice.paidAmount` vs `SUM(PaymentEvent.amount)` | `Invoice`, `PaymentEvent` | Materialized aggregate for read performance. Reconciliation endpoint exists. | ✅ **Acceptable** — reconciliation endpoint (`/reconcile-payments`) handles drift. |
| `ProteinStock.Quantity` vs `SUM(ProteinLot.quantity)` | `ProteinStock`, `ProteinLot` | DB trigger auto-syncs. | ✅ **Good** — trigger eliminates drift. |

### 3.3 Missing Indexes (for 10K DAU scale)

| Table | Proposed Index | Rationale |
|---|---|---|
| `Invoice` | `(gymId, invoiceDate)` | Used in every dashboard stats query; currently no composite covering index |
| `Invoice` | `(gymId, status, isDeleted)` | Pending balance queries filter on these 3 columns |
| `Expense` | `(gymId, date, isDeleted)` | Summary and dashboard queries filter by date range |
| `Member` | `(gymId, isDeleted, computed_status)` | Dashboard active member counts; `computed_status` is a SQL expression so a functional index or a partial index on `NextDuedate` is more appropriate |
| `Member` | `(gymId, NextDuedate)` | Expiry alert queries use this range |
| `AuditLog` | `(gymId, createdAt)` | Already exists ✅ |
| `RefreshToken` | `(expiresAt)` | Cleanup script needs to find expired tokens efficiently |

---

## 4. Bottleneck & Write Amplification Analysis

### 4.1 Write Amplification Hotspots

| Operation | Writes Generated | Analysis |
|---|---|---|
| **Create Member** | 1 Member + 1 Invoice + 1 PaymentEvent + 1 AuditLog + 1 AuditLog (invoice) | **5 writes per member creation.** At bulk import (100 members), this is 500 DB writes. The `flush()` before `PaymentEvent` is correct. Acceptable. |
| **Create ProteinLot** | 1 ProteinLot + 1 ProteinStock UPDATE (trigger) | **2 writes.** Trigger fires synchronously. Low concern. |
| **Dashboard SSE tick** | 9 aggregate queries + 1 GymDailySummary upsert | **Mitigated by 5-min cache.** At 50 gyms, worst case = 10 upserts/5-min = 0.03 writes/sec. ✅ |
| **Bulk expense import** | N Expense rows + 1 commit | **No individual AuditLog per expense** in bulk-create. ⚠️ Consider logging the batch metadata. |
| **Update ProteinStock** | 1 ProteinStock UPDATE + 1 AuditLog (if price changed) | **2 writes max.** Acceptable. |
| **`PATCH /proteins/update`** | Same as PUT but accepts raw dict | ⚠️ **No input validation** — `data: dict` bypass. Addresses in Security section. |

### 4.2 Query Bottlenecks at 10K DAU

| Endpoint | Current Pattern | Problem | Fix |
|---|---|---|---|
| `GET /expenses/summary` | Fetches **all** expenses into Python, groups in-memory | O(N) memory for large datasets | Use `GROUP BY` in SQL: `db.query(Expense.category, func.sum(Expense.amount)).group_by(Expense.category)` |
| `GET /proteins/low-stock` | Fetches **all** proteins, filters in Python | O(N) at 50+ gyms with 200+ products each | Already partially fixed in dashboard — apply same SQL filter here |
| `GET /automation/low-stock-items` | Fetches **all** proteins, filters in Python | Duplicate of the above pattern | Consolidate with `/proteins/low-stock` or use SQL filter |
| `GET /automation/smart-suggestions` | Fetches **all** proteins just to count low stock | Wasteful | Use `SELECT COUNT(*)` with threshold filter |
| `GET /dashboard/stats` (sync) | 9 aggregate queries, then caches to GymDailySummary | **BUG:** Missing `return result` — always returns `None` | Fix immediately (see §7) |
| `GET /contacts` | No pagination | All contacts loaded at once | Add `limit`/`offset` pagination |

### 4.3 Connection Pool Pressure

At 10K DAU with ~50 RPS peak:

```
Current config:
  pool_size     = 20
  max_overflow  = 40
  pool_timeout  = 30
  → Max connections = 60
```

**Assessment:** With average query times of 10-50ms, 50 RPS would use ~3-5 connections concurrently. The pool is **adequately sized** for 10K DAU. The concern is when SSE streams hold long-lived connections:

- 50 SSE streams × 1 connection/tick (released after each tick) = spiky demand
- **Mitigation:** SSE uses `AsyncSessionLocal()` with its own connection lifecycle, released after each tick. ✅

---

## 5. Security Vulnerability Assessment

### 5.1 CRITICAL Severity

| ID | Vulnerability | Location | Description | Mitigation |
|---|---|---|---|---|
| **SEC-CRIT-01** | **Unvalidated dict input on write endpoints** | `proteins.py:422` `PATCH /proteins/update` | Accepts `data: dict` with **no schema validation**. Any field (including `gymId`, `id`, `createdAt`) can be set by the client. The `updatable_data` blocklist only removes 7 known keys — an attacker can set any other ORM attribute. | **Replace `data: dict` with a typed Pydantic schema** (e.g., `ProteinInlineUpdate`). Block all fields not explicitly defined. |
| **SEC-CRIT-02** | **Bulk-create endpoints accept raw dict** | `expenses.py:88`, `proteins.py:281` | `bulk_create_expenses` and `bulk_create_proteins` both accept `data: dict` instead of a validated Pydantic model. Arbitrary fields pass through to ORM constructors. | **Define `BulkExpenseCreate` and `BulkProteinCreate` Pydantic schemas** with strict field definitions. |

### 5.2 HIGH Severity

| ID | Vulnerability | Location | Description | Mitigation |
|---|---|---|---|---|
| **SEC-HIGH-01** | **Missing RBAC on member create/update** | `members.py` | Any authenticated user (including STAFF) can create and update members. Only bulk-delete requires MANAGER+. A malicious STAFF user could modify member data or import 10K fake members. | Add `require_owner_or_manager` dependency to `POST /members` and `PUT /members/{id}`. Keep individual GET accessible to STAFF for lookup. |
| **SEC-HIGH-02** | **Missing RBAC on invoice create** | `invoices.py` | Any authenticated user can create invoices and record payments. A malicious STAFF user could create fraudulent invoices. | Add `require_owner_or_manager` to `POST /invoices` and `POST /invoices/{id}/pay`. |
| **SEC-HIGH-03** | **Missing RBAC on expense create/update** | `expenses.py` | Any authenticated user can create and update expenses. Only delete requires MANAGER+. | Add `require_owner_or_manager` to `POST /expenses` and `PUT /expenses/{id}`. |
| **SEC-HIGH-04** | **Protein image stored as BYTEA in DB** | `proteins.py:506-573` | Unlike expense receipts (stored in object storage), protein images are stored directly as `imageData` BYTEA column. At 5MB max × 200 products = 1GB of binary data in PostgreSQL. This bloats table size, slows backups, and defeats WAL archiving. | **Migrate to object storage** (same pattern as `expenses.py` receipts). Store `imageUrl` key, use signed URLs. |
| **SEC-HIGH-05** | **No file size validation on protein image upload** | `proteins.py:522` | `file.read()` reads the entire file into memory with no size limit, unlike `storage.py` which has a 5MB cap and magic byte validation. | Use `storage.py`'s `upload_image()` which validates MIME type, magic bytes, file size, and re-encodes. |

### 5.3 MEDIUM Severity

| ID | Vulnerability | Location | Description | Mitigation |
|---|---|---|---|---|
| **SEC-MED-01** | **Settings update accepts any field via `setattr`** | `settings.py:50` | `for key, value in update_data.items(): setattr(settings, key, value)` — if the Pydantic schema is broad, unexpected fields could be set. | Validate that schema only includes known settings fields. Current schema appears well-defined, but enforce an explicit allowlist for defense-in-depth. |
| **SEC-MED-02** | **Pricing matrix bulk update accepts `data: dict`** | `settings.py:168`, `settings.py:253`, `settings.py:316` | Three bulk pricing endpoints accept unvalidated dicts. While the loop structure limits damage, `float(price)` conversion could throw unhandled exceptions on non-numeric input. | Define typed Pydantic schemas for bulk pricing updates. |
| **SEC-MED-03** | **Contact CRUD missing RBAC on create/update** | `contacts.py` | Any authenticated user can create and update external contacts. Only delete requires MANAGER+. | Add `require_owner_or_manager` to write endpoints. |
| **SEC-MED-04** | **Terms CRUD missing RBAC on create/update** | `terms.py` | Similar to contacts — any authenticated user can create and update terms. | Add `require_owner_or_manager` to `POST /terms` and `PUT /terms/{id}`. |
| **SEC-MED-05** | **`datetime.utcnow()` deprecated** | `expenses.py:153,218` | `datetime.utcnow()` is deprecated in Python 3.12+. Returns naive datetime (no timezone info). | Replace with `datetime.now(timezone.utc)` throughout. |
| **SEC-MED-06** | **WhatsApp template preview renders user input** | `whatsapp_templates.py:206-210` | While HTML escaping is applied, the template body itself comes from user input. The final `re.sub(r"<[^>]+>", "", rendered)` strip is good but regex-based HTML stripping is not 100% reliable. | Current mitigation is acceptable for plain-text WhatsApp messages. Ensure frontend never renders this as HTML. |

### 5.4 LOW Severity

| ID | Vulnerability | Location | Description | Mitigation |
|---|---|---|---|---|
| **SEC-LOW-01** | **Seed data endpoint in production code** | `audit.py:160` | `seed-sample-data` endpoint exists in production code. Gated by `ALLOW_SEED_DATA` env var and OWNER role, which is acceptable. | Move to a separate dev-only module or behind a feature flag. Current env var gate is adequate. |
| **SEC-LOW-02** | **Error messages expose internal details** | `expenses.py:163`, `proteins.py:359` | `HTTPException(status_code=500, detail=str(e))` — exception messages (table names, SQL errors) leak to API clients. | Return generic error messages. Log the actual exception server-side. |
| **SEC-LOW-03** | **Rate limiting not applied to all write endpoints** | Various | `bulk_create_expenses` is rate-limited (5/min) but `create_expense`, `create_protein`, `create_protein_lot` are not. | Add rate limiting to all create endpoints (e.g., `"30/minute"`). |
| **SEC-LOW-04** | **Branch logo base64 endpoint fetches external URL** | `branch_details.py:303` | `httpx.get(signed_url)` fetches from external storage. If the signed URL is manipulated (SSRF via stored key), the server could be tricked into fetching arbitrary URLs. | The storage key is server-generated (UUID), so SSRF risk is minimal. For defense-in-depth, validate that the signed URL domain matches `STORAGE_ENDPOINT_URL`. |

### 5.5 Security Checklist

| Control | Implemented | Notes |
|---|---|---|
| JWT with issuer/audience validation | ✅ | `security.py` + `dependencies.py` |
| Password hashing (bcrypt) | ✅ | `passlib` with `bcrypt` scheme |
| CORS strict origins | ✅ | Explicit `ALLOWED_ORIGINS` list |
| HSTS headers | ✅ | Middleware in `main.py` |
| Rate limiting (auth endpoints) | ✅ | `slowapi` on login/signup/refresh |
| Rate limiting (data endpoints) | ⚠️ Partial | Only on bulk operations and seed data |
| Aadhaar encryption at rest | ✅ | Fernet AES-128-CBC |
| Aadhaar masked in API responses | ✅ | `mask_aadhaar()` returns `XXXX-XXXX-NNNN` |
| SQL injection protection | ✅ | SQLAlchemy parameterized queries |
| IDOR prevention | ✅ | `gymId` filter on all data access |
| File upload validation | ✅ | Magic bytes + Pillow re-encode (for storage.py) |
| Audit trail | ✅ | `AuditLog` with sensitive field scrubbing |
| IP address logging | ✅ | `x-forwarded-for` from trusted proxies only |
| Refresh token rotation | ✅ | Family-based theft detection |
| Subscription limit enforcement | ✅ | `maxMembers` and `maxStaff` checks |
| Gym hard-delete prevention | ✅ | PG rule + ORM event |
| Input validation (Pydantic) | ⚠️ Partial | Missing on bulk/patch endpoints |
| CSRF protection | ✅ | JWT in header (no cookies used for auth) |

---

## 6. File Cleanup & Consolidation

### 6.1 Files to DELETE

| File | Reason | Safe to Remove? |
|---|---|---|
| `backend/test_import.txt` | Debug artifact — Windows traceback from pydantic import failure. Not a test file. | ✅ Yes |
| `backend/pytest.log` | Stale test log — contains Windows-specific pydantic import errors. Not useful in Linux environment. | ✅ Yes |
| `EZTRACK_AUDIT_REPORT.md` | Superseded by `EZTRACK_Full_Audit_v3.md` and this document | ✅ Yes (archive first) |
| `EZTRACK_Audit_v2.md` | Superseded by `EZTRACK_Full_Audit_v3.md` and this document | ✅ Yes (archive first) |
| `EZTRACK_Master_Audit.md` | Superseded by `EZTRACK_Full_Audit_v3.md` and this document | ✅ Yes (archive first) |

### 6.2 Files to REVIEW for Consolidation

| Files | Recommendation | Rationale |
|---|---|---|
| `routers/automation.py` endpoints vs `routers/dashboard.py` alerts | **Merge `automation.py` into `dashboard.py`** | `automation.py` duplicates logic from `dashboard.py` alerts (low stock, expiring members, overdue payments). The WhatsApp bulk reminder is the only unique feature — move it to a `whatsapp_automation` sub-router or keep in `automation.py` with imports from dashboard. |
| `routers/audit.py` (seed data) vs dev tooling | **Extract `seed-sample-data` into `scripts/seed_data.py`** | Seed data doesn't belong in the audit router. Move to `scripts/` directory alongside `clean_refresh_tokens.py`. |
| `backend/migrate.py` | **Keep but document clearly** | Contains important DB triggers and partitioning logic. Not a "migration" in the Alembic sense — rename to `db_setup.py` for clarity. |

### 6.3 Dead Code

| Item | Location | Status |
|---|---|---|
| `test_migration.py` references `list` return from GET /members | `tests/test_migration.py:74` | Test expects a `list` but GET /members returns a `dict` with pagination. **Test is broken.** |
| `test_migration.py` references `list` return from GET /invoices | `tests/test_migration.py:148` | Same issue — GET /invoices returns paginated dict, not a list. |
| `test_migration.py` references `list` return from GET /proteins | `tests/test_migration.py:153` | GET /proteins returns `{"data": [...], "total": ..., ...}`, not a list. |

---

## 7. Critical Bugs Found During Audit

### BUG-01: `_compute_stats()` Missing Return Statement [CRITICAL]

**File:** `backend/routers/dashboard.py`, line 180
**Impact:** `GET /api/dashboard/stats` always returns `null` (HTTP 200)
**Root Cause:** The function builds a `result` dict but never returns it.
**Note:** The async version (`_compute_stats_async`) correctly returns. The SSE cache path (`_stats_from_summary`) also works. Only the sync one-shot endpoint is broken.

```python
# Line 180: Missing return
    result = {
        "activeMembers":    active_members,
        ...
        "_source":          "live",
    }
    # ← MISSING: return result

async def _compute_stats_async(...):
    ...
    return {  # ← This async version correctly returns
```

**Fix:**
```python
    result = {
        ...
    }
    # ── ARCH-NEW-02: Upsert into GymDailySummary ──
    ...
    return result  # ← ADD THIS LINE
```

### BUG-02: Expense Summary Uses String Comparison for Dates [HIGH]

**File:** `backend/routers/expenses.py`, lines 302-303
**Impact:** Date range filtering broken — compares `Date` column against unparsed string parameters.

```python
# Lines 301-303 — BUG: date columns compared with raw strings
if start_date:
    query = query.filter(Expense.date >= start_date)  # start_date is a str!
if end_date:
    query = query.filter(Expense.date <= end_date)    # end_date is a str!
```

**Fix:** Call `parse_date()` on the string parameters:
```python
if start_date:
    query = query.filter(Expense.date >= parse_date(start_date))
if end_date:
    query = query.filter(Expense.date <= parse_date(end_date))
```

### BUG-03: Expense Summary Loads All Rows into Python [HIGH]

**File:** `backend/routers/expenses.py`, lines 306-316
**Impact:** At scale, `query.all()` fetches all matching expenses into Python memory just to sum them by category. With 10K DAU and thousands of expenses per gym, this causes memory spikes and slow responses.

**Fix:** Replace with SQL aggregate:
```python
from sqlalchemy import func

results = db.query(
    Expense.category,
    func.sum(Expense.amount).label("total"),
    func.count(Expense.id).label("count")
).filter(
    Expense.gymId == current_gym.id,
    Expense.isDeleted == False,
).group_by(Expense.category).all()

summary = {r.category: float(r.total or 0) for r in results}
total = sum(summary.values())
count = sum(r.count for r in results)
```

### BUG-04: Protein Bulk-Delete is HARD DELETE [MEDIUM]

**File:** `backend/routers/proteins.py`, lines 351-354
**Impact:** `bulk_delete_proteins` uses `DELETE` statement, permanently removing data. Unlike expenses (which use soft-delete), protein deletions are irreversible. No audit log is written.

```python
# Line 351 — HARD DELETE, no audit
stmt = ProteinStock.__table__.delete().where(...)
```

**Fix:** Use soft-delete pattern (add `isDeleted` + `deletedAt` to ProteinStock model) or at minimum, add audit logging before deletion.

### BUG-05: Single Protein Delete is HARD DELETE Without Audit Log [MEDIUM]

**File:** `backend/routers/proteins.py`, lines 499-500
**Impact:** `DELETE /proteins/{id}` calls `db.delete(protein)` — permanent deletion with no audit trail. Lot data is cascade-deleted.

### BUG-06: Staff Delete is HARD DELETE [MEDIUM]

**File:** `backend/routers/staff.py`, lines 186-187
**Impact:** `DELETE /staff/{id}` permanently removes the User row. If the user had activity logged in `AuditLog`, the `userId` reference becomes an orphan.

**Fix:** Add soft-delete (`isActive = False`) or keep the row but revoke access.

### BUG-07: `adjust_protein_stock` Missing Audit Log [LOW]

**File:** `backend/routers/proteins.py`, line 610-620
**Impact:** Stock adjustments create a lot but don't write to AuditLog, breaking the audit trail for inventory changes.

---

## 8. Recommended Schema Improvements

### 8.1 For Long-Term Stability (Not Simplicity)

| ID | Change | Table(s) | Rationale | Complexity |
|---|---|---|---|---|
| **SCH-01** | Add `isDeleted` + `deletedAt` to `ProteinStock` | `ProteinStock` | Currently hard-deleted. At scale, accidental deletions are unrecoverable. Soft-delete allows recovery window. | Low |
| **SCH-02** | Remove `User.branchIds` JSON column | `User` | Fully replaced by `UserBranchAccess` table. Keeping both causes write amplification (trigger validates JSON on every User write). | Medium |
| **SCH-03** | Add composite indexes for dashboard queries | `Invoice`, `Expense`, `Member` | See §3.3 — prevents sequential scans at scale | Low |
| **SCH-04** | Partition `AuditLog` by month | `AuditLog` | Already planned (P13 in `migrate.py`). Execute when table exceeds 100K rows. | Medium |
| **SCH-05** | Add `RefreshToken.expiresAt` index | `RefreshToken` | Cleanup script performance — without index, every cleanup does a full table scan | Low |
| **SCH-06** | Move protein images from BYTEA to object storage | `ProteinStock` | Replace `imageData` BLOB with `imageUrl` key (same pattern as Branch logos and expense receipts) | Medium |
| **SCH-07** | Add `isActive` to `User` model | `User` | Staff soft-delete instead of hard-delete. Prevents orphaned `AuditLog.userId` references. | Low |
| **SCH-08** | Add `createdBy` / `updatedBy` to `Invoice` and `Expense` | `Invoice`, `Expense` | Track which staff user created/modified financial records. Currently only the gym owner username is logged. | Low |
| **SCH-09** | Add unique constraint: `(gymId, configType, planType, periodType)` on `PricingConfig` | `PricingConfig` | Prevent duplicate pricing entries. Currently only enforced in application logic. | Low |

### 8.2 For Scale Beyond 10K DAU (Future)

| Change | When | Benefit |
|---|---|---|
| Read replica for dashboard/analytics queries | >25K DAU | Offloads heavy aggregate queries from primary |
| Materialized view for monthly revenue summaries | >50K total invoices | Sub-millisecond dashboard reads |
| Separate schema per gym (row-level security → schema isolation) | >1000 gyms | Complete data isolation, simpler backup/restore per tenant |
| Async-only API (remove sync`get_db`) | When SSE usage exceeds 100 gyms | Eliminates thread pool starvation risk |

---

## 9. Priority Action Items

### P0 — Fix Immediately (Blocking)

| # | Item | File | Effort |
|---|---|---|---|
| 1 | **Add `return result` to `_compute_stats()`** | `dashboard.py:180` | 1 min |
| 2 | **Fix expense summary date comparison** | `expenses.py:302-303` | 5 min |

### P1 — Fix This Sprint (Security)

| # | Item | File | Effort |
|---|---|---|---|
| 3 | Replace `data: dict` with Pydantic schema on `PATCH /proteins/update` | `proteins.py:421` | 30 min |
| 4 | Replace `data: dict` with Pydantic schemas on bulk-create endpoints | `expenses.py:88`, `proteins.py:281` | 30 min |
| 5 | Add RBAC (`require_owner_or_manager`) to member create/update | `members.py` | 15 min |
| 6 | Add RBAC to invoice create and pay | `invoices.py` | 15 min |
| 7 | Add RBAC to expense create/update | `expenses.py` | 10 min |
| 8 | Migrate protein images to object storage | `proteins.py` | 2 hrs |
| 9 | Add file size + magic byte validation to protein image upload | `proteins.py:522` | 30 min |

### P2 — Fix This Month (Stability)

| # | Item | File | Effort |
|---|---|---|---|
| 10 | Replace expense summary with SQL `GROUP BY` | `expenses.py:296-321` | 30 min |
| 11 | Fix low-stock Python loops with SQL filters | `proteins.py:156-177`, `automation.py` | 30 min |
| 12 | Add soft-delete to `ProteinStock` | `all_models.py`, `proteins.py` | 1 hr |
| 13 | Add `isActive` soft-delete to `User` | `all_models.py`, `staff.py` | 1 hr |
| 14 | Add composite DB indexes (§3.3) | Migration | 30 min |
| 15 | Replace `datetime.utcnow()` with `datetime.now(timezone.utc)` | Multiple files | 15 min |
| 16 | Remove dead files (`test_import.txt`, `pytest.log`) | Backend root | 5 min |
| 17 | Consolidate audit document versions | Project root | 30 min |

### P3 — Track (Nice to Have)

| # | Item | File | Effort |
|---|---|---|---|
| 18 | Add pagination to contacts endpoint | `contacts.py` | 20 min |
| 19 | Add rate limiting to all create endpoints | Multiple | 30 min |
| 20 | Extract seed data to `scripts/seed_data.py` | `audit.py` → `scripts/` | 30 min |
| 21 | Rename `migrate.py` to `db_setup.py` | Backend root | 5 min |
| 22 | Add request ID / trace correlation middleware | `main.py` | 1 hr |
| 23 | Add RBAC to contacts/terms create/update | `contacts.py`, `terms.py` | 10 min |
| 24 | Sanitize 500 error responses (remove `str(e)`) | `expenses.py`, `proteins.py` | 10 min |
| 25 | Update `test_migration.py` to match current API responses | `tests/` | 1 hr |

---

## Appendix A: File Inventory

### Backend Core (`backend/core/`)
| File | Lines | Purpose | Status |
|---|---|---|---|
| `aadhaar_crypto.py` | 145 | Aadhaar encrypt/decrypt/hash/mask | ✅ Clean |
| `audit_utils.py` | 129 | Audit log writer + sensitive field scrubbing | ✅ Clean |
| `cache.py` | 155 | In-process TTL cache for GymSettings | ✅ Clean |
| `config.py` | 21 | Pydantic settings from .env | ✅ Clean |
| `database.py` | 47 | SQLAlchemy engine + session factories | ✅ Clean |
| `date_utils.py` | 53 | Date parsing/formatting utilities | ✅ Clean |
| `dependencies.py` | 162 | Auth + RBAC FastAPI dependencies | ✅ Clean |
| `rate_limit.py` | 51 | slowapi rate limiter setup | ✅ Clean |
| `security.py` | 51 | bcrypt + JWT creation | ✅ Clean |
| `storage.py` | 305 | S3-compatible object storage abstraction | ✅ Clean |

### Backend Routers (`backend/routers/`)
| File | Lines | Purpose | Issues |
|---|---|---|---|
| `auth.py` | 343 | Login, signup, refresh, logout | ✅ Clean |
| `members.py` | 1020 | Member CRUD + bulk ops | ⚠️ Missing RBAC on create/update |
| `invoices.py` | 620 | Invoice CRUD + payments | ⚠️ Missing RBAC on create/pay |
| `expenses.py` | 343 | Expense CRUD + receipts | 🔴 Date comparison bug, ⚠️ Missing RBAC |
| `proteins.py` | 776 | Protein stock + lots + images | 🔴 Raw dict input, BYTEA images |
| `dashboard.py` | 729 | Stats, SSE, alerts, reconciliation | 🔴 Missing return statement |
| `staff.py` | 189 | Staff CRUD | ⚠️ Hard-delete, no audit |
| `settings.py` | 371 | Gym settings + pricing configs | ⚠️ Raw dict on bulk pricing |
| `contacts.py` | 123 | External contacts CRUD | ⚠️ No pagination, missing RBAC |
| `automation.py` | 243 | Expiry/stock/payment automation | ⚠️ Duplicates dashboard logic |
| `audit.py` | 255 | Audit log viewer + seed data | ⚠️ Seed data should be separate |
| `whatsapp_templates.py` | 216 | Template CRUD + preview | ✅ Clean |
| `terms.py` | 96 | Terms & conditions CRUD | ⚠️ Missing RBAC on create/update |
| `branch_details.py` | 345 | Branch details + logo management | ✅ Clean |

### Backend Other
| File | Lines | Purpose | Status |
|---|---|---|---|
| `main.py` | 231 | FastAPI app setup | ✅ Clean |
| `migrate.py` | 543 | DB setup + triggers + partitioning | ✅ Keep (rename to `db_setup.py`) |
| `all_models.py` | 892 | All SQLAlchemy models | ✅ Clean |
| `test_import.txt` | 29 | Debug artifact | 🗑️ Delete |
| `pytest.log` | 43 | Stale test log | 🗑️ Delete |

### Scripts
| File | Lines | Purpose | Status |
|---|---|---|---|
| `scripts/clean_refresh_tokens.py` | 24 | Expired token cleanup | ✅ Clean |

---

## Appendix B: Security Threat Model

```
Threat Actor → Attack Vector → Protection Layer

1. Unauthenticated attacker
   └→ API endpoint access       → JWT required on all /api/* routes ✅
   └→ Brute-force login         → Rate limit 5/min on /auth/login ✅
   └→ Token theft               → 30-min access token + family rotation ✅

2. Authenticated STAFF user (malicious insider)
   └→ Access other gym's data   → gymId filter on every query ✅
   └→ Escalate to OWNER role    → MANAGER cannot set OWNER role ✅
   └→ Create fraudulent invoices → ⚠️ No RBAC on invoice create
   └→ Modify member data        → ⚠️ No RBAC on member update
   └→ Exfiltrate Aadhaar data   → Masked in API, encrypted at rest ✅
   └→ Delete critical data      → RBAC on delete endpoints ✅

3. External attacker with valid token
   └→ IDOR via direct ID guess  → gymId filter prevents cross-tenant access ✅
   └→ Mass assignment           → ⚠️ PATCH /proteins/update accepts raw dict
   └→ File upload exploitation  → Magic bytes + Pillow re-encode ✅ (storage.py)
                                  ⚠️ NOT applied to protein image upload
   └→ SQL injection             → SQLAlchemy parameterized queries ✅

4. Infrastructure attacker
   └→ MITM                      → HSTS headers enforced ✅
   └→ CORS bypass               → Explicit ALLOWED_ORIGINS ✅
   └→ Direct DB access          → Aadhaar encrypted, passwords hashed ✅
   └→ Storage bucket access     → Private bucket, signed URLs only ✅
```

---

*End of audit report.*
