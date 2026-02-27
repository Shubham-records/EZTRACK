import logging
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from typing import List, Optional

from core.database import get_db
from core.dependencies import get_current_gym, require_owner_or_manager
from core.date_utils import parse_date, format_date
from core.storage import upload_image, get_signed_url, delete_image, StorageFolder
from models.all_models import Gym, Expense
from schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseResponse
from core.audit_utils import log_audit

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
    query = db.query(Expense).filter(Expense.gymId == current_gym.id)

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
    db: Session = Depends(get_db)
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
def bulk_create_expenses(data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Bulk create expenses from import"""
    expenses_list = data.get("items", []) # Aligning naming with frontend generic 'items' or 'expenses'
    # Actually frontend usually sends { "expenses": [...] } or generic. Let's support "expenses"
    if not expenses_list:
        expenses_list = data.get("expenses", [])

    created_count = 0
    
    for expense_data in expenses_list:
        try:
            # Basic validation: Amount is required.
            amount = expense_data.get("Amount") or expense_data.get("amount")
            if not amount:
                continue

            # Parse date or default to today
            date_str = expense_data.get("Date") or expense_data.get("date")
            
            new_expense = Expense(
                gymId=current_gym.id,
                description=expense_data.get("Description") or expense_data.get("description") or "Imported Expense",
                amount=float(amount),
                category=expense_data.get("Category") or expense_data.get("category") or "Other",
                paymentMode=expense_data.get("PaymentMode") or expense_data.get("paymentMode") or "Cash",
                date=parse_date(date_str),
                notes=expense_data.get("Notes") or expense_data.get("notes"),
                lastEditedBy=current_gym.username,
                editReason='Bulk Import'
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
    """Bulk delete expenses"""
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    
    try:
        stmt = Expense.__table__.delete().where(
            Expense.id.in_(ids),
            Expense.gymId == current_gym.id
        )
        result = db.execute(stmt)
        db.commit()
        return {"message": f"Deleted {result.rowcount} expenses", "count": result.rowcount}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{expense_id}", response_model=ExpenseResponse)
def update_expense(
    expense_id: str,
    data: ExpenseUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Update an expense record."""
    expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.gymId == current_gym.id
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
        Expense.gymId == current_gym.id
    ).first()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    log_audit(db, current_gym.id, "Expense", expense.id, "DELETE",
              {"category": expense.category, "amount": expense.amount},
              current_gym.username)
    db.delete(expense)
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
        Expense.gymId == current_gym.id
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
        Expense.gymId == current_gym.id
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
    """Get expense summary by category."""
    query = db.query(Expense).filter(Expense.gymId == current_gym.id)
    
    if start_date:
        query = query.filter(Expense.date >= start_date)
    if end_date:
        query = query.filter(Expense.date <= end_date)
    
    expenses = query.all()
    
    # Group by category
    summary = {}
    total = 0
    for expense in expenses:
        if expense.category not in summary:
            summary[expense.category] = 0
        summary[expense.category] += expense.amount
        total += expense.amount
    
    return {
        "byCategory": summary,
        "total": total,
        "count": len(expenses)
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
