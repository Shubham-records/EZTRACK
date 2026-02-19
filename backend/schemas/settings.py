from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class GymSettingsBase(BaseModel):
    # General
    currency: Optional[str] = "INR"
    dateFormat: Optional[str] = "DD/MM/YYYY"
    timezone: Optional[str] = "Asia/Kolkata"
    financialYearStart: Optional[str] = "April"
    
    # GST
    enableGST: Optional[bool] = False
    memberGSTPercent: Optional[float] = 18.0
    proteinGSTPercent: Optional[float] = 18.0
    gstin: Optional[str] = None
    showGSTBreakup: Optional[bool] = True
    hsnService: Optional[str] = "99979"
    hsnGoods: Optional[str] = "21069099"
    
    # Billing
    invoicePrefix: Optional[str] = "EZT-"
    receiptPrefix: Optional[str] = "RCP-"
    invoiceStartNumber: Optional[int] = 1001
    showLogoOnInvoice: Optional[bool] = True
    showTermsOnInvoice: Optional[bool] = True
    invoiceTermsText: Optional[str] = None
    
    # Stock
    lowStockThreshold: Optional[int] = 5
    reorderPoint: Optional[int] = 10
    expiryWarningDays: Optional[int] = 30
    expiryRange: Optional[int] = 30 # New field
    postExpiryGraceDays: Optional[int] = 30 # Grace period for expiry alerts
    admissionExpiryDays: Optional[int] = 365 # Admission expiry
    readmissionDiscount: Optional[int] = 50 # Readmission discount %
    admissionFee: Optional[float] = 0.0
    reAdmissionFee: Optional[float] = 0.0
    
    # Notifications
    enableWhatsAppReminders: Optional[bool] = True
    reminderDaysBefore: Optional[int] = 3


class GymSettingsCreate(GymSettingsBase):
    pass


class GymSettingsUpdate(GymSettingsBase):
    pass


class GymSettingsResponse(GymSettingsBase):
    id: str
    gymId: str
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True
