from pydantic import BaseModel
from typing import Optional


class WhatsAppTemplateCreate(BaseModel):
    templateType: str  # Admission, Re-Admission, Renewal, Protein
    messageTemplate: str


class WhatsAppTemplateUpdate(BaseModel):
    messageTemplate: Optional[str] = None
    isActive: Optional[bool] = None


class WhatsAppTemplateResponse(BaseModel):
    id: str
    gymId: str
    templateType: str
    messageTemplate: str
    isActive: bool

    class Config:
        from_attributes = True
