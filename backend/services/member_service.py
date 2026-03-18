from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from datetime import datetime

from models.all_models import Member, GymSubscription
from core.date_utils import parse_date
from core.aadhaar_crypto import encrypt_aadhaar, hash_aadhaar
from services.invoice_service import create_membership_invoice

async def check_gym_member_limit(db: AsyncSession, gym_id: str) -> bool:
    """Check if gym has reached member subscription limit. Raises ValueError if exceeded."""
    sub_stmt = select(GymSubscription).where(GymSubscription.gymId == gym_id)
    sub_res = await db.execute(sub_stmt)
    subscription = sub_res.scalars().first()
    
    if subscription and subscription.maxMembers and subscription.maxMembers > 0:
        c_stmt = select(func.count(Member.id)).where(
            Member.gymId == gym_id,
            Member.isDeleted == False,
        )
        c_res = await db.execute(c_stmt)
        current_count = c_res.scalar() or 0
        if current_count >= subscription.maxMembers:
            raise ValueError(f"Member limit reached ({subscription.maxMembers}). Upgrade your plan to add more members.")
    return True

async def process_member_creation(
    db: AsyncSession,
    gym_id: str,
    gym_username: str,
    data: Any  # MemberCreate schema
) -> Member:
    """
    Core business logic for creating a new member (admission).
    Handles dedup checking, subscription limits, aadhaar encryption, and invoice creation.
    """
    # 1. Subscription Check
    await check_gym_member_limit(db, gym_id)

    # 2. Aadhaar Dedup and Encryption
    aadhaar_encrypted = None
    aadhaar_hash = None
    if getattr(data, 'Aadhaar', None):
        raw_aadhar = str(data.Aadhaar).strip()
        aadhaar_hash = hash_aadhaar(raw_aadhar)
        
        ext_stmt = select(Member).where(
            Member.gymId == gym_id,
            Member.AadhaarHash == aadhaar_hash,
            Member.isDeleted == False,
        )
        ext_res = await db.execute(ext_stmt)
        if ext_res.scalars().first():
            raise ValueError("A member with this Aadhaar number already exists in this gym.")
            
        aadhaar_encrypted = encrypt_aadhaar(raw_aadhar)

    # 3. Create Member Record
    new_member = Member(
        gymId=gym_id,
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
        Aadhaar=aadhaar_encrypted,
        AadhaarHash=aadhaar_hash,
        Remark=data.Remark,
        Mobile=data.Mobile,
        extraDays=data.extraDays,
        agreeTerms=data.agreeTerms,
        lastEditedBy=gym_username,
        editReason='New Admission',
    )
    
    db.add(new_member)
    await db.flush()  # Provide ID for invoice

    # 4. Create invoice if payment info provided
    if data.LastPaymentAmount and getattr(data, 'LastPaymentAmount', 0) > 0:
        total_amount = float(data.LastPaymentAmount)
        paid = float(data.paidAmount) if getattr(data, 'paidAmount', None) is not None else total_amount
        
        await create_membership_invoice(
            db=db,
            gym_id=gym_id,
            gym_username=gym_username,
            member_id=str(new_member.id),
            member_name=new_member.Name,
            plan_type=data.PlanType,
            plan_period=data.PlanPeriod,
            last_payment_amount=total_amount,
            paid_amount=paid,
            payment_mode=data.paymentMode,
            admission_price=float(getattr(data, 'admissionPrice', 0) or 0),
            extra_amount=float(getattr(data, 'extraAmount', 0) or 0),
            pt_amount=float(getattr(data, 'ptAmount', 0) or 0) if getattr(data, 'ptPlanType', None) else 0.0,
            pt_plan_type=getattr(data, 'ptPlanType', None),
            pt_plan_period=getattr(data, 'ptPlanPeriod', None),
            invoice_type="New Admission"
        )
        
    return new_member

async def process_re_admission(
    db: AsyncSession,
    gym_id: str,
    gym_username: str,
    data: Any # MemberCreate schema
) -> Member:
    """Core logic for re-admitting a member."""
    if not getattr(data, 'MembershipReceiptnumber', None):
        raise ValueError("Client ID (MembershipReceiptnumber) required for re-admission")
        
    stmt = select(Member).where(
        Member.MembershipReceiptnumber == data.MembershipReceiptnumber,
        Member.gymId == gym_id
    )
    res = await db.execute(stmt)
    member = res.scalars().first()
    
    if not member:
        raise ValueError("Member not found")
        
    # Update member details
    member.Name = data.Name
    member.Gender = data.Gender
    member.Age = data.Age
    member.height = data.height
    member.weight = data.weight
    member.DateOfReJoin = parse_date(data.DateOfReJoin)
    member.Billtype = data.Billtype
    member.Address = data.Address
    member.Whatsapp = data.Whatsapp
    member.PlanPeriod = data.PlanPeriod
    member.PlanType = data.PlanType
    member.MembershipExpiryDate = parse_date(data.MembershipExpiryDate)
    member.LastPaymentDate = parse_date(data.LastPaymentDate)
    member.NextDuedate = parse_date(data.NextDuedate)
    member.LastPaymentAmount = data.LastPaymentAmount
    member.RenewalReceiptNumber = data.RenewalReceiptNumber
    member.Aadhaar = getattr(data, 'Aadhaar', member.Aadhaar)
    member.Remark = data.Remark
    member.Mobile = data.Mobile
    member.extraDays = data.extraDays
    member.agreeTerms = data.agreeTerms
    
    member.lastEditedBy = gym_username
    member.editReason = 'Re-Admission'
    
    if data.LastPaymentAmount and getattr(data, 'LastPaymentAmount', 0) > 0:
        total_amount = float(data.LastPaymentAmount)
        paid = float(data.paidAmount) if getattr(data, 'paidAmount', None) is not None else total_amount
        
        await create_membership_invoice(
            db=db,
            gym_id=gym_id,
            gym_username=gym_username,
            member_id=str(member.id),
            member_name=member.Name,
            plan_type=data.PlanType,
            plan_period=data.PlanPeriod,
            last_payment_amount=total_amount,
            paid_amount=paid,
            payment_mode=data.paymentMode,
            admission_price=float(getattr(data, 'admissionPrice', 0) or 0),
            extra_amount=float(getattr(data, 'extraAmount', 0) or 0),
            pt_amount=float(getattr(data, 'ptAmount', 0) or 0) if getattr(data, 'ptPlanType', None) else 0.0,
            pt_plan_type=getattr(data, 'ptPlanType', None),
            pt_plan_period=getattr(data, 'ptPlanPeriod', None),
            invoice_type="Re-Admission"
        )
        
    return member

async def process_renew_member(
    db: AsyncSession,
    gym_id: str,
    gym_username: str,
    data: Any # MemberCreate schema
) -> Member:
    """Core logic for renewing a member."""
    if not getattr(data, 'MembershipReceiptnumber', None):
        raise ValueError("Client ID (MembershipReceiptnumber) required for renewal")
        
    stmt = select(Member).where(
        Member.MembershipReceiptnumber == data.MembershipReceiptnumber,
        Member.gymId == gym_id
    )
    res = await db.execute(stmt)
    member = res.scalars().first()
    
    if not member:
        raise ValueError("Member not found")
        
    # Update renewal details
    member.PlanPeriod = data.PlanPeriod
    member.PlanType = data.PlanType
    member.MembershipExpiryDate = parse_date(data.MembershipExpiryDate)
    member.LastPaymentDate = parse_date(data.LastPaymentDate)
    member.NextDuedate = parse_date(data.NextDuedate)
    member.LastPaymentAmount = data.LastPaymentAmount
    member.RenewalReceiptNumber = data.RenewalReceiptNumber
    member.Remark = data.Remark
    member.extraDays = data.extraDays
    
    member.lastEditedBy = gym_username
    member.editReason = 'Renewal'
    
    if data.LastPaymentAmount and getattr(data, 'LastPaymentAmount', 0) > 0:
        total_amount = float(data.LastPaymentAmount)
        paid = float(data.paidAmount) if getattr(data, 'paidAmount', None) is not None else total_amount
        
        await create_membership_invoice(
            db=db,
            gym_id=gym_id,
            gym_username=gym_username,
            member_id=str(member.id),
            member_name=member.Name,
            plan_type=data.PlanType,
            plan_period=data.PlanPeriod,
            last_payment_amount=total_amount,
            paid_amount=paid,
            payment_mode=data.paymentMode,
            admission_price=0.0,
            extra_amount=float(getattr(data, 'extraAmount', 0) or 0),
            pt_amount=float(getattr(data, 'ptAmount', 0) or 0) if getattr(data, 'ptPlanType', None) else 0.0,
            pt_plan_type=getattr(data, 'ptPlanType', None),
            pt_plan_period=getattr(data, 'ptPlanPeriod', None),
            invoice_type="Renewal"
        )
        
    return member

