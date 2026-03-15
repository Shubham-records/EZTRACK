import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, delete
from typing import List, Optional
from datetime import datetime, date
from pydantic import BaseModel

from core.database import get_db, get_async_db
from core.dependencies import get_current_gym, require_owner_or_manager
from models.all_models import Gym, Invoice, Member, PaymentEvent
from schemas.invoice import InvoiceCreate, InvoiceResponse, PendingCreate
from schemas.payment import PaymentRecord
from core.audit_utils import log_audit
from core.rate_limit import rate_limit

logger = logging.getLogger(__name__)
router = APIRouter()

# SEC-04: Strongly-typed update schema — prevents mass assignment of total/gymId
class InvoiceUpdateRequest(BaseModel):
    id: Optional[str] = None
    status: Optional[str] = None
    paymentMode: Optional[str] = None
    dueDate: Optional[date] = None
    customerName: Optional[str] = None
    editReason: Optional[str] = None
    items: Optional[list] = None
    # NOTE: total, subTotal, tax, discount, paidAmount, gymId are NOT accepted here.
    # Financial recalculation must happen through create_invoice or pay_invoice.



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
async def get_invoices(
    page: int = 1,
    page_size: int = 30,
    status_filter: Optional[str] = None,   # PENDING | PARTIAL | PAID
    member_id: Optional[str] = None,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    ):
    """ARCH-06: Paginated invoice list. max page_size=500."""
    page_size = max(1, min(page_size, 500))
    offset = (page - 1) * page_size

    stmt = select(Invoice).where(
        Invoice.gymId == current_gym.id,
        Invoice.isDeleted == False,   # SCH-08: soft-delete
    )
    if status_filter:
        stmt = stmt.where(Invoice.status == status_filter.upper())
    if member_id:
        stmt = stmt.where(Invoice.memberId == member_id)

    from sqlalchemy import func
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_res = await db.execute(count_stmt)
    total = total_res.scalar() or 0
    
    stmt = stmt.order_by(Invoice.invoiceDate.desc()).offset(offset).limit(page_size)
    inv_res = await db.execute(stmt)
    invoices = inv_res.scalars().all()
    
    total_pages = (total + page_size - 1) // page_size if page_size > 0 else 1

    return {
        "data": [map_invoice_response(i) for i in invoices],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "totalPages": total_pages,
    }



@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    data: InvoiceCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),   # SEC-HIGH-02: MANAGER+ can create invoices
    ):
    # SCH-NORM-01: Cross-tenant guard — prevent invoices being attributed to
    # members of a different gym. Invoice.gymId is denormalized for query
    # efficiency, but without this check a stale/malicious memberId could
    # create a cross-tenant billing record (no DB CHECK constraint covers it).
    if data.memberId:
        stmt = select(Member).where(
            Member.id == data.memberId,
            Member.isDeleted == False,
        )
        mem_res = await db.execute(stmt)
        member = mem_res.scalars().first()
        
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")
        if member.gymId != current_gym.id:
            raise HTTPException(
                status_code=403,
                detail="Member does not belong to this gym",
            )

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
    await db.flush()  # get new_invoice.id before creating PaymentEvent

    # ARCH-NEW-09: Always create a PaymentEvent when paid > 0.
    # This ensures Invoice.paidAmount == SUM(PaymentEvent.amount) from creation,
    # closing the drift path that previously existed for upfront-PAID invoices.
    if paid > 0:
        payment_event = PaymentEvent(
            gymId=current_gym.id,
            invoiceId=new_invoice.id,
            amount=paid,
            paymentMode=data.paymentMode or "CASH",
            notes="Initial payment at invoice creation",
            recordedBy=current_gym.username,
        )
        db.add(payment_event)

    log_audit(db, current_gym.id, "Invoice", new_invoice.id, "CREATE",
              {"customerName": data.customerName, "total": total, "status": data.status},
              current_gym.username)
    await db.commit()
    # await db.refresh(new_invoice)

    return map_invoice_response(new_invoice)


@router.post("/bulk-create")
@rate_limit("5/minute")
async def bulk_create_invoices(request: Request, data: dict, current_gym: Gym = Depends(get_current_gym), db: AsyncSession = Depends(get_async_db)):
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
            await db.flush()

            # DATA-1: Insert PaymentEvent if paidAmount > 0
            if new_invoice.paidAmount and new_invoice.paidAmount > 0:
                db.add(PaymentEvent(
                    invoiceId=new_invoice.id,
                    gymId=current_gym.id,
                    amount=new_invoice.paidAmount,
                    paymentMode=new_invoice.paymentMode or "CASH",
                    notes="Bulk import",
                    recordedBy=current_gym.username,
                ))

            created_count += 1
        except Exception as e:
            logger.error("Bulk invoice create error: %s", type(e).__name__, exc_info=False)
            continue
    
    await db.commit()
    return {"message": f"Created {created_count} invoices", "count": created_count}


@router.post("/bulk-delete")
async def bulk_delete_invoices(
    data: dict,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
    ):
    """Bulk delete invoices (soft-delete)"""
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")

    # SEC-NEW-04: Cap bulk deletes to prevent oversized IN-clause queries
    MAX_BULK_DELETE = 500
    if len(ids) > MAX_BULK_DELETE:
        raise HTTPException(
            status_code=400,
            detail=f"Bulk delete limited to {MAX_BULK_DELETE} items per request. Got {len(ids)}.",
        )

    try:
        from datetime import datetime, timezone
        stmt = update(Invoice).where(
            Invoice.id.in_(ids),
            Invoice.gymId == current_gym.id
        ).values(isDeleted=True, deletedAt=datetime.now(timezone.utc))

        result = await db.execute(stmt)
        await db.commit()
        return {"message": f"Deleted {result.rowcount} invoices", "count": result.rowcount}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: str, current_gym: Gym = Depends(get_current_gym), db: AsyncSession = Depends(get_async_db)):
    stmt = select(Invoice).where(Invoice.id == invoice_id, Invoice.gymId == current_gym.id)
    res = await db.execute(stmt)
    invoice = res.scalars().first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return map_invoice_response(invoice)


@router.patch("/update")
async def update_invoice(
    data: InvoiceUpdateRequest,   # SEC-04: typed schema, not raw dict
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),
    ):
    invoice_id = data.id
    if not invoice_id:
        raise HTTPException(status_code=400, detail="Invoice ID required")
    
    stmt = select(Invoice).where(Invoice.id == invoice_id, Invoice.gymId == current_gym.id)
    res = await db.execute(stmt)
    invoice = res.scalars().first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # SEC-04: Only safe, explicitly listed fields can be changed.
    # Financial fields (total, subTotal, tax, discount, paidAmount, gymId) are NOT here.
    if data.status is not None:
        invoice.status = data.status
    if data.paymentMode is not None:
        invoice.paymentMode = data.paymentMode
    if data.dueDate is not None:
        invoice.dueDate = data.dueDate
    if data.customerName is not None:
        invoice.customerName = data.customerName
    if data.items is not None:
        invoice.items = data.items
    
    invoice.lastEditedBy = current_gym.username
    invoice.editReason = data.editReason or 'Invoice Updated'
    
    await db.commit()
    # await db.refresh(invoice)
    return map_invoice_response(invoice)


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invoice(
    invoice_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),   # SEC-02: MANAGER+ only
    ):
    stmt = select(Invoice).where(Invoice.id == invoice_id, Invoice.gymId == current_gym.id)
    res = await db.execute(stmt)
    invoice = res.scalars().first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # SCH-08: Soft-delete — preserves PaymentEvent history and audit trail
    from datetime import datetime, timezone
    invoice.isDeleted = True
    invoice.deletedAt = datetime.now(timezone.utc)
    await db.commit()
    return None


# MISSING-2: Payment history endpoint
@router.get("/{invoice_id}/payment-history")
async def get_payment_history(
    invoice_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
    ):
    stmt = select(Invoice).where(
        Invoice.id == invoice_id,
        Invoice.gymId == current_gym.id
    )
    res = await db.execute(stmt)
    invoice = res.scalars().first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    p_stmt = select(PaymentEvent).where(
        PaymentEvent.invoiceId == invoice_id
    ).order_by(PaymentEvent.createdAt.asc())
    p_res = await db.execute(p_stmt)
    events = p_res.scalars().all()

    return [{
        "id": e.id,
        "amount": e.amount,
        "paymentMode": e.paymentMode,
        "notes": e.notes,
        "recordedBy": e.recordedBy,
        "createdAt": e.createdAt.isoformat() if e.createdAt else None,
    } for e in events]



@router.post("/{invoice_id}/pay")
async def pay_invoice(
    invoice_id: str,
    data: dict,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),   # SEC-HIGH-02: MANAGER+ can record payments
    ):
    stmt = select(Invoice).where(
        Invoice.id == invoice_id,
        Invoice.gymId == current_gym.id
    )
    res = await db.execute(stmt)
    invoice = res.scalars().first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    amount = float(data.get("amount", 0))
    mode   = str(data.get("paymentMode", "CASH")).upper()
    notes  = data.get("notes", "") or ""

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")

    # SCH-NORM-02: Explicit cross-tenant guard before inserting PaymentEvent.
    # PaymentEvent.gymId is denormalized from invoice.gymId for query efficiency.
    # The query above already filters by gymId, but this assertion makes the
    # invariant explicit so a future refactor can't silently drop the filter.
    if invoice.gymId != current_gym.id:
        raise HTTPException(
            status_code=403,
            detail="Invoice does not belong to this gym",
        )

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

    log_audit(db, current_gym.id, "Invoice", invoice.id, "UPDATE",
              {"action": "Payment", "amount": amount, "paymentMode": mode, "newStatus": invoice.status},
              current_gym.username)

    await db.commit()
    # await db.refresh(invoice)
    return map_invoice_response(invoice)


# ─── Pending Sub-Router ───────────────────────────────────────────────────────

import urllib.parse

pending_router = APIRouter(prefix="/pending")

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

@pending_router.get("")
@pending_router.get("/")
async def get_pending_balances(
    status_filter: Optional[str] = None,
    entity_type: Optional[str] = None,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get all pending balances from invoices."""
    stmt = select(Invoice).options(selectinload(Invoice.member)).where(Invoice.gymId == current_gym.id)
    
    if status_filter:
        stmt = stmt.where(Invoice.status == status_filter.upper())
    else:
        stmt = stmt.where(Invoice.status.in_(['PENDING', 'PARTIAL']))
        
    if entity_type == 'member':
        stmt = stmt.where(Invoice.memberId != None)
    elif entity_type == 'external':
        stmt = stmt.where(Invoice.memberId == None)
    
    stmt = stmt.order_by(Invoice.dueDate)
    res = await db.execute(stmt)
    invoices = res.scalars().all()
    
    return [map_invoice_to_pending(inv) for inv in invoices]

@pending_router.post("")
@pending_router.post("/")
async def create_pending_balance(
    data: PendingCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),
):
    """Create a new pending balance (simplified invoice)."""
    # Simply create an invoice with one item representing the generic balance
    # We store the "EntityName" in customerName on the Invoice
    new_invoice = Invoice(
        gymId=current_gym.id,
        customerName=data.entityName,
        items=[{
            "description": f"Pending Balance ({data.entityType})",
            "quantity": 1,
            "rate": data.amount,
            "amount": data.amount
        }],
        subTotal=data.amount,
        total=data.amount,
        status="PENDING",
        paymentMode="CASH",
        invoiceDate=datetime.now(),
        dueDate=data.dueDate,
        paidAmount=0,
        editReason=data.notes or f"Manual pending entry for {data.entityType}",
        lastEditedBy=current_gym.username
    )
    
    db.add(new_invoice)
    await db.flush()
    
    log_audit(db, current_gym.id, "Invoice", new_invoice.id, "CREATE_PENDING", 
              {"name": data.entityName, "amount": data.amount}, 
              current_gym.username)
    
    await db.commit()
    # To map efficiently back to response, but no member because it's newly created manual.
    return map_invoice_to_pending(new_invoice)

@pending_router.get("/summary")
async def get_pending_summary(
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get pending balance summary from invoices."""
    stmt = select(Invoice).where(
        Invoice.gymId == current_gym.id,
        Invoice.status.in_(['PENDING', 'PARTIAL'])
    )
    res = await db.execute(stmt)
    invoices = res.scalars().all()
    
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
        
        if inv.dueDate and inv.dueDate < today:
            overdue_count += 1
            
    return {
        "totalPending": round(total_pending, 2),
        "byType": by_type,
        "totalCount": len(invoices),
        "overdueCount": overdue_count
    }

@pending_router.get("/overdue")
async def get_overdue_balances(
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get overdue pending balances from invoices."""
    today = datetime.now().date()
    
    stmt = select(Invoice).options(selectinload(Invoice.member)).where(
        Invoice.gymId == current_gym.id,
        Invoice.status.in_(['PENDING', 'PARTIAL']),
        Invoice.dueDate < today
    ).order_by(Invoice.dueDate)
    res = await db.execute(stmt)
    invoices = res.scalars().all()
    
    return [map_invoice_to_pending(inv) for inv in invoices]

@pending_router.get("/{pending_id}")
async def get_pending_balance(
    pending_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get single pending balance from invoice."""
    stmt = select(Invoice).options(selectinload(Invoice.member)).where(
        Invoice.id == pending_id,
        Invoice.gymId == current_gym.id
    )
    res = await db.execute(stmt)
    invoice = res.scalars().first()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Pending balance not found")
    
    return map_invoice_to_pending(invoice)

@pending_router.post("/{pending_id}/pay")
async def record_payment(
    pending_id: str,
    payment: PaymentRecord,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),
):
    """Record a payment against pending balance (invoice).
    Uses the same logic as pay_invoice internally.
    """
    stmt = select(Invoice).where(
        Invoice.id == pending_id,
        Invoice.gymId == current_gym.id
    )
    res = await db.execute(stmt)
    invoice = res.scalars().first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Pending balance not found")

    return await pay_invoice(
        invoice_id=pending_id,
        data={"amount": payment.amount, "paymentMode": payment.paymentMode, "notes": payment.notes},
        current_gym=current_gym,
        db=db
    )

@pending_router.get("/{pending_id}/whatsapp-link")
async def get_whatsapp_reminder_link(
    pending_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Generate WhatsApp reminder link."""
    stmt = select(Invoice).options(selectinload(Invoice.member)).where(
        Invoice.id == pending_id,
        Invoice.gymId == current_gym.id
    )
    res = await db.execute(stmt)
    invoice = res.scalars().first()
    
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

router.include_router(pending_router)
