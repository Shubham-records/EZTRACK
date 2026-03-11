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


class ProteinInlineUpdate(BaseModel):
    """SEC-CRIT-01: Typed schema for PATCH /proteins/update (inline table edit).
    Only explicitly listed fields can be updated — prevents mass assignment via raw dict.
    """
    id: Optional[str] = None    # accepted for convenience, not applied to model
    Brand: Optional[str] = None
    ProductName: Optional[str] = None
    Flavour: Optional[str] = None
    Weight: Optional[str] = None
    Quantity: Optional[int] = None
    MRPPrice: Optional[float] = None
    LandingPrice: Optional[float] = None
    Remark: Optional[str] = None
    SellingPrice: Optional[float] = None
    ExpiryDate: Optional[str] = None
    MarginPrice: Optional[float] = None
    OfferPrice: Optional[float] = None
    StockThreshold: Optional[int] = None


class BulkProteinItem(BaseModel):
    """SEC-CRIT-02: Typed schema for one protein row in bulk-create."""
    Brand: Optional[str] = None
    ProductName: Optional[str] = None
    Flavour: Optional[str] = None
    Weight: Optional[str] = None
    Quantity: Optional[int] = 0
    MRPPrice: Optional[float] = 0
    LandingPrice: Optional[float] = 0
    MarginPrice: Optional[float] = 0
    OfferPrice: Optional[float] = 0
    SellingPrice: Optional[float] = None
    Remark: Optional[str] = None
    ExpiryDate: Optional[str] = None
    StockThreshold: Optional[int] = 5


class BulkProteinCreate(BaseModel):
    stocks: List[BulkProteinItem] = []


class ProteinResponse(ProteinBase):
    id: str
    legacy_id: str = Field(..., alias="_id", serialization_alias="_id")
    gymId: str
    createdAt: datetime
    updatedAt: datetime

    # Computed field for low stock indicator
    isLowStock: Optional[bool] = None
    TotalPrice: Optional[float] = None  # Computed: Quantity × LandingPrice
    hasImage: Optional[bool] = False
    imageUrl: Optional[str] = None
    lots: Optional[List[dict]] = []

    class Config:
        from_attributes = True
        populate_by_name = True


class BulkDeleteRequest(BaseModel):
    """SW-06: Typed schema for bulk-delete endpoints.
    Validates that ids is a list of strings, capped at 500 items.
    Replaces raw dict on bulk_delete_proteins.
    """
    ids: List[str] = Field(..., min_length=1, max_length=500)


class ProteinLotCreate(BaseModel):
    """SW-07: Typed schema for POST /proteins/lots (create lot).
    Replaces raw dict param in create_protein_lot().
    """
    quantity: int = Field(..., ge=1)
    purchaseDate: Optional[str] = None
    expiryDate: Optional[str] = None
    notes: Optional[str] = None
    batchNumber: Optional[str] = None


class ProteinLotUpdate(BaseModel):
    """SW-07: Typed schema for PUT /proteins/lots/{lot_id} (update lot).
    Replaces raw dict param in update_protein_lot().
    """
    quantity: Optional[int] = Field(None, ge=1)
    purchaseDate: Optional[str] = None
    expiryDate: Optional[str] = None
    notes: Optional[str] = None
    batchNumber: Optional[str] = None

