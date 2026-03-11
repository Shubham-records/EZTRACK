import logging
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from typing import List, Optional

from core.database import get_db
from core.dependencies import get_current_gym, require_owner_or_manager
from core.date_utils import parse_date, format_date
from core.storage import upload_image, get_signed_url, delete_image, StorageFolder
from models.all_models import Gym, Expense
from schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseResponse, BulkExpenseCreate
from core.audit_utils import log_audit
from core.rate_limit import rate_limit

logger = logging.getLogger(__name__)
router = APIRouter()


def map_expense_response(expense: Expense):
    e_dict = expense.__dict__.copy()
    e_dict['_id'] = expense.id
    e_dict.pop('_sa_instance_state', None)
    e_dict['hasReceipt'] = bool(getattr(expense, 'receiptUrl', None))
    # Format date as DD/MM/YYYY
    e_dict['date'] = format_date(expense.date)
    return e_dict


@router.get("")
@router.get("/")
def get_expenses(
    category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    """ARCH-06: Paginated expenses. max limit=500."""
    limit = min(limit, 500)
    query = db.query(Expense).filter(
        Expense.gymId == current_gym.id,
        Expense.isDeleted == False
    )

    if category:
        query = query.filter(Expense.category == category)
    if start_date:
        query = query.filter(Expense.date >= parse_date(start_date))
    if end_date:
        query = query.filter(Expense.date <= parse_date(end_date))

    total = query.count()
    expenses = query.order_by(Expense.date.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [map_expense_response(e) for e in expenses],
    }


@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_expense(
    data: ExpenseCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager),   # SEC-HIGH-03: MANAGER+ only
):
    """Create a new expense record."""
    expense_data = data.model_dump()
    expense_data['date'] = parse_date(expense_data.get('date'))
    expense = Expense(gymId=current_gym.id, **expense_data)
    db.add(expense)
    db.flush()
    log_audit(db, current_gym.id, "Expense", expense.id, "CREATE",
              {"category": expense.category, "amount": expense.amount},
              current_gym.username)
    db.commit()
    db.refresh(expense)
    return map_expense_response(expense)


@router.post("/bulk-create")
@rate_limit("5/minute")
def bulk_create_expenses(
    request: Request,
    data: BulkExpenseCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager),   # SEC-HIGH-03: MANAGER+ only
):
    """Bulk create expenses from import.
    SEC-CRIT-02: Uses BulkExpenseCreate typed schema — no raw dict.
    """
    expenses_list = data.all_items()
    created_count = 0

    for item in expenses_list:
        try:
            new_expense = Expense(
                gymId=current_gym.id,
                description=item.description or "Imported Expense",
                amount=float(item.amount),
                category=item.category or "Other",
                paymentMode=item.paymentMode or "Cash",
                date=parse_date(item.date),
                notes=item.notes,
                lastEditedBy=current_gym.username,
                editReason='Bulk Import',
            )
            db.add(new_expense)
            created_count += 1
        except Exception as e:
            logger.error("Bulk expense create error: %s", type(e).__name__, exc_info=False)
            continue

    db.commit()
    return {"message": f"Created {created_count} expenses", "count": created_count}


@router.post("/bulk-delete")
def bulk_delete_expenses(
    data: dict,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Bulk delete expenses. SEC-NEW-04: Requires MANAGER+, capped at 500, audit-logged."""
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")

    # SEC-NEW-04: Cap to prevent oversized IN-clause SQL queries
    MAX_BULK_DELETE = 500
    if len(ids) > MAX_BULK_DELETE:
        raise HTTPException(
            status_code=400,
            detail=f"Bulk delete limited to {MAX_BULK_DELETE} items per request. Got {len(ids)}.",
        )

    try:
        from datetime import datetime, timezone
        stmt = Expense.__table__.update().where(
            Expense.id.in_(ids),
            Expense.gymId == current_gym.id
        ).values(isDeleted=True, deletedAt=datetime.now(timezone.utc))
        result = db.execute(stmt)
        # SEC-NEW-04: Audit log for bulk hard-deletes
        log_audit(db, current_gym.id, "Expense", "bulk", "DELETE",
                  {"ids_count": result.rowcount, "requested_ids": len(ids)},
                  current_gym.username)
        db.commit()
        return {"message": f"Deleted {result.rowcount} expenses", "count": result.rowcount}
    except Exception as e:
        db.rollback()
        logger.error("Bulk expense delete error: %s", type(e).__name__, exc_info=True)
        raise HTTPException(status_code=500, detail="Bulk delete failed. Please try again.")


@router.put("/{expense_id}", response_model=ExpenseResponse)
def update_expense(
    expense_id: str,
    data: ExpenseUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager),   # SEC-HIGH-03: MANAGER+ only
):
    """Update an expense record."""
    expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.gymId == current_gym.id,
        Expense.isDeleted == False
    ).first()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    update_data = data.model_dump(exclude_unset=True)
    if 'date' in update_data:
        update_data['date'] = parse_date(update_data['date'])
    for key, value in update_data.items():
        setattr(expense, key, value)
    
    log_audit(db, current_gym.id, "Expense", expense.id, "UPDATE",
              update_data, current_gym.username)
    db.commit()
    db.refresh(expense)
    return map_expense_response(expense)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Delete an expense record."""
    expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.gymId == current_gym.id,
        Expense.isDeleted == False
    ).first()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    log_audit(db, current_gym.id, "Expense", expense.id, "DELETE",
              {"category": expense.category, "amount": expense.amount},
              current_gym.username)
    from datetime import datetime, timezone
    expense.isDeleted = True
    expense.deletedAt = datetime.now(timezone.utc)
    db.commit()
    return None


@router.post("/{expense_id}/receipt")
async def upload_receipt(
    expense_id: str,
    file: UploadFile = File(...),
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Upload receipt image for an expense — stored in object storage (not DB)."""
    expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.gymId == current_gym.id,
        Expense.isDeleted == False
    ).first()

    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    # Delete old receipt from storage if one exists
    if expense.receiptUrl:
        delete_image(expense.receiptUrl)

    image_data = await file.read()
    # FIX: store in object storage, keep only the key in DB
    storage_key = upload_image(
        image_data,
        folder=StorageFolder.RECEIPTS,
        mime_type=file.content_type,
    )

    expense.receiptUrl      = storage_key
    expense.receiptMimeType = file.content_type
    expense.hasReceipt      = True
    db.commit()

    return {
        "message":    "Receipt uploaded successfully",
        "receiptUrl": get_signed_url(storage_key),
    }


@router.get("/{expense_id}/receipt")
def get_receipt(
    expense_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """
    Get a fresh signed URL for an expense receipt.
    Returns a redirect to the signed URL so the browser fetches the image
    directly from object storage — no binary data passes through the API.
    """
    expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.gymId == current_gym.id,
        Expense.isDeleted == False
    ).first()

    if not expense or not expense.receiptUrl:
        raise HTTPException(status_code=404, detail="Receipt not found")

    # FIX: generate a short-lived signed URL and redirect the client to it
    signed_url = get_signed_url(expense.receiptUrl)
    return RedirectResponse(url=signed_url, status_code=302)


@router.get("/summary")
def get_expense_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get expense summary by category.
    BUG-02 fix: parse date strings before comparing with Date column.
    BUG-03 fix: use SQL GROUP BY instead of Python in-memory grouping.
    """
    from sqlalchemy import func

    query = db.query(
        Expense.category,
        func.sum(Expense.amount).label("category_total"),
        func.count(Expense.id).label("category_count"),
    ).filter(
        Expense.gymId == current_gym.id,
        Expense.isDeleted == False,
    )

    # BUG-02: parse strings to native date before comparing with Date column
    if start_date:
        parsed_start = parse_date(start_date)
        if parsed_start:
            query = query.filter(Expense.date >= parsed_start)
    if end_date:
        parsed_end = parse_date(end_date)
        if parsed_end:
            query = query.filter(Expense.date <= parsed_end)

    rows = query.group_by(Expense.category).all()

    summary = {r.category: round(float(r.category_total or 0), 2) for r in rows}
    total   = round(sum(summary.values()), 2)
    count   = sum(r.category_count for r in rows)

    return {
        "byCategory": summary,
        "total": total,
        "count": count,
    }


# Expense categories constant
EXPENSE_CATEGORIES = [
    "Rent",
    "Electricity",
    "Salaries",
    "Maintenance",
    "Supplies",
    "Marketing",
    "Equipment",
    "Insurance",
    "Utilities",
    "Other"
]


@router.get("/categories")
def get_expense_categories():
    """Get list of expense categories."""
    return EXPENSE_CATEGORIES
