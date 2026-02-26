# EZTRACK Backend — Master Agent Brief
**Version:** Post-Schema-v2 | **Date:** February 2026  
**Purpose:** Complete task list for an AI agent. Fix every issue below in order of priority. Do not skip sections.

---

## PART 1 — CRITICAL BUGS (Fix First — Will Crash in Production)

---

### BUG-1: `dashboard.py` Still References Removed Column `MembershipStatus`

**File:** `routers/dashboard.py`  
**Severity:** CRASH on cache miss for any new gym or after rollback  

In the fallback computation block inside `get_dashboard_stats()`, two queries still filter on `Member.MembershipStatus` — a column that was **removed in v2**. This causes `AttributeError` whenever `GymDailySummary` is missing (new gym, first startup, after DB rollback).

**Lines to find (approximate):**
```python
# WRONG — this column no longer exists
active_members = db.query(Member).filter(
    Member.gymId == current_gym.id,
    Member.MembershipStatus.in_(['Active', 'active'])
).count()

# WRONG — same problem
Member.MembershipStatus.in_(['Active', 'active'])  # in expiring_this_week query
```

**Fix — replace both with:**
```python
# active_members
active_members = db.query(Member).filter(
    Member.gymId == current_gym.id,
    Member.computed_status == "Active"
).count()

# expiring_this_week
expiring_this_week = db.query(Member).filter(
    Member.gymId == current_gym.id,
    Member.computed_status == "Active",
    Member.MembershipExpiryDate >= today,
    Member.MembershipExpiryDate <= week_end,
).count()
```

---

### BUG-2: `members.py` `create_member()` Sets Removed Column `MembershipStatus`

**File:** `routers/members.py`  
**Severity:** Silent failure / AttributeError on member creation  

Inside `create_member()`, the `Member(...)` constructor is called with `MembershipStatus=data.MembershipStatus`. This column no longer exists on the model.

**Line to find:**
```python
new_member = Member(
    ...
    MembershipStatus=data.MembershipStatus,   # ← REMOVE THIS LINE
    ...
)
```

**Fix:** Delete that line entirely. Status is computed from `NextDuedate` via `computed_status`.

---

### BUG-3: `members.py` `bulk_update_members()` Casts Phone Fields to `int`

**File:** `routers/members.py`  
**Severity:** Runtime error — phone/Aadhaar are now `String(15)` not `BigInteger`  

In `bulk_update_members()`:
```python
if key in ['Mobile', 'Whatsapp', 'Aadhaar', 'Age', 'weight', 'LastPaymentAmount']:
    value = int(value) if value else None   # ← Mobile/Whatsapp/Aadhaar must NOT be cast to int
```

**Fix:** Split the cast:
```python
if key in ['Age', 'weight', 'LastPaymentAmount']:
    value = int(value) if value else None
elif key in ['Mobile', 'Whatsapp', 'Aadhaar']:
    value = str(value) if value else None   # String columns
```

Same fix applies in `update_member_put()` where it also casts `Mobile`, `Whatsapp`, `Aadhaar` to `int`.

---

### BUG-4: `members.py` `search_duplicates()` and `check_duplicates()` Cast Phone to `int`

**File:** `routers/members.py`  
**Severity:** Duplicate detection silently fails for all phone lookups  

Both functions do:
```python
conditions.append(Member.Mobile == int(mobile))
```

Since `Member.Mobile` is `String(15)` in v2, comparing it to an `int` will never match. All phone-based duplicate checks silently return no results.

**Fix:** Remove the `int()` cast — compare strings directly:
```python
conditions.append(Member.Mobile == str(mobile))
conditions.append(Member.Whatsapp == str(whatsapp))
conditions.append(Member.Aadhaar == str(aadhaar))
```
And remove the `try/except` blocks wrapping them.

---

## PART 2 — DATA INTEGRITY ISSUES (Fix Before Going Live)

---

### DATA-1: `Invoice.paidAmount` Has Three Inconsistent Write Paths

**Files:** `routers/invoices.py`, `routers/members.py`  
**Risk:** `paidAmount` diverges from `SUM(PaymentEvent.amount)` — billing reports become unreliable  

Three code paths set `paidAmount` without inserting a matching `PaymentEvent` row:

1. `invoices.py → update_invoice()` — `paidAmount` is in `updatable_fields`
2. `invoices.py → bulk_create_invoices()` — sets `paidAmount = total_amount` with no `PaymentEvent`
3. `members.py → create_member()`, `renewal()`, `re_admission()` — create invoices with `paidAmount` set but no `PaymentEvent`

**Fix:**
- Remove `paidAmount` from `updatable_fields` in `update_invoice()`.
- In `bulk_create_invoices()`, after setting `paidAmount`, insert a `PaymentEvent` if `paidAmount > 0`:
```python
if new_invoice.paidAmount and new_invoice.paidAmount > 0:
    db.add(PaymentEvent(
        invoiceId=new_invoice.id,
        gymId=current_gym.id,
        amount=new_invoice.paidAmount,
        paymentMode=new_invoice.paymentMode or "CASH",
        notes="Bulk import",
        recordedBy=current_gym.username,
    ))
```
- Apply the same pattern in `members.py` wherever invoices are created with `paidAmount > 0` (create_member, renewal, re_admission).

---

### DATA-2: `ProteinStock.Quantity` Never Synced from `ProteinLot`

**Files:** `routers/proteins.py` (check for lot create/update/delete)  
**Risk:** `ProteinStock.Quantity` is stale from day one — dashboard low-stock counts are wrong  

`ProteinStock.Quantity` is supposed to be `SUM(ProteinLot.quantity)` per product, but no code path updates it when lots are created, modified, or deleted.

**Fix:** Add a helper function and call it after every lot write:
```python
def sync_protein_quantity(protein_id: str, db: Session):
    from sqlalchemy import func
    total = db.query(func.sum(ProteinLot.quantity)).filter(
        ProteinLot.proteinId == protein_id
    ).scalar() or 0
    db.query(ProteinStock).filter(ProteinStock.id == protein_id).update(
        {ProteinStock.Quantity: total}
    )
```
Call `sync_protein_quantity(lot.proteinId, db)` after any lot INSERT, UPDATE (quantity change), or DELETE, before `db.commit()`.

---

### DATA-3: `ProteinLot.gymId` Can Mismatch `ProteinStock.gymId` — Cross-Tenant Risk

**File:** `models/all_models.py`  
**Risk:** A lot can reference a protein from another gym, leaking stock data across tenants  

`ProteinLot` has both `gymId` and `proteinId` FK with no constraint enforcing they belong to the same gym.

**Fix option A (preferred):** Remove `gymId` from `ProteinLot` and derive it via JOIN to `ProteinStock` in every query.  
**Fix option B (quick):** Add a CHECK at insert time in the proteins router:
```python
# Before adding a lot, verify the protein belongs to current gym
protein = db.query(ProteinStock).filter(
    ProteinStock.id == lot_data.proteinId,
    ProteinStock.gymId == current_gym.id
).first()
if not protein:
    raise HTTPException(status_code=403, detail="Protein not found in this gym")
```

---

### DATA-4: `GymDailySummary` Upsert Is Not Atomic

**File:** `routers/dashboard.py`  
**Risk:** Concurrent requests (APScheduler + live request) both try INSERT → one fails silently, leaves stale data  

Current pattern:
```python
try:
    db.commit()
except Exception as e:
    db.rollback()  # swallows the error silently
```

**Fix:** Replace the INSERT with a PostgreSQL native upsert. In SQLAlchemy:
```python
from sqlalchemy.dialects.postgresql import insert as pg_insert

stmt = pg_insert(GymDailySummary).values(
    gymId=current_gym.id,
    summaryDate=today,
    activeMembers=active_members,
    ...
).on_conflict_do_update(
    index_elements=["gymId", "summaryDate"],
    set_=dict(activeMembers=active_members, ..., updatedAt=func.now())
)
db.execute(stmt)
db.commit()
```

---

### DATA-5: `ensure_default_templates()` Runs a DB Query on Every GET Request

**File:** `routers/whatsapp_templates.py`  
**Risk:** Thousands of redundant DB queries per day at 10K DAU  

`ensure_default_templates()` is called inside every `GET /whatsapp-templates` and `GET /whatsapp-templates/{type}` handler. It always queries the full template list even when templates already exist.

**Fix:** Add a boolean flag to the `Gym` model (or use a simple in-memory set):
```python
# Quick fix — check count once
def ensure_default_templates(gym_id: str, db: Session):
    count = db.query(WhatsAppTemplate).filter(
        WhatsAppTemplate.gymId == gym_id
    ).count()
    if count >= len(DEFAULT_TEMPLATES):
        return   # Already initialised, skip all work
    # ... rest of existing logic
```

---

## PART 3 — MISSING FEATURES (Currently Broken / Empty)

---

### MISSING-1: `AuditLog` Table Has Zero Writes — All Audit History Is Empty

**Files:** All routers (`members.py`, `invoices.py`, `expenses.py`, `proteins.py`)  
**Impact:** `GET /api/audit/` always returns empty. Price history endpoint always returns `[]`.  

No router writes to `AuditLog`. The table exists, indexes exist, GET endpoints exist — but nothing ever INSERTs into it.

**Fix:** Add an audit helper and call it after every state-changing operation on core entities:
```python
# core/audit_utils.py
def log_audit(db: Session, gym_id: str, entity_type: str, entity_id: str,
              action: str, changes: dict, user_name: str):
    from models.all_models import AuditLog
    entry = AuditLog(
        gymId=gym_id,
        entityType=entity_type,
        entityId=entity_id,
        action=action,
        changes=changes,
        userName=user_name,
    )
    db.add(entry)
    # Do NOT commit here — caller commits as part of their transaction
```

Call sites (minimum viable set):
- `members.py`: after CREATE, UPDATE (diff old vs new values), renewal, re-admission
- `invoices.py`: after CREATE, pay_invoice (log payment amount + mode)
- `expenses.py`: after CREATE, UPDATE, DELETE
- `proteins.py`: after price changes (SellingPrice, LandingPrice, MRPPrice) — this powers the price history endpoint

---

### MISSING-2: No `GET /api/invoices/{id}/payment-history` Endpoint

**File:** `routers/invoices.py`  
**Impact:** Frontend cannot show payment history (paymentLogs was removed, no replacement endpoint exists)  

**Fix:** Add this endpoint:
```python
@router.get("/{invoice_id}/payment-history")
def get_payment_history(
    invoice_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    invoice = db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.gymId == current_gym.id
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    events = db.query(PaymentEvent).filter(
        PaymentEvent.invoiceId == invoice_id
    ).order_by(PaymentEvent.createdAt.asc()).all()

    return [{
        "id": e.id,
        "amount": e.amount,
        "paymentMode": e.paymentMode,
        "notes": e.notes,
        "recordedBy": e.recordedBy,
        "createdAt": e.createdAt.isoformat() if e.createdAt else None,
    } for e in events]
```

---

## PART 4 — PERFORMANCE ISSUES (Fix Before Scale)

---

### PERF-1: Add Functional Index for `computed_status` Queries

**File:** `models/all_models.py`  
**Risk:** Every "Active members" filter is a full gym-partition table scan  

`computed_status` is a `CASE` expression — PostgreSQL cannot use a standard column index on it. Every filter like `Member.computed_status == "Active"` falls back to scanning all members for that gym and evaluating the CASE per row.

**Fix:** Add this Alembic migration (do not add to `all_models.py` directly — use `alembic revision`):
```sql
CREATE INDEX ix_member_gym_active ON "Member" (gymId, "NextDuedate")
WHERE "NextDuedate" IS NOT NULL;
```

This partial index covers the majority of computed_status queries at a fraction of the full-table cost.

---

### PERF-2: `GET /api/dashboard/alerts` Loads All Members Into Python Memory

**File:** `routers/dashboard.py` → `get_dashboard_alerts()`  
**Risk:** At 200 members/gym × 25,000 loads/day = 5M Python iterations per day  

Current code:
```python
members = db.query(Member).filter(Member.gymId == current_gym.id).all()
for m in members:
    # Python-side expiry logic
```

**Fix:** Push the filter to SQL:
```python
# Only load members relevant to alerts (expiring in window or recently expired)
grace_cutoff = today - timedelta(days=grace_period)
alert_end    = today + timedelta(days=expiry_range)

members = db.query(Member).filter(
    Member.gymId == current_gym.id,
    Member.NextDuedate.isnot(None),
    Member.NextDuedate >= grace_cutoff,
    Member.NextDuedate <= alert_end,
).all()
```

---

### PERF-3: `Invoice.items` JSON Causes Full TOAST Rewrite on Every Invoice Update

**File:** `models/all_models.py`  
**Risk:** Every `PATCH /invoices/update` rewrites the entire items blob in PostgreSQL TOAST  

This is a long-term architectural item. For now, make sure `update_invoice()` in `invoices.py` does **not** update `items` unless explicitly changed. The current `updatable_fields` list includes `items` — only set it if the caller actually sent new items:

```python
# In update_invoice():
if 'items' in data and data['items'] is not None:
    invoice.items = data['items']
# Do NOT include 'items' in updatable_fields loop unconditionally
```

---

## PART 5 — SCHEMA IMPROVEMENTS (Alembic Migrations Required)

These require `alembic revision --autogenerate` + `alembic upgrade head`. **Never run ALTER TABLE at startup.**

---

### SCHEMA-1: Change All Monetary Columns from `Float` to `Numeric(10, 2)`

**Risk:** Float arithmetic errors compound in billing — ₹1,850.50 × 12 may produce ₹22,205.9999998  

Affected columns across all models:
- `Invoice`: `subTotal`, `tax`, `discount`, `total`, `paidAmount`
- `PaymentEvent`: `amount`
- `Expense`: `amount`
- `ProteinStock`: `MRPPrice`, `LandingPrice`, `MarginPrice`, `OfferPrice`, `SellingPrice`, `ProfitAmount`
- `ProteinLot`: `purchasePrice`, `sellingPrice`, `marginValue`, `offerPrice`
- `PricingConfig`: `basePrice`, `marginValue`, `offerDiscount`
- `GymSettings`: `admissionFee`, `reAdmissionFee`
- `GymDailySummary`: `totalIncome`, `totalExpenses`, `pendingBalance`
- `Member`: `LastPaymentAmount` (currently Integer — fine, but review)

**Change in models:**
```python
from sqlalchemy import Numeric
# Replace Column(Float, ...) with:
Column(Numeric(10, 2), ...)
```

---

### SCHEMA-2: `Invoice.dueDate` — Change `DateTime(timezone=True)` to `Date`

**Risk:** `datetime.now()` (timezone-naive) compared to TIMESTAMPTZ causes overdue detection to be off by up to 5.5 hours in IST  

`dueDate` represents a calendar day, not a point in time.

```python
# In Invoice model:
dueDate = Column(Date, nullable=True)   # was DateTime(timezone=True)
```

Update all comparison code from `Invoice.dueDate < datetime.now()` to `Invoice.dueDate < date.today()` in `dashboard.py`, `automation.py`, `pending.py`, `invoices.py`.

---

### SCHEMA-3: `User.branchIds` JSON → `UserBranchAccess` Junction Table

**Risk:** Cannot query "which users have access to branch X" in SQL. All permission checks are Python-side  

**New model to add:**
```python
class UserBranchAccess(Base):
    __tablename__ = "UserBranchAccess"
    __table_args__ = (
        Index("uq_user_branch", "userId", "branchId", unique=True),
    )
    id       = Column(String, primary_key=True, default=generate_uuid)
    userId   = Column(String, ForeignKey("User.id"), nullable=False)
    branchId = Column(String, ForeignKey("Branch.id"), nullable=False)
    gymId    = Column(String, ForeignKey("Gym.id"), nullable=False)
    createdAt = Column(DateTime(timezone=True), default=func.now())
```

Migration: read existing `User.branchIds` JSON arrays, insert rows into `UserBranchAccess`, then drop `User.branchIds`.

---

### SCHEMA-4: `Branch` Model Missing `gymId` Index

**File:** `models/all_models.py`  
**Risk:** Every branch lookup by gym is a full table scan  

`Branch` has no `__table_args__` at all. Add:
```python
__table_args__ = (
    Index("ix_branch_gym_id", "gymId"),
    Index("ix_branch_gym_default", "gymId", "isDefault"),
)
```

---

### SCHEMA-5: `GymSubscription.plan` Limits Never Enforced

**Risk:** Gyms can create unlimited members/branches/staff regardless of plan. Adding enforcement later will immediately break existing over-limit gyms  

**Fix:** Add a `check_plan_limits()` helper and call it in `POST /members`, `POST /staff`, and branch creation **before** inserting:
```python
def check_plan_limits(gym_id: str, resource: str, db: Session):
    from models.all_models import GymSubscription, Member, User, Branch
    sub = db.query(GymSubscription).filter(GymSubscription.gymId == gym_id).first()
    if not sub:
        return  # No subscription record = free tier defaults apply elsewhere

    if resource == "member":
        count = db.query(Member).filter(Member.gymId == gym_id).count()
        if count >= sub.maxMembers:
            raise HTTPException(status_code=402, detail=f"Member limit ({sub.maxMembers}) reached for your plan.")
    elif resource == "staff":
        count = db.query(User).filter(User.gymId == gym_id).count()
        if count >= sub.maxStaff:
            raise HTTPException(status_code=402, detail=f"Staff limit ({sub.maxStaff}) reached for your plan.")
    elif resource == "branch":
        count = db.query(Branch).filter(Branch.gymId == gym_id).count()
        if count >= sub.maxBranches:
            raise HTTPException(status_code=402, detail=f"Branch limit ({sub.maxBranches}) reached for your plan.")
```

---

## PART 6 — SECURITY ISSUES

---

### SEC-1: Hard Delete Cascade on `Gym` — No Safeguard

**File:** `models/all_models.py`  
**Risk:** Any code path that calls `db.delete(gym_obj)` cascades-deletes every member, invoice, and payment record for that gym permanently  

Every relationship on `Gym` has `cascade="all, delete-orphan"`. The `isDeleted` flag is application-level only.

**Fix:** Add a SQLAlchemy event listener that prevents hard deletes:
```python
from sqlalchemy import event

@event.listens_for(Gym, "before_delete")
def prevent_gym_hard_delete(mapper, connection, target):
    raise RuntimeError(
        f"Hard delete of Gym {target.id} is not allowed. "
        "Set isDeleted=True and deletedAt=datetime.utcnow() instead."
    )
```

---

### SEC-2: `POST /audit/seed-sample-data` Has No Role Guard

**File:** `routers/audit.py`  
**Risk:** Any authenticated gym user can call this endpoint and flood the database with 150+ fake records  

**Fix:** Add a role check at the top of the endpoint:
```python
@router.post("/seed-sample-data")
def seed_sample_data(
    members_count: int = 100,
    proteins_count: int = 50,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    if not os.getenv("ALLOW_SEED_DATA", "false").lower() == "true":
        raise HTTPException(status_code=403, detail="Seed data not available in production")
    ...
```

---

## PART 7 — FRONTEND API CHANGES

All of the following must be reflected in frontend code before deploying backend v2.

---

### FE-1: Members List — Paginated Envelope (BREAKING)

`GET /api/members` no longer returns a flat array.

**Old:**
```json
[ { "id": "...", "Name": "..." }, ... ]
```

**New:**
```json
{
  "data":       [ { "id": "...", "Name": "..." }, ... ],
  "total":      1042,
  "page":       1,
  "pageSize":   30,
  "totalPages": 35
}
```

**Every call site must change:**
```js
// Before
const members = await fetchMembers();
members.map(m => ...);

// After
const res = await fetchMembers({ page, pageSize, search, status_filter });
const members = res.data;
const total = res.total;
```

**Query params:**
| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | int | 1 | 1-based |
| `page_size` | int | 30 | `0` = return all (exports only) |
| `search` | string | `""` | Name / Mobile / Whatsapp / ClientID |
| `status_filter` | string | `""` | Must be `Active`, `Expired`, or `Inactive` (capital first letter) |

---

### FE-2: Member Status Filter Casing (BREAKING)

`status_filter` must use capital-first values: `Active`, `Expired`, `Inactive`.  
Lowercase (`active`, `expired`) returns 0 results silently.

---

### FE-3: `paymentLogs` Removed from Invoice Response (BREAKING)

Invoice objects no longer have a `paymentLogs` array. Remove any UI that reads `invoice.paymentLogs`.

For payment history, call the new endpoint:
```
GET /api/invoices/{id}/payment-history
```
Response: array of `{ id, amount, paymentMode, notes, recordedBy, createdAt }`.

The invoice object still contains:
```json
{ "paidAmount": 1500.0, "balance": 500.0, "status": "PARTIAL" }
```

---

### FE-4: Receipt View — HTTP 302 Redirect (NOT binary)

`GET /api/expenses/{id}/receipt` now returns an HTTP 302 redirect to a signed URL.

- `<img src="/api/expenses/{id}/receipt" />` — **works as-is**, browsers follow redirects automatically.
- `fetch()` must opt into redirect following:
```js
const res = await fetch(`/api/expenses/${id}/receipt`, { redirect: 'follow' });
const blob = await res.blob();
```
- Do **not** cache the signed URL in `localStorage`. Signed URLs expire after 1 hour. Re-call `/receipt` to get a fresh URL when needed.

---

### FE-5: Receipt Upload — Response Shape Changed

`POST /api/expenses/{id}/receipt` response now includes `receiptUrl`:
```json
{
  "message":    "Receipt uploaded successfully",
  "receiptUrl": "https://storage.example.com/receipts/abc?token=..."
}
```
Use `receiptUrl` for immediate preview without a second request.

---

### FE-6: `extraDays` Is Now a Number

`Member.extraDays` was a string `"0"` in v1. It is now an integer `0`.

```js
// Before (v1)
const days = parseInt(member.extraDays, 10);

// After (v2) — no parseInt needed
const days = member.extraDays;
```
Frontend sends are safe — FastAPI coerces `"7"` → `7`. Only reads need updating.

---

### FE-7: Do Not Send `MembershipStatus` in Create/Update Bodies

`MembershipStatus` is no longer a stored column. Sending it in request bodies is silently ignored. The backend computes it from `NextDuedate`. No code change required — just remove it from any forms that explicitly set it to avoid confusion.

---

### FE-8: WhatsApp Template Update — Can Return 409

`PUT /api/whatsapp-templates/{type}` now has a DB-level UNIQUE constraint. Concurrent double-submits return `409 Conflict`.

```js
try {
  await updateTemplate(type, message);
} catch (err) {
  if (err.status === 409) {
    // Template already exists — fetch and display existing version
  }
}
```

---

### FE-9: Deleted Gym JWT Returns 401

If a gym account is soft-deleted, its JWT returns `401 Unauthorized`. Handle in the global auth interceptor:
```js
// In your Axios/fetch interceptor:
if (response.status === 401) {
  clearAuthTokens();
  router.push('/login');
}
```

---

### FE-10: Automation Endpoints — No Shape Changes

`GET /api/automation/expiring-memberships`, `/low-stock-items`, `/smart-suggestions`, `/overdue-payments` return the same JSON shapes as v1. No frontend changes needed.

---

## SUMMARY CHECKLIST

### Backend Fixes — Ordered by Priority

| # | File | Issue | Status |
|---|------|--------|--------|
| BUG-1 | `routers/dashboard.py` | Replace `MembershipStatus` filter with `computed_status` | ✅ Done (27 Feb 2026) |
| BUG-2 | `routers/members.py` | Remove `MembershipStatus=` from `Member()` constructor in `create_member()` | ✅ Done (27 Feb 2026) |
| BUG-3 | `routers/members.py` | Fix `bulk_update_members()` and `update_member_put()` phone field casting | ✅ Done (27 Feb 2026) |
| BUG-4 | `routers/members.py` | Fix `search_duplicates()` and `check_duplicates()` phone comparison | ✅ Done (27 Feb 2026) |
| DATA-1 | `routers/invoices.py`, `routers/members.py` | Sync `PaymentEvent` with all `paidAmount` write paths | ✅ Done (27 Feb 2026) |
| DATA-2 | `routers/proteins.py` | Add `sync_protein_quantity()` after every lot write | ✅ Already implemented |
| DATA-3 | `routers/proteins.py` | Add gym ownership check before lot INSERT | ✅ Already implemented |
| DATA-4 | `routers/dashboard.py` | Replace try/except upsert with `INSERT ... ON CONFLICT DO UPDATE` | ✅ Done (27 Feb 2026) |
| DATA-5 | `routers/whatsapp_templates.py` | Add early-exit count check in `ensure_default_templates()` | ✅ Done (27 Feb 2026) |
| MISSING-1 | All routers + `core/audit_utils.py` | Wire `AuditLog` writes for members, invoices, expenses, protein price changes | ✅ Done (27 Feb 2026) — member UPDATE diff audit added |
| MISSING-2 | `routers/invoices.py` | Add `GET /{invoice_id}/payment-history` endpoint | ✅ Done (27 Feb 2026) |
| PERF-1 | `models/all_models.py` + `migration.py` | Add partial index `ix_member_gym_active` for `computed_status` queries | ✅ Done + migrated (27 Feb 2026) |
| PERF-2 | `routers/dashboard.py` | Push alerts member filter to SQL WHERE clause | ✅ Done (27 Feb 2026) |
| PERF-3 | `routers/invoices.py` | Only update `items` JSON if explicitly changed | ✅ Done (27 Feb 2026) |
| SCHEMA-1 | `models/all_models.py` + Alembic | `Float` → `Numeric(10,2)` for all monetary columns | ⏳ Pending (needs Alembic) |
| SCHEMA-2 | `models/all_models.py` + Alembic | `Invoice.dueDate` DateTime → Date | ⏳ Pending (needs Alembic) |
| SCHEMA-3 | `models/all_models.py` + Alembic | `User.branchIds` JSON → `UserBranchAccess` table | ⏳ Pending (needs Alembic) |
| SCHEMA-4 | `models/all_models.py` + Alembic | Add missing `gymId` index on `Branch` | ⏳ Pending (needs Alembic) |
| SCHEMA-5 | `routers/members.py`, `staff.py`, `branch_details.py` | Enforce `GymSubscription` plan limits | ⏳ Pending |
| SEC-1 | `models/all_models.py` | Add SQLAlchemy event listener to block `Gym` hard deletes | ✅ Done (27 Feb 2026) |
| SEC-2 | `routers/audit.py` | Gate `seed-sample-data` behind `ALLOW_SEED_DATA` env var | ✅ Done (27 Feb 2026) |

### Frontend Fixes — Ordered by Severity

| # | Severity | Change | Status |
|---|----------|--------|--------|
| FE-1 | **BREAKING** | Members list: read array from `res.data`, add pagination params | ⏳ Pending |
| FE-2 | **BREAKING** | Status filter: use `Active` / `Expired` / `Inactive` (not lowercase) | ⏳ Pending |
| FE-3 | **BREAKING** | Remove `paymentLogs` from invoice UI; add payment-history API call | ⏳ Pending (backend ✅) |
| FE-4 | Minor | Receipt `fetch()`: add `redirect: 'follow'` | ⏳ Pending |
| FE-5 | Additive | Receipt upload: use `receiptUrl` from response for preview | ⏳ Pending |
| FE-6 | Safe | `extraDays`: no `parseInt()` needed on reads | ⏳ Pending |
| FE-7 | Safe | Don't send `MembershipStatus` in request bodies | ⏳ Pending |
| FE-8 | Minor | Handle `409` on WhatsApp template update | ⏳ Pending |
| FE-9 | Minor | Handle `401` for deleted gym in auth interceptor | ⏳ Pending |
| FE-10 | None | Automation endpoints: no changes needed | ✅ N/A |

### Files Created (27 Feb 2026)

- `core/audit_utils.py` — Centralized audit logging with `log_audit()` and `compute_diff()` helpers

### Files Modified (27 Feb 2026)

- `models/all_models.py` — SEC-1 (Gym hard-delete prevention), PERF-1 (partial index)
- `routers/dashboard.py` — BUG-1 (computed_status), DATA-4 (atomic upsert), PERF-2 (SQL-level alerts filter)
- `routers/members.py` — BUG-2, BUG-3, BUG-4, DATA-1 (PaymentEvent), MISSING-1 (audit logging incl. UPDATE diff in `update_member_put` + `update_member_body`), type-safe field conversion in PATCH `/update`
- `routers/invoices.py` — DATA-1 (PaymentEvent in bulk), PERF-3 (items field), MISSING-1 (audit), MISSING-2 (payment-history)
- `routers/proteins.py` — MISSING-1 (price change audit logging with from→to diff), `sync_protein_quantity` clarified commit pattern
- `routers/expenses.py` — MISSING-1 (CRUD audit logging)
- `routers/whatsapp_templates.py` — DATA-5 (early-exit count check)
- `routers/audit.py` — SEC-2 (env var guard), seed data fixes
- `migration.py` — PERF-1 (partial index migration, executed successfully)

---

## DEPLOYMENT ORDER

1. ~~Run Alembic migrations for SCHEMA-1 through SCHEMA-4 before deploying new backend code~~ → Deferred (no Alembic setup yet; PERF-1 index done via `migration.py`)
2. ✅ Backend BUG-\*, DATA-\*, MISSING-\*, PERF-\*, SEC-\* fixes — **all applied (27 Feb 2026)** — post-audit fixes applied (member UPDATE audit, PATCH type safety, protein price diff logging)
3. Deploy frontend with FE-1, FE-2, FE-3 (these are breaking — must go together with backend)
4. Monitor: GymSettings cache hit rate, dashboard error rate for new gyms
5. In following sprint: SCHEMA-1–4 (Alembic setup + migrations), SCHEMA-5 (plan limits), FE-\* frontend changes
