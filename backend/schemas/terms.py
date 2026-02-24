from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class TermsCreate(BaseModel):
    text: str
    appliesTo: List[str]
    sortOrder: Optional[int] = 0
    isActive: Optional[bool] = True

class TermsUpdate(BaseModel):
    text: Optional[str] = None
    appliesTo: Optional[List[str]] = None
    sortOrder: Optional[int] = None
    isActive: Optional[bool] = None

class TermsResponse(BaseModel):
    id: str
    gymId: str
    text: str
    appliesTo: List[str]
    sortOrder: int
    isActive: bool
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True
