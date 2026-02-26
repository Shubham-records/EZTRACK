from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from core.database import get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, Invoice, PaymentEvent
from schemas.invoice import InvoiceCreate, InvoiceResponse

router = APIRouter()


def map_invoice_response(invoice: Invoice):
    i_dict = invoice.__dict__.copy()
    i_dict['_id'] = invoice.id
    i_dict.pop('_sa_instance_state', None)

    # ── Invoice type tag ──────────────────────────────────────────────────────
    invoice_type = "Other"
    if invoice.editReason in ("Admission", "Renewal", "Re-Admission", "Protein"):
        invoice_type = invoice.editReason
    elif invoice.items and len(invoice.items) > 0:
        desc = invoice.items[0].get("description", "").lower()
        if "re-admission" in desc:
            invoice_type = "Re-Admission"
        elif "admission" in desc:
            invoice_type = "Admission"
        elif "renewal" in desc:
            invoice_type = "Renewal"
    i_dict["invoiceType"] = invoice_type

    # ── Payment amounts ───────────────────────────────────────────────────────
    # FIX: trust Invoice.paidAmount directly — the authoritative column.
    # Removed the regex fallback that parsed "Paid: ₹NNN" from editReason;
    # that was a v1 workaround and could silently corrupt balances.
    paid_amount = invoice.paidAmount or 0
    total       = invoice.total or 0
    balance     = max(total - paid_amount, 0)

    i_dict["paidAmount"] = round(paid_amount, 2)
    i_dict["balance"]    = round(balance, 2)

    return i_dict


@router.get("")
@router.get("/")
def get_invoices(current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    invoices = db.query(Invoice).filter(Invoice.gymId == current_gym.id).order_by(Invoice.invoiceDate.desc()).all()
    return [map_invoice_response(i) for i in invoices]


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(data: InvoiceCreate, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    # Calculate totals
    items = data.items
    # sum amounts
    sub_total = sum(item.amount or 0 for item in items)
    tax = data.tax or 0
    discount = data.discount or 0
    total = sub_total + tax - discount
    
    paid = data.paidAmount if data.paidAmount is not None else total
    if data.status == "PENDING":
        paid = 0
    elif data.status == "PAID":
        paid = total
    
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
        paidAmount=paid,
        lastEditedBy=current_gym.username, # simplified
        editReason=data.invoiceType if hasattr(data, 'invoiceType') and data.invoiceType else 'New Invoice'
    )
    
    db.add(new_invoice)
    db.commit()
    db.refresh(new_invoice)
    
    return map_invoice_response(new_invoice)


@router.post("/bulk-create")
def bulk_create_invoices(data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Bulk create invoices from import"""
    invoices_list = data.get("invoices", [])
    created_count = 0
    
    for invoice_data in invoices_list:
        try:
            # Required fields
            customer_name = invoice_data.get("CustomerName") or invoice_data.get("customerName")
            if not customer_name:
                continue
                
            total_amount = float(invoice_data.get("Total") or invoice_data.get("total") or 0)
            
            # Construct items if not provided
            items = invoice_data.get("Items") or invoice_data.get("items")
            if not items:
                items = [{
                    "description": "Imported Item",
                    "quantity": 1,
                    "rate": total_amount,
                    "amount": total_amount
                }]
            
            date_str = invoice_data.get("InvoiceDate") or invoice_data.get("invoiceDate")
            
            new_invoice = Invoice(
                gymId=current_gym.id,
                customerName=customer_name,
                items=items,
                subTotal=total_amount,
                tax=0,
                discount=0,
                total=total_amount,
                status=(invoice_data.get("Status") or invoice_data.get("status") or "PAID").upper(),
                paymentMode=(invoice_data.get("PaymentMode") or invoice_data.get("paymentMode") or "CASH").upper(),
                invoiceDate=date_str or datetime.now(),
                dueDate=invoice_data.get("DueDate") or invoice_data.get("dueDate"),
                paidAmount=total_amount if (invoice_data.get("Status") or invoice_data.get("status") or "PAID").upper() == "PAID" else 0,
                lastEditedBy=current_gym.username,
                editReason='Bulk Import'
            )
            db.add(new_invoice)
            created_count += 1
        except Exception as e:
            print(f"Error creating invoice: {e}")
            continue
    
    db.commit()
    return {"message": f"Created {created_count} invoices", "count": created_count}


@router.post("/bulk-delete")
def bulk_delete_invoices(data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Bulk delete invoices"""
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    
    try:
        stmt = Invoice.__table__.delete().where(
            Invoice.id.in_(ids),
            Invoice.gymId == current_gym.id
        )
        result = db.execute(stmt)
        db.commit()
        return {"message": f"Deleted {result.rowcount} invoices", "count": result.rowcount}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


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





@router.post("/{invoice_id}/pay")
def pay_invoice(
    invoice_id: str,
    data: dict,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    invoice = db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.gymId == current_gym.id
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    amount = float(data.get("amount", 0))
    mode   = str(data.get("paymentMode", "CASH")).upper()
    notes  = data.get("notes", "") or ""

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")

    # FIX: INSERT a PaymentEvent row (append-only) instead of mutating a JSON blob.
    # Invoice.paidAmount is the denormalized running total — kept in sync here.
    payment_event = PaymentEvent(
        invoiceId   = invoice.id,
        gymId       = current_gym.id,
        amount      = amount,
        paymentMode = mode,
        notes       = notes,
        recordedBy  = current_gym.username,
    )
    db.add(payment_event)

    new_paid = (invoice.paidAmount or 0) + amount
    total    = invoice.total or 0

    if new_paid >= total:
        invoice.status     = "PAID"
        invoice.paidAmount = total          # cap at total; no overpayment drift
    else:
        invoice.status     = "PARTIAL"
        invoice.paidAmount = new_paid

    # editReason is a CATEGORY TAG only — financial data lives in PaymentEvent
    invoice.lastEditedBy = current_gym.username

    db.commit()
    db.refresh(invoice)
    return map_invoice_response(invoice)
