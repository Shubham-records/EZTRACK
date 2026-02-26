from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import urllib.parse

from core.database import get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, Invoice, PaymentEvent
from schemas.pending import PaymentRecord

router = APIRouter()

def map_invoice_to_pending(invoice: Invoice):
    paid_amt = getattr(invoice, "paidAmount", 0) or 0
    if invoice.status == "PAID":
        paid_amt = invoice.total
        
    phone = None
    if invoice.member and hasattr(invoice.member, 'Mobile'):
        phone = str(invoice.member.Mobile)

    return {
        "_id": invoice.id,
        "id": invoice.id,
        "gymId": invoice.gymId,
        "entityType": "member" if invoice.memberId else "external",
        "entityName": invoice.customerName or "Unknown",
        "phone": phone,
        "amount": invoice.total or 0,
        "paidAmount": paid_amt,
        "dueDate": invoice.dueDate.strftime('%Y-%m-%d') if invoice.dueDate else None,
        "status": invoice.status.lower() if invoice.status else "pending",
        "notes": invoice.editReason
    }

@router.get("")
@router.get("/")
def get_pending_balances(
    status_filter: Optional[str] = None,
    entity_type: Optional[str] = None,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get all pending balances from invoices."""
    query = db.query(Invoice).filter(Invoice.gymId == current_gym.id)
    
    if status_filter:
        query = query.filter(Invoice.status == status_filter.upper())
    else:
        query = query.filter(Invoice.status.in_(['PENDING', 'PARTIAL']))
        
    if entity_type == 'member':
        query = query.filter(Invoice.memberId != None)
    elif entity_type == 'external':
        query = query.filter(Invoice.memberId == None)
    
    invoices = query.order_by(Invoice.dueDate).all()
    return [map_invoice_to_pending(inv) for inv in invoices]

@router.get("/summary")
def get_pending_summary(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get pending balance summary from invoices."""
    invoices = db.query(Invoice).filter(
        Invoice.gymId == current_gym.id,
        Invoice.status.in_(['PENDING', 'PARTIAL'])
    ).all()
    
    total_pending = 0
    by_type = {"member": 0, "external": 0}
    overdue_count = 0
    today = datetime.now().date()
    
    for inv in invoices:
        paid_amt = getattr(inv, "paidAmount", 0)  or 0
        remaining = (inv.total or 0) - paid_amt
        total_pending += remaining
        
        ent_type = "member" if inv.memberId else "external"
        by_type[ent_type] += remaining
        
        if inv.dueDate and inv.dueDate.date() < today:
            overdue_count += 1
            
    return {
        "totalPending": round(total_pending, 2),
        "byType": by_type,
        "totalCount": len(invoices),
        "overdueCount": overdue_count
    }

@router.get("/overdue")
def get_overdue_balances(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get overdue pending balances from invoices."""
    today = datetime.now()
    
    invoices = db.query(Invoice).filter(
        Invoice.gymId == current_gym.id,
        Invoice.status.in_(['PENDING', 'PARTIAL']),
        Invoice.dueDate < today
    ).order_by(Invoice.dueDate).all()
    
    return [map_invoice_to_pending(inv) for inv in invoices]

@router.get("/{pending_id}")
def get_pending_balance(
    pending_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get single pending balance from invoice."""
    invoice = db.query(Invoice).filter(
        Invoice.id == pending_id,
        Invoice.gymId == current_gym.id
    ).first()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Pending balance not found")
    
    return map_invoice_to_pending(invoice)

@router.post("/{pending_id}/pay")
def record_payment(
    pending_id: str,
    payment: PaymentRecord,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Record a payment against pending balance (invoice)."""
    invoice = db.query(Invoice).filter(
        Invoice.id == pending_id,
        Invoice.gymId == current_gym.id
    ).first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Pending balance not found")

    # FIX: INSERT a PaymentEvent row instead of mutating paymentLogs JSON blob
    payment_event = PaymentEvent(
        invoiceId   = invoice.id,
        gymId       = current_gym.id,
        amount      = payment.amount,
        paymentMode = payment.paymentMode.upper(),
        notes       = payment.notes or "",
        recordedBy  = current_gym.username,
    )
    db.add(payment_event)

    new_paid = (invoice.paidAmount or 0) + payment.amount
    total    = invoice.total or 0

    if new_paid >= total:
        invoice.status     = "PAID"
        invoice.paidAmount = total      # cap; no overpayment drift
    else:
        invoice.status     = "PARTIAL"
        invoice.paidAmount = new_paid

    invoice.lastEditedBy = current_gym.username

    db.commit()
    db.refresh(invoice)
    return map_invoice_to_pending(invoice)

@router.get("/{pending_id}/whatsapp-link")
def get_whatsapp_reminder_link(
    pending_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Generate WhatsApp reminder link."""
    invoice = db.query(Invoice).filter(
        Invoice.id == pending_id,
        Invoice.gymId == current_gym.id
    ).first()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Pending balance not found")
    
    phone = None
    if invoice.member and hasattr(invoice.member, 'Mobile') and invoice.member.Mobile:
        phone = str(invoice.member.Mobile).replace("+", "").replace(" ", "")
        
    if not phone:
        raise HTTPException(status_code=400, detail="No phone number available")
    
    if not phone.startswith("91"):
        phone = "91" + phone
    
    remaining = invoice.total - getattr(invoice, "paidAmount", 0)
    customer_name = invoice.customerName or "Customer"
    
    message = f"Hi {customer_name}, this is a friendly reminder about your pending balance of ₹{remaining:.2f} at our gym."
    if invoice.dueDate:
        message += f" Due date: {invoice.dueDate.strftime('%Y-%m-%d')}."
    message += " Please clear at your earliest convenience. Thank you!"
    
    encoded_message = urllib.parse.quote(message)
    
    return {
        "link": f"https://web.whatsapp.com/send?phone={phone}&text={encoded_message}",
        "message": message,
        "phone": phone
    }
