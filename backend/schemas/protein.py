from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from typing import List


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
    
    # New pricing fields
    MarginPrice: Optional[float] = None
    OfferPrice: Optional[float] = None
    SellingPrice: Optional[float] = None
    StockThreshold: Optional[int] = 5
    
    # Multi-branch
    branchId: Optional[str] = None


class ProteinCreate(ProteinBase):
    pass


class ProteinUpdate(BaseModel):
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
    MarginPrice: Optional[float] = None
    OfferPrice: Optional[float] = None
    SellingPrice: Optional[float] = None
    StockThreshold: Optional[int] = None


class ProteinResponse(ProteinBase):
    id: str
    legacy_id: str = Field(..., alias="_id", serialization_alias="_id")
    gymId: str
    createdAt: datetime
    updatedAt: datetime
    
    # Computed field for low stock indicator
    isLowStock: Optional[bool] = None
    lots: Optional[List[dict]] = []

    class Config:
        from_attributes = True
        populate_by_name = True
