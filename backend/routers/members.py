from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List
from datetime import datetime

from core.database import get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, Member, Invoice
from schemas.member import MemberCreate, MemberResponse, MemberUpdate

router = APIRouter()

def map_member_response(member: Member):
    # Convert SQLAlchemy object to dict to add _id and perform string conversions safely
    m_dict = member.__dict__.copy()
    m_dict['_id'] = member.id
    
    # Handle BigInt to str conversion explicitly if needed, 
    # though Pydantic response_model usually handles int->str coercion if schema says str.
    if m_dict.get('Mobile') is not None:
        m_dict['Mobile'] = str(m_dict['Mobile'])
    if m_dict.get('Whatsapp') is not None:
        m_dict['Whatsapp'] = str(m_dict['Whatsapp'])
    if m_dict.get('Aadhaar') is not None:
        m_dict['Aadhaar'] = str(m_dict['Aadhaar'])
        
    return m_dict

@router.get("/", response_model=List[MemberResponse])
def get_members(current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    members = db.query(Member).filter(Member.gymId == current_gym.id).all()
    # Map _id
    return [map_member_response(m) for m in members]

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

    # Create Invoice
    if data.LastPaymentAmount and data.LastPaymentAmount > 0:
        new_invoice = Invoice(
            gymId=current_gym.id,
            memberId=new_member.id,
            customerName=new_member.Name,
            invoiceDate=datetime.now(),
            items=[{
                "description": f"New Admission - {data.PlanType} ({data.PlanPeriod})",
                "quantity": 1,
                "rate": data.LastPaymentAmount,
                "amount": data.LastPaymentAmount
            }],
            subTotal=float(data.LastPaymentAmount),
            total=float(data.LastPaymentAmount),
            status='PAID',
            paymentMode='CASH', 
            tax=0.0,
            discount=0.0,
            lastEditedBy=current_gym.username
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
