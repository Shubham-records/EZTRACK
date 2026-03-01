import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, String
from typing import List, Optional
from datetime import datetime, date, timedelta

from core.database import get_db
from core.dependencies import get_current_gym, require_owner_or_manager, require_owner
from core.date_utils import parse_date, format_date
from core.cache import get_gym_settings
from core.aadhaar_crypto import encrypt_aadhaar, decrypt_aadhaar, hash_aadhaar, mask_aadhaar
from models.all_models import Gym, Member, Invoice, GymSettings, PaymentEvent, GymSubscription
from schemas.member import MemberCreate, MemberResponse, MemberUpdate
from core.audit_utils import log_audit
from core.rate_limit import rate_limit

logger = logging.getLogger(__name__)
router = APIRouter()


def calculate_member_status(member: Member, admission_expiry_days: int = 365) -> dict:
    today = datetime.now().date()
    status_data = {
        "computed_status":      "Inactive",
        "is_expired":           False,
        "days_until_expiry":    None,
        "admission_expiry_date": None,
        "is_admission_expired": False,
    }

    # NextDuedate is a native Date column — no parsing needed
    if member.NextDuedate:
        due_date = member.NextDuedate
        delta = (due_date - today).days
        status_data["days_until_expiry"] = delta

        if due_date < today:
            status_data["computed_status"] = "Expired"
            status_data["is_expired"] = True
        else:
            status_data["computed_status"] = "Active"

        admission_expiry_date = due_date + timedelta(days=admission_expiry_days)
        status_data["admission_expiry_date"] = format_date(admission_expiry_date)
        status_data["is_admission_expired"] = today > admission_expiry_date

    return status_data

def map_member_response(member: Member, admission_expiry_days: int = 365):
    m_dict = member.__dict__.copy()
    m_dict['_id'] = member.id

    # Phone are String(15) in v2 — cast to str for safety
    for field in ('Mobile', 'Whatsapp'):
        val = m_dict.get(field)
        m_dict[field] = str(val) if val is not None else None

    # SEC-05 / SCH-07: Decrypt Fernet ciphertext, then mask for API response.
    # The plaintext is NEVER sent — only XXXX-XXXX-NNNN.
    raw_aadhaar = m_dict.get('Aadhaar')
    if raw_aadhaar:
        plaintext = decrypt_aadhaar(raw_aadhaar)   # decrypt encrypted DB value
        m_dict['Aadhaar'] = mask_aadhaar(plaintext)  # mask to XXXX-XXXX-NNNN
    else:
        m_dict['Aadhaar'] = None
    # Never return the HMAC hash to clients
    m_dict.pop('AadhaarHash', None)

    # v1 leftovers — remove silently if still in __dict__
    m_dict.pop('AccessStatus',        None)
    m_dict.pop('imageData',           None)
    m_dict.pop('imageMimeType',       None)
    m_dict.pop('_sa_instance_state',  None)

    m_dict['hasImage'] = bool(getattr(member, 'hasImage', False))

    # Format all date fields as DD/MM/YYYY
    for field in ('DateOfJoining', 'DateOfReJoin', 'MembershipExpiryDate', 'LastPaymentDate', 'NextDuedate'):
        m_dict[field] = format_date(getattr(member, field, None))

    status_info = calculate_member_status(member, admission_expiry_days)
    m_dict.update(status_info)
    # Keep MembershipStatus as an alias of computed_status for backward-compat with frontend
    m_dict['MembershipStatus'] = status_info['computed_status']
    return m_dict

@router.get("/generate-client-number")
def generate_client_number(current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Generate the next available client number"""
    try:
        max_number = db.query(func.max(Member.MembershipReceiptnumber)).filter(Member.gymId == current_gym.id).scalar()
        next_number = (max_number or 0) + 1
        return {"clientNumber": next_number}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.get("")
@router.get("/")
@rate_limit("200/minute")
def get_members(
    request: Request,
    page: int = 1,
    page_size: int = 30,
    search: str = "",
    status_filter: str = "",
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    # ARCH-06: Enforce max page_size=500, no page_size=0 bypass
    page_size = max(1, min(page_size, 500))
    # FIX: use cache.py (10-min TTL) instead of raw DB query for GymSettings
    settings = get_gym_settings(current_gym.id, db)
    admission_expiry_days = settings.admissionExpiryDays if settings and settings.admissionExpiryDays else 365

    query = db.query(Member).filter(Member.gymId == current_gym.id)

    # Apply search filter at DB level
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Member.Name.ilike(search_term),
                Member.Mobile.ilike(search_term),
                Member.Whatsapp.ilike(search_term),
                Member.MembershipReceiptnumber.cast(String).ilike(search_term),
            )
        )

    if status_filter:
        query = query.filter(Member.computed_status == status_filter)

    total = query.count()
    offset = (page - 1) * page_size
    members = query.order_by(Member.createdAt.desc()).offset(offset).limit(page_size).all()
    total_pages = (total + page_size - 1) // page_size

    return {
        "data":       [map_member_response(m, admission_expiry_days) for m in members],
        "total":      total,
        "page":       page,
        "pageSize":   page_size,
        "totalPages": total_pages,
    }


@router.get("/export", dependencies=[Depends(require_owner)])
def export_members(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Gated export endpoint for gym owners. Limited to 1000 records."""
    settings = get_gym_settings(current_gym.id, db)
    admission_expiry_days = settings.admissionExpiryDays if settings and settings.admissionExpiryDays else 365
    
    members = db.query(Member).filter(
        Member.gymId == current_gym.id
    ).order_by(Member.createdAt.desc()).limit(1000).all()
    
    return {
        "data":       [map_member_response(m, admission_expiry_days) for m in members],
        "total":      len(members),
        "page":       1,
        "pageSize":   len(members),
        "totalPages": 1,
    }


@router.post("/search-duplicates")
def search_duplicates(data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Search for potential duplicates based on Name, Mobile, Whatsapp, or Aadhaar.

    SEC-NEW-09: Returns minimal fields only — {id, Name, masked_phone}.
    Full member objects must NOT be returned here; this endpoint is accessible to all
    authenticated roles including STAFF and could leak sensitive data if it returned
    phone numbers, addresses, or masked Aadhaar to lower-privilege callers.

    ARCH-NEW-05: Aadhaar matching now uses AadhaarHash (HMAC) — the Aadhaar column
    stores Fernet ciphertext which can never match a raw 12-digit number.
    """
    name = data.get("Name")
    mobile = data.get("Mobile")
    whatsapp = data.get("Whatsapp")
    aadhaar = data.get("Aadhaar")

    if not any([name, mobile, whatsapp, aadhaar]):
        return []

    conditions = []
    if name:
        conditions.append(Member.Name == name)
    if mobile:
        conditions.append(Member.Mobile == str(mobile))
    if whatsapp:
        conditions.append(Member.Whatsapp == str(whatsapp))
    if aadhaar:
        conditions.append(Member.AadhaarHash == hash_aadhaar(str(aadhaar).strip()))
            
    if not conditions:
        return []

    # Find matches
    matches = db.query(Member).filter(
        Member.gymId == current_gym.id,
        or_(*conditions)
    ).all()

    # SEC-NEW-09: Return minimal safe fields only — no phone numbers, no addresses, no Aadhaar
    return [
        {
            "id": m.id,
            "Name": m.Name,
            "MembershipReceiptnumber": m.MembershipReceiptnumber,
        }
        for m in matches
    ]

@router.post("/check-duplicates")
def check_duplicates(data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Check for duplicate members before import"""
    members_list = data.get("members", [])
    conflicts = []
    clean = []
    
    for member_data in members_list:
        name = member_data.get("Name", "")
        mobile = member_data.get("Mobile")
        whatsapp = member_data.get("Whatsapp")
        
        # Check if member exists by name or mobile
        query = db.query(Member).filter(Member.gymId == current_gym.id)
        
        conditions = []
        if name:
            conditions.append(Member.Name == name)
        if mobile:
            conditions.append(Member.Mobile == str(mobile))
        if whatsapp:
            conditions.append(Member.Whatsapp == str(whatsapp))
        
        existing = None
        if conditions:
            existing = query.filter(or_(*conditions)).first()
        
        if existing:
            conflicts.append({
                "importData": member_data,
                "existingMember": map_member_response(existing),
                "matchedOn": "Name" if existing.Name == name else "Mobile/Whatsapp"
            })
        else:
            clean.append(member_data)
    
    return {
        "conflicts": conflicts,
        "clean": clean,
        "conflictCount": len(conflicts),
        "cleanCount": len(clean)
    }


@router.post("/bulk-create")
@rate_limit("5/minute")
def bulk_create_members(request: Request, data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Bulk create members from import"""
    members_list = data.get("members", [])
    created_count = 0
    
    for member_data in members_list:
        try:
            new_member = Member(
                gymId=current_gym.id,
                Name=member_data.get("Name"),
                MembershipReceiptnumber=member_data.get("MembershipReceiptnumber"),
                Gender=member_data.get("Gender"),
                Age=int(member_data.get("Age")) if member_data.get("Age") else None,
                # AccessStatus removed in v2 — do not set
                height=float(member_data.get("height")) if member_data.get("height") else None,
                weight=int(member_data.get("weight")) if member_data.get("weight") else None,
                DateOfJoining=parse_date(member_data.get("DateOfJoining")),
                DateOfReJoin=parse_date(member_data.get("DateOfReJoin")),
                Billtype=member_data.get("Billtype"),
                Address=member_data.get("Address"),
                # FIX: String(15) in v2, not BigInteger — store as-is
                Whatsapp=str(member_data.get("Whatsapp")) if member_data.get("Whatsapp") else None,
                PlanPeriod=member_data.get("PlanPeriod"),
                PlanType=member_data.get("PlanType"),
                MembershipExpiryDate=parse_date(member_data.get("MembershipExpiryDate")),
                LastPaymentDate=parse_date(member_data.get("LastPaymentDate")),
                NextDuedate=parse_date(member_data.get("NextDuedate")),
                LastPaymentAmount=float(member_data.get("LastPaymentAmount")) if member_data.get("LastPaymentAmount") else None,
                RenewalReceiptNumber=member_data.get("RenewalReceiptNumber"),
                Aadhaar=str(member_data.get("Aadhaar")) if member_data.get("Aadhaar") else None,
                Remark=member_data.get("Remark"),
                Mobile=str(member_data.get("Mobile")) if member_data.get("Mobile") else None,
                extraDays=int(member_data.get("extraDays") or 0),
                agreeTerms=member_data.get("agreeTerms") in [True, "true", "True", "1", 1],
                lastEditedBy=current_gym.username,
                editReason='Bulk Import'
            )
            db.add(new_member)
            created_count += 1
        except Exception as e:
            logger.error("Bulk member create failed for row: %s", type(e).__name__, exc_info=False)
            continue
    
    db.commit()
    return {"message": f"Created {created_count} members", "count": created_count}


@router.post("/bulk-delete")
def bulk_delete_members(
    data: dict,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Bulk delete members (soft-delete)"""
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    
    # Check if all members belong to current gym
    # We can delete in one query for efficiency
    try:
        from datetime import datetime
        
        # Soft delete instead of hard delete
        stmt = Member.__table__.update().where(
            Member.id.in_(ids),
            Member.gymId == current_gym.id
        ).values(isDeleted=True, deletedAt=datetime.utcnow())
        
        result = db.execute(stmt)
        db.commit()
        return {"message": f"Deleted {result.rowcount} members", "count": result.rowcount}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bulk-update")
def bulk_update_members(data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Bulk update members from import merge"""
    members_list = data.get("members", [])
    updated_count = 0
    
    for member_data in members_list:
        member_id = member_data.get("id")
        if not member_id:
            continue
            
        member = db.query(Member).filter(Member.id == member_id, Member.gymId == current_gym.id).first()
        if not member:
            continue
        
        # Update fields
        for key, value in member_data.items():
            if key in ['id', '_id', 'gymId', 'createdAt', 'updatedAt']:
                continue
            if hasattr(member, key) and value is not None:
                try:
                    if key in ['Age', 'weight']:
                        value = int(value) if value else None
                    elif key == 'LastPaymentAmount':
                        value = float(value) if value else None
                    elif key in ['Mobile', 'Whatsapp', 'Aadhaar']:
                        value = str(value) if value else None
                    elif key == 'height':
                        value = float(value) if value else None
                    setattr(member, key, value)
                except:
                    pass
        
        member.lastEditedBy = current_gym.username
        member.editReason = 'Bulk Update/Merge'
        updated_count += 1
    
    db.commit()
    return {"message": f"Updated {updated_count} members", "count": updated_count}

@router.post("/re-admission", status_code=status.HTTP_200_OK)
def re_admission(data: MemberCreate, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Re-activate a member and create invoice"""
    # Find existing member by receipt number (client ID)
    if not data.MembershipReceiptnumber:
        raise HTTPException(status_code=400, detail="Client ID (MembershipReceiptnumber) required for re-admission")
        
    member = db.query(Member).filter(
        Member.MembershipReceiptnumber == data.MembershipReceiptnumber,
        Member.gymId == current_gym.id
    ).first()
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
        
    # Update member details
    member.Name = data.Name
    member.Gender = data.Gender
    member.Age = data.Age
    # member.AccessStatus = data.AccessStatus  # Removed: deprecated field
    member.height = data.height
    member.weight = data.weight
    member.DateOfReJoin = parse_date(data.DateOfReJoin)
    member.Billtype = data.Billtype
    member.Address = data.Address
    member.Whatsapp = data.Whatsapp
    member.PlanPeriod = data.PlanPeriod
    member.PlanType = data.PlanType
    # MembershipStatus is computed dynamically from dates — no need to set it here
    member.MembershipExpiryDate = parse_date(data.MembershipExpiryDate)
    member.LastPaymentDate = parse_date(data.LastPaymentDate)
    member.NextDuedate = parse_date(data.NextDuedate)
    member.LastPaymentAmount = data.LastPaymentAmount
    member.RenewalReceiptNumber = data.RenewalReceiptNumber
    member.Aadhaar = data.Aadhaar
    member.Remark = data.Remark
    member.Mobile = data.Mobile
    member.extraDays = data.extraDays
    member.agreeTerms = data.agreeTerms
    
    member.lastEditedBy = current_gym.username
    member.editReason = 'Re-Admission'
    
    # Create Invoice with breakdown (SINGLE TRANSACTION with member update)
    if data.LastPaymentAmount and data.LastPaymentAmount > 0:
        items = []
        
        # Calculate base plan price
        base_plan_price = float(data.LastPaymentAmount)
        admission_price = float(data.admissionPrice or 0)
        extra_amount = float(data.extraAmount or 0)
        pt_amount = float(data.ptAmount or 0) if data.ptPlanType else 0
        
        base_plan_price = base_plan_price - admission_price - extra_amount - pt_amount
            
        # Add items
        if base_plan_price > 0:
            items.append({
                "description": f"Re-Admission Plan - {data.PlanType} ({data.PlanPeriod})",
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
            pt_desc = f"Personal Training - {data.ptPlanType or 'PT'}" + (f" ({data.ptPlanPeriod})" if data.ptPlanPeriod else "")
            items.append({
                "description": pt_desc,
                "quantity": 1,
                "rate": pt_amount,
                "amount": pt_amount
            })

        # Calculate payment details
        total_amount = float(data.LastPaymentAmount)
        paid_amount = float(data.paidAmount) if data.paidAmount is not None else total_amount
        balance = total_amount - paid_amount
        
        payment_status = 'PAID'
        if balance > 0:
            payment_status = 'PARTIAL' if paid_amount > 0 else 'PENDING'

        new_invoice = Invoice(
            gymId=current_gym.id,
            memberId=member.id,
            customerName=member.Name,
            invoiceDate=datetime.now(),
            items=items,
            subTotal=total_amount,
            total=total_amount,
            status=payment_status,
            paymentMode=data.paymentMode, 
            tax=0.0,
            discount=0.0,
            paidAmount=paid_amount,
            lastEditedBy=current_gym.username,
            editReason=f"Re-Admission Invoice | Paid: ₹{paid_amount:.0f} | Balance: ₹{balance:.0f}" if payment_status != 'PAID' else "Re-Admission Invoice"
        )
        db.add(new_invoice)

        # DATA-1: Insert PaymentEvent for invoice paidAmount sync
        if paid_amount > 0:
            db.add(PaymentEvent(
                invoiceId=new_invoice.id,
                gymId=current_gym.id,
                amount=paid_amount,
                paymentMode=data.paymentMode or "CASH",
                notes="Re-Admission",
                recordedBy=current_gym.username,
            ))

    # ONE commit for both member update + invoice (atomic)
    try:
        db.flush()  # populate IDs for audit
        log_audit(db, current_gym.id, "Member", member.id, "UPDATE",
                  {"action": "Re-Admission", "PlanType": data.PlanType, "PlanPeriod": data.PlanPeriod},
                  current_gym.username)
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(member)
    return {
        "message": "Re-instate member successfully",
        "id": member.id,
        "invoiceCreated": (data.LastPaymentAmount is not None and data.LastPaymentAmount > 0),
        **map_member_response(member)
    }

@router.post("/renewal", status_code=status.HTTP_200_OK)
def renew_member(data: MemberCreate, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Renew a member's plan and create invoice"""
    if not data.MembershipReceiptnumber:
        raise HTTPException(status_code=400, detail="Client ID (MembershipReceiptnumber) required for renewal")
    
    member = db.query(Member).filter(
        Member.MembershipReceiptnumber == data.MembershipReceiptnumber,
        Member.gymId == current_gym.id
    ).first()
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Update member plan details
    member.PlanPeriod = data.PlanPeriod
    member.PlanType = data.PlanType
    # MembershipStatus is computed dynamically from dates — no need to set it here
    member.MembershipExpiryDate = parse_date(data.MembershipExpiryDate)
    member.LastPaymentDate = parse_date(data.LastPaymentDate or data.DateOfReJoin)
    member.NextDuedate = parse_date(data.NextDuedate)
    member.LastPaymentAmount = data.LastPaymentAmount
    member.RenewalReceiptNumber = data.RenewalReceiptNumber
    member.extraDays = data.extraDays
    
    member.lastEditedBy = current_gym.username
    member.editReason = 'Renewal'
    
    # Create Invoice with breakdown (SINGLE TRANSACTION with member update)
    if data.LastPaymentAmount and data.LastPaymentAmount > 0:
        items = []
        
        base_plan_price = float(data.LastPaymentAmount)
        extra_amount = float(data.extraAmount or 0)
        pt_amount = float(data.ptAmount or 0) if data.ptPlanType else 0
        
        base_plan_price = base_plan_price - extra_amount - pt_amount
        
        if base_plan_price > 0:
            items.append({
                "description": f"Renewal - {data.PlanType} ({data.PlanPeriod})",
                "quantity": 1,
                "rate": base_plan_price,
                "amount": base_plan_price
            })
        
        if extra_amount > 0:
            items.append({
                "description": "Extra Charges",
                "quantity": 1,
                "rate": extra_amount,
                "amount": extra_amount
            })
        
        if pt_amount > 0:
            pt_desc = f"Personal Training - {data.ptPlanType or 'PT'}" + (f" ({data.ptPlanPeriod})" if data.ptPlanPeriod else "")
            items.append({
                "description": pt_desc,
                "quantity": 1,
                "rate": pt_amount,
                "amount": pt_amount
            })
        
        total_amount = float(data.LastPaymentAmount)
        paid_amount = float(data.paidAmount) if data.paidAmount is not None else total_amount
        balance = total_amount - paid_amount
        
        payment_status = 'PAID'
        if balance > 0:
            payment_status = 'PARTIAL' if paid_amount > 0 else 'PENDING'
        
        new_invoice = Invoice(
            gymId=current_gym.id,
            memberId=member.id,
            customerName=member.Name,
            invoiceDate=datetime.now(),
            items=items,
            subTotal=total_amount,
            total=total_amount,
            status=payment_status,
            paymentMode=data.paymentMode,
            tax=0.0,
            discount=0.0,
            paidAmount=paid_amount,
            lastEditedBy=current_gym.username,
            editReason="Renewal Invoice"
        )
        if payment_status != 'PAID':
            new_invoice.editReason = f"Renewal Invoice | Paid: ₹{paid_amount:.0f} | Balance: ₹{balance:.0f}"
        db.add(new_invoice)

        # DATA-1: Insert PaymentEvent for invoice paidAmount sync
        if paid_amount > 0:
            db.add(PaymentEvent(
                invoiceId=new_invoice.id,
                gymId=current_gym.id,
                amount=paid_amount,
                paymentMode=data.paymentMode or "CASH",
                notes="Renewal",
                recordedBy=current_gym.username,
            ))

    # ONE commit for both member update + invoice (atomic)
    try:
        db.flush()
        log_audit(db, current_gym.id, "Member", member.id, "UPDATE",
                  {"action": "Renewal", "PlanType": data.PlanType, "PlanPeriod": data.PlanPeriod},
                  current_gym.username)
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(member)
    return {
        "message": "Renewal successful",
        "id": member.id,
        "invoiceCreated": (data.LastPaymentAmount is not None and data.LastPaymentAmount > 0),
        **map_member_response(member)
    }

@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
def create_member(data: MemberCreate, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Create a new member (admission). SEC-14: Enforces subscription maxMembers limit."""
    # SEC-14: Enforce subscription maxMembers limit
    subscription = db.query(GymSubscription).filter(
        GymSubscription.gymId == current_gym.id
    ).first()
    if subscription and subscription.maxMembers and subscription.maxMembers > 0:
        current_count = db.query(func.count(Member.id)).filter(
            Member.gymId == current_gym.id,
            Member.isDeleted == False,
        ).scalar() or 0
        if current_count >= subscription.maxMembers:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Member limit reached ({subscription.maxMembers}). Upgrade your plan to add more members.",
            )

    # SCH-07: Encrypt Aadhaar before storing; compute HMAC for dedup search
    aadhaar_encrypted = None
    aadhaar_hash = None
    if data.Aadhaar:
        raw_aadhar = str(data.Aadhaar).strip()
        # Dedup: check if this Aadhaar is already in this gym
        aadhaar_hash = hash_aadhaar(raw_aadhar)
        existing_aadhaar = db.query(Member).filter(
            Member.gymId == current_gym.id,
            Member.AadhaarHash == aadhaar_hash,
            Member.isDeleted == False,
        ).first()
        if existing_aadhaar:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A member with this Aadhaar number already exists in this gym.",
            )
        aadhaar_encrypted = encrypt_aadhaar(raw_aadhar)

    new_member = Member(
        gymId=current_gym.id,
        Name=data.Name,
        MembershipReceiptnumber=data.MembershipReceiptnumber,
        Gender=data.Gender,
        Age=data.Age,
        height=data.height,
        weight=data.weight,
        DateOfJoining=parse_date(data.DateOfJoining),
        DateOfReJoin=parse_date(data.DateOfReJoin),
        Billtype=data.Billtype,
        Address=data.Address,
        Whatsapp=data.Whatsapp,
        PlanPeriod=data.PlanPeriod,
        PlanType=data.PlanType,
        MembershipExpiryDate=parse_date(data.MembershipExpiryDate),
        LastPaymentDate=parse_date(data.LastPaymentDate),
        NextDuedate=parse_date(data.NextDuedate),
        LastPaymentAmount=data.LastPaymentAmount,
        RenewalReceiptNumber=data.RenewalReceiptNumber,
        Aadhaar=aadhaar_encrypted,        # SCH-07: encrypted ciphertext
        AadhaarHash=aadhaar_hash,          # SCH-07: HMAC for dedup
        Remark=data.Remark,
        Mobile=data.Mobile,
        extraDays=data.extraDays,
        agreeTerms=data.agreeTerms,
        lastEditedBy=current_gym.username,
        editReason='New Admission',
    )

    db.add(new_member)
    db.flush()  # Populate ID

    # Create Invoice with breakdown
    if data.LastPaymentAmount and data.LastPaymentAmount > 0:
        items = []
        
        # Calculate base plan price
        base_plan_price = float(data.LastPaymentAmount)
        admission_price = float(data.admissionPrice or 0)
        extra_amount = float(data.extraAmount or 0)
        pt_amount = float(data.ptAmount or 0) if data.ptPlanType else 0
        
        base_plan_price = base_plan_price - admission_price - extra_amount - pt_amount
            
        # Add items
        if base_plan_price > 0:
            items.append({
                "description": f"New Admission - {data.PlanType} ({data.PlanPeriod})",
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
            pt_desc = f"Personal Training - {data.ptPlanType or 'PT'}" + (f" ({data.ptPlanPeriod})" if data.ptPlanPeriod else "")
            items.append({
                "description": pt_desc,
                "quantity": 1,
                "rate": pt_amount,
                "amount": pt_amount
            })

        # Calculate payment details
        total_amount = float(data.LastPaymentAmount)
        paid_amount = float(data.paidAmount) if data.paidAmount is not None else total_amount
        balance = total_amount - paid_amount
        
        payment_status = 'PAID'
        if balance > 0:
            payment_status = 'PARTIAL' if paid_amount > 0 else 'PENDING'

        new_invoice = Invoice(
            gymId=current_gym.id,
            memberId=new_member.id,
            customerName=new_member.Name,
            invoiceDate=datetime.now(),
            items=items,
            subTotal=total_amount,
            total=total_amount,
            status=payment_status,
            paymentMode=data.paymentMode, 
            tax=0.0,
            discount=0.0,
            paidAmount=paid_amount,
            lastEditedBy=current_gym.username,
            editReason=f"New Admission | Paid: ₹{paid_amount:.0f} | Balance: ₹{balance:.0f}" if payment_status != 'PAID' else "New Admission"
        )
        db.add(new_invoice)

        # DATA-1: Insert PaymentEvent for invoice paidAmount sync
        if paid_amount > 0:
            db.add(PaymentEvent(
                invoiceId=new_invoice.id,
                gymId=current_gym.id,
                amount=paid_amount,
                paymentMode=data.paymentMode or "CASH",
                notes="New Admission",
                recordedBy=current_gym.username,
            ))
    
    log_audit(db, current_gym.id, "Member", new_member.id, "CREATE",
              {"Name": data.Name, "PlanType": data.PlanType, "PlanPeriod": data.PlanPeriod},
              current_gym.username)
    
    db.commit()
    db.refresh(new_member)
    
    response_data = map_member_response(new_member)
    # Return custom dict structure as per Next.js
    return {
        "message": "New admission added successfully",
        "id": new_member.id,
        "invoiceCreated": (data.LastPaymentAmount is not None and data.LastPaymentAmount > 0),
        **response_data 
    }

@router.put("/{id}", response_model=MemberResponse)
def update_member_put(id: str, data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == id, Member.gymId == current_gym.id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
        
    date_keys = {'DateOfJoining', 'DateOfReJoin', 'MembershipExpiryDate', 'LastPaymentDate', 'NextDuedate'}
    changed = {}
    
    for key, value in data.items():
        if key in ['id', '_id', 'gymId', 'createdAt', 'updatedAt', 'tableData']:
             continue
        if hasattr(member, key):
             try:
                 if key in ['Age', 'weight', 'MembershipReceiptnumber', 'RenewalReceiptNumber']:
                     value = int(value) if value is not None and value != '' else None
                 elif key in ['LastPaymentAmount']:
                     value = float(value) if value is not None and value != '' else None
                 elif key in ['Mobile', 'Whatsapp', 'Aadhaar']:
                     value = str(value) if value is not None and value != '' else None
                 elif key in ['height']:
                     value = float(value) if value is not None and value != '' else None
                 elif key in date_keys:
                     value = parse_date(value)
                 old_val = getattr(member, key, None)
                 if old_val != value:
                     changed[key] = {"from": str(old_val) if hasattr(old_val, 'isoformat') else old_val,
                                     "to": str(value) if hasattr(value, 'isoformat') else value}
                 setattr(member, key, value)
             except Exception:
                 pass
             
    member.lastEditedBy = current_gym.username
    member.editReason = 'Update via Web'
    
    if changed:
        log_audit(db, current_gym.id, "Member", member.id, "UPDATE", changed, current_gym.username)
    db.commit()
    db.refresh(member)
    return map_member_response(member)

@router.patch("", response_model=MemberResponse)
@router.patch("/", response_model=MemberResponse)
def update_member(data: MemberUpdate, id: str, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    # Note: Next.js reads 'id' from body, but using query param or path param is standard.
    # Next.js PATCH: `const { id ... } = data`. So it expects ID in body.
    # But here I defined `update_member` with `id: str` query param? 
    # Wait, FastAPI can read from body.
    # I should redefine logic to accept a Body model that INCLUDES id, or matches Next.js exactly.
    # But let's assume I fix the frontend or make this ID extraction work.
    # I'll change signature to take a dict or special Schema.
    pass

# Redefining PATCH to match Next.js exactly (ID in body)
@router.patch("/update", response_model=MemberResponse)
def update_member_body(data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    member_id = data.get("id")
    if not member_id:
        raise HTTPException(status_code=400, detail="Member ID required")
    
    member = db.query(Member).filter(Member.id == member_id, Member.gymId == current_gym.id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
        
    updatable_data = data.copy()
    for k in ['id', '_id', 'gymId', 'createdAt', 'updatedAt', 'lastEditedBy', 'editReason', 'tableData']:
        updatable_data.pop(k, None)
    
    date_keys = {'DateOfJoining', 'DateOfReJoin', 'MembershipExpiryDate', 'LastPaymentDate', 'NextDuedate'}
    changed = {}
    
    for key, value in updatable_data.items():
        if hasattr(member, key):
            try:
                if key in ['Age', 'weight', 'MembershipReceiptnumber', 'RenewalReceiptNumber']:
                    value = int(value) if value is not None and value != '' else None
                elif key in ['LastPaymentAmount']:
                    value = float(value) if value is not None and value != '' else None
                elif key in ['Mobile', 'Whatsapp', 'Aadhaar']:
                    value = str(value) if value is not None and value != '' else None
                elif key in ['height']:
                    value = float(value) if value is not None and value != '' else None
                elif key in date_keys:
                    value = parse_date(value)
                old_val = getattr(member, key, None)
                if old_val != value:
                    changed[key] = {"from": str(old_val) if hasattr(old_val, 'isoformat') else old_val,
                                    "to": str(value) if hasattr(value, 'isoformat') else value}
                setattr(member, key, value)
            except Exception:
                pass
    
    member.lastEditedBy = current_gym.username
    member.editReason = data.get('editReason', 'Updated Member Details')
    
    if changed:
        log_audit(db, current_gym.id, "Member", member.id, "UPDATE", changed, current_gym.username)
    db.commit()
    db.refresh(member)
    
    return map_member_response(member)

@router.get("/client/{client_number}", response_model=MemberResponse)
def get_member_by_client_number(client_number: int, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Get member details by client number (receipt number)"""
    member = db.query(Member).filter(
        Member.MembershipReceiptnumber == client_number,
        Member.gymId == current_gym.id
    ).first()

    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # FIX: use cache (10-min TTL)
    settings = get_gym_settings(current_gym.id, db)
    admission_expiry_days = settings.admissionExpiryDays if settings and settings.admissionExpiryDays else 365
    return map_member_response(member, admission_expiry_days)


@router.get("/{member_id}", response_model=MemberResponse)
def get_member_by_id(member_id: str, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Get a single member by their UUID (used by invoice detail view)"""
    member = db.query(Member).filter(
        Member.id == member_id,
        Member.gymId == current_gym.id
    ).first()

    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # FIX: use cache (10-min TTL)
    settings = get_gym_settings(current_gym.id, db)
    admission_expiry_days = settings.admissionExpiryDays if settings and settings.admissionExpiryDays else 365
    return map_member_response(member, admission_expiry_days)

