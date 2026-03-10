"""
routers/staff.py
================
SEC-01 / SEC-02: RBAC enforced on all staff management endpoints.

- GET /api/staff         — OWNER or MANAGER can list staff
- POST /api/staff        — OWNER only can create staff
- DELETE /api/staff/{id} — OWNER only
- PUT /api/staff/{id}    — OWNER or MANAGER

SEC-NEW-05: update_staff() now uses typed UserUpdate schema (replaces raw dict).
            - Role is validated as Literal["OWNER","MANAGER","STAFF"]
            - MANAGER cannot promote another user to OWNER
P14: create_staff() now enforces GymSubscription.maxStaff.
P12: update_staff() syncs UserBranchAccess junction table in addition to branchIds JSON.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from core.database import get_db
from core.dependencies import (
    get_current_gym, require_owner, require_owner_or_manager, get_caller_role
)
from core.security import get_password_hash
from models.all_models import Gym, User, UserBranchAccess
from schemas.staff import UserCreate, UserUpdate, UserResponse

logger = logging.getLogger(__name__)
router = APIRouter()

ROLE_RANK = {"OWNER": 3, "MANAGER": 2, "STAFF": 1}


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
    """Create a new staff account. Only gym OWNERs can create staff.
    P14: Enforces GymSubscription.maxStaff limit.
    """
    # P14: Enforce maxStaff subscription limit
    from models.all_models import GymSubscription
    subscription = db.query(GymSubscription).filter(
        GymSubscription.gymId == current_gym.id
    ).first()
    if subscription and subscription.maxStaff:
        current_count = db.query(User).filter(User.gymId == current_gym.id).count()
        if current_count >= subscription.maxStaff:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Staff limit reached ({subscription.maxStaff}). Upgrade subscription to add more staff.",
            )

    # Check for duplicate username within this gym
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
        activeBranchId=data.activeBranchId,
    )

    db.add(new_user)
    db.flush()  # assign new_user.id

    # Sync UserBranchAccess junction table
    if data.branchIds:
        for bid in data.branchIds:
            uba = UserBranchAccess(
                userId=new_user.id,
                branchId=bid,
                gymId=current_gym.id,
            )
            db.add(uba)

    db.commit()
    db.refresh(new_user)
    logger.info("New staff '%s' (role=%s) created for gym %s", new_user.username, new_user.role, current_gym.id)
    return new_user


@router.put("/{user_id}", response_model=UserResponse)
def update_staff(
    user_id: str,
    data: UserUpdate,   # SEC-NEW-05: typed schema replaces raw dict
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    caller: tuple = Depends(get_caller_role),
    _rbac=Depends(require_owner_or_manager),   # MANAGER+ for edits
):
    """Update staff member details. MANAGERs and OWNERs only.

    SEC-NEW-05: MANAGERs cannot promote a user to OWNER — only OWNERs can.
    This prevents privilege escalation via the update endpoint.
    """
    caller_role, caller_username = caller

    user = db.query(User).filter(
        User.id == user_id,
        User.gymId == current_gym.id
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")

    # SEC-NEW-05: MANAGER cannot promote anyone to OWNER
    if data.role is not None:
        if (
            ROLE_RANK.get(caller_role, 0) < ROLE_RANK["OWNER"]
            and data.role == "OWNER"
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only OWNERs can assign the OWNER role.",
            )
        user.role = data.role

    if data.permissions is not None:
        user.permissions = data.permissions
    if data.activeBranchId is not None:
        user.activeBranchId = data.activeBranchId
    if data.branchIds is not None:
        # Replace UserBranchAccess rows
        db.query(UserBranchAccess).filter(UserBranchAccess.userId == user.id).delete()
        for bid in data.branchIds:
            uba = UserBranchAccess(
                userId=user.id,
                branchId=bid,
                gymId=current_gym.id,
            )
            db.add(uba)

    if data.password:
        user.password = get_password_hash(data.password)

    db.commit()
    db.refresh(user)
    logger.info(
        "Staff '%s' updated by '%s' (caller_role=%s)",
        user.username, caller_username, caller_role
    )
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
