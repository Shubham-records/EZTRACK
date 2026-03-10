# EZTRACK Backend — Verified Audit Report

> **Verified:** 2026-03-10 · **Status:** Line-by-line source code review completed
> **Verdict:** Production-ready for ~500–2,000 DAU. Targeted fixes needed before 10K DAU.

---

## Priority Fix List

| # | Priority | Issue | File(s) | Status |
|---|----------|-------|---------|--------|
| 1 | **P0** | `signup()` uses `request.GYMNAME` instead of `body.GYMNAME` for Branch | `routers/auth.py:290-294` | ✅ DONE |
| 2 | **P0** | `Expense` model missing `description` column — bulk import data loss | `models/all_models.py`, `routers/expenses.py` | ✅ DONE |
| 3 | **P1** | `bulk_create_members` has no RBAC — any STAFF can mass-import | `routers/members.py:270` | ✅ DONE |
| 4 | **P1** | `bulk_update_members` has no RBAC — any STAFF can mass-modify | `routers/members.py:350` | ✅ DONE |
| 5 | **P1** | `maxMembers` subscription limit not enforced on bulk import | `routers/members.py:270` | ✅ DONE |
| 6 | **P1** | X-Forwarded-For trusted without proxy validation | `main.py:168-178` | ✅ DONE |
| 7 | **P1** | Fernet creates new instance per call — cache as singleton | `core/aadhaar_crypto.py:59-68` | ✅ DONE |
| 8 | **P1** | Member `PUT /{id}` accepts raw `dict` — unvalidated fields injectable | `routers/members.py:828` | ✅ DONE |
| 9 | **P2** | `cleanup_expired_refresh_tokens` defined but never called | `routers/auth.py:79-83` | ✅ DONE |
| 10 | **P2** | Receipt number race condition under concurrent load | `routers/members.py:88-96` | ✅ DONE |
| 11 | **P2** | `check_duplicates` N+1 query loop | `routers/members.py:220-267` | ✅ DONE |
| 12 | **P2** | Refresh token theft detection (no family rotation) | `routers/auth.py`, `models/all_models.py` | ✅ DONE |
| 13 | **P2** | Dual branch storage — `User.branchIds` JSON + `UserBranchAccess` table | `models/all_models.py`, `routers/staff.py` | ✅ DONE |
| 14 | **P2** | `ensure_default_templates` runs COUNT on every GET | `routers/whatsapp_templates.py` | ✅ DONE |
| 15 | **P2** | Dead `PATCH ""` route — body is `pass`, returns null | `routers/members.py:869-879` | ✅ DONE |
| 16 | **P2** | Inline auth schemas in router — consolidate with `schemas/auth.py` | `routers/auth.py:91-107` | ✅ DONE |
| 17 | **P2** | Remove `role` from JWT payload (unused by RBAC, misleading) | `routers/auth.py:170` | ✅ DONE |
| 18 | **P3** | ILIKE search without trigram index | `routers/members.py:121-130` | ✅ DONE |
| 19 | **P3** | ~~`GymDailySummary` table is dead~~ — Actually used by `dashboard.py` as SSE cache | `models/all_models.py` | ❌ NOT A BUG |
| 20 | **P3** | `Invoice.items` JSON blob — normalize to `InvoiceLineItem` table | `models/all_models.py:308` | ⬜ DEFERRED |
| 21 | **P3** | `ProteinStock.Quantity` not synced with `SUM(lots.quantity)` | `models/all_models.py:510` | ⬜ DEFERRED |
| 22 | **P3** | Seed data references removed `Year`/`Month` columns on ProteinStock | `routers/audit.py:230-231` | ✅ DONE |
| 23 | **P3** | GST columns use `MONEY` (Numeric 12,2) instead of `Numeric(5,2)` | `models/all_models.py:625-626` | ✅ DONE |
| 24 | **P3** | `LoginResponse` schema imported but never used as `response_model` | `schemas/auth.py`, `routers/auth.py` | ✅ DONE |
| 25 | **P3** | `export_members` has no rate limiting (OWNER-only but still) | `routers/members.py:149` | ✅ DONE |
| 26 | **P3** | `preview_template` endpoint has no rate limit | `routers/whatsapp_templates.py:163` | ✅ DONE |

---

## Issue Details

### P0-1: `signup()` Branch uses `request.GYMNAME` instead of `body.GYMNAME`

**File:** `routers/auth.py` lines 290–294

```python
default_branch = Branch(
    name=request.GYMNAME,         # BUG: request is FastAPI Request, not body
    displayName=request.GYMNAME,  # BUG
    email=request.EMAILID,        # BUG
)
```

`request` is the FastAPI `Request` object. It does NOT have `GYMNAME` or `EMAILID` attributes. The correct references are `body.GYMNAME` and `body.EMAILID`. This causes `AttributeError` on every new gym signup.

**Fix:** Replace `request.GYMNAME` → `body.GYMNAME`, `request.EMAILID` → `body.EMAILID`.

---

### P0-2: `Expense` model missing `description` column

**File:** `models/all_models.py` (Expense class), `routers/expenses.py` line 109

`bulk_create_expenses` sets `description=...` on the `Expense()` constructor, but the `Expense` model has no `description` column. SQLAlchemy silently ignores unknown kwargs → every bulk-imported expense loses its description.

**Fix:** Add `description = Column(Text, nullable=True)` to the `Expense` model. Also add it to `ExpenseCreate`/`ExpenseUpdate` schemas.

---

### P1-3 & P1-4: Bulk member endpoints have no RBAC

**File:** `routers/members.py` lines 270, 350

`bulk_create_members` and `bulk_update_members` lack `Depends(require_owner_or_manager)`. Any STAFF-level user can mass-import or mass-modify member records.

**Fix:** Add `_rbac=Depends(require_owner_or_manager)` to both endpoints.

---

### P1-5: `maxMembers` not enforced on bulk import

**File:** `routers/members.py` line 270

`create_member()` enforces `maxMembers` (line 661), but `bulk_create_members()` skips the check entirely. Users can bypass subscription limits via bulk import.

**Fix:** Add the same `maxMembers` check at the start of `bulk_create_members()`.

---

### P1-6: X-Forwarded-For spoofing

**File:** `main.py` lines 168–178

Any client can send `X-Forwarded-For: 127.0.0.1` to spoof their IP in audit logs. Rate limiting for unauthenticated endpoints (login/signup) uses IP and can be bypassed.

**Fix:** Only trust proxy headers from known trusted proxy IPs. Add `TRUSTED_PROXY_IPS` env var.

---

### P1-7: Fernet singleton

**File:** `core/aadhaar_crypto.py` lines 59–68

`_fernet()` creates a new `Fernet()` object on every call. `_derive_fernet_key()` re-reads `os.getenv()` and re-derives the key each time. At 30 members per page, that's 30 redundant key derivations per list request.

**Fix:** Cache the `Fernet` instance as a module-level singleton.

---

### P1-8: Member PUT accepts raw dict

**File:** `routers/members.py` line 828–829

```python
@router.put("/{id}", response_model=MemberResponse)
def update_member_put(id: str, data: dict, ...):
```

Accepts any key/value. Fields like `isDeleted`, `deletedAt`, `gymId` are partially filtered (line 838) but `isDeleted` and `deletedAt` are NOT in the filter list — an authenticated user could soft-delete a member via PUT.

**Fix:** Use `MemberUpdate` Pydantic schema or add `isDeleted`/`deletedAt`/`AadhaarHash` to the skip list.

---

### P2-9: RefreshToken cleanup never runs

**File:** `routers/auth.py` lines 79–83

`cleanup_expired_refresh_tokens()` is defined but never wired to any scheduler, cron, or endpoint. The `RefreshToken` table grows unbounded.

**Fix:** Call it lazily on login (e.g., every 100th login) or wire to a management endpoint.

---

### P2-10: Receipt number race condition

**File:** `routers/members.py` lines 88–96

```python
max_number = db.query(func.max(Member.MembershipReceiptnumber)).filter(...).scalar()
next_number = (max_number or 0) + 1
```

No locking. Two concurrent requests get the same number. No DB unique constraint on `(gymId, MembershipReceiptnumber)`.

**Fix:** Add `UniqueConstraint("gymId", "MembershipReceiptnumber")` + advisory lock or retry logic.

---

### P2-11: `check_duplicates` N+1 query loop

**File:** `routers/members.py` lines 220–267

Each member in the import list fires a separate DB query. 200 members = 200 queries.

**Fix:** Batch all mobile/name values into a single `WHERE IN (...)` query.

---

### P2-15: Dead PATCH route

**File:** `routers/members.py` lines 869–879

```python
@router.patch("", response_model=MemberResponse)
def update_member(...):
    pass  # does nothing
```

This silently returns `null` for PATCH requests to `/api/members`.

**Fix:** Remove the dead route. The actual PATCH lives at `/update` (line 882).

---

### P2-16: Inline auth schemas

**File:** `routers/auth.py` lines 91–107

`RefreshRequest`, `FullLoginResponse`, `StaffLoginRequest` defined inline in the router while `schemas/auth.py` has `LoginRequest`, `LoginResponse`, `SignupRequest`. Two places for auth schemas.

**Fix:** Move all to `schemas/auth.py`.

---

### P3-22: Seed data references removed columns

**File:** `routers/audit.py` lines 230–231

```python
Year=str(datetime.now().year),
Month=datetime.now().strftime("%B")
```

`ProteinStock.Year` and `ProteinStock.Month` were removed in v2. Seed data creation for proteins will fail.

**Fix:** Remove these two lines from the seed function.
