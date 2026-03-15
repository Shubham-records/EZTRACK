from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime, date

class InvoiceItem(BaseModel):
    description: str
    quantity: int
    rate: float
    amount: float

class InvoiceBase(BaseModel):
    memberId: Optional[str] = None
    customerName: Optional[str] = None
    invoiceDate: Optional[datetime] = None
    dueDate: Optional[date] = None
    items: List[InvoiceItem] = []
    subTotal: float = 0
    tax: float = 0
    discount: float = 0
    total: float = 0
    status: Optional[str] = "PENDING"
    paymentMode: Optional[str] = "CASH"
    termsAndConditions: Optional[Any] = None

class InvoiceCreate(BaseModel):
    # Reduced create model as total usually calculated by server? 
    # But Next.js logic took everything from body.
    # We will accept structure similar to Next.js
    memberId: Optional[str] = None
    customerName: Optional[str] = None
    invoiceType: Optional[str] = None
    items: List[InvoiceItem] = []
    tax: Optional[float] = 0
    discount: Optional[float] = 0
    status: Optional[str] = "PENDING"
    paymentMode: Optional[str] = "CASH"
    invoiceDate: Optional[datetime] = None
    dueDate: Optional[date] = None
    paidAmount: Optional[float] = None
    termsAndConditions: Optional[Any] = None

class InvoiceResponse(InvoiceBase):
    id: str
    gymId: str
    createdAt: datetime
    updatedAt: datetime
    lastEditedBy: Optional[str] = None

    class Config:
        from_attributes = True


class PendingCreate(BaseModel):
    entityType: str  # 'member' or 'protein'
    entityName: str
    phone: Optional[str] = None
    amount: float
    dueDate: Optional[date] = None
    notes: Optional[str] = None
