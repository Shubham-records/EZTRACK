from pydantic import BaseModel
from typing import Optional

class PaymentRecord(BaseModel):
    amount: float
    paymentMode: str  # "cash", "upi", "card", "bank"
    date: Optional[str] = None
    notes: Optional[str] = None
