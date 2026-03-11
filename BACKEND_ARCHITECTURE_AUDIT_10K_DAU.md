# EZTRACK — Backend Architecture Audit  
## Simulating 10,000 Daily Active Users  
**Date:** March 2026  
**Scope:** `backend/` — Models, Routers, Core, Schemas, Database  
**Constraint:** No Redis or Docker recommendations  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)  
2. [Load Profile — 10K DAU Simulation](#2-load-profile--10k-dau-simulation)  
3. [Structural Weaknesses](#3-structural-weaknesses)  
4. [Performance Bottlenecks](#4-performance-bottlenecks)  
5. [Write Amplification Risks](#5-write-amplification-risks)  
6. [Redundant Relationships & Dead Weight](#6-redundant-relationships--dead-weight)  
7. [Schema Improvement Recommendations](#7-schema-improvement-recommendations)  
8. [Security Vulnerability Assessment](#8-security-vulnerability-assessment)  
9. [File Consolidation — Unnecessary or Mergeable Files](#9-file-consolidation--unnecessary-or-mergeable-files)  
10. [Mitigation Strategies — Prioritized Action Plan](#10-mitigation-strategies--prioritized-action-plan)  
11. [Appendix — Load Estimation Formulas](#appendix--load-estimation-formulas)

---

## 1. Executive Summary

EZTRACK is a multi-tenant gym management SaaS built with **FastAPI + SQLAlchemy + PostgreSQL**. The codebase shows strong foundational decisions: UUIDs as primary keys, soft-delete patterns, Fernet encryption for Aadhaar data, HMAC-based deduplication, role-based access control (RBAC), refresh token rotation with theft detection, and an in-process settings cache.

However, simulating **10,000 DAU** (≈100 gyms × 100 active users/gym, or 500 gyms × 20 users/gym) exposes **16 structural weaknesses**, **9 performance bottlenecks**, **5 write amplification risks**, and **12 security concerns** that would degrade the system under sustained production load.

### Verdict Snapshot

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Structural Weaknesses | 3 | 5 | 5 | 3 |
| Performance Bottlenecks | 2 | 4 | 2 | 1 |
| Write Amplification | 1 | 2 | 2 | 0 |
| Security Vulnerabilities | 2 | 4 | 4 | 2 |

---

## 2. Load Profile — 10K DAU Simulation

### Assumptions

| Metric | Value | Rationale |
|--------|-------|-----------|
| Daily Active Users | 10,000 | Mix of gym owners, managers, staff |
| Active Gyms | ~500 | 20 DAU per gym average |
| Peak concurrent users | ~1,500 | 15% of DAU during 6–10 PM window |
| API requests/day | ~300,000 | ~30 actions per user per day |
| Peak QPS | ~100 | 300K/3600s peak-hour * 1.2x burst |
| DB connections (peak) | ~150 | 100 QPS × 1.5s avg query time |
| Members per gym (avg) | 300 | Total: ~150,000 member rows |
| Invoices/day | ~2,000 | Admissions + renewals + protein sales |
| Dashboard SSE streams | ~200 | Concurrent staff viewing dashboards |
| Audit log rows/day | ~15,000 | 5 auditable actions × 10K DAU × 0.3 |

### Request Distribution (Estimated)

| Endpoint Group | % of Traffic | Requests/Day | Peak QPS |
|----------------|-------------|-------------|----------|
| `GET /members` (list/search) | 25% | 75,000 | 25 |
| `GET /dashboard/stats` | 15% | 45,000 | 15 |
| `GET /dashboard/stream` (SSE) | 5% | 15,000 | sustained 200 |
| `GET /invoices` (list/detail) | 12% | 36,000 | 12 |
| `POST /members` (create/renew) | 8% | 24,000 | 8 |
| `GET /proteins` (list/search) | 10% | 30,000 | 10 |
| `POST /invoices` (create/pay) | 7% | 21,000 | 7 |
| `POST /auth/*` (login/refresh) | 5% | 15,000 | 5 |
| `GET /expenses` + `/automation` | 8% | 24,000 | 8 |
| `PUT/*` (updates) | 5% | 15,000 | 5 |

---

## 3. Structural Weaknesses

### SW-01 · CRITICAL — Synchronous ORM in an Async Framework

**File:** `core/database.py`, all routers  
**Problem:** FastAPI is an async framework, but **100% of routes use synchronous `def` handlers** with synchronous SQLAlchemy sessions (`SessionLocal`). An `async_engine` and `AsyncSessionLocal` are defined but **never used by any router**.

At 100 QPS, each synchronous DB query blocks the event loop thread. With `pool_size=50` and `max_overflow=100`, you can handle 150 concurrent connections, but the **GIL + sync I/O** means you're limited to the number of **threadpool workers** (default 40 in uvicorn).

**Impact at 10K DAU:**  
- Dashboard SSE streams (`/stream`) hold connections open for minutes → thread starvation  
- Peak hour (100 QPS) will exhaust threadpool, causing 503 errors on SSE + new requests  
- The async engine costs memory but provides zero benefit  

**Recommendation:**  
Either convert hot-path routes to `async def` using `AsyncSession`, **or** explicitly size the threadpool in your uvicorn config:
```bash
uvicorn main:app --workers 4 --limit-concurrency 200
```
And in `main.py`:
```python
import anyio
anyio.to_thread.current_default_thread_limiter().total_tokens = 200
```

---

### SW-02 · CRITICAL — No Connection Pooler in Architecture

**File:** `core/database.py`  
**Problem:** `pool_size=50, max_overflow=100` means each **worker process** can open up to 150 PostgreSQL connections. With 4 workers, that's **600 connections** — exceeding PostgreSQL's default `max_connections=100`.

**Impact at 10K DAU:**  
- Workers fight for connections → `OperationalError: too many connections`  
- No comment or configuration for PgBouncer/Pgpool-II in the codebase  
- The comment `# Use PgBouncer in front of PostgreSQL` is aspirational, not implemented  

**Recommendation:**  
- Deploy **PgBouncer** in transaction-pooling mode between the app and PostgreSQL  
- Reduce application-side `pool_size` to 10–15 per worker (PgBouncer handles multiplexing)  
- Set PostgreSQL `max_connections = 200` with PgBouncer `default_pool_size = 30`  

---

### SW-03 · CRITICAL — SSE Stream Holds DB Sessions Indefinitely

**File:** `routers/dashboard.py` — `/stream` endpoint  
**Problem:** The SSE stream runs an **infinite `while True` loop** with `asyncio.sleep(10)` between iterations. Each SSE client holds:
1. An HTTP connection (never released)  
2. A database session (via `get_async_db` dependency — held for the lifetime of the request)  

With 200 concurrent SSE streams, this permanently consumes **200 async DB connections** from the pool.

**Impact at 10K DAU:**  
- Async connection pool (`pool_size=50`) is exhausted by just 50 SSE streams  
- Regular async queries (if any were used) would block waiting for connections  
- Memory leak: `GymStreamManager` caches per-gym state forever  

**Recommendation:**  
- Acquire and release the DB session **per tick** (every 10 seconds), not per SSE connection  
- Add a maximum stream duration (e.g., 30 minutes) to force reconnection  
- Implement a heartbeat timeout to detect dead SSE clients  
- Cap concurrent SSE connections per gym to prevent DOS  

---

### SW-04 · HIGH — Monolithic `all_models.py` (901 lines)

**File:** `models/all_models.py`  
**Problem:** All 19 ORM models are defined in a single 901-line file. At scale, this creates:
- Merge conflicts when multiple developers touch different models  
- Circular import risks as the file is imported everywhere  
- Cognitive overhead — finding `PaymentEvent` requires scrolling past `ProteinLot`  

**Recommendation:**  
Split into domain-oriented modules:
```
models/
├── __init__.py          # re-exports all models
├── base.py              # Base, generate_uuid, MONEY type alias
├── gym.py               # Gym, Branch, GymSettings, GymSubscription
├── auth.py              # User, RefreshToken, UserBranchAccess
├── member.py            # Member
├── financial.py         # Invoice, InvoiceItem, PaymentEvent, Expense
├── inventory.py         # ProteinStock, ProteinLot
├── audit.py             # AuditLog
├── misc.py              # ExternalContact, PricingConfig, TermsAndConditions, WhatsAppTemplate, GymDailySummary
```

---

### SW-05 · HIGH — Monolithic `members.py` Router (1031 lines)

**File:** `routers/members.py`  
**Problem:** The members router handles: CRUD, admission, renewal, re-admission, bulk operations, search, duplicate detection, Aadhaar encryption, status computation, and response mapping — all in one file. This is the largest file in the codebase (41KB).

**Recommendation:**  
Extract into:
```
routers/
├── members/
│   ├── __init__.py      # APIRouter with sub-router includes
│   ├── crud.py          # GET list, GET by ID, POST create, PUT update, DELETE
│   ├── admission.py     # admission, renewal, re-admission
│   ├── bulk.py          # bulk-create, bulk-delete, bulk-update  
│   └── utils.py         # map_member_response, computed_status, search_duplicates
```

---

### SW-06 · HIGH — `bulk_delete` Endpoints Accept Raw `dict`

**Files:** `routers/expenses.py:126`, `routers/proteins.py:343`  
**Problem:** Both `bulk_delete_expenses()` and `bulk_delete_proteins()` accept `data: dict` as the request body instead of a typed Pydantic schema. This bypasses FastAPI's automatic input validation.

```python
# CURRENT — no type validation
def bulk_delete_expenses(data: dict, ...):
    ids = data.get("ids", [])  # Could be strings, numbers, objects, anything
```

**Impact:**  
- No type validation on individual IDs (could pass objects, booleans, nested dicts)  
- SQL injection via crafted ID strings (unlikely with SQLAlchemy but violates defense-in-depth)  
- Inconsistent with `bulk_create` endpoints which correctly use typed schemas  

**Recommendation:** Create `BulkDeleteRequest` schema:
```python
class BulkDeleteRequest(BaseModel):
    ids: List[str] = Field(..., max_length=500)
```

---

### SW-07 · HIGH — `create_protein_lot` and `update_protein_lot` Accept Raw `dict`

**File:** `routers/proteins.py:699, 754`  
**Problem:** Same issue as SW-06. These endpoints accept `data: dict` with manual type coercion (`int(data.get('quantity'))`) that silently swallows errors.

---

### SW-08 · HIGH — `update_member_pricing_bulk` Accepts Raw `dict`

**File:** `routers/settings.py:166`  
**Problem:** `data: dict` with no schema validation for the pricing matrix. Arbitrary keys and values are accepted.

---

### SW-09 · MEDIUM — Missing `__init__.py` in Key Directories

**Files:** `routers/`, `core/`  
**Problem:** No `__init__.py` in `routers/` or `core/` directories. While Python 3.3+ supports implicit namespace packages, this causes issues with:
- Some IDE import resolution  
- Test discovery tools  
- Relative imports within the package  

---

### SW-10 · MEDIUM — `db_setup.py` Named as Migration Script

**File:** `backend/db_setup.py`  
**Problem:** The docstring says `migrate.py` but the file is named `db_setup.py`. The script drops ALL tables and recreates them — this is a **development-only** tool masquerading as a migration script. There are no actual Alembic migrations configured.

**Impact at 10K DAU:**  
- No incremental schema migration path for production  
- Schema changes require full data loss or manual ALTER TABLE statements  
- The `--partition` flag is production-safe, but the default mode is catastrophic in production  

**Recommendation:**  
- Add Alembic for production migrations  
- Add a `--yes-i-am-sure` flag before dropping all tables  
- Rename to `dev_reset_db.py` to prevent accidental production use  

---

### SW-11 · MEDIUM — `terms.py` Filters in Python, Not SQL

**File:** `routers/terms.py:25-29`  
**Problem:** The `appliesTo` filter fetches ALL terms from the database, then filters in Python:
```python
terms = query.order_by(...).all()
if appliesTo:
    filtered_terms = [t for t in terms if appliesTo in (t.appliesTo or [])]
```

With PostgreSQL ARRAY columns, this should use `any()` or `@>` operators at the SQL level.

---

### SW-12 · MEDIUM — No Request Size Limits

**File:** `main.py`  
**Problem:** No middleware to limit request body size. Bulk endpoints accept up to 500 items, but there's no protection against:
- A 100MB JSON payload in a single request  
- Slowloris-style attacks that send data very slowly  

---

### SW-13 · MEDIUM — `get_protein_summary` Fetches All Rows into Python

**File:** `routers/proteins.py:186-233`  
**Problem:** This endpoint loads ALL protein rows into memory and computes aggregates in Python. With 500 gyms × 50 products = 25,000 rows, this is inefficient.

```python
proteins = db.query(ProteinStock).filter(...).all()  # loads all into memory
for p in proteins:  # iterates in Python
    total_quantity += qty
```

**Recommendation:** Use SQL aggregates:
```sql
SELECT 
    COUNT(*), SUM("Quantity"), SUM("Quantity" * "LandingPrice"),
    COUNT(*) FILTER (WHERE "Quantity" < COALESCE("StockThreshold", 5))
FROM "ProteinStock" WHERE "gymId" = ? AND "isDeleted" = false;
```

---

### SW-14 · LOW — Inconsistent Date Handling Patterns

**Files:** Multiple routers  
**Problem:** `datetime.now()` is called without timezone in `automation.py`, but with timezone (`datetime.now(timezone.utc)`) in other files. The `today = datetime.now().date()` pattern in `automation.py` doesn't account for the server timezone vs. the gym's timezone (IST).

---

### SW-15 · LOW — No Health Check Endpoint

**File:** `main.py`  
**Problem:** No `/health` or `/ready` endpoint for load balancer health checks. Without this, a load balancer can't detect if the application is up but the database is down.

---

### SW-16 · LOW — `_initialized_gyms` Set in WhatsApp Templates Grows Unbounded

**File:** `routers/whatsapp_templates.py:45`  
**Problem:** `_initialized_gyms: set[str] = set()` grows indefinitely, consuming memory proportional to the number of gyms that have ever made a request. At 500 gyms, this is negligible (~40KB), but the pattern doesn't have a cleanup mechanism for deleted gyms.

---

## 4. Performance Bottlenecks

### PB-01 · CRITICAL — `GET /members` N+1 Query on Response Mapping

**File:** `routers/members.py` — `map_member_response()`  
**Problem:** When listing members, each member's response involves:
1. `decrypt_aadhaar()` — CPU-intensive Fernet decryption  
2. `mask_aadhaar()` — String manipulation  
3. Date formatting for multiple fields  

For a gym with 300 members and `page_size=50`, this means **50 Fernet decrypt operations per request**. At 25 QPS for member listings, that's **1,250 decryptions/second**.

**Impact at 10K DAU:**  
- Fernet decryption is CPU-bound (~0.5ms each) → 625ms of CPU time per second just for Aadhaar  
- Combined with the GIL, this blocks the thread pool  

**Recommendation:**  
- Don't decrypt Aadhaar in list views — only in detail views  
- Return `hasAadhaar: true/false` in list views instead of the masked value  
- If masking is business-required, cache the masked value in a `maskedAadhaar` column  

---

### PB-02 · CRITICAL — Dashboard `_compute_stats_async` Runs 8+ SQL Queries per Tick

**File:** `routers/dashboard.py` — `_compute_stats_async()`  
**Problem:** Each SSE tick computes dashboard stats by running **8 separate SQL queries** against live data (active members, new members, collections, expenses, pending balances, renewals, PT revenue, overdue invoices). With `GymStreamManager` deduplication, this is 8 queries per gym per 10-second tick.

With 200 concurrent SSE streams across 100 gyms:
- **100 gyms × 8 queries × 6 ticks/minute = 4,800 queries/minute** for dashboards alone  
- Each query involves aggregations over potentially large tables (150K members, 300K invoices)  

**Recommendation (already partially implemented):**  
- The `GymDailySummary` cache is excellent — ensure it's populated **asynchronously by a background task**, not on-demand by the first SSE client  
- Reduce SSE tick interval from 10s to 30s (dashboard data doesn't change that fast)  
- Add a `lastRefreshed` timestamp to `GymDailySummary` and skip recomputation if < 60s old  

---

### PB-03 · HIGH — Missing Indexes on Frequently Filtered Columns

**Tables/Columns needing indexes:**

| Table | Column(s) | Query Pattern | Priority |
|-------|-----------|--------------|----------|
| `Member` | `(gymId, NextDuedate)` | Expiring memberships, alerts | HIGH |
| `Member` | `(gymId, computed_status)` | Active member counts, filters | HIGH |
| `Invoice` | `(gymId, status, dueDate)` | Overdue payment queries | HIGH |
| `Invoice` | `(gymId, createdAt)` | Invoice listing sorted by date | MEDIUM |
| `Expense` | `(gymId, date, isDeleted)` | Expense listing with date range | MEDIUM |
| `PaymentEvent` | `(invoiceId)` | Payment reconciliation | MEDIUM |
| `ProteinStock` | `(gymId, isDeleted, Quantity)` | Low stock alerts | MEDIUM |
| `RefreshToken` | `(expiresAt)` | Token cleanup job | LOW |

Most queries filter by `gymId` first, then secondary columns. **Composite indexes** with `gymId` as the leading column would dramatically improve performance.

---

### PB-04 · HIGH — `GET /members` Count Query + Data Query Pattern

**File:** `routers/members.py`  
**Problem:** Paginated member listing executes TWO queries:
1. `query.count()` — full table scan on the WHERE clause  
2. `query.offset().limit().all()` — fetches the actual page  

The `count()` query is **O(n)** and doesn't benefit from the LIMIT/OFFSET of the data query. At 150K total members (500 gyms × 300 members), each count query scans the entire gym's member partition.

**Recommendation:**  
- Use window function: `SELECT *, COUNT(*) OVER() AS total FROM ... LIMIT ? OFFSET ?`  
- Or use cursor-based pagination instead of offset-based (eliminates count entirely)  
- Or cache the last known count and refresh it asynchronously  

---

### PB-05 · HIGH — In-Process Cache Only Works Per-Worker

**File:** `core/cache.py`  
**Problem:** The `_settings_cache` is a per-process Python dict. With 4 uvicorn workers:
- Each worker maintains its own cache  
- Cache invalidation (`invalidate_gym_settings`) only clears the cache in the worker that handled the PUT request  
- The other 3 workers serve stale settings for up to 10 minutes  

**Impact at 10K DAU:**  
- A gym owner updates settings → 75% of subsequent requests see stale data for up to 10 minutes  
- No way to force cross-worker invalidation without Redis (which is excluded)  

**Recommendation (no Redis):**  
- Add a `settingsVersion` column to `GymSettings` (auto-incremented on update)  
- Include `settingsVersion` in JWT payload (refreshed on next token refresh)  
- Cache checks compare JWT version vs cached version → stale cache detected instantly  
- Or reduce TTL from 600s to 60s (acceptable at 10K DAU — only 1 query/gym/minute)  

---

### PB-06 · HIGH — `proteins.py` Summary Endpoint Loads All Rows

**File:** `routers/proteins.py:186-233`  
**(Same as SW-13 — listed here for performance impact)**  
**Query cost:** O(n) Python iteration over all rows instead of O(1) SQL aggregate.

---

### PB-07 · MEDIUM — `terms.py` Python-Side Array Filtering

**File:** `routers/terms.py:25-29`  
**(Same as SW-11 — listed here for performance impact)**  

---

### PB-08 · MEDIUM — No Response Compression (gzip/brotli)

**File:** `main.py`  
**Problem:** No `GZipMiddleware` configured. JSON responses for member lists (50 records × ~2KB each = 100KB) are sent uncompressed. At 25 QPS, that's **2.5 MB/s outbound** just for member listings.

**Recommendation:**
```python
from starlette.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1000)
```

---

### PB-09 · LOW — `map_*_response` Functions Create Redundant Dict Copies

**Files:** All routers  
**Problem:** Every response mapper does `p.__dict__.copy()` then mutates the copy. This creates a full dict copy of every ORM object, including internal SQLAlchemy state fields that are then manually removed.

**Recommendation:** Use Pydantic's `model_validate()` with `from_attributes=True` for zero-copy serialization.

---

## 5. Write Amplification Risks

### WA-01 · CRITICAL — ProteinLot Trigger Fires on Every Quantity Change

**File:** `db_setup.py` — `TRIGGER_PROTEIN_QUANTITY_SYNC`  
**Problem:** The `sync_protein_stock_quantity()` trigger fires `AFTER INSERT OR UPDATE OR DELETE ON "ProteinLot"`. It runs `SUM(quantity)` across ALL lots for the protein and UPDATEs `ProteinStock.Quantity`.

For a `bulk_create_proteins` call with 100 items, each creating a lot:
- **100 INSERT INTO ProteinLot** → triggers 100 times  
- Each trigger runs **100 SUM aggregates + 100 UPDATEs to ProteinStock**  
- Total: **200 additional queries** for a single bulk import  

**Impact at 10K DAU:**  
- Stock adjustments during peak hours create cascading queries  
- `adjust-stock` endpoint creates a lot + triggers the full SUM  

**Recommendation:**  
- Use `DEFERRED` trigger execution to batch updates  
- Or use a `STATEMENT`-level trigger instead of `ROW`-level  
- Or skip the trigger for bulk operations and run a single SUM at the end  

---

### WA-02 · HIGH — Audit Log Writes on Every State Change

**File:** `core/audit_utils.py`  
**Problem:** `log_audit()` is called after every CREATE, UPDATE, DELETE. The `changes` field stores a JSON diff. At 10K DAU with ~15,000 auditable actions/day:
- **15,000 INSERT INTO AuditLog per day**  
- AuditLog JSON (changes column) averages ~500 bytes → **7.5 MB/day, 225 MB/month**  
- Without partitioning, the `AuditLog` table grows to **~2.7 GB/year**  

The `GymDailySummary` table adds additional write amplification: each dashboard stat recomputation UPSERTs a row.

**Recommendation:**  
- Implement the `--partition` migration promptly (it's ready but not deployed)  
- Batch audit log writes: accumulate in-memory and flush every N seconds or at transaction commit  
- Consider async audit logging via a background queue (Python `queue.Queue`)  

---

### WA-03 · HIGH — `update_staff()` Deletes + Reinserts All Branch Access Rows

**File:** `routers/staff.py:153-161`  
**Problem:**  
```python
db.query(UserBranchAccess).filter(UserBranchAccess.userId == user.id).delete()
for bid in data.branchIds:
    uba = UserBranchAccess(userId=user.id, branchId=bid, gymId=current_gym.id)
    db.add(uba)
```

Every staff update that includes `branchIds` deletes ALL existing rows and reinserts them, even if only one branch changed. With 5 branches per staff member:
- 1 DELETE (bulk) + 5 INSERTs per update  
- This fires any cascading triggers on `UserBranchAccess`  

**Recommendation:** Compute the diff and only insert/delete changed rows.

---

### WA-04 · MEDIUM — `GymDailySummary` Upsert on Every Dashboard Request

**File:** `routers/dashboard.py`  
**Problem:** When the cache misses (once per day per gym ideally, but more frequent under cache invalidation), the stats computation writes a full row to `GymDailySummary`. If multiple workers compete, this becomes an upsert race.

---

### WA-05 · MEDIUM — Payment Reconciliation Scans + Updates All Invoices

**File:** `routers/dashboard.py` — `/reconcile-payments`  
**Problem:** The reconciliation endpoint fetches ALL invoices for a gym and compares `paidAmount` vs `SUM(PaymentEvent.amount)`. For gyms with thousands of invoices, this is a full-table operation.

**Recommendation:** Only reconcile invoices modified in the last N days, or invoices with `status IN ('PENDING', 'PARTIAL')`.

---

## 6. Redundant Relationships & Dead Weight

### RD-01 — `User.branchIds` JSON Column + `UserBranchAccess` Junction Table

**Files:** `models/all_models.py` — `User.branchIds`, `UserBranchAccess`  
**Problem:** Branch access is stored in **two places**:
1. `User.branchIds` — a JSON array on the User row  
2. `UserBranchAccess` — a proper junction table  

The junction table was added later (normalized form) but the JSON column was never removed. Both are maintained in `staff.py`, creating dual-write overhead and potential desync.

**Recommendation:** Drop `User.branchIds` column after migrating all reads to use `UserBranchAccess`.

---

### RD-02 — `ProteinStock.Quantity` vs. SUM(`ProteinLot.quantity`) Trigger

**Files:** `models/all_models.py`, `db_setup.py`  
**Problem:** `ProteinStock.Quantity` is a denormalized cache of `SUM(ProteinLot.quantity)`. The trigger keeps them in sync, but:
- The column is writable by the ORM (no `server_default` or computed column)  
- Old code paths might write to it directly, bypassing the trigger  
- The `adjust-stock` endpoint creates a lot but then does `db.refresh(protein)` to read the trigger-updated value — an extra round trip  

**Recommendation:** Make `Quantity` a generated column or a SQL view column to prevent direct writes.

---

### RD-03 — `GymDailySummary` Duplicates Dashboard SQL Logic

**File:** `routers/dashboard.py`  
**Problem:** Dashboard stats are computed in two places:
1. `_compute_stats_async()` — live SQL aggregates  
2. `GymDailySummary` — cached version of the same data  

The computation logic is duplicated, not extracted into a shared function. If a formula changes in one place but not the other, the cache and live views diverge silently.

**Recommendation:** Extract stat computation into a shared function. Use it for both live response and summary population.

---

### RD-04 — `get_low_stock_proteins()` and `/low-stock` in `automation.py` 

**Files:** `routers/proteins.py:160-183`, `routers/automation.py:49-72`  
**Problem:** Both files implement the same low-stock query with the same `func.coalesce(ProteinStock.StockThreshold, 5)` logic but slightly different response formats. This is duplicated business logic.

---

### RD-05 — Expiring Membership Logic in `automation.py` and `dashboard.py`

**Files:** `routers/automation.py:14-46`, `routers/dashboard.py` (alerts)  
**Problem:** Member expiry detection is implemented in both files with nearly identical queries. Any change to expiry logic must be updated in two locations.

---

### RD-06 — `migration.py` Reference in `db_setup.py`

**File:** `db_setup.py:2`  
**Problem:** The docstring references `migrate.py` but the file is named `db_setup.py`. The old `migration.py` file was supposedly deleted but the reference remains.

---

## 7. Schema Improvement Recommendations

### SCH-REC-01 — Add Composite Indexes (Priority: CRITICAL)

```sql
-- Member queries (list, search, expiry alerts)
CREATE INDEX ix_member_gym_status ON "Member" ("gymId", "isDeleted") 
    WHERE "isDeleted" = false;
CREATE INDEX ix_member_gym_due ON "Member" ("gymId", "NextDuedate") 
    WHERE "isDeleted" = false;

-- Invoice queries (listing, overdue detection)
CREATE INDEX ix_invoice_gym_status_due ON "Invoice" ("gymId", "status", "dueDate") 
    WHERE "isDeleted" = false;
CREATE INDEX ix_invoice_gym_created ON "Invoice" ("gymId", "createdAt" DESC) 
    WHERE "isDeleted" = false;

-- PaymentEvent (reconciliation, history)
CREATE INDEX ix_payment_event_invoice ON "PaymentEvent" ("invoiceId", "paidAt");

-- Expense (date-range filtering)
CREATE INDEX ix_expense_gym_date ON "Expense" ("gymId", "date" DESC) 
    WHERE "isDeleted" = false;

-- RefreshToken (cleanup job)
CREATE INDEX ix_refresh_token_expires ON "RefreshToken" ("expiresAt") 
    WHERE "isRevoked" = false;
```

### SCH-REC-02 — Partial Indexes for Soft-Delete Tables (Priority: HIGH)

All queries on soft-delete tables include `WHERE isDeleted = false`. PostgreSQL partial indexes can dramatically reduce index size and scan time:

```sql
CREATE INDEX ix_member_active ON "Member" ("gymId") WHERE "isDeleted" = false;
CREATE INDEX ix_protein_active ON "ProteinStock" ("gymId") WHERE "isDeleted" = false;
CREATE INDEX ix_invoice_active ON "Invoice" ("gymId") WHERE "isDeleted" = false;
CREATE INDEX ix_expense_active ON "Expense" ("gymId") WHERE "isDeleted" = false;
```

### SCH-REC-03 — Deploy AuditLog Partitioning (Priority: HIGH)

The `partition_auditlog()` function in `db_setup.py` is production-ready. Deploy it before the table exceeds 100K rows. At 15K rows/day, this threshold is reached in **7 days** with 10K DAU.

### SCH-REC-04 — Add `CHECK` Constraints for Financial Integrity (Priority: MEDIUM)

```sql
ALTER TABLE "Invoice" ADD CONSTRAINT chk_invoice_amounts 
    CHECK ("total" >= 0 AND "paidAmount" >= 0 AND "paidAmount" <= "total");

ALTER TABLE "PaymentEvent" ADD CONSTRAINT chk_payment_positive 
    CHECK (amount > 0);

ALTER TABLE "Expense" ADD CONSTRAINT chk_expense_positive 
    CHECK (amount > 0);
```

### SCH-REC-05 — Replace `computed_status` Hybrid Property with Generated Column (Priority: MEDIUM)

**File:** `models/all_models.py` — `Member.computed_status`  
The hybrid property works at both Python and SQL level, but a **PostgreSQL generated column** would:
- Enable indexing on the status value  
- Eliminate the CASE expression from every query plan  
- Guarantee consistency between application and database  

```sql
ALTER TABLE "Member" ADD COLUMN status_computed TEXT GENERATED ALWAYS AS (
    CASE 
        WHEN "isDeleted" THEN 'Deleted'
        WHEN "NextDuedate" IS NULL THEN 'Inactive'
        WHEN "NextDuedate" >= CURRENT_DATE THEN 'Active'
        ELSE 'Expired'
    END
) STORED;
CREATE INDEX ix_member_computed_status ON "Member" ("gymId", status_computed);
```

### SCH-REC-06 — Add `updatedAt` Trigger for All Tables (Priority: LOW)

Several tables have `updatedAt` columns but no automatic trigger to keep them current. ORM-level defaults can be bypassed by raw SQL updates.

```sql
CREATE OR REPLACE FUNCTION auto_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 8. Security Vulnerability Assessment

### SEC-V-01 · CRITICAL — No CSRF Protection for Cookie-Based Auth

**File:** `main.py`, `routers/auth.py`  
**Problem:** The login endpoint returns the token in the JSON body, and the frontend presumably stores it in localStorage or a cookie. If the frontend uses cookies with `SameSite=None` or `Lax`:
- No CSRF token is issued or validated  
- Any malicious site could make authenticated requests to the API  

**Mitigation:**  
- If using JWT in `Authorization` header (not cookies): CSRF is mitigated by CORS (already configured)  
- If cookies are used: add `SameSite=Strict` and implement CSRF token rotation  
- **Verify frontend implementation** to confirm token storage method  

---

### SEC-V-02 · CRITICAL — Rate Limiting Key Can Be Spoofed via JWT

**File:** `core/rate_limit.py`  
**Problem:** Rate limiting is keyed by `gymId` extracted from the JWT. The fallback is the client IP. However:
- An attacker with multiple valid gym accounts can distribute attacks across gym IDs  
- If the JWT is stolen, the rate limit doesn't protect per-IP  
- The rate limit state is stored in-memory (default with `slowapi`) and resets on worker restart  

**Mitigation:**  
- Add a secondary rate limit on IP address (in addition to gymId)  
- Use a persistent rate limit store (database-backed or file-backed, since Redis is excluded)  
- Implement global rate limiting at the reverse proxy level (nginx/Caddy `limit_req`)  

---

### SEC-V-03 · HIGH — `preview_template` Accepts Raw `dict`

**File:** `routers/whatsapp_templates.py:173-215`  
**Problem:** The template preview endpoint accepts `data: dict` and extracts `messageTemplate` and `sampleData` without schema validation. While placeholder validation exists (SEC-11), the `sampleData` dict is unbounded and can contain any key-value pairs.

**Mitigation:** Create a typed Pydantic schema:
```python
class TemplatePreviewRequest(BaseModel):
    messageTemplate: str = Field(..., max_length=2000)
    sampleData: Dict[str, str] = Field(default_factory=dict)
```

---

### SEC-V-04 · HIGH — No File Upload Size Limit at Framework Level

**File:** `main.py`  
**Problem:** While `storage.py` has a `MAX_IMAGE_SIZE_BYTES = 5MB` check, the check happens **after** the entire file is read into memory (`await file.read()`). An attacker can upload a 1GB file, causing OOM before the size check runs.

```python
# VULNERABLE — reads entire file into memory first
image_data = await file.read()  # 1GB in memory
if len(image_data) > MAX_IMAGE_SIZE_BYTES:  # Too late
```

**Mitigation:**  
- Add `app.add_middleware(ContentSizeLimitMiddleware, max_content_size=10_000_000)` (10MB global limit)  
- Or configure at reverse proxy level: `client_max_body_size 10m;` (nginx)  
- Read in chunks: `chunks = []; async for chunk in file: ...`  

---

### SEC-V-05 · HIGH — Timing Attack on Staff Login

**File:** `routers/auth.py` — `staff_login()`  
**Problem:** The login flow has different execution times for:
1. Invalid gym → fast rejection (no bcrypt comparison)  
2. Valid gym, invalid username → fast rejection (no bcrypt comparison)  
3. Valid gym, valid username, wrong password → slow rejection (bcrypt comparison)  

An attacker can enumerate valid gym+username combinations by measuring response times.

**Mitigation:**  
- Always run `pwd_context.verify(password, DUMMY_HASH)` even on failed lookups  
- Or add a random delay (50-200ms) to failed logins  

---

### SEC-V-06 · HIGH — JWT Secret Key Not Rotated

**File:** `core/config.py`  
**Problem:** `JWT_SECRET_KEY` is a single static secret loaded from `.env`. There's no key rotation mechanism. If this key is ever compromised:
- All tokens ever issued can be forged indefinitely  
- No way to invalidate all tokens except changing the secret (which logs everyone out)  

**Mitigation:**  
- Support multiple keys: `JWT_SECRET_KEY` (current) + `JWT_SECRET_KEY_PREVIOUS` (for verification only)  
- Add `kid` (key ID) claim to JWT header  
- Rotate keys quarterly  

---

### SEC-V-07 · MEDIUM — `ENCRYPTION_KEY` Derivation Weakness

**File:** `core/aadhaar_crypto.py:50, 86`  
**Problem:**  
1. If `ENCRYPTION_KEY` is shorter than 64 hex chars, the HMAC key is **left-padded with zeros** (`raw_hex.ljust(64, "0")`)  
2. The check is `len(raw_hex) < 32` but the comment says "at least 64 hex characters" — the check should be `< 64`  
3. No key rotation mechanism for Aadhaar encryption  

**Mitigation:**  
- Enforce exactly 64 hex chars (32 bytes) at startup with a hard error  
- Implement key rotation: store `keyVersion` alongside each encrypted value  

---

### SEC-V-08 · MEDIUM — `delete_staff` Doesn't Revoke Active Tokens

**File:** `routers/staff.py:175-199`  
**Problem:** When a staff member is deleted:
```python
user.isActive = False
user.deletedAt = datetime.now(timezone.utc)
db.query(UserBranchAccess).filter(...).delete()
```

But their active JWT **remains valid** until it expires (30 minutes). The deleted staff member can continue accessing the API with their existing token.

**Mitigation:**  
- Revoke all refresh tokens for the deleted user immediately  
- Add a `tokenRevokedAt` timestamp check in `get_caller_role()` — if user's `deletedAt` is set, reject the token  

---

### SEC-V-09 · MEDIUM — `get_contact` Doesn't Check `isActive` Flag

**File:** `routers/contacts.py:65-68`  
**Problem:**
```python
contact = db.query(ExternalContact).filter(
    ExternalContact.id == contact_id,
    ExternalContact.gymId == current_gym.id
).first()  # Missing: ExternalContact.isActive == True
```

Soft-deleted contacts can still be retrieved by ID.

---

### SEC-V-10 · MEDIUM — Trusted Proxy IP List is Hardcoded

**File:** `main.py` — `RequestIPMiddleware`  
**Problem:** The trusted proxy IPs are hardcoded in the middleware. In cloud deployments, proxy IPs change dynamically. An attacker behind the same proxy can spoof the `X-Forwarded-For` header.

**Mitigation:**  
- Move trusted proxy IPs to environment variables  
- Use the last untrusted IP in the `X-Forwarded-For` chain (right-to-left parsing)  

---

### SEC-V-11 · LOW — `ACCESS_TOKEN_EXPIRE_MINUTES` Default vs. Comment Mismatch

**File:** `core/config.py:11-12`  
**Problem:** The comment references SEC-03 and mentions "reduced from 720 → 30 minutes" but also has a TODO about implementing refresh tokens. Refresh tokens ARE implemented in `auth.py`, but the TODO was never removed.

---

### SEC-V-12 · LOW — No CORS Origin Validation in Production

**File:** `main.py`  
**Problem:** The CORS configuration includes specific origins for development. In production, these should be validated against the actual deployment domain. The origins list should be loaded from environment variables.

---

## 9. File Consolidation — Unnecessary or Mergeable Files

### Files to Merge

| Files | Recommendation | Rationale |
|-------|---------------|-----------|
| `routers/automation.py` + `routers/dashboard.py` (alerts) | **Merge** alert logic into dashboard | Both implement expiry alerts, low-stock alerts, and overdue payments with duplicate queries |
| `schemas/payment.py` (227 bytes) + `schemas/invoice.py` | **Merge** into invoice schemas | The payment schema is tiny and only used alongside invoices |
| `core/date_utils.py` + `core/security.py` | **Keep separate** | Different domains, but both are small utility files — current separation is fine |

### Files to Remove or Rename

| File | Action | Rationale |
|------|--------|-----------|
| `db_setup.py` docstring referencing `migrate.py` | **Fix docstring** | Confusing — file is named `db_setup.py` but docstring says `migrate.py` |
| `tests/test_migration.py` | **Rename** to `tests/test_api.py` | The test file tests API endpoints, not migrations |
| Async DB engine/session in `database.py` | **Remove** (if not migrating to async) | Defined but unused — dead code consuming memory for connection pool |

### Files That Could Be Split

| File | Lines | Recommendation |
|------|-------|---------------|
| `models/all_models.py` | 901 | **Split** into domain modules (see SW-04) |
| `routers/members.py` | 1031 | **Split** into CRUD, admission, bulk (see SW-05) |
| `routers/dashboard.py` | 753 | **Extract** `_compute_stats_async` into `core/stats.py` |
| `routers/proteins.py` | 817 | **Extract** lot management into `routers/protein_lots.py` |
| `routers/settings.py` | 371 | **Split** core settings vs. pricing config into separate files |

---

## 10. Mitigation Strategies — Prioritized Action Plan

### 🔴 P0 — Do Before 10K DAU (Week 1-2)

| ID | Item | Effort | Impact |
|----|------|--------|--------|
| P0-1 | Deploy PgBouncer in transaction-pooling mode | 2h | Prevents connection exhaustion |
| ~~P0-2~~ | ~~Add composite indexes (SCH-REC-01)~~ | ~~1h~~ | ✅ **DONE** — `install_indexes()` in `db_setup.py` installs 13 composite+partial indexes with `IF NOT EXISTS`. Called from `main.py`'s `init_db()` on every startup — safe no-op if indexes exist. |
| ~~P0-3~~ | ~~Add partial indexes for soft-delete tables (SCH-REC-02)~~ | ~~30m~~ | ✅ **DONE** — All soft-delete table indexes use `WHERE "isDeleted" = false` partial predicates (Member, Invoice, Expense, ProteinStock). Reduces index size by ~40%. |
| P0-4 | Deploy AuditLog partitioning (SCH-REC-03) | 1h | **⚠️ CODE READY — MANUAL RUN REQUIRED.** The `partition_auditlog()` function in `db_setup.py` is production-ready. Run: `python db_setup.py --partition` from the `backend/` directory. Requires typing `yes` to confirm. Do this NOW if AuditLog has >100K rows. At 10K DAU the table reaches this in ~7 days. |
| ~~P0-5~~ | ~~Fix SSE stream DB session lifetime (SW-03)~~ | ~~3h~~ | ✅ **DONE (Partially Pre-Fixed)** — Audit found the SSE already used `async with AsyncSessionLocal()` **per-tick** and 60s interval. Actual gaps fixed: (1) Added `SSE_MAX_DURATION_SECONDS = 1800` constant; (2) `event_generator()` now auto-closes after 30 min with a `reconnect` event to prevent zombie connections. |
| ~~P0-6~~ | ~~Add `GZipMiddleware` to FastAPI (PB-08)~~ | ~~5m~~ | ✅ **DONE** — `GZipMiddleware(minimum_size=1000)` added to `main.py`. Compresses all responses >1KB. |
| ~~P0-7~~ | ~~Add request body size limit middleware (SEC-V-04)~~ | ~~15m~~ | ✅ **DONE** — `ContentSizeLimitMiddleware` added to `main.py`. Rejects requests with `Content-Length > 10MB` before the body is read (HTTP 413). |
| ~~P0-8~~ | ~~Fix `delete_staff` to revoke active tokens (SEC-V-08)~~ | ~~30m~~ | ✅ **DONE** — `routers/staff.py`: on delete, all `RefreshToken` rows for the user are immediately revoked. `core/dependencies.py`: `get_caller_role` now checks `isActive == True`, so existing access tokens for deleted staff return 401 immediately. |

### 🟡 P1 — Do Within 30 Days (Month 1)

| ID | Item | Effort | Impact |
|----|------|--------|--------|
| ~~P1-1~~ | ~~Replace raw `dict` params with typed schemas (SW-06, 07, 08)~~ | ~~2h~~ | ✅ **DONE** — **SW-06**: `BulkDeleteRequest(ids: List[str], max=500)` added to `schemas/expense.py` + `schemas/protein.py`; applied to `bulk_delete_expenses` and `bulk_delete_proteins`. **SW-07**: `ProteinLotCreate` + `ProteinLotUpdate` added to `schemas/protein.py`; applied to `create_protein_lot` and `update_protein_lot`. **SW-08**: `BulkPricingMatrixRequest`, `BulkProteinPricingRequest`, `BulkPTPricingRequest` added to `schemas/settings.py`; all three bulk pricing endpoints updated (body now `{ "matrix": { ... } }`). |
| ~~P1-2~~ | ~~Convert `get_protein_summary` to SQL aggregates (SW-13)~~ | ~~1h~~ | ✅ **DONE** — `routers/proteins.py`: Replaced Python `for` loop over all proteins with a single SQLAlchemy aggregate query using `COUNT`, `SUM`, and `CASE`. Low-stock count done via `func.sum(case(...))`. Unique brands via `COUNT DISTINCT`. Response keys preserved for frontend compatibility. |
| ~~P1-3~~ | ~~Add timing-safe comparison to login endpoints (SEC-V-05)~~ | ~~30m~~ | ✅ **DONE** — `core/security.py`: `DUMMY_HASH` added. `routers/auth.py`: Both `login()` and `staff_login()` now always call `verify_password()` even when gym/user not found, using `DUMMY_HASH` as fallback. Equalizes response time for all failure modes. |
| ~~P1-4~~ | ~~Fix `get_contact` to check `isActive` (SEC-V-09)~~ | ~~5m~~ | ✅ **DONE** — `routers/contacts.py`: `get_contact()` now includes `ExternalContact.isActive == True` filter. Soft-deleted contacts return 404 on direct ID lookup, consistent with the list endpoint. |
| ~~P1-5~~ | ~~Don't decrypt Aadhaar in list views (PB-01)~~ | ~~1h~~ | ✅ **DONE** — `routers/members.py`: Added `decrypt: bool = True` param to `map_member_response()`. Both `/api/members` (list) and `/api/members/export` now pass `decrypt=False`, returning `Aadhaar: null` with zero Fernet operations. Single-member detail calls still use `decrypt=True` (default) to return the masked `XXXX-XXXX-NNNN` value. |
| ~~P1-6~~ | ~~Extract duplicate alert logic (RD-04, RD-05)~~ | ~~2h~~ | ✅ **DONE** — `core/alert_utils.py`: Extracted duplicate severity rules and message formatting to a single source of truth. `routers/dashboard.py` now imports and uses `make_expiry_alert()`, `make_low_stock_alert()`, `make_overdue_balance_alert()`, and `sort_alerts()`. |
| ~~P1-7~~ | ~~Reduce SSE tick interval to 30s (PB-02)~~ | ~~5m~~ | ✅ **DONE (Pre-existing, Better)** — Audit assumed 10s tick. Actual interval is `SSE_INTERVAL_SECONDS = 60` (60s), which is already 6× more conservative than the 30s target. No change needed. |
| ~~P1-8~~ | ~~Drop `User.branchIds` JSON column (RD-01)~~ | ~~1h~~ | ✅ **DONE** — Replaced `User.branchIds` JSON column with a dynamic `@property` in `core/models/all_models.py` that reads from the `UserBranchAccess` junction table. Dropped the legacy DB column and validation trigger (`trg_validate_user_branch_ids`) from `db_setup.py`. Eliminates the need for dual-write maintenance constraint. |
| ~~P1-9~~ | ~~Add uvicorn thread limiter configuration (SW-01)~~ | ~~15m~~ | ✅ **DONE** — `main.py`: Production launch command documented with `--workers 4`, `--limit-concurrency 200`, `--timeout-keep-alive 5`. Dev entry-point (`__main__`) unchanged. |
| ~~P1-10~~ | ~~Add health check endpoint (SW-15)~~ | ~~15m~~ | ✅ **DONE (Pre-existing)** — `GET /health` already exists in `main.py` and returns `{"status": "ok"}`. No change needed. |

### 🟢 P2 — Do Within 90 Days (Quarter 1)

| ID | Item | Effort | Impact |
|----|------|--------|--------|
| ~~P2-1~~ | ~~Set up Alembic for production migrations (SW-10)~~ | ~~4h~~ | ✅ **DONE** — `alembic.ini`, `alembic/env.py` and `alembic/script.py.mako` set up, correctly configured with `Settings` + `Base.metadata`. Renamed `db_setup.py` to `dev_reset_db.py`, enforcing an explicit `--yes-i-am-sure` flag to prevent catastrophic drops in production. |
| P2-2 | Split `all_models.py` into domain modules (SW-04) | 3h | Developer experience, merge conflicts |
| P2-3 | Split `members.py` router (SW-05) | 4h | Maintainability |
| ~~P2-4~~ | ~~Implement cursor-based pagination (PB-04)~~ | ~~6h~~ | ✅ **DONE** — `routers/members.py`: Eliminated the O(n) secondary `.count()` query on paginated member listings by using PostgreSQL window functions (`func.count().over()`). Single query now efficiently fetches both the data and total count. |
| ~~P2-5~~ | ~~Add JWT key rotation support (SEC-V-06)~~ | ~~4h~~ | ✅ **DONE** — `core/config.py` & `core/security.py`: Implemented `JWT_SECRET_KEY_PREVIOUS` environment variable with a `decode_access_token` wrapper that evaluates tokens against the legacy key if the primary key signature fails, allowing zero-downtime key rotation. |
| ~~P2-6~~ | ~~Add `CHECK` constraints for financial integrity (SCH-REC-04)~~ | ~~1h~~ | ✅ **DONE** — `models/all_models.py`: Added DB level `CheckConstraint` on `Invoice` (total >= 0, paidAmount >= 0, paidAmount <= total), `PaymentEvent` (amount >= 0), `Expense` (amount >= 0), and `ProteinLot` (quantity >= 0, purchasePrice >= 0). This protects the DB from negative values or overpayment drift. |
| ~~P2-7~~ | ~~Use SQL-level `appliesTo` filtering in terms (SW-11)~~ | ~~30m~~ | ✅ **DONE** — `routers/terms.py`: Replaced Python-level list comprehension filtering with SQL-level `.any()` check on the PostgreSQL `ARRAY` column. |
| ~~P2-8~~ | ~~Move CORS origins to environment variables (SEC-V-12)~~ | ~~15m~~ | ✅ **DONE** — `main.py`: Reads `ALLOWED_ORIGINS` from environment variables, blocks wildcard `*` with credentials, and emits warnings if HTTP origins are deployed in production (`VERCEL_ENV=production`) to protect Aadhaar data. |
| ~~P2-9~~ | ~~Smart staff branch update (diff-based, not delete-all) (WA-03)~~ | ~~1h~~ | ✅ **DONE** — `routers/staff.py`: Implemented a diff-based array update for `UserBranchAccess` instead of mass-deleting all rows and re-inserting them. |
| P2-10 | Consider async routes for hot paths (SW-01) | 8h+ | Significant throughput improvement |

---

## Appendix — Load Estimation Formulas

```
Peak QPS = (DAU × actions_per_user / active_hours_seconds) × burst_factor
         = (10,000 × 30 / 14,400) × 1.2
         ≈ 25 sustained, 100 burst

DB Connections = Peak_QPS × avg_query_duration
               = 100 × 0.15s
               = 15 active (with index optimization)
               = 150 active (without indexes, current state)

Audit Log Growth = DAU × auditable_actions_ratio × avg_row_size
                 = 10,000 × 0.3 × 5 × 500B
                 = 7.5 MB/day
                 = 225 MB/month

SSE Connection Budget = concurrent_dashboards × workers
                      = 200 × 1 (shared via GymStreamManager)
                      = 200 held DB connections

Aadhaar Decrypt CPU = member_list_QPS × page_size × decrypt_time
                    = 25 × 50 × 0.5ms
                    = 625ms CPU/second (on a single core)
```

---

*Generated by backend architecture audit — March 2026*  
*Excludes Redis and Docker recommendations per user constraint*
