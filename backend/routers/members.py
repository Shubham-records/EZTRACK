from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, String
from typing import List
from datetime import datetime, date, timedelta

from core.database import get_db
from core.dependencies import get_current_gym
from core.date_utils import parse_date, format_date
from core.cache import get_gym_settings
from models.all_models import Gym, Member, Invoice, GymSettings
from schemas.member import MemberCreate, MemberResponse, MemberUpdate

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

    # Phone/Aadhaar are String(15/12) in v2 — cast to str for safety
    for field in ('Mobile', 'Whatsapp', 'Aadhaar'):
        val = m_dict.get(field)
        m_dict[field] = str(val) if val is not None else None

    # v1 leftovers — remove silently if still in __dict__
    m_dict.pop('AccessStatus',        None)
    m_dict.pop('imageData',           None)
    m_dict.pop('imageMimeType',       None)
    m_dict.pop('_sa_instance_state',  None)

    m_dict['hasImage'] = bool(getattr(member, 'hasImage', False))

    # Format all date fields as DD/MM/YYYY
    for field in ('DateOfJoining', 'DateOfReJoin', 'MembershipExpiryDate', 'LastPaymentDate', 'NextDuedate'):
        m_dict[field] = format_date(getattr(member, field, None))

    # Compute MembershipStatus dynamically (stored column removed in v2)
    today = datetime.now().date()
    if member.NextDuedate:
        if today <= member.NextDuedate:
            computed_ms = 'Active'
        elif member.MembershipExpiryDate and today > member.MembershipExpiryDate:
            computed_ms = 'Expired'
        else:
            computed_ms = 'Inactive'
    else:
        computed_ms = 'Inactive'
    m_dict['MembershipStatus'] = computed_ms

    status_info = calculate_member_status(member, admission_expiry_days)
    m_dict.update(status_info)
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
def get_members(
    page: int = 1,
    page_size: int = 30,
    search: str = "",
    status_filter: str = "",
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
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

    # FIX: filter on computed_status (hybrid expression) — MembershipStatus column removed in v2
    if status_filter:
        query = query.filter(Member.computed_status == status_filter)

    total = query.count()

    # page_size=0 means return all (for exports/bulk operations)
    if page_size > 0:
        offset = (page - 1) * page_size
        members = query.order_by(Member.createdAt.desc()).offset(offset).limit(page_size).all()
        total_pages = (total + page_size - 1) // page_size
    else:
        members = query.order_by(Member.createdAt.desc()).all()
        total_pages = 1
        page_size = total

    return {
        "data":       [map_member_response(m, admission_expiry_days) for m in members],
        "total":      total,
        "page":       page,
        "pageSize":   page_size,
        "totalPages": total_pages,
    }



@router.post("/search-duplicates")
def search_duplicates(data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Search for potential duplicates based on Name, Mobile, Whatsapp, or Aadhaar"""
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
        try:
            conditions.append(Member.Mobile == int(mobile))
        except:
            pass
    if whatsapp:
        try:
            conditions.append(Member.Whatsapp == int(whatsapp))
        except:
            pass
    if aadhaar:
        try:
            conditions.append(Member.Aadhaar == int(aadhaar))
        except:
            pass
            
    if not conditions:
        return []
        
    # Find matches
    matches = db.query(Member).filter(
        Member.gymId == current_gym.id,
        or_(*conditions)
    ).all()
    
    return [map_member_response(m) for m in matches]

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
            try:
                conditions.append(Member.Mobile == int(mobile))
            except:
                pass
        if whatsapp:
            try:
                conditions.append(Member.Whatsapp == int(whatsapp))
            except:
                pass
        
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
def bulk_create_members(data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
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
                LastPaymentAmount=int(member_data.get("LastPaymentAmount")) if member_data.get("LastPaymentAmount") else None,
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
            print(f"Error creating member: {e}")
            continue
    
    db.commit()
    return {"message": f"Created {created_count} members", "count": created_count}


@router.post("/bulk-delete")
def bulk_delete_members(data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Bulk delete members"""
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    
    # Check if all members belong to current gym
    # We can delete in one query for efficiency
    try:
        # Unlink invoices first to avoid foreign key violations
        db.query(Invoice).filter(
            Invoice.memberId.in_(ids),
            Invoice.gymId == current_gym.id
        ).update({Invoice.memberId: None}, synchronize_session=False)

        stmt = Member.__table__.delete().where(
            Member.id.in_(ids),
            Member.gymId == current_gym.id
        )
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
                    if key in ['Mobile', 'Whatsapp', 'Aadhaar', 'Age', 'weight', 'LastPaymentAmount']:
                        value = int(value) if value else None
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

    # ONE commit for both member update + invoice (atomic)
    try:
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

    # ONE commit for both member update + invoice (atomic)
    try:
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
    # Basic validation logic mirrored from Next.js
    # (Pydantic handles required fields)

    # Check duplicates?
    # Next.js: Check Name OR Mobile
    # existing = db.query(Member).filter(Member.gymId == current_gym.id).filter(
    #     or_(Member.Name == data.Name, Member.Mobile == data.Mobile)
    # ).first()
    # if existing:
    #      pass # Logic was commented out/simplified in Next.js snippet slightly

    new_member = Member(
        gymId=current_gym.id,
        Name=data.Name,
        MembershipReceiptnumber=data.MembershipReceiptnumber,
        Gender=data.Gender,
        Age=data.Age,
        # AccessStatus is deprecated, no longer set from data
        height=data.height,
        weight=data.weight,
        DateOfJoining=parse_date(data.DateOfJoining),
        DateOfReJoin=parse_date(data.DateOfReJoin),
        Billtype=data.Billtype,
        Address=data.Address,
        Whatsapp=data.Whatsapp,
        PlanPeriod=data.PlanPeriod,
        PlanType=data.PlanType,
        MembershipStatus=data.MembershipStatus,
        MembershipExpiryDate=parse_date(data.MembershipExpiryDate),
        LastPaymentDate=parse_date(data.LastPaymentDate),
        NextDuedate=parse_date(data.NextDuedate),
        LastPaymentAmount=data.LastPaymentAmount,
        RenewalReceiptNumber=data.RenewalReceiptNumber,
        Aadhaar=data.Aadhaar,
        Remark=data.Remark,
        Mobile=data.Mobile,
        extraDays=data.extraDays,
        agreeTerms=data.agreeTerms,
        lastEditedBy=current_gym.username, # simplified
        editReason='New Admission'
    )
    
    db.add(new_member)
    db.flush() # Populate ID

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
    
    for key, value in data.items():
        if key in ['id', '_id', 'gymId', 'createdAt', 'updatedAt', 'tableData']:
             continue
        if hasattr(member, key):
             # Type conversion checks
             try:
                 if key in ['Mobile', 'Whatsapp', 'Aadhaar', 'Age', 'weight', 'LastPaymentAmount', 'MembershipReceiptnumber', 'RenewalReceiptNumber']:
                     value = int(value) if value is not None and value != '' else None
                 elif key in ['height']:
                     value = float(value) if value is not None and value != '' else None
                 elif key in date_keys:
                     value = parse_date(value)
                 setattr(member, key, value)
             except Exception:
                 pass # Ignore conversion errors, keep original or skip
             
    member.lastEditedBy = current_gym.username
    member.editReason = 'Update via Web'
    
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
@router.patch("/update", response_model=MemberResponse) # Using different path to avoid collision if needed, but Next.js usage was PATCH /api/members
def update_member_body(data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    # Using generic dict to extract ID then parse via Pydantic
    member_id = data.get("id")
    if not member_id:
        raise HTTPException(status_code=400, detail="Member ID required")
    
    member = db.query(Member).filter(Member.id == member_id, Member.gymId == current_gym.id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
        
    # Update fields
    # We should iterate safely.
    # Remove metadata
    updatable_data = data.copy()
    updatable_data.pop('id', None)
    updatable_data.pop('lastEditedBy', None)
    updatable_data.pop('editReason', None)
    
    # Manually update
    for key, value in updatable_data.items():
        if hasattr(member, key):
             # Handle constraints or types if needed
             setattr(member, key, value)
    
    member.lastEditedBy = current_gym.username
    member.editReason = data.get('editReason', 'Updated Member Details')
    
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

