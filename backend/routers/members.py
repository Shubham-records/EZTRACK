from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List
from datetime import datetime

from core.database import get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, Member, Invoice, PendingBalance
from schemas.member import MemberCreate, MemberResponse, MemberUpdate

router = APIRouter()


def calculate_member_status(member: Member, admission_expiry_days: int = 365) -> dict:
    today = datetime.now().date()
    status_data = {
        "computed_status": "Active",
        "is_expired": False,
        "days_until_expiry": None,
        "admission_expiry_date": None,
        "is_admission_expired": False
    }
    
    # Check if member has a NextDueDate
    if member.NextDuedate:
        try:
            # Parse date - handle potential formats
            # Attempt to parse DD/MM/YYYY or YYYY-MM-DD
            try:
                due_date = datetime.strptime(member.NextDuedate, "%d/%m/%Y").date()
            except ValueError:
                due_date = datetime.strptime(member.NextDuedate, "%Y-%m-%d").date()
                
            delta = (due_date - today).days
            status_data["days_until_expiry"] = delta
            
            # 1. Plan Expiry (Monthly Dues)
            if due_date < today:
                status_data["computed_status"] = "Expired"
                status_data["is_expired"] = True
            else:
                 # Check if expiring soon? Typically "Active" until actually expired.
                 # Frontend determines "Expiring Soon" visual with warnings, 
                 # but status is simply Active or Expired.
                 status_data["computed_status"] = "Active"
                 status_data["is_expired"] = False
            
            # 2. Admission Expiry (Long-term)
            # Admission Expires X days AFTER the Next Due Date (if not renewed)
            # OR typically calculated from Join Date? 
            # User said: "membership admission expiry to 365 days, so bob membership expiry date is 2nd jan 26 as per the next due date of his"
            # So dependent on NextDueDate.
            from datetime import timedelta
            admission_expiry_date = due_date + timedelta(days=admission_expiry_days)
            status_data["admission_expiry_date"] = admission_expiry_date
            
            if today > admission_expiry_date:
                status_data["is_admission_expired"] = True
            else:
                status_data["is_admission_expired"] = False
                 
        except Exception:
            # If date parse fails, fallback to existing status or default
            status_data["computed_status"] = member.MembershipStatus
            
    else:
        # No due date
        status_data["computed_status"] = member.MembershipStatus
        # Without a due date, we can't calculate admission expiry accurately yet via this logic. 
        # Falls back to defaults (None/False)

    return status_data

def map_member_response(member: Member, admission_expiry_days: int = 365):
    # Convert SQLAlchemy object to dict to add _id and perform string conversions safely
    m_dict = member.__dict__.copy()
    m_dict['_id'] = member.id
    
    # Handle BigInt to str conversion explicitly if needed
    if m_dict.get('Mobile') is not None:
        m_dict['Mobile'] = str(m_dict['Mobile'])
    if m_dict.get('Whatsapp') is not None:
        m_dict['Whatsapp'] = str(m_dict['Whatsapp'])
    if m_dict.get('Aadhaar') is not None:
        m_dict['Aadhaar'] = str(m_dict['Aadhaar'])
        
    # Calculate Dynamic Status
    status_info = calculate_member_status(member, admission_expiry_days)
    m_dict.update(status_info)
    
    # Validating pydantic model effectively ignores extra fields if not in schema,
    # but we added them to schema.
        
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

from models.all_models import Gym, Member, Invoice, GymSettings

@router.get("", response_model=List[MemberResponse])
@router.get("/", response_model=List[MemberResponse])
def get_members(current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    members = db.query(Member).filter(Member.gymId == current_gym.id).all()
    # Fetch settings for admission expiry
    settings = db.query(GymSettings).filter(GymSettings.gymId == current_gym.id).first()
    admission_expiry_days = settings.admissionExpiryDays if settings and settings.admissionExpiryDays else 365
    
    # Map _id and compute status
    return [map_member_response(m, admission_expiry_days) for m in members]



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
                AccessStatus=member_data.get("AccessStatus", "no"),
                height=float(member_data.get("height")) if member_data.get("height") else None,
                weight=int(member_data.get("weight")) if member_data.get("weight") else None,
                DateOfJoining=member_data.get("DateOfJoining"),
                DateOfReJoin=member_data.get("DateOfReJoin"),
                Billtype=member_data.get("Billtype"),
                Address=member_data.get("Address"),
                Whatsapp=int(member_data.get("Whatsapp")) if member_data.get("Whatsapp") else None,
                PlanPeriod=member_data.get("PlanPeriod"),
                PlanType=member_data.get("PlanType"),
                MembershipStatus=member_data.get("MembershipStatus", "Active"),
                MembershipExpiryDate=member_data.get("MembershipExpiryDate"),
                LastPaymentDate=member_data.get("LastPaymentDate"),
                NextDuedate=member_data.get("NextDuedate"),
                LastPaymentAmount=int(member_data.get("LastPaymentAmount")) if member_data.get("LastPaymentAmount") else None,
                RenewalReceiptNumber=member_data.get("RenewalReceiptNumber"),
                Aadhaar=int(member_data.get("Aadhaar")) if member_data.get("Aadhaar") else None,
                Remark=member_data.get("Remark"),
                Mobile=int(member_data.get("Mobile")) if member_data.get("Mobile") else None,
                extraDays=member_data.get("extraDays"),
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
    member.AccessStatus = data.AccessStatus
    member.height = data.height
    member.weight = data.weight
    member.DateOfReJoin = data.DateOfReJoin
    member.Billtype = data.Billtype
    member.Address = data.Address
    member.Whatsapp = data.Whatsapp
    member.PlanPeriod = data.PlanPeriod
    member.PlanType = data.PlanType
    member.MembershipStatus = "Active"
    member.MembershipExpiryDate = data.MembershipExpiryDate
    member.LastPaymentDate = data.LastPaymentDate # Usually DateOfReJoin
    member.NextDuedate = data.NextDuedate
    member.LastPaymentAmount = data.LastPaymentAmount
    member.RenewalReceiptNumber = data.RenewalReceiptNumber
    member.Aadhaar = data.Aadhaar
    member.Remark = data.Remark
    member.Mobile = data.Mobile
    member.extraDays = data.extraDays
    member.agreeTerms = data.agreeTerms
    
    member.lastEditedBy = current_gym.username
    member.editReason = 'Re-Admission'
    
    # Store changes
    db.commit()
    
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
            lastEditedBy=current_gym.username,
            editReason="Re-Admission Invoice"
        )
        db.add(new_invoice)

        # Create Pending Balance if needed
        if balance > 0:
            pending_entry = PendingBalance(
                gymId=current_gym.id,
                entityType="member",
                entityName=member.Name,
                phone=str(member.Mobile) if member.Mobile else None,
                memberId=member.id,
                amount=total_amount,
                paidAmount=paid_amount,
                dueDate=data.NextDuedate, 
                status="partial" if paid_amount > 0 else "pending",
                notes=f"Balance from Re-Admission. Invoice amount: {total_amount}, Paid: {paid_amount}"
            )
            db.add(pending_entry)
        db.commit()

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
    member.MembershipStatus = "Active"
    member.MembershipExpiryDate = data.MembershipExpiryDate
    member.LastPaymentDate = data.LastPaymentDate or data.DateOfReJoin
    member.NextDuedate = data.NextDuedate
    member.LastPaymentAmount = data.LastPaymentAmount
    member.RenewalReceiptNumber = data.RenewalReceiptNumber
    member.extraDays = data.extraDays
    
    member.lastEditedBy = current_gym.username
    member.editReason = 'Renewal'
    
    db.commit()
    
    # Create Invoice with breakdown
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
            lastEditedBy=current_gym.username,
            editReason="Renewal Invoice"
        )
        db.add(new_invoice)
        
        if balance > 0:
            pending_entry = PendingBalance(
                gymId=current_gym.id,
                entityType="member",
                entityName=member.Name,
                phone=str(member.Mobile) if member.Mobile else None,
                memberId=member.id,
                amount=total_amount,
                paidAmount=paid_amount,
                dueDate=data.NextDuedate,
                status="partial" if paid_amount > 0 else "pending",
                notes=f"Balance from Renewal. Invoice amount: {total_amount}, Paid: {paid_amount}"
            )
            db.add(pending_entry)
        db.commit()
    
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
        AccessStatus=data.AccessStatus,
        height=data.height,
        weight=data.weight,
        DateOfJoining=data.DateOfJoining,
        DateOfReJoin=data.DateOfReJoin,
        Billtype=data.Billtype,
        Address=data.Address,
        Whatsapp=data.Whatsapp,
        PlanPeriod=data.PlanPeriod,
        PlanType=data.PlanType,
        MembershipStatus=data.MembershipStatus,
        MembershipExpiryDate=data.MembershipExpiryDate,
        LastPaymentDate=data.LastPaymentDate,
        NextDuedate=data.NextDuedate,
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
            lastEditedBy=current_gym.username
        )
        db.add(new_invoice)

        # Create Pending Balance if needed
        if balance > 0:
            pending_entry = PendingBalance(
                gymId=current_gym.id,
                entityType="member",
                entityName=new_member.Name,
                phone=str(new_member.Mobile) if new_member.Mobile else None,
                memberId=new_member.id,
                amount=total_amount,
                paidAmount=paid_amount,
                dueDate=data.NextDuedate, # Use NextDueDate as likely payment due date for balance
                status="partial" if paid_amount > 0 else "pending",
                notes=f"Balance from New Admission. Invoice amount: {total_amount}, Paid: {paid_amount}"
            )
            db.add(pending_entry)
    
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
        
    # Fetch settings for admission expiry to correctly map status
    settings = db.query(GymSettings).filter(GymSettings.gymId == current_gym.id).first()
    admission_expiry_days = settings.admissionExpiryDays if settings and settings.admissionExpiryDays else 365
        
    return map_member_response(member, admission_expiry_days)
