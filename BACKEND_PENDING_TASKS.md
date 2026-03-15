# Backend Pending Tasks (Audit Follow-up)
=========================================

This document tracks the remaining items and recommendations from the backend architecture audit (10,000 DAU scalability). 

> [!IMPORTANT]
> SW-04 (Splitting `all_models.py`) and SW-05 (Splitting `members.py` router) have been explicitly skipped per user request.

## 🛠 Critical Infrastructure & Clean-up

| ID | Title | Description | Priority |
| :--- | :--- | :--- | :--- |
| **SW-01** | **Async ORM Conversion** | Convert hot-path routes to `async def` and use `AsyncSessionLocal` one-by-one. (Pending: auth, dashboard, invoices, members, staff, proteins, etc). | High |

### SW-01: Async Conversion Tracker
- [x] `auth.py`
- [x] `members.py`
- [x] `staff.py`
- [x] `proteins.py`
- [x] `invoices.py`
- [x] `settings.py`
- [x] `expenses.py`
- [x] `contacts.py`
- [x] `automation.py`
- [x] `audit.py`
- [x] `branch_details.py`
- [x] `whatsapp_templates.py`
- [x] `terms.py`
- [x] `dashboard.py`
| ~~**SW-09**~~ | ~~**Package Structure**~~ | ~~Add `__init__.py` to `core/` and `routers/` directories to ensure proper package behavior in production.~~ | ~~Medium~~ |
| ~~**SW-10**~~ | ~~**Production Migrations**~~ | ~~Fully transition to Alembic for schema changes. Retire `Base.metadata.create_all` for production environments.~~ | ~~High~~ |
| ~~**SW-16**~~ | ~~**Unbounded Cache Growth**~~ | ~~Implement a cleanup or TTL strategy for `_initialized_gyms` in `whatsapp_templates.py` to prevent memory leaks over months.~~ | ~~Low~~ |

## ⚡ Performance Optimizations

| ID | Title | Description | Priority |
| :--- | :--- | :--- | :--- |
| **PB-05** | **Cross-Worker Cache** | Settings cache in `core/cache.py` is in-process. Invalidation on worker A won't affect worker B. Investigate shared cache strategy. | High |
| **PB-09** | **Redundant Dict Copies** | `map_*_response` functions use `.__dict__.copy()`. Move to Pydantic `model_validate` for zero-copy serialization. | Low |
| ~~**BUG-03**~~ | ~~**SQL Aggregation**~~ | ~~Refactor `get_expense_summary` in `expenses.py` to use SQL `GROUP BY` for aggregation instead of in-memory Python grouping.~~ | ~~High~~ |
| ~~**SCH-REC-05**~~| ~~**Generated Columns**~~ | ~~Convert `computed_status` to a PostgreSQL `STORED` generated column. This allows native SQL indexing for "Active" member queries. (NOTE: Impossible in PG as current_date is not IMMUTABLE)~~ | ~~High~~ |

## 📦 Consistency & Logic Fixes

| ID | Title | Description | Priority |
| :--- | :--- | :--- | :--- |
| ~~**WA-01**~~ | ~~**Batch Lot Triggers**~~ | ~~`trg_sync_protein_quantity` fires for every row. Optimize for bulk stock updates to reduce write IOPS.~~ | ~~Medium~~ |
| ~~**WA-04**~~ | ~~**Dashboard Upsert Race**~~ | ~~Add a row-level lock or unique constraint guard for `GymDailySummary` updates in `dashboard.py`.~~ | ~~Medium~~ |
| ~~**WA-05**~~ | ~~**Scoped Reconciliation**~~ | ~~`/reconcile-payments` scans the entire invoice table. Limit scanning to recent (unpaid) invoices.~~ | ~~High~~ |

## 🔐 Security Enhancements

| ID | Title | Description | Priority |
| :--- | :--- | :--- | :--- |
| ~~**SEC-V-02**~~ | ~~**Dual-Key Rate Limits**~~ | ~~Update `core/rate_limit.py` to track usage by both IP and `gymId` to prevent account-distributed attacks.~~ | ~~High~~ |
| ~~**SEC-V-06**~~ | ~~**JWT Key Rotation**~~ | ~~Update auth logic to support a list of secret keys (legacy + current) to allow rotation without logging out all users.~~ | ~~Medium~~ |
| ~~**SEC-V-07**~~ | ~~**AES Key Validation**~~ | ~~Enforce strict 64-character hex format for `ENCRYPTION_KEY`. Currently, it allows zero-padding which weakens entropy.~~ | ~~Medium~~ |
| ~~**SEC-RBAC-01**~~| ~~**RBAC Gaps**~~ | ~~Enforce `require_owner_or_manager` on `update_member_body`, `re_admission`, `renewal`, `update_invoice`, and `record_payment`.~~ | ~~High~~ |
| ~~**SEC-AUDIT-01**~~| ~~**Staff Audit Logs**~~ | ~~Implement audit logging for staff management actions (password changes, role updates) in `routers/staff.py`.~~ | ~~Medium~~ |
| ~~**SEC-STOR-01**~~| ~~**Object Storage**~~ | ~~Complete the migration of protein/member/receipt images from DB to object storage using `core/storage.py`.~~ | ~~High~~ |
