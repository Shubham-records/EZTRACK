from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from core.database import get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, Invoice
from schemas.invoice import InvoiceCreate, InvoiceResponse

router = APIRouter()

@router.get("/", response_model=List[InvoiceResponse])
def get_invoices(current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    invoices = db.query(Invoice).filter(Invoice.gymId == current_gym.id).order_by(Invoice.invoiceDate.desc()).all()
    return invoices

@router.post("/", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(data: InvoiceCreate, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    # Calculate totals
    items = data.items
    # sum amounts
    sub_total = sum(item.amount or 0 for item in items)
    tax = data.tax or 0
    discount = data.discount or 0
    total = sub_total + tax - discount
    
    new_invoice = Invoice(
        gymId=current_gym.id,
        memberId=data.memberId,
        customerName=data.customerName,
        items=[item.model_dump() for item in items], # Convert Pydantic models to dict/JSON
        subTotal=sub_total,
        tax=tax,
        discount=discount,
        total=total,
        status=data.status,
        paymentMode=data.paymentMode,
        invoiceDate=data.invoiceDate or datetime.now(),
        dueDate=data.dueDate,
        lastEditedBy=current_gym.username, # simplified
        editReason='New Invoice'
    )
    
    db.add(new_invoice)
    db.commit()
    db.refresh(new_invoice)
    
    return new_invoice
