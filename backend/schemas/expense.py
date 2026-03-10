from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ExpenseBase(BaseModel):
    category: str
    description: Optional[str] = None
    amount: float
    date: str  # YYYY-MM-DD
    paymentMode: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    branchId: Optional[str] = None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    date: Optional[str] = None
    paymentMode: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


class ExpenseResponse(ExpenseBase):
    id: str
    legacy_id: str = Field(..., alias="_id", serialization_alias="_id")
    gymId: str
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True
        populate_by_name = True
