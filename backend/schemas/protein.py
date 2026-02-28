from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from typing import List


class ProteinBase(BaseModel):
    Brand: Optional[str] = None
    ProductName: Optional[str] = None
    Flavour: Optional[str] = None
    Weight: Optional[str] = None
    Quantity: Optional[int] = 0
    MRPPrice: Optional[float] = 0
    LandingPrice: Optional[float] = 0
    Remark: Optional[str] = None
    SellingPrice: Optional[float] = None
    ProfitAmount: Optional[float] = None
    ExpiryDate: Optional[str] = None

    # Pricing fields kept for compatibility
    MarginPrice: Optional[float] = None
    OfferPrice: Optional[float] = None
    StockThreshold: Optional[int] = 5

    # Multi-branch
    branchId: Optional[str] = None


class ProteinCreate(ProteinBase):
    pass


class ProteinUpdate(BaseModel):
    Brand: Optional[str] = None
    ProductName: Optional[str] = None
    Flavour: Optional[str] = None
    Weight: Optional[str] = None
    Quantity: Optional[int] = None
    MRPPrice: Optional[float] = None
    LandingPrice: Optional[float] = None
    Remark: Optional[str] = None
    SellingPrice: Optional[float] = None
    ProfitAmount: Optional[float] = None
    ExpiryDate: Optional[str] = None
    MarginPrice: Optional[float] = None
    OfferPrice: Optional[float] = None
    StockThreshold: Optional[int] = None


class ProteinResponse(ProteinBase):
    id: str
    legacy_id: str = Field(..., alias="_id", serialization_alias="_id")
    gymId: str
    createdAt: datetime
    updatedAt: datetime

    # Computed field for low stock indicator
    isLowStock: Optional[bool] = None
    TotalPrice: Optional[float] = None  # Computed: Quantity × LandingPrice
    lots: Optional[List[dict]] = []

    class Config:
        from_attributes = True
        populate_by_name = True
