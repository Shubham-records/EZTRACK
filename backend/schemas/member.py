from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Any
from core.phone_utils import normalize_phone
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
    Whatsapp: Optional[str] = None 
    PlanPeriod: Optional[str] = None
    PlanType: Optional[str] = None
    MembershipExpiryDate: Optional[str] = None
    LastPaymentDate: Optional[str] = None
    NextDuedate: Optional[str] = None
    LastPaymentAmount: Optional[float] = None  # SCH-NEW-02: was int — truncated decimal/GST amounts
    RenewalReceiptNumber: Optional[int] = None
    Aadhaar: Optional[str] = None # ORM is string (Fernet), we receive raw string initially
    Remark: Optional[str] = None
    Mobile: Optional[str] = None
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

    @field_validator("Whatsapp", "Mobile", mode="before")
    @classmethod
    def validate_phones(cls, v: Any) -> Optional[str]:
        if v is None or str(v).strip() == "":
            return None
        # Normalizes phone format to strict E.164 (SCH-01)
        normalized = normalize_phone(str(v))
        if normalized is None:
            return None
        return normalized

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
    admission_expiry_date: Optional[str] = None
    is_admission_expired: Optional[bool] = None
    MembershipStatus: Optional[str] = None
    hasImage: Optional[bool] = False
    imageUrl: Optional[str] = None

    class Config:
        from_attributes = True
        populate_by_name = True

    @staticmethod
    def resolve__id(obj):
        return obj.id
