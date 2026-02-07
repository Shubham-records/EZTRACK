from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from core.database import get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, PendingBalance
from schemas.pending import PendingBalanceCreate, PendingBalanceUpdate, PendingBalanceResponse, PaymentRecord

router = APIRouter()


def map_pending_response(p: PendingBalance):
    p_dict = p.__dict__.copy()
    p_dict['_id'] = p.id
    p_dict.pop('_sa_instance_state', None)
    return p_dict


@router.get("")
@router.get("/")
def get_pending_balances(
    status_filter: Optional[str] = None,
    entity_type: Optional[str] = None,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get all pending balances."""
    query = db.query(PendingBalance).filter(PendingBalance.gymId == current_gym.id)
    
    if status_filter:
        query = query.filter(PendingBalance.status == status_filter)
    if entity_type:
        query = query.filter(PendingBalance.entityType == entity_type)
    
    # Default: show pending and partial only
    if not status_filter:
        query = query.filter(PendingBalance.status.in_(['pending', 'partial']))
    
    balances = query.order_by(PendingBalance.dueDate).all()
    return [map_pending_response(p) for p in balances]


@router.get("/summary")
def get_pending_summary(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get pending balance summary."""
    balances = db.query(PendingBalance).filter(
        PendingBalance.gymId == current_gym.id,
        PendingBalance.status.in_(['pending', 'partial'])
    ).all()
    
    total_pending = sum(b.amount - (b.paidAmount or 0) for b in balances)
    by_type = {}
    for b in balances:
        remaining = b.amount - (b.paidAmount or 0)
        if b.entityType not in by_type:
            by_type[b.entityType] = 0
        by_type[b.entityType] += remaining
    
    # Count overdue
    today = datetime.now().strftime('%Y-%m-%d')
    overdue_count = sum(1 for b in balances if b.dueDate and b.dueDate < today)
    
    return {
        "totalPending": round(total_pending, 2),
        "byType": by_type,
        "totalCount": len(balances),
        "overdueCount": overdue_count
    }


@router.get("/overdue")
def get_overdue_balances(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get overdue pending balances."""
    today = datetime.now().strftime('%Y-%m-%d')
    
    balances = db.query(PendingBalance).filter(
        PendingBalance.gymId == current_gym.id,
        PendingBalance.status.in_(['pending', 'partial']),
        PendingBalance.dueDate < today
    ).order_by(PendingBalance.dueDate).all()
    
    return [map_pending_response(p) for p in balances]


@router.get("/{pending_id}", response_model=PendingBalanceResponse)
def get_pending_balance(
    pending_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get single pending balance."""
    pending = db.query(PendingBalance).filter(
        PendingBalance.id == pending_id,
        PendingBalance.gymId == current_gym.id
    ).first()
    
    if not pending:
        raise HTTPException(status_code=404, detail="Pending balance not found")
    
    return map_pending_response(pending)


@router.post("/", response_model=PendingBalanceResponse, status_code=status.HTTP_201_CREATED)
def create_pending_balance(
    data: PendingBalanceCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Create a new pending balance record."""
    pending = PendingBalance(gymId=current_gym.id, **data.model_dump())
    db.add(pending)
    db.commit()
    db.refresh(pending)
    return map_pending_response(pending)


@router.put("/{pending_id}", response_model=PendingBalanceResponse)
def update_pending_balance(
    pending_id: str,
    data: PendingBalanceUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Update a pending balance."""
    pending = db.query(PendingBalance).filter(
        PendingBalance.id == pending_id,
        PendingBalance.gymId == current_gym.id
    ).first()
    
    if not pending:
        raise HTTPException(status_code=404, detail="Pending balance not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(pending, key, value)
    
    db.commit()
    db.refresh(pending)
    return map_pending_response(pending)


@router.post("/{pending_id}/pay", response_model=PendingBalanceResponse)
def record_payment(
    pending_id: str,
    payment: PaymentRecord,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Record a payment against pending balance."""
    pending = db.query(PendingBalance).filter(
        PendingBalance.id == pending_id,
        PendingBalance.gymId == current_gym.id
    ).first()
    
    if not pending:
        raise HTTPException(status_code=404, detail="Pending balance not found")
    
    # Update paid amount
    current_paid = pending.paidAmount or 0
    new_paid = current_paid + payment.amount
    pending.paidAmount = new_paid
    
    # Update status
    remaining = pending.amount - new_paid
    if remaining <= 0:
        pending.status = "paid"
    elif new_paid > 0:
        pending.status = "partial"
    
    # Add payment note
    payment_note = f"[{payment.date or datetime.now().strftime('%Y-%m-%d')}] ₹{payment.amount} via {payment.paymentMode}"
    if payment.notes:
        payment_note += f" - {payment.notes}"
    
    if pending.notes:
        pending.notes += f"\n{payment_note}"
    else:
        pending.notes = payment_note
    
    db.commit()
    db.refresh(pending)
    return map_pending_response(pending)


@router.get("/{pending_id}/whatsapp-link")
def get_whatsapp_reminder_link(
    pending_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Generate WhatsApp reminder link."""
    pending = db.query(PendingBalance).filter(
        PendingBalance.id == pending_id,
        PendingBalance.gymId == current_gym.id
    ).first()
    
    if not pending:
        raise HTTPException(status_code=404, detail="Pending balance not found")
    
    if not pending.phone:
        raise HTTPException(status_code=400, detail="No phone number available")
    
    phone = pending.phone.replace("+", "").replace(" ", "")
    if not phone.startswith("91"):
        phone = "91" + phone
    
    remaining = pending.amount - (pending.paidAmount or 0)
    message = f"Hi {pending.entityName}, this is a friendly reminder about your pending balance of ₹{remaining:.2f} at our gym."
    if pending.dueDate:
        message += f" Due date: {pending.dueDate}."
    message += " Please clear at your earliest convenience. Thank you!"
    
    import urllib.parse
    encoded_message = urllib.parse.quote(message)
    
    return {
        "link": f"https://web.whatsapp.com/send?phone={phone}&text={encoded_message}",
        "message": message,
        "phone": phone
    }


@router.delete("/{pending_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pending_balance(
    pending_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Delete a pending balance."""
    pending = db.query(PendingBalance).filter(
        PendingBalance.id == pending_id,
        PendingBalance.gymId == current_gym.id
    ).first()
    
    if not pending:
        raise HTTPException(status_code=404, detail="Pending balance not found")
    
    db.delete(pending)
    db.commit()
    return None
