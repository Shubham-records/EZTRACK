"""
routers/staff.py
================
SEC-01 / SEC-02: RBAC enforced on all staff management endpoints.

- GET /api/staff   — OWNER or MANAGER can list staff
- POST /api/staff  — OWNER only can create staff
- DELETE /api/staff/{id} — OWNER only
- PUT /api/staff/{id}    — OWNER or MANAGER
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.database import get_db
from core.dependencies import get_current_gym, require_owner, require_owner_or_manager
from core.security import get_password_hash
from models.all_models import Gym, User
from schemas.staff import UserCreate, UserResponse
from typing import List

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=List[UserResponse])
@router.get("/", response_model=List[UserResponse])
def get_staff(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager),   # SEC-01: MANAGER+ only
):
    """List all staff members for the gym."""
    users = db.query(User).filter(User.gymId == current_gym.id).all()
    return users


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_staff(
    data: UserCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner),   # SEC-01: OWNER only
):
    """Create a new staff account. Only gym OWNERs can create staff."""
    existing = db.query(User).filter(
        User.gymId == current_gym.id,
        User.username == data.username
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists in this gym")

    hashed_password = get_password_hash(data.password)
    new_user = User(
        gymId=current_gym.id,
        username=data.username,
        password=hashed_password,
        role=data.role,
        permissions=data.permissions,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    logger.info("New staff '%s' (role=%s) created for gym %s", new_user.username, new_user.role, current_gym.id)
    return new_user


@router.put("/{user_id}", response_model=UserResponse)
def update_staff(
    user_id: str,
    data: dict,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager),   # MANAGER+ for edits
):
    """Update staff member details. MANAGERs and OWNERs only."""
    user = db.query(User).filter(
        User.id == user_id,
        User.gymId == current_gym.id
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")

    # Only safe fields can be updated; never allow gymId/id overwrite
    safe_fields = {"role", "permissions", "activeBranchId", "branchIds"}
    for key, value in data.items():
        if key in safe_fields and hasattr(user, key):
            setattr(user, key, value)

    if data.get("password"):
        user.password = get_password_hash(data["password"])

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_staff(
    user_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner),   # OWNER only for deletions
):
    """Delete a staff member. Only gym OWNERs can remove staff."""
    user = db.query(User).filter(
        User.id == user_id,
        User.gymId == current_gym.id
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")

    db.delete(user)
    db.commit()
    return None
