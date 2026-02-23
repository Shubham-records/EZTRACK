from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date

class MemberBase(BaseModel):
    Name: str
    MembershipReceiptnumber: Optional[int] = None
    Gender: Optional[str] = None
    Age: Optional[int] = None
    # AccessStatus: removed (deprecated - computed dynamically now)
    height: Optional[float] = None
    weight: Optional[int] = None
    DateOfJoining: Optional[str] = None
    DateOfReJoin: Optional[str] = None
    Billtype: Optional[str] = None
    Address: Optional[str] = None
    Whatsapp: Optional[int] = None # ORM is BigInt, Pydantic handles int
    PlanPeriod: Optional[str] = None
    PlanType: Optional[str] = None
    MembershipStatus: Optional[str] = ""
    MembershipExpiryDate: Optional[str] = None
    LastPaymentDate: Optional[str] = None
    NextDuedate: Optional[str] = None
    LastPaymentAmount: Optional[int] = None
    RenewalReceiptNumber: Optional[int] = None
    Aadhaar: Optional[int] = None
    Remark: Optional[str] = None
    Mobile: Optional[int] = None
    extraDays: Optional[str] = "0"
    agreeTerms: Optional[bool] = False
    
    # Billing fields (not stored in Member table, but used for Invoice)
    admissionPrice: Optional[float] = 0.0
    extraAmount: Optional[float] = 0.0
    
    # Personal Training fields (billing only)
    applyPersonalTraining: Optional[bool] = False
    ptPlanType: Optional[str] = None
    ptPlanPeriod: Optional[str] = None
    ptAmount: Optional[float] = 0.0

class MemberCreate(MemberBase):
    paymentMode: Optional[str] = "CASH"
    paidAmount: Optional[float] = None

class MemberUpdate(MemberBase):
    # All fields from Base are optional by default if not '...' required, 
    # but in Base they are Optional. 
    # Name is Required in Base (not Optional), so must redefine for Update to be optional
    Name: Optional[str] = None
    lastEditedBy: Optional[str] = None
    editReason: Optional[str] = None

class MemberResponse(MemberBase):
    id: str
    legacy_id: str = Field(..., alias="_id", serialization_alias="_id")
    gymId: str
    lastEditedBy: Optional[str] = None
    editReason: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime
    
    # Override BigInt fields to deserialize as String for frontend compatibility if needed
    # But Pydantic int is fine for strictly "numbers". 
    # If frontend explicitly wants string for these, we redefine:
    Whatsapp: Optional[str] = None
    Aadhaar: Optional[str] = None
    Mobile: Optional[str] = None
    
    # Computed fields
    computed_status: Optional[str] = None
    is_expired: Optional[bool] = None
    days_until_expiry: Optional[int] = None
    admission_expiry_date: Optional[date] = None
    is_admission_expired: Optional[bool] = None

    class Config:
        from_attributes = True
        populate_by_name = True

    @staticmethod
    def resolve__id(obj):
        return obj.id
