from datetime import datetime, date
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from models.all_models import Invoice, PaymentEvent, Member

async def create_membership_invoice(
    db: AsyncSession,
    gym_id: str,
    gym_username: str,
    member_id: str,
    member_name: str,
    plan_type: str,
    plan_period: str,
    last_payment_amount: float,
    paid_amount: float,
    payment_mode: str,
    admission_price: float = 0.0,
    extra_amount: float = 0.0,
    pt_amount: float = 0.0,
    pt_plan_type: Optional[str] = None,
    pt_plan_period: Optional[str] = None,
    invoice_type: str = "New Admission"
) -> Invoice:
    """
    Creates an Invoice and PaymentEvent for a new admission, re-admission, or renewal.
    NOTE: Caller is responsible for commit and audit logging.
    """
    items = []
        
    # Calculate base plan price
    base_plan_price = float(last_payment_amount)
    base_plan_price = base_plan_price - admission_price - extra_amount - pt_amount
        
    # Add items
    if base_plan_price > 0:
        items.append({
            "description": f"{invoice_type} - {plan_type} ({plan_period})",
            "quantity": 1,
            "rate": base_plan_price,
            "amount": base_plan_price
        })

    if admission_price > 0:
        items.append({
            "description": "Admission Fee",
            "quantity": 1,
            "rate": admission_price,
            "amount": admission_price
        })
        
    if extra_amount > 0:
        items.append({
            "description": "Extra Charges",
            "quantity": 1,
            "rate": extra_amount,
            "amount": extra_amount
        })

    if pt_amount > 0:
        pt_desc = f"Personal Training - {pt_plan_type or 'PT'}" + (f" ({pt_plan_period})" if pt_plan_period else "")
        items.append({
            "description": pt_desc,
            "quantity": 1,
            "rate": pt_amount,
            "amount": pt_amount
        })

    # Calculate payment details
    total_amount = float(last_payment_amount)
    balance = max(0.0, total_amount - paid_amount)  # both floats — avoids int/float overload mismatch
    
    payment_status = 'PAID'
    if balance > 0:
        payment_status = 'PARTIAL' if paid_amount > 0 else 'PENDING'

    new_invoice = Invoice(
        gymId=gym_id,
        memberId=member_id,
        customerName=member_name,
        invoiceDate=datetime.now(),
        items=items,
        subTotal=total_amount,
        total=total_amount,
        status=payment_status,
        paymentMode=payment_mode, 
        tax=0.0,
        discount=0.0,
        paidAmount=paid_amount,
        lastEditedBy=gym_username,
        editReason=f"{invoice_type} | Paid: ₹{paid_amount:.0f} | Balance: ₹{balance:.0f}" if payment_status != 'PAID' else invoice_type
    )
    db.add(new_invoice)
    await db.flush()

    # Insert PaymentEvent for invoice paidAmount sync
    if paid_amount > 0:
        db.add(PaymentEvent(
            invoiceId=new_invoice.id,
            gymId=gym_id,
            amount=paid_amount,
            paymentMode=payment_mode or "CASH",
            notes=invoice_type,
            recordedBy=gym_username,
        ))
        
    return new_invoice

async def process_invoice_creation(
    db: AsyncSession,
    gym_id: str,
    gym_username: str,
    items: List[Dict[str, Any]],
    member_id: Optional[str] = None,
    customer_name: Optional[str] = None,
    tax: float = 0.0,
    discount: float = 0.0,
    status: str = "PAID",
    payment_mode: str = "CASH",
    invoice_date: Optional[datetime] = None,
    due_date: Optional[date] = None,
    paid_amount_input: Optional[float] = None,
    invoice_type: Optional[str] = None,
    edit_reason: Optional[str] = None,
) -> Invoice:
    """
    Core business logic for creating a generic invoice.
    Can be called by API routes or background jobs (e.g. auto-renewal).
    Raises ValueError for invalid business constraints.
    """
    # SCH-NORM-01: Cross-tenant guard
    if member_id:
        stmt = select(Member).where(
            Member.id == member_id,
            Member.isDeleted == False,
        )
        mem_res = await db.execute(stmt)
        member = mem_res.scalars().first()
        
        if not member:
            raise ValueError("Member not found")
        if member.gymId != gym_id:
            raise ValueError("Member does not belong to this gym")

    # Calculate totals
    sub_total = sum(float(item.get("amount", 0)) for item in items)
    total = sub_total + float(tax) - float(discount)
    
    paid = float(paid_amount_input) if paid_amount_input is not None else total
    if status == "PENDING":
        paid = 0.0
    elif status == "PAID":
        paid = total
        
    actual_invoice_date = invoice_date or datetime.now()
    actual_edit_reason = edit_reason or (invoice_type if invoice_type else 'New Invoice')

    new_invoice = Invoice(
        gymId=gym_id,
        memberId=member_id,
        customerName=customer_name,
        items=items,
        subTotal=sub_total,
        tax=tax,
        discount=discount,
        total=total,
        status=status,
        paymentMode=payment_mode,
        invoiceDate=actual_invoice_date,
        dueDate=due_date,
        paidAmount=paid,
        lastEditedBy=gym_username,
        editReason=actual_edit_reason
    )
    
    db.add(new_invoice)
    await db.flush()

    # ARCH-NEW-09: Always create a PaymentEvent when paid > 0.
    if paid > 0:
        payment_event = PaymentEvent(
            gymId=gym_id,
            invoiceId=new_invoice.id,
            amount=paid,
            paymentMode=payment_mode or "CASH",
            notes=actual_edit_reason if actual_edit_reason != 'New Invoice' else "Initial payment at invoice creation",
            recordedBy=gym_username,
        )
        db.add(payment_event)

    return new_invoice


async def process_invoice_payment(
    db: AsyncSession,
    invoice_id: str,
    gym_id: str,
    gym_username: str,
    amount: float,
    payment_mode: str = "CASH",
    notes: str = ""
) -> Invoice:
    """
    Core business logic for recording a payment against an invoice.
    Raises ValueError for invalid business constraints.
    """
    stmt = select(Invoice).where(
        Invoice.id == invoice_id,
        Invoice.gymId == gym_id
    )
    res = await db.execute(stmt)
    invoice = res.scalars().first()
    
    if not invoice:
        raise ValueError("Invoice not found")

    if amount <= 0:
        raise ValueError("Invalid amount")

    # SCH-NORM-02: Explicit cross-tenant guard
    if invoice.gymId != gym_id:
        raise ValueError("Invoice does not belong to this gym")

    # Insert a PaymentEvent row (append-only)
    payment_event = PaymentEvent(
        invoiceId   = invoice.id,
        gymId       = gym_id,
        amount      = amount,
        paymentMode = payment_mode,
        notes       = notes,
        recordedBy  = gym_username,
    )
    db.add(payment_event)

    new_paid = float(invoice.paidAmount or 0) + float(amount)
    total    = float(invoice.total or 0)

    if new_paid >= total:
        invoice.status     = "PAID"
        invoice.paidAmount = total          # cap at total; no overpayment drift
    else:
        invoice.status     = "PARTIAL"
        invoice.paidAmount = new_paid

    invoice.lastEditedBy = gym_username
    return invoice

