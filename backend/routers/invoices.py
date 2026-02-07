from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from core.database import get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, Invoice
from schemas.invoice import InvoiceCreate, InvoiceResponse

router = APIRouter()


def map_invoice_response(invoice: Invoice):
    i_dict = invoice.__dict__.copy()
    i_dict['_id'] = invoice.id
    i_dict.pop('_sa_instance_state', None)
    return i_dict


@router.get("")
@router.get("/")
def get_invoices(current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    invoices = db.query(Invoice).filter(Invoice.gymId == current_gym.id).order_by(Invoice.invoiceDate.desc()).all()
    return [map_invoice_response(i) for i in invoices]


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
    
    return map_invoice_response(new_invoice)


@router.get("/{invoice_id}")
def get_invoice(invoice_id: str, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.gymId == current_gym.id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return map_invoice_response(invoice)


@router.patch("/update")
def update_invoice(data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    invoice_id = data.get("id") or data.get("_id")
    if not invoice_id:
        raise HTTPException(status_code=400, detail="Invoice ID required")
    
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.gymId == current_gym.id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Update allowed fields
    updatable_fields = ['status', 'paymentMode', 'dueDate', 'customerName', 'items', 'subTotal', 'tax', 'discount', 'total']
    for key in updatable_fields:
        if key in data and data[key] is not None:
            setattr(invoice, key, data[key])
    
    invoice.lastEditedBy = current_gym.username
    invoice.editReason = data.get('editReason', 'Invoice Updated')
    
    db.commit()
    db.refresh(invoice)
    return map_invoice_response(invoice)


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(invoice_id: str, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.gymId == current_gym.id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    db.delete(invoice)
    db.commit()
    return None
