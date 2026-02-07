from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Optional

from core.database import get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, Expense
from schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseResponse

router = APIRouter()


def map_expense_response(expense: Expense):
    e_dict = expense.__dict__.copy()
    e_dict['_id'] = expense.id
    # Remove binary data from response (separate endpoint for that)
    e_dict.pop('receiptImage', None)
    e_dict.pop('_sa_instance_state', None)
    return e_dict


@router.get("")
@router.get("/")
def get_expenses(
    category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get all expenses with optional filters."""
    query = db.query(Expense).filter(Expense.gymId == current_gym.id)
    
    if category:
        query = query.filter(Expense.category == category)
    if start_date:
        query = query.filter(Expense.date >= start_date)
    if end_date:
        query = query.filter(Expense.date <= end_date)
    
    expenses = query.order_by(Expense.date.desc()).all()
    return [map_expense_response(e) for e in expenses]


@router.post("/", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_expense(
    data: ExpenseCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Create a new expense record."""
    expense = Expense(gymId=current_gym.id, **data.model_dump())
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return map_expense_response(expense)


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
    for key, value in update_data.items():
        setattr(expense, key, value)
    
    db.commit()
    db.refresh(expense)
    return map_expense_response(expense)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Delete an expense record."""
    expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.gymId == current_gym.id
    ).first()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
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
    """Upload receipt image for an expense."""
    expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.gymId == current_gym.id
    ).first()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    image_data = await file.read()
    expense.receiptImage = image_data
    expense.receiptImageMimeType = file.content_type
    
    db.commit()
    return {"message": "Receipt uploaded successfully"}


@router.get("/{expense_id}/receipt")
def get_receipt(
    expense_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get receipt image for an expense."""
    expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.gymId == current_gym.id
    ).first()
    
    if not expense or not expense.receiptImage:
        raise HTTPException(status_code=404, detail="Receipt not found")
    
    return Response(
        content=expense.receiptImage,
        media_type=expense.receiptImageMimeType or "image/jpeg"
    )


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
