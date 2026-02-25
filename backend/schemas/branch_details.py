from pydantic import BaseModel
from typing import Optional


class BranchDetailsCreate(BaseModel):
    branchId: Optional[str] = None
    gymName: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    slogan: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    phoneCountryCode: Optional[str] = '+91'


class BranchDetailsUpdate(BaseModel):
    gymName: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    slogan: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    phoneCountryCode: Optional[str] = None


class BranchDetailsResponse(BaseModel):
    id: str
    gymId: str
    branchId: Optional[str] = None
    gymName: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    slogan: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    phoneCountryCode: Optional[str] = '+91'
    hasLogo: bool = False

    class Config:
        from_attributes = True
