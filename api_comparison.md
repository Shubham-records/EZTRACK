# API Comparison: Frontend vs Backend (v2)

This document tracks the alignment between the optimized Backend (v2) and the existing Frontend codebase for the EZTRACK application.

## Dashboard / Alerts

| Feature | Frontend Endpoint | Backend Router | Status | Notes |
|---------|-------------------|----------------|--------|-------|
| Live Stats | `/api/dashboard/stream` | `routers/dashboard.py` | ✅ Matched | SSE based stream. |
| One-shot Stats | `/api/dashboard/stats` | `routers/dashboard.py` | ✅ Matched | Used for initial load. |
| General Alerts | `/api/dashboard/alerts` | `routers/dashboard.py` | ✅ Matched | Returns member expiry, low stock, overdues. |
| Stock Alerts | `/api/dashboard/stock-alerts` | `routers/dashboard.py` | ✅ Matched | Detailed lot-level alerts. |
| Recent Activity | `/api/dashboard/recent-activity` | `routers/dashboard.py` | ✅ Matched | Latest invoices and members. |

## Members

| Feature | Frontend Endpoint | Backend Router | Status | Notes |
|---------|-------------------|----------------|--------|-------|
| Get Members | `GET /api/members` | `routers/members.py` | ✅ Matched | Support pagination, search, status filter. |
| Member Detail | `GET /api/members/{id}` | `routers/members.py` | ✅ Matched | |
| Create Member | `POST /api/members` | `routers/members.py` | ✅ Matched | |
| Update Member | `PUT /api/members/{id}` | `routers/members.py` | ✅ Matched | |
| Delete Member | `DELETE /api/members/{id}` | `routers/members.py` | ✅ Matched | Soft-delete. |
| Bulk Create | `POST /api/members/bulk-create` | `routers/members.py` | ✅ Matched | |
| Bulk Update | `POST /api/members/bulk-update" | `routers/members.py` | ✅ Matched | |
| Bulk Delete | `POST /api/members/bulk-delete" | `routers/members.py` | ✅ Matched | |
| Check Duplicates | `POST /api/members/check-duplicates` | `routers/members.py` | ✅ Matched | |
| Search Duplicates | `POST /api/members/search-duplicates` | `routers/members.py` | ✅ Matched | |
| Renewal | `POST /api/members/renewal` | `routers/members.py` | ✅ Matched | |
| Re-Admission | `POST /api/members/re-admission` | `routers/members.py` | ✅ Matched | |

## Invoices / Pending Balances

| Feature | Frontend Endpoint | Backend Router | Status | Notes |
|---------|-------------------|----------------|--------|-------|
| Get Invoices | `GET /api/invoices` | `routers/invoices.py` | ✅ Matched | Paginated result.data structure. |
| Create Invoice | `POST /api/invoices` | `routers/invoices.py` | ✅ Matched | |
| Pay Invoice | `POST /api/invoices/{id}/pay` | `routers/invoices.py` | ✅ Matched | Records PaymentEvent. |
| Pending List | `GET /api/invoices/pending` | `routers/invoices.py` | ✅ Matched | |
| Pending Summary | `GET /api/invoices/pending/summary` | `routers/invoices.py` | ✅ Matched | Provides totals and overdue counts. |
| WhatsApp Link | `GET /api/invoices/pending/{id}/whatsapp-link` | `routers/invoices.py` | ✅ Matched | |

## Proteins / Supplements

| Feature | Frontend Endpoint | Backend Router | Status | Notes |
|---------|-------------------|----------------|--------|-------|
| Get Proteins | `GET /api/proteins` | `routers/proteins.py` | ✅ Matched | Paginated. |
| Get Protein | `GET /api/proteins/{id}` | `routers/proteins.py" | ✅ Matched | |
| Create Protein | `POST /api/proteins` | `routers/proteins.py" | ✅ Matched | |
| Update Protein | `PUT /api/proteins/{id}` | `routers/proteins.py" | ✅ Matched | |
| Delete Protein | `DELETE /api/proteins/{id}` | `routers/proteins.py" | ✅ Matched | |
| Bulk Create | `POST /api/proteins/bulk-create` | `routers/proteins.py" | ✅ Matched | |
| Adjust Stock | `POST /api/proteins/{id}/adjust-stock`| `routers/proteins.py" | ✅ Matched | |

## Expenses

| Feature | Frontend Endpoint | Backend Router | Status | Notes |
|---------|-------------------|----------------|--------|-------|
| Get Expenses | `GET /api/expenses` | `routers/expenses.py` | ✅ Matched | Paginated result.data structure. |
| Create Expense | `POST /api/expenses` | `routers/expenses.py` | ✅ Matched | |

## Settings / Terms / Branch

| Feature | Frontend Endpoint | Backend Router | Status | Notes |
|---------|-------------------|----------------|--------|-------|
| Gym Settings | `GET /api/settings` | `routers/settings.py` | ✅ Fixed | Paths updated from /api/gym-settings to /api/settings. |
| Terms & Conditions | `GET /api/terms` | `routers/terms.py` | ✅ Fixed | Paths updated from /api/gym-settings/terms to /api/terms. |
| Branch Details | `GET /api/branch-details` | `routers/branch_details.py`| ✅ Matched | |
| Logo Base64 | `GET /api/branch-details/logo/base64`| `routers/branch_details.py`| ✅ Matched | Used for PDF and WhatsApp sharing. |

## Data Mapping & Compatibility Issues (Resolved)

1. **Pagination**: All paginated GET endpoints (`members`, `invoices`, `proteins`, `expenses`) now support `page` and `page_size` and return data under a `data` key. Frontend components have been updated to handle either plain arrays or the `result.data` structure.
2. **Date Parsing**: `Analytics.jsx` now uses `parseInternalDate` to reliably handle the `DD/MM/YYYY` format returned by the backend.
3. **Paths**: Corrected various legacy paths in `Invoices.jsx` and `Analytics.jsx` to match the Backend v2 router prefixes.
4. **Member Status**: Backend returns `MembershipStatus` as an alias for `computed_status` to ensure compatibility with existing frontend logic.
5. **Pending Balances**: Backend handles simplified invoice creation for manual pending entries, and provides a summary endpoint for dashboard cards.

## Implementation Plan

All critical integration points for Backend v2 have been addressed. The system is now ready for end-to-end testing with 10K DAU optimization verified in the backend.
