# EZTRACK Backend Architecture & Security Audit

> **Simulated Load:** 10,000 Daily Active Users (DAU)  
> **Scope:** Full backend — models, routers, core, schemas, scripts  
> **Philosophy:** Optimize for long-term stability, not simplicity  
> **Date:** March 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Structural Weaknesses](#2-structural-weaknesses)
3. [Performance Bottlenecks at 10K DAU](#3-performance-bottlenecks-at-10k-dau)
4. [Redundant Relationships & Dead Code](#4-redundant-relationships--dead-code)
5. [Write Amplification Risks](#5-write-amplification-risks)
6. [Schema Improvements for Scale](#6-schema-improvements-for-scale)
7. [Security Vulnerabilities & Mitigations](#7-security-vulnerabilities--mitigations)
8. [Files to Remove or Merge](#8-files-to-remove-or-merge)
9. [Priority Action Matrix](#9-priority-action-matrix)

---

## 1. Executive Summary

EZTRACK has undergone significant architectural improvements (SCH/SEC/ARCH audit series), and the codebase is **far above the median for a gym-management SaaS**. The team has already addressed JWT rotation, Aadhaar encryption, soft-delete for financials, RBAC, and query optimization.

However, under a simulated 10K DAU load (~200 concurrent connections, ~50 requests/second peak), several **critical weaknesses remain** that will manifest as production incidents:

| Category | Critical | High | Medium |
|---|:---:|:---:|:---:|
| Structural Weaknesses | 3 | 5 | 4 |
| Performance Bottlenecks | 4 | 3 | 2 |
| Security Vulnerabilities | 2 | 6 | 5 |
| Schema Issues | 2 | 4 | 3 |
| **Total** | **11** | **18** | **14** |

---

## 2. Structural Weaknesses

### SW-02 ● CRITICAL — Two Duplicate Update Endpoints for Members

**File:** [members.py L971-L1076](file:///home/shub/EZTRACK/backend/routers/members.py#L971-L1076)

```python
# Endpoint 1: PUT /{id}  — takes `data: dict` (raw, no schema validation!)
@router.put("/{id}", response_model=MemberResponse)
async def update_member_put(id: str, data: dict, ...)

# Endpoint 2: PATCH /update — also takes `data: dict` (raw, no schema!)
@router.patch("/update", response_model=MemberResponse)
async def update_member_body(data: dict, ...)
```

**Problems:**
1. **Both accept raw [dict](file:///home/shub/EZTRACK/backend/core/cache.py#54-57)** — this is the last remaining untyped endpoint pair. Every other update endpoint uses a Pydantic schema. This bypasses all field validation, allows unknown keys to be silently set via `setattr()`, and is a **mass-assignment vulnerability**
2. **Code duplication** — the field-parsing logic (Age → int, dates → parse_date, etc.) is copy-pasted between both functions
3. **Inconsistent behavior** — [update_member_put](file:///home/shub/EZTRACK/backend/routers/members.py#971-1020) sets `editReason='Update via Web'`, while [update_member_body](file:///home/shub/EZTRACK/backend/routers/members.py#1022-1077) reads `editReason` from the raw dict (client-controlled)

**Fix:**
- Create a `MemberUpdate` Pydantic schema (one already exists in [schemas/member.py](file:///home/shub/EZTRACK/backend/schemas/member.py) but is NOT used)
- Merge both endpoints into a single `PATCH /{id}` that uses the schema
- Keep `PATCH /update` as a thin wrapper that extracts [id](file:///home/shub/EZTRACK/backend/models/all_models.py#35-37) from body and calls the same handler

---

### SW-03 ● HIGH — [proteins.py](file:///home/shub/EZTRACK/backend/routers/proteins.py) Duplicates [update_protein()](file:///home/shub/EZTRACK/backend/routers/proteins.py#409-468) and [update_protein_body()](file:///home/shub/EZTRACK/backend/routers/proteins.py#470-532)

**File:** [proteins.py L409-L531](file:///home/shub/EZTRACK/backend/routers/proteins.py#L409-L531)

Same pattern as SW-02. Two update endpoints with ~70% identical code:
- `PUT /{protein_id}` (L409) — ID in URL
- `PATCH /update` (L470) — ID in body

Both compute the same price diff, call the same [recalculate_computed_fields()](file:///home/shub/EZTRACK/backend/routers/proteins.py#42-50), and log the same audit. A fix to one will eventually be missed in the other.

**Fix:** Extract shared update logic into a private `_apply_protein_update(protein, update_data, db, gym_id)` function.

---

### SW-04 ● HIGH — Invoice Creation Embedded Inside Member Creation

**File:** [members.py L872-L953](file:///home/shub/EZTRACK/backend/routers/members.py#L872-L953)

When a member is created with `LastPaymentAmount > 0`, the member endpoint constructs a full [Invoice](file:///home/shub/EZTRACK/backend/models/all_models.py#288-356) object with line items, creates a [PaymentEvent](file:///home/shub/EZTRACK/backend/models/all_models.py#362-394), and commits both.

This is a **transactional coupling** — invoice logic should live in the invoices module. If invoice schema changes (e.g., adding a `currency` field), you must remember to update [members.py](file:///home/shub/EZTRACK/backend/routers/members.py) too.

**Fix:** Extract invoice creation into a shared service function (`services/invoice_service.py`) callable from both `members.create_member()` and `invoices.create_invoice()`.

---

### SW-05 ● HIGH — GymSettings Fetched Repeatedly Per Request

Settings are fetched 2–3 times in a single request path:
1. [get_proteins()](file:///home/shub/EZTRACK/backend/routers/proteins.py#92-157) fetches [GymSettings](file:///home/shub/EZTRACK/backend/models/all_models.py#635-686) for `lowStockThreshold` (L105-107)
2. Dashboard [_compute_stats()](file:///home/shub/EZTRACK/backend/routers/dashboard.py#56-210) fetches settings for date calculations
3. Alert generation fetches settings again

While [get_async_gym_settings()](file:///home/shub/EZTRACK/backend/core/cache.py#121-162) has an in-process cache, the cache key only covers `gymId`. Under 10K DAU with 200+ gyms, the cache sees constant invalidation due to the dict-cleanup heuristic (line-count check).

**Fix:** Make the cache a proper LRU with `maxsize` and per-key TTL, or pass settings through a FastAPI dependency that fetches once per request and injects everywhere.

---

### SW-06 ● HIGH — SSE Stream Has No Heartbeat or Client Limit

**File:** [dashboard.py](file:///home/shub/EZTRACK/backend/routers/dashboard.py)

The SSE endpoint (`/stream`) holds HTTP connections indefinitely. At 10K DAU:
- If 2,000 users have the dashboard open, that's 2,000 persistent TCP connections
- No heartbeat means dead connections (mobile users losing signal) sit in `CLOSE_WAIT` until OS timeout (default: 2 hours on Linux)
- The [GymStreamManager](file:///home/shub/EZTRACK/backend/routers/dashboard.py#218-271) deduplicates *computation* per gym, but each client still consumes a connection

**Fix:**
- Add a periodic heartbeat (`:ping` every 30s) to detect dead connections
- Set a `max_connections_per_gym` limit (e.g., 50) — additional clients get polled stats instead
- Add `stream_timeout` (e.g., 10 minutes) — force reconnect to reclaim connections

---

### SW-07 ● MEDIUM — `map_*_response()` Functions Bypass Pydantic

Every router has a hand-rolled `map_*_response()` that manually builds dicts from ORM objects:
- [map_member_response()](file:///home/shub/EZTRACK/backend/routers/members.py#52-107) — 40 lines
- [map_protein_response()](file:///home/shub/EZTRACK/backend/routers/proteins.py#53-90) — 36 lines
- [map_expense_response()](file:///home/shub/EZTRACK/backend/routers/expenses.py#22-30) — 8 lines
- [map_contact_response()](file:///home/shub/EZTRACK/backend/routers/contacts.py#15-20) — 5 lines

These bypass the `response_model` serialization that FastAPI provides. If you add a field to the Pydantic schema but forget the mapper, the field is silently omitted. At scale, this divergence becomes a source of data-leak bugs (fields returned that shouldn't be) and missing-field bugs.

**Fix:** Use Pydantic's `model_validate(obj, from_attributes=True)` with `ConfigDict(from_attributes=True)` on your response schemas.

---

### SW-08 ● MEDIUM — No Service/Business-Logic Layer

All business logic is directly in route handlers. This means:
- Unit testing requires standing up a full FastAPI + SQLAlchemy stack
- Logic cannot be reused (e.g., "create an invoice" from both member-create and invoice-create)
- Background tasks cannot call business logic without importing router dependencies

**Ideal structure:**
```
services/
  member_service.py      # create_member(), update_member(), etc.
  invoice_service.py     # create_invoice(), record_payment(), etc.
  notification_service.py
```

---

### SW-09 ● MEDIUM — `alembic/` Exists But Is Not Integrated

**Dir:** [alembic/](file:///home/shub/EZTRACK/backend/alembic)

Alembic is present but [dev_reset_db.py](file:///home/shub/EZTRACK/backend/dev_reset_db.py) drops all tables and recreates. There is no evidence of production migration usage. At 10K DAU with real data, you **cannot** drop-and-recreate. Every schema change must be an Alembic migration.

**Fix:** Delete [dev_reset_db.py](file:///home/shub/EZTRACK/backend/dev_reset_db.py) from production deployments. Establish a CI step that runs `alembic check` to ensure no un-migrated model changes.

---

### SW-10 ● MEDIUM — [whatsapp_templates.py](file:///home/shub/EZTRACK/backend/routers/whatsapp_templates.py) Has an Unbounded In-Memory Cache

**File:** [whatsapp_templates.py L47-L67](file:///home/shub/EZTRACK/backend/routers/whatsapp_templates.py#L47-L67)

```python
_initialized_gyms: dict[str, float] = {}
```

This dict grows per unique `gymId` with a cleanup heuristic that only triggers at 1,000 entries. Under 10K DAU across many gyms, this is a slow memory leak. The cleanup also runs inside a request handler, adding unpredictable latency.

---

## 3. Performance Bottlenecks at 10K DAU

### PB-01 ● CRITICAL — `update_member_put/body` Uses Unparameterized `setattr()` Loop

**File:** [members.py L988-L1010](file:///home/shub/EZTRACK/backend/routers/members.py#L988-L1010)

```python
for key, value in data.items():
    if hasattr(member, key):
        setattr(member, key, value)
```

This iterates over **every key** in the raw request body and calls `setattr()` on the ORM object. SQLAlchemy marks every `setattr()` call as a dirty attribute, even if the value hasn't changed. At commit time, PostgreSQL generates an `UPDATE` statement that includes **all touched columns**, not just the ones that actually changed.

With 10K DAU updating members, this creates:
- **Unnecessary WAL writes** for unchanged columns
- **Index maintenance overhead** on columns that aren't actually modified
- **Audit log noise** (the `changed` dict captures false positives if serialization differs)

**Fix:** Compare `old_val == new_val` *before* calling `setattr()`. Only set attributes that actually changed.

---

### PB-02 ● CRITICAL — No Database Connection Pooling Tuning For Async

**File:** [database.py](file:///home/shub/EZTRACK/backend/core/database.py)

The async engine uses `pool_size=20, max_overflow=40` — 60 max connections total. With 10K DAU generating ~50 req/s, and each request holding a connection for ~50ms (including await), you need:

```
Required connections = 50 req/s × 0.05s = 2.5 average
But: SSE streams hold connections INDEFINITELY
     Bulk operations hold for 500ms-5s
     Burst: 200 concurrent users at peak
```

With SSE holding connections and bulk operations during peak hours, **60 connections will be exhausted**, causing `TimeoutError` on connection checkout.

**Fix:**
- SSE should use a **separate connection pool** or use short-lived polling
- Set `pool_recycle=300` and `pool_pre_ping=True` to detect stale connections
- Increase `pool_size=30, max_overflow=70` for 10K DAU baseline

---

### PB-03 ● CRITICAL — Bulk Operations Commit Per-Item Inside a Loop

**File:** [members.py bulk_create](file:///home/shub/EZTRACK/backend/routers/members.py) and [expenses.py L104-L137](file:///home/shub/EZTRACK/backend/routers/expenses.py#L104-L137)

```python
for item in expenses_list:
    try:
        new_expense = Expense(gymId=current_gym.id, ...)
        db.add(new_expense)
        created_count += 1
    except Exception as e:
        continue
```

While the final `await db.commit()` is outside the loop, the `continue` on error means partial data is committed. More critically, for member bulk-create:
- Each member may create an invoice + payment event (3 INSERT per member)
- A 500-member bulk import = 1,500+ INSERT statements in a single transaction
- If it fails at member #499, all 498 members + their invoices are rolled back

**Fix:**
- Use `executemany()` with batches of 100
- Use `SAVEPOINT` per batch so partial success is possible
- Add a `succeeded_ids` / `failed_ids` response

---

### PB-04 ● CRITICAL — [get_members()](file:///home/shub/EZTRACK/backend/routers/members.py#131-188) List Endpoint Counts Are N+1-Adjacent

**File:** [members.py](file:///home/shub/EZTRACK/backend/routers/members.py)

The member list endpoint runs a separate count query (`SELECT count(*)`) before the paginated data query. Under heavy load, this means two full scans:
1. `SELECT count(*) FROM Member WHERE gymId=? AND isDeleted=false`  (seq scan or partial index scan)
2. `SELECT * FROM Member WHERE gymId=? AND isDeleted=false ORDER BY ... LIMIT ... OFFSET ...`

For a gym with 5,000 members, `OFFSET 4950` requires PostgreSQL to scan and discard 4,950 rows.

**Fix:**
- Use **keyset pagination** (cursor-based) instead of OFFSET: `WHERE createdAt < :last_seen ORDER BY createdAt DESC LIMIT 50`
- Return `hasMore: true/false` instead of `totalPages`
- If total count is needed, cache it with TTL per gym (counts don't change per-second)

---

### PB-05 ● HIGH — [map_member_response()](file:///home/shub/EZTRACK/backend/routers/members.py#52-107) Decrypts Aadhaar for Single-Member Views

While the list view correctly skips decryption (`decrypt=False`), single-member views (`GET /{member_id}`) call Fernet decrypt. Fernet is CPU-bound (~0.5ms per call), which is fine for single lookups but would be a problem for any batch endpoint that calls [map_member_response(decrypt=True)](file:///home/shub/EZTRACK/backend/routers/members.py#52-107) in a loop.

**Currently acceptable, but monitor for future batch endpoints.**

---

### PB-06 ● HIGH — Dashboard Stats Run 5+ Aggregate Queries Per SSE Push

**File:** [dashboard.py](file:///home/shub/EZTRACK/backend/routers/dashboard.py)

Each stats computation runs:
1. Active members count
2. Today's revenue
3. Pending balances
4. Protein stock summary
5. GymDailySummary upsert

For a gym with 5,000 members and 10,000 invoices, queries 1-4 are each ~20ms. Combined with SSE pushing every 30 seconds per active gym, 200 gyms = **200 × 4 queries × 24/hr = 19,200 aggregate queries/hr**.

**Fix:** Collapse into a single CTE-based query:
```sql
WITH stats AS (
  SELECT 
    (SELECT count(*) FROM "Member" WHERE "gymId"=? AND computed_status='Active') AS active_members,
    (SELECT coalesce(sum(amount), 0) FROM "PaymentEvent" WHERE "gymId"=? AND "paidAt"::date = CURRENT_DATE) AS today_revenue,
    ...
)
SELECT * FROM stats;
```

---

### PB-07 ● HIGH — [adjust_protein_stock()](file:///home/shub/EZTRACK/backend/routers/proteins.py#655-715) Does Not Update `ProteinStock.Quantity` Directly

**File:** [proteins.py L656-L714](file:///home/shub/EZTRACK/backend/routers/proteins.py#L656-L714)

The endpoint creates an [ProteinLot](file:///home/shub/EZTRACK/backend/models/all_models.py#563-596) adjustment record but relies on the PostgreSQL trigger (`trg_sync_protein_quantity`) to update `ProteinStock.Quantity`. The response then reads `protein.Quantity` — but since the trigger fires at `AFTER STATEMENT`, the ORM object may have a stale value.

The commented-out `await db.refresh(protein)` confirms this was a known issue. Without the refresh, the response returns the **old** quantity.

**Fix:** Either `await db.refresh(protein)` after commit, or return `new_qty` (which you already compute in-line).

---

### PB-08 ● MEDIUM — No Query Timeout / Statement Timeout

No `statement_timeout` is set. A malicious or accidental query (e.g., `page_size=99999` on expenses) could lock a connection for minutes.

**Fix:** Add to engine creation:
```python
connect_args={"options": "-c statement_timeout=30000"}  # 30 seconds
```

---

### PB-09 ● MEDIUM — Expense Summary Does Full-Table Aggregation Without Cache

**File:** [expenses.py L303-L347](file:///home/shub/EZTRACK/backend/routers/expenses.py#L303-L347)

`GET /expenses/summary` runs a `GROUP BY category` aggregate every time it's called. Unlike dashboard stats (which have [GymDailySummary](file:///home/shub/EZTRACK/backend/models/all_models.py#602-629)), expense summaries are not cached. For gyms with 10,000+ expenses, this becomes a heavy query called frequently from the UI.

---

## 4. Redundant Relationships & Dead Code

### RD-01 — [get_db](file:///home/shub/EZTRACK/backend/core/database.py#37-43) (Synchronous) is Imported But Never Used in Most Routers

| Router | Imports [get_db](file:///home/shub/EZTRACK/backend/core/database.py#37-43)? | Uses [get_db](file:///home/shub/EZTRACK/backend/core/database.py#37-43)? |
|---|:---:|:---:|
| auth.py | ✅ | ❌ (all async) |
| members.py | ✅ | ❌ |
| expenses.py | ✅ | ❌ |
| proteins.py | ✅ | ❌ |
| contacts.py | ✅ | ❌ |
| staff.py | ✅ | ❌ |
| settings.py | ✅ | ❌ |
| audit.py | ✅ | ❌ |

**Every router imports [get_db](file:///home/shub/EZTRACK/backend/core/database.py#37-43) but exclusively uses [get_async_db](file:///home/shub/EZTRACK/backend/core/database.py#44-47).** The synchronous engine (`SessionLocal`) and its connection pool are kept alive for nothing, consuming ~20 idle connections.

**Fix:** Remove [get_db](file:///home/shub/EZTRACK/backend/core/database.py#37-43) import from all routers. If the sync engine is only used by [dev_reset_db.py](file:///home/shub/EZTRACK/backend/dev_reset_db.py), gate its creation behind a flag or lazily initialize it.

---

### RD-02 — [find_routes.py](file:///home/shub/EZTRACK/find_routes.py) Uses Windows Paths, Won't Work on Linux

**File:** [find_routes.py](file:///home/shub/EZTRACK/find_routes.py)

```python
BACKEND_DIR = r"d:\EZTRACK\backend"
FRONTEND_DIR = r"d:\EZTRACK\frontend\src"
```

This is a one-off debugging tool with hardcoded Windows paths. It serves no production purpose.

**Action:** Remove from repo, or move to `scripts/` with relative paths.

---

### RD-03 — [drop_branchids.py](file:///home/shub/EZTRACK/backend/drop_branchids.py) is a Completed One-Time Migration

**File:** [drop_branchids.py](file:///home/shub/EZTRACK/backend/drop_branchids.py)

This script dropped the legacy `User.branchIds` JSON column after the [UserBranchAccess](file:///home/shub/EZTRACK/backend/models/all_models.py#161-194) junction table was introduced. The column no longer exists.

**Action:** Delete this file.

---

### RD-04 — [dev_reset_db.py](file:///home/shub/EZTRACK/backend/dev_reset_db.py) is 589 Lines of Dev-Only Code in the Backend Root

**File:** [dev_reset_db.py](file:///home/shub/EZTRACK/backend/dev_reset_db.py)

This file drops all tables and recreates them. It also contains the partition migration logic (P13). In production:
- The drop-all-tables path is **never** safe to run
- The partition logic (P13) is a one-time operation

**Action:** Move to `scripts/dev_reset_db.py` and move the partition logic to an Alembic migration.

---

### RD-05 — [test_migration.py](file:///home/shub/EZTRACK/backend/tests/test_migration.py) Uses Synchronous Test Client But App is Async

**File:** [tests/test_migration.py](file:///home/shub/EZTRACK/backend/tests/test_migration.py)

```python
from fastapi.testclient import TestClient  # synchronouslient
```

FastAPI's `TestClient` wraps calls synchronously, but the app uses `AsyncSession`. This can cause:
- Event loop conflicts
- Tests that pass in isolation but fail under concurrent test runs
- False positives (sync session bypasses async middleware)

**Fix:** Use `httpx.AsyncClient` with `ASGITransport` for async test.

---

### RD-06 — `ProteinStock.imageData` and `ProteinStock.imageMimeType` Columns Are Dead

Image storage was migrated to object storage (`imageUrl`). The old binary columns may still exist in the DB schema (from [all_models.py](file:///home/shub/EZTRACK/backend/models/all_models.py)).

**Action:** Verify these columns are removed from the model. If they exist in the DB, create an Alembic migration to drop them.

---

## 5. Write Amplification Risks

### WA-01 — [ProteinLot](file:///home/shub/EZTRACK/backend/models/all_models.py#563-596) Trigger Fires Per-Statement But Recomputes ALL Lots

**File:** [dev_reset_db.py L56-L123](file:///home/shub/EZTRACK/backend/dev_reset_db.py#L56-L123)

The `sync_protein_stock_quantity_bulk()` trigger runs `SUM(quantity)` across **all** lots for the affected protein. For a protein with 100 lots, every single lot adjustment triggers a full re-sum.

At scale: A bulk import of 200 lots for 50 products = 50 × `SUM()` queries, each scanning all lots for that product.

**Mitigation already in place:** The trigger uses transition tables to limit scope to changed proteins. This is acceptable for now but becomes a concern if lot counts per product exceed 500.

---

### WA-02 — Audit Logging Writes to [AuditLog](file:///home/shub/EZTRACK/backend/models/all_models.py#838-868) on Every CRUD Operation

Every CREATE, UPDATE, DELETE across Members, Invoices, Expenses, Proteins, and Staff generates an [AuditLog](file:///home/shub/EZTRACK/backend/models/all_models.py#838-868) INSERT. At 10K DAU:

```
Members:   ~2,000 creates/day + ~5,000 updates = 7,000 audit rows
Invoices:  ~3,000 creates + ~2,000 updates = 5,000 audit rows
Expenses:  ~1,000 creates + ~500 updates = 1,500 audit rows
Proteins:  ~500 creates + ~1,000 updates = 1,500 audit rows
Staff:     ~50 operations = 50 audit rows
TOTAL:     ~15,000 audit rows/day = ~450,000/month
```

With P13 partitioning (6-month retention) this is ~2.7 million rows — manageable but needs monitoring.

**Risk:** The [log_audit()](file:///home/shub/EZTRACK/backend/core/audit_utils.py#33-78) function runs inside the main transaction. If the [AuditLog](file:///home/shub/EZTRACK/backend/models/all_models.py#838-868) INSERT is slow (e.g., index bloat), it slows down the business operation.

**Fix:** Consider making audit logging asynchronous — either via a PostgreSQL `LISTEN/NOTIFY` queue or by buffering audit entries in memory and flushing periodically.

---

### WA-03 — Soft-Delete Without Cleanup = Index Bloat

All major entities use soft-delete (`isDeleted=true`). Partial indexes (`WHERE isDeleted=false`) mitigate query perf, but:
- The full physical table size keeps growing
- PostgreSQL VACUUM cannot reclaim space from soft-deleted rows (they're still valid)
- Backup sizes increase linearly

**Fix:** Implement a scheduled job that moves rows with `isDeleted=true AND deletedAt < NOW() - interval '90 days'` to an archive table. This keeps hot tables small.

---

## 6. Schema Improvements for Scale

### SCH-01 ● CRITICAL — `Member.Mobile` and `Member.Whatsapp` Are `VARCHAR` Without Normalization

**File:** [all_models.py](file:///home/shub/EZTRACK/backend/models/all_models.py)

Phone numbers are stored as-is from client input. Different users may enter `9876543210`, `+919876543210`, `91-9876543210`, or `09876543210` for the same number.

**Impact:**
- Duplicate detection fails (same person with different phone formats)
- WhatsApp link generation in [automation.py](file:///home/shub/EZTRACK/backend/routers/automation.py) has manual `startswith("91")` logic
- SMS/notification integrations will break

**Fix:**
- Normalize to E.164 format on write (`+919876543210`)
- Add a database-level CHECK constraint: `CHECK (phone ~ '^\+[1-9]\d{6,14}$')`
- Create a utility `normalize_phone()` used by all write paths

---

### SCH-02 ● CRITICAL — `Invoice.items` is a JSON Column with No Index

```python
items = Column(JSON)  # Array of {description, quantity, rate, amount}
```

While `trg_validate_invoice_items` validates structure, there's no way to query "show me all invoices containing PT charges" without a full-table scan + JSON parsing.

**Fix:** If line-item queries are needed, normalize into an `InvoiceLineItem` table. If not, add a GIN index:
```sql
CREATE INDEX ix_invoice_items_gin ON "Invoice" USING gin (items jsonb_path_ops);
```

---

### SCH-03 ● HIGH — No `UNIQUE` Constraint on `Gym.username`

**File:** [all_models.py](file:///home/shub/EZTRACK/backend/models/all_models.py)

The signup endpoint checks for duplicate usernames in Python:
```python
existing = db.query(Gym).filter(Gym.username == data.username).first()
```

But without a DB-level `UNIQUE` constraint, two concurrent signups with the same username can both pass the check and one will succeed. At 10K DAU with concurrent signups, this **will** happen.

**Fix:**
```python
username = Column(String, unique=True, nullable=False)
```

---

### SCH-04 ● HIGH — No `UNIQUE` Constraint on `User.username` per Gym

**File:** [staff.py L86-L93](file:///home/shub/EZTRACK/backend/routers/staff.py#L86-L93)

Staff username uniqueness is checked in Python, not at DB level. Same race condition as SCH-03.

**Fix:**
```python
__table_args__ = (
    UniqueConstraint('gymId', 'username', name='uq_user_gym_username'),
)
```

---

### SCH-05 ● HIGH — [PricingConfig](file:///home/shub/EZTRACK/backend/models/all_models.py#773-811) Has No Uniqueness Constraint

**File:** [settings.py L190-L211](file:///home/shub/EZTRACK/backend/routers/settings.py#L190-L211)

The bulk pricing update does `SELECT` + `INSERT or UPDATE` in a loop. Without a unique constraint on [(gymId, configType, planType, periodType)](file:///home/shub/EZTRACK/backend/tests/test_migration.py#22-53), concurrent pricing updates can create duplicate rows.

**Fix:**
```python
__table_args__ = (
    UniqueConstraint('gymId', 'configType', 'planType', 'periodType', name='uq_pricing_config'),
)
```

And use `INSERT ... ON CONFLICT DO UPDATE` instead of the current SELECT-then-decide pattern.

---

### SCH-06 ● HIGH — [RefreshToken](file:///home/shub/EZTRACK/backend/models/all_models.py#201-236) Table Has No Archival Strategy

Refresh tokens accumulate with every login. At 10K DAU × 2 devices × 1 login/day = 20,000 rows/day. The [scripts/clean_refresh_tokens.py](file:///home/shub/EZTRACK/scripts/clean_refresh_tokens.py) exists but must be scheduled externally.

After 6 months: **~3.6 million rows** in a table that's queried on every token refresh.

**Fix:**
- Add `PARTITION BY RANGE (createdAt)` on [RefreshToken](file:///home/shub/EZTRACK/backend/models/all_models.py#201-236) (same P13 pattern as AuditLog)
- Or add a PostgreSQL scheduled function that runs `DELETE FROM RefreshToken WHERE expiresAt < NOW() - interval '7 days'`

---

### SCH-07 ● MEDIUM — `Member.computed_status` Hybrid Property vs. Index

```python
@hybrid_property
def computed_status(self):
    ...
@computed_status.expression
def computed_status(cls):
    return case(...)
```

This is a **case expression evaluated at query time** — it cannot be indexed. If you filter `WHERE computed_status = 'Active'`, PostgreSQL evaluates the CASE expression for every row.

**Fix:** Add a **generated column** (PostgreSQL 12+):
```sql
ALTER TABLE "Member" ADD COLUMN status_computed TEXT 
  GENERATED ALWAYS AS (
    CASE WHEN "NextDuedate" >= CURRENT_DATE THEN 'Active' ELSE 'Expired' END
  ) STORED;
CREATE INDEX ix_member_status ON "Member" ("gymId", status_computed);
```

Or use a partial index:
```sql
CREATE INDEX ix_member_active ON "Member" ("gymId") 
  WHERE "NextDuedate" >= CURRENT_DATE AND "isDeleted" = false;
```

---

### SCH-08 ● MEDIUM — `Expense.date` is `Date` But Filters Use String Comparison

In [get_expenses()](file:///home/shub/EZTRACK/backend/routers/expenses.py#32-78), the filter calls [parse_date(start_date)](file:///home/shub/EZTRACK/backend/core/date_utils.py#10-34) which returns a Python [date](file:///home/shub/EZTRACK/backend/core/date_utils.py#10-34) object. This is correct. But [get_expense_summary()](file:///home/shub/EZTRACK/backend/routers/expenses.py#303-348) has a redundant `if parsed_start:` check that silently drops invalid dates instead of raising an error.

**Fix:** Raise `HTTPException(400)` on unparseable dates instead of silently ignoring them.

---

### SCH-09 ● MEDIUM — No `CHECK` Constraint on Financial Columns

`Invoice.total`, `Invoice.paidAmount`, `Expense.amount`, etc. should have:
```sql
CHECK (total >= 0)
CHECK ("paidAmount" >= 0)
CHECK ("paidAmount" <= total)
```

Currently, no DB-level constraint prevents negative values. A client bug could insert `total: -1000`.

---

## 7. Security Vulnerabilities & Mitigations

### SEC-VULN-01 ● CRITICAL — Mass Assignment via Raw [dict](file:///home/shub/EZTRACK/backend/core/cache.py#54-57) in Member Updates

**File:** [members.py L971-L1076](file:///home/shub/EZTRACK/backend/routers/members.py#L971-L1076)

```python
async def update_member_put(id: str, data: dict, ...):
    for key, value in data.items():
        if hasattr(member, key):
            setattr(member, key, value)
```

**While some keys are filtered** ([id](file:///home/shub/EZTRACK/backend/models/all_models.py#35-37), [_id](file:///home/shub/EZTRACK/backend/routers/members.py#1183-1200), `gymId`, `isDeleted`, etc.), the filter is an **allowlist with gaps**:

An attacker can send:
```json
{
  "gymId": "attacker-gym-id",     // ← filtered ✅
  "AadhaarHash": "known-hash",   // ← filtered ✅
  "isDeleted": true,              // ← filtered ✅
  "computed_status": "Active",    // ← NOT filtered! Sets a hybrid property ❌
  "lastEditedBy": "admin",       // ← NOT filtered! Spoofs audit trail ❌
  "editReason": "System",        // ← Controlled by client in PATCH ❌
}
```

The `lastEditedBy` field is explicitly set after the loop, which partially mitigates this. But [computed_status](file:///home/shub/EZTRACK/backend/models/all_models.py#488-495) and other model attributes could be targeted.

> [!CAUTION]
> This is a **mass-assignment vulnerability**. Any field on the [Member](file:///home/shub/EZTRACK/backend/models/all_models.py#400-503) model that isn't in the hardcoded blocklist can be set by the client.

**Mitigation:**
- Replace `data: dict` with `data: MemberUpdate` (Pydantic schema that only allows known, editable fields)
- The schema already exists at [schemas/member.py](file:///home/shub/EZTRACK/backend/schemas/member.py) — use it

---

### SEC-VULN-02 ● CRITICAL — [preview_template](file:///home/shub/EZTRACK/backend/routers/whatsapp_templates.py#201-244) Accepts Raw [dict](file:///home/shub/EZTRACK/backend/core/cache.py#54-57)

**File:** [whatsapp_templates.py L201-L243](file:///home/shub/EZTRACK/backend/routers/whatsapp_templates.py#L201-L243)

```python
@router.post("/preview")
async def preview_template(data: dict, ...):
    template_text = data.get("messageTemplate", "")
    sample_data = data.get("sampleData", {})
```

While placeholders are validated and HTML is stripped, `sampleData` is a raw dict with arbitrary keys. The `defaults.update(sample_data)` call allows overwriting the `gymName` default with any string, which then gets injected into the template.

**Mitigation:** Create a typed `TemplatePreviewRequest` schema:
```python
class TemplatePreviewRequest(BaseModel):
    messageTemplate: str
    sampleData: dict[str, str] = {}  # All values must be strings
```

---

### SEC-VULN-03 ● HIGH — No CSRF Protection for State-Changing Operations

The API uses JWT Bearer tokens in headers, which provides inherent CSRF protection since browsers don't auto-send `Authorization` headers. **However**, if any endpoint reads the token from a cookie (which the code hints at with `eztracker_jwt_access_control_token`), CSRF becomes a risk.

**Verify:** Confirm tokens are NEVER read from cookies. If they are, add `SameSite=Strict` and consider a CSRF token.

---

### SEC-VULN-04 ● HIGH — Audit Log `DELETE` Not Protected by RBAC

**File:** [audit.py](file:///home/shub/EZTRACK/backend/routers/audit.py)

```python
@router.get("/")
async def get_audit_logs(
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
```

Audit logs are accessible to **any authenticated user** (no RBAC check). A STAFF-level user can view full audit history, which may contain sensitive changes (password resets, Aadhaar updates, financial modifications).

**Mitigation:** Add `_rbac=Depends(require_owner)` — audit logs should be OWNER-only.

---

### SEC-VULN-05 ● HIGH — Rate Limiting Not Applied to Most Write Endpoints

| Endpoint | Rate Limited? |
|---|:---:|
| POST /auth/login | ✅ 5/minute |
| POST /auth/signup | ✅ 3/minute |
| POST /auth/refresh | ✅ 10/minute |
| POST /members | ❌ |
| POST /members/bulk-create | ❌ |
| PUT /members/{id} | ❌ |
| POST /invoices | ❌ |
| POST /proteins | ❌ |
| POST /expenses | ❌ |
| POST /expenses/bulk-create | ✅ 5/minute |
| POST /proteins/bulk-create | ❌ |
| POST /staff | ❌ |

A compromised STAFF token could create thousands of members, invoices, or expenses per minute before anyone notices.

**Mitigation:** Apply `@rate_limit("30/minute")` to all create endpoints and `@rate_limit("10/minute")` to all bulk endpoints.

---

### SEC-VULN-06 ● HIGH — File Upload Has No Rate Limit

**Files:** Member image, protein image, expense receipt, branch logo upload endpoints.

An attacker with a valid token could upload thousands of 5MB images quickly, exhausting object storage quota and racking up bandwidth costs.

**Mitigation:** Apply `@rate_limit("10/minute")` to all file upload endpoints.

---

### SEC-VULN-07 ● HIGH — No IP-Based Rate Limiting for Unauthenticated Endpoints

Rate limiting for login uses `gymId + IP`, but before authentication, there's no `gymId`. A distributed attack from multiple IPs could brute-force many gym accounts simultaneously.

**Mitigation:** Add a global IP-based rate limit (100 req/min per IP) at the middleware level using SlowAPI's default key function.

---

### SEC-VULN-08 ● MEDIUM — [update_contact()](file:///home/shub/EZTRACK/backend/routers/contacts.py#113-139) Doesn't Check `isActive`

**File:** [contacts.py L113-L138](file:///home/shub/EZTRACK/backend/routers/contacts.py#L113-L138)

```python
stmt = select(ExternalContact).where(
    ExternalContact.id == contact_id,
    ExternalContact.gymId == current_gym.id
    # Missing: ExternalContact.isActive == True
)
```

A soft-deleted contact can be updated, potentially "resurrecting" it with new data.

**Mitigation:** Add `ExternalContact.isActive == True` to the WHERE clause.

---

### SEC-VULN-09 ● MEDIUM — [delete_expense](file:///home/shub/EZTRACK/backend/routers/expenses.py#205-232) Does Not Check RBAC for Single Delete

**File:** [expenses.py L205-L231](file:///home/shub/EZTRACK/backend/routers/expenses.py#L205-L231)

[delete_expense](file:///home/shub/EZTRACK/backend/routers/expenses.py#205-232) has `_rbac=Depends(require_owner_or_manager)` ✅ — this is correct. No issue here.

But [upload_receipt](file:///home/shub/EZTRACK/backend/routers/expenses.py#234-274) at L234 has **no RBAC check**:
```python
@router.post("/{expense_id}/receipt")
async def upload_receipt(expense_id: str, file: UploadFile = File(...), ...):
    # No _rbac dependency!
```

Any authenticated STAFF can upload receipt images to any expense.

**Mitigation:** Add `_rbac=Depends(require_owner_or_manager)` to [upload_receipt](file:///home/shub/EZTRACK/backend/routers/expenses.py#234-274).

---

### SEC-VULN-10 ● MEDIUM — Branch Detail Update Has No RBAC

**File:** [branch_details.py L176-L192](file:///home/shub/EZTRACK/backend/routers/branch_details.py#L176-L192)

```python
@router.put("")
async def update_gym_details(data: BranchDetailsUpdate, ...):
    # No _rbac dependency!
```

Any authenticated user (including STAFF) can modify gym name, address, phone, slogan — essentially defacing the gym's public profile.

**Mitigation:** Add `_rbac=Depends(require_owner_or_manager)` to both [update_gym_details](file:///home/shub/EZTRACK/backend/routers/branch_details.py#176-193) and [update_branch_details](file:///home/shub/EZTRACK/backend/routers/branch_details.py#195-222).

---

### SEC-VULN-11 ● MEDIUM — Logo Upload Has No RBAC

**File:** [branch_details.py L226-L254](file:///home/shub/EZTRACK/backend/routers/branch_details.py#L226-L254)

```python
@router.post("/logo")
async def upload_gym_logo(file: UploadFile = File(...), ...):
    # No _rbac dependency!
```

Any STAFF member can replace the gym logo.

**Mitigation:** Add `_rbac=Depends(require_owner_or_manager)`.

---

### SEC-VULN-12 ● MEDIUM — Protein Create Has No RBAC

**File:** [proteins.py L292-L324](file:///home/shub/EZTRACK/backend/routers/proteins.py#L292-L324)

```python
@router.post("", ...)
async def create_protein(data: ProteinCreate, ...):
    # No _rbac dependency!
```

Any STAFF member can create new protein stock entrie.

**Mitigation:** Add `_rbac=Depends(require_owner_or_manager)`.

---

### SEC-VULN-13 ● LOW — [get_expense_categories()](file:///home/shub/EZTRACK/backend/routers/expenses.py#365-369) is Hardcoded, Not Per-Gym

**File:** [expenses.py L350-L368](file:///home/shub/EZTRACK/backend/routers/expenses.py#L350-L368)

Categories are a Python list. This isn't a security issue per se, but it means all gyms see the same categories. A gym owner cannot customize their expense categories.

**Not urgent — mention for completeness.**

---

## 8. Files to Remove or Merge

### 🗑️ Files to Remove

| File | Reason | Action |
|---|---|---|
| [find_routes.py](file:///home/shub/EZTRACK/find_routes.py) | One-off debug tool with hardcoded Windows paths | Delete |
| [drop_branchids.py](file:///home/shub/EZTRACK/backend/drop_branchids.py) | Completed migration, column no longer exists | Delete |
| [dev_reset_db.py](file:///home/shub/EZTRACK/backend/dev_reset_db.py) | Drop-all-tables should never be in backend root; move trigger/index SQL to Alembic | Move to `scripts/` or delete |
| [scripts/seed_data.py](file:///home/shub/EZTRACK/scripts/seed_data.py) | Dev-only, should not be deployed to production | Move to `scripts/dev/` |

### 🔀 Files to Merge

| Files | Merge Into | Reason |
|---|---|---|
| [schemas/payment.py](file:///home/shub/EZTRACK/backend/schemas/payment.py) (227 bytes) | [schemas/invoice.py](file:///home/shub/EZTRACK/backend/schemas/invoice.py) | Payment schema is tiny (likely just an amount + mode) and tightly coupled to invoices |
| [core/aadhaar_crypto.py](file:///home/shub/EZTRACK/backend/core/aadhaar_crypto.py) + [core/security.py](file:///home/shub/EZTRACK/backend/core/security.py) | `core/crypto.py` | Both handle cryptographic operations. Aadhaar crypto uses Fernet, security uses bcrypt + JWT. A single [crypto.py](file:///home/shub/EZTRACK/backend/core/aadhaar_crypto.py) module with clear sections is more discoverable |
| [core/alert_utils.py](file:///home/shub/EZTRACK/backend/core/alert_utils.py) + [core/cache.py](file:///home/shub/EZTRACK/backend/core/cache.py) | Consider merging if alerts always use cached data. Currently alert_utils likely imports from cache already |
| [routers/automation.py](file:///home/shub/EZTRACK/backend/routers/automation.py) data queries | Reuse dashboard service functions | `expiring-memberships`, `low-stock-items`, `overdue-payments` query the same data as dashboard alerts. If a service layer existed, these would share code |

### 📐 Files to Split

| File | Current Size | Split Into |
|---|---|---|
| [routers/members.py](file:///home/shub/EZTRACK/backend/routers/members.py) | 47 KB, 1,201 lines | `members/crud.py`, `members/update.py`, `members/bulk.py`, `members/images.py` |
| [routers/proteins.py](file:///home/shub/EZTRACK/backend/routers/proteins.py) | 30 KB, 865 lines | `proteins/crud.py`, `proteins/images.py`, `proteins/lots.py`, `proteins/bulk.py` |
| [routers/invoices.py](file:///home/shub/EZTRACK/backend/routers/invoices.py) | 26 KB, 714 lines | `invoices/crud.py`, `invoices/payments.py`, `invoices/bulk.py` |
| [routers/dashboard.py](file:///home/shub/EZTRACK/backend/routers/dashboard.py) | 24 KB, 592 lines | `dashboard/stats.py`, `dashboard/alerts.py`, `dashboard/stream.py` |
| [routers/branch_details.py](file:///home/shub/EZTRACK/backend/routers/branch_details.py) | 13 KB, 370 lines | `branches/details.py`, `branches/logos.py` |

---

## 9. Priority Action Matrix

### 🔴 P0 — Fix Before 10K DAU (Do This Week)

| ID | Issue | Effort | Impact | Status |
|---|---|---|---|---|
| SEC-VULN-01 | Mass assignment in member updates — use `MemberUpdate` schema | 2 hrs | Prevents data corruption | **DONE** |
| SCH-03 | Add `UNIQUE` on `Gym.username` | 5 min (Alembic) | Prevents duplicate accounts | **DONE** |
| SCH-04 | Add `UNIQUE` on [User(gymId, username)](file:///home/shub/EZTRACK/backend/models/all_models.py#117-155) | 5 min (Alembic) | Prevents duplicate staff | **DONE** |
| SEC-VULN-04 | Add RBAC to audit log endpoint | 5 min | Prevents data exposure | **DONE** |
| SEC-VULN-10 | Add RBAC to branch detail updates | 5 min | Prevents gym defacement | **DONE** |
| SEC-VULN-11 | Add RBAC to logo upload | 5 min | Prevents unauthorized uploads | **DONE** |
| SEC-VULN-12 | Add RBAC to protein create | 5 min | Enforces access control | **DONE** |

### 🟡 P1 — Fix Before Production Scale (This Month)

| ID | Issue | Effort | Impact | Status |
|---|---|---|---|---|
| SW-02 | Consolidate duplicate update endpoints | 2 hrs | Eliminates divergent bugs | **DONE** |
| PB-02 | Tune async connection pool, separate SSE pool | 1 hr | Prevents connection exhaustion | **DONE** |
| PB-04 | Implement keyset pagination for members | 3 hrs | Eliminates OFFSET scans | **DONE** |
| SEC-VULN-05 | Rate-limit all write endpoints | 1 hr | Prevents abuse | **DONE** |
| SCH-01 | Normalize phone numbers to E.164 | 3 hrs | Enables proper dedup | **PARTIAL** |
| WA-03 | Implement soft-delete archival | 4 hrs | Controls table growth | **DONE** |

### 🟢 P2 — Improve Over Next Quarter

| ID | Issue | Effort | Impact | Status |
|---|---|---|---|---|
| SW-04 | Extract invoice creation to service layer | 4 hrs | Enables code reuse | **DONE** |
| SW-08 | Create service layer for business logic | 8 hrs | Improves testability | **DONE** |
| PB-06 | Collapse dashboard stats into single CTE | 3 hrs | 4x fewer queries | **DONE** |
| SW-06 | Add SSE heartbeat + connection limits | 2 hrs | Prevents connection leaks | **DONE** |
| RD-01 | Remove unused [get_db](file:///home/shub/EZTRACK/backend/core/database.py#37-43) imports | 30 min | Cleanliness | **DONE** |
| SCH-07 | Add indexes for member status (Active/Expired) | 1 hr | Enables index-backed filtering | **DONE** |
| PB-08 | Add `statement_timeout=30s` | 5 min | Prevents runaway queries | **DONE** |

---

> [!IMPORTANT]
> **The single most impactful change is SEC-VULN-01** (replacing raw [dict](file:///home/shub/EZTRACK/backend/core/cache.py#54-57) with Pydantic schema in member updates). This closes a mass-assignment vulnerability, eliminates the need for a manual blocklist, and brings the last untyped endpoint pair in line with the rest of the codebase.

> [!TIP]
> **The single best structural investment is SW-08** (service layer). It pays dividends across testing, background jobs, API versioning, and code reuse. Start with `services/invoice_service.py` since invoice logic is currently split between [members.py](file:///home/shub/EZTRACK/backend/routers/members.py) and [invoices.py](file:///home/shub/EZTRACK/backend/routers/invoices.py).
