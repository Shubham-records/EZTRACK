from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PricingConfigBase(BaseModel):
    configType: str  # "member" or "protein"
    planType: Optional[str] = None
    periodType: Optional[str] = None
    brandName: Optional[str] = None
    basePrice: float
    marginType: Optional[str] = None
    marginValue: Optional[float] = None
    offerDiscount: Optional[float] = 0
    effectiveFrom: Optional[str] = None
    isActive: Optional[bool] = True


class PricingConfigCreate(PricingConfigBase):
    pass


class PricingConfigUpdate(BaseModel):
    basePrice: Optional[float] = None
    marginType: Optional[str] = None
    marginValue: Optional[float] = None
    offerDiscount: Optional[float] = None
    isActive: Optional[bool] = None


class PricingConfigResponse(PricingConfigBase):
    id: str
    gymId: str
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True
