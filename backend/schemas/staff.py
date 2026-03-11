from pydantic import BaseModel, field_validator
from typing import List, Optional, Literal
from datetime import datetime


class UserBase(BaseModel):
    username: str
    role: Optional[Literal["OWNER", "MANAGER", "STAFF"]] = "STAFF"
    permissions: Optional[List[str]] = []
    activeBranchId: Optional[str] = None
    branchIds: Optional[List[str]] = []
    isActive: Optional[bool] = True


class UserCreate(UserBase):
    password: str
    gymId: Optional[str] = None  # Optional — inferred from JWT in create_staff()

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if v and len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserUpdate(BaseModel):
    """
    SEC-NEW-05: Typed update schema — replaces raw dict in update_staff().
    Only explicitly listed safe fields are accepted.
    Role is validated as a Literal to prevent garbage values like 'SUPERADMIN'.
    """
    role: Optional[Literal["OWNER", "MANAGER", "STAFF"]] = None
    permissions: Optional[List[str]] = None
    activeBranchId: Optional[str] = None
    branchIds: Optional[List[str]] = None
    password: Optional[str] = None  # will be hashed before storage

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if v and len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    # NOTE: username, gymId, id are NOT accepted here.
    # Username changes require a separate endpoint with duplicate checking.


class UserResponse(UserBase):
    id: str
    gymId: str
    createdAt: datetime
    # password is never returned

    class Config:
        from_attributes = True
