from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ProteinBase(BaseModel):
    Year: Optional[str] = None
    Month: Optional[str] = None
    Brand: Optional[str] = None
    ProductName: Optional[str] = None
    Flavour: Optional[str] = None
    Weight: Optional[str] = None
    Quantity: Optional[str] = None
    MRPPrice: Optional[str] = None
    LandingPrice: Optional[str] = None
    TotalPrice: Optional[str] = None
    Remark: Optional[str] = None

class ProteinResponse(ProteinBase):
    id: str
    legacy_id: str = Field(..., alias="_id", serialization_alias="_id")
    gymId: str
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True
        populate_by_name = True
