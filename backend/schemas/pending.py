from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ExternalContactBase(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    contactType: str  # "vendor", "service", "consultant", "partner", "other"
    company: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    isActive: Optional[bool] = True


class ExternalContactCreate(ExternalContactBase):
    pass


class ExternalContactUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    contactType: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    isActive: Optional[bool] = None


class ExternalContactResponse(ExternalContactBase):
    id: str
    legacy_id: str = Field(..., alias="_id", serialization_alias="_id")
    gymId: str
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True
        populate_by_name = True


# Pending Balance
class PendingBalanceBase(BaseModel):
    entityType: str  # "member", "protein", "perday"
    entityId: Optional[str] = None
    entityName: str
    phone: Optional[str] = None
    amount: float
    dueDate: Optional[str] = None
    status: Optional[str] = "pending"  # "pending", "partial", "paid"
    notes: Optional[str] = None


class PendingBalanceCreate(PendingBalanceBase):
    pass


class PendingBalanceUpdate(BaseModel):
    amount: Optional[float] = None
    dueDate: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class PendingBalanceResponse(PendingBalanceBase):
    id: str
    legacy_id: str = Field(..., alias="_id", serialization_alias="_id")
    gymId: str
    createdAt: datetime
    updatedAt: datetime
    paidAmount: Optional[float] = 0

    class Config:
        from_attributes = True
        populate_by_name = True


class PaymentRecord(BaseModel):
    amount: float
    paymentMode: str  # "cash", "upi", "card", "bank"
    date: Optional[str] = None
    notes: Optional[str] = None
