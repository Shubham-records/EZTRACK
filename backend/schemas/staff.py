from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from sqlalchemy.dialects.postgresql import ARRAY 
# Wait, pydantic doesn't use sqlalchemy types. Just List[str].

class UserBase(BaseModel):
    username: str
    role: Optional[str] = "STAFF"
    permissions: Optional[List[str]] = []

class UserCreate(UserBase):
    password: str
    gymId: Optional[str] = None # Optional usually inferred from auth

class UserResponse(UserBase):
    id: str
    gymId: str
    createdAt: datetime
    # password should not be returned

    class Config:
        from_attributes = True
