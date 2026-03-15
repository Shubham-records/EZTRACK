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
from models.all_models import Gym, User, UserBranchAccess, RefreshToken
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
    users = db.query(User).filter(
        User.gymId == current_gym.id,
        User.isActive == True
    ).all()
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

    from core.audit_utils import log_audit
    log_audit(db, current_gym.id, "Staff", new_user.id, "CREATE",
              {"username": new_user.username, "role": new_user.role},
              current_gym.username)

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
        User.gymId == current_gym.id,
        User.isActive == True
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
        # P2-9: Smart branch update diff-based
        existing_access = db.query(UserBranchAccess).filter(UserBranchAccess.userId == user.id).all()
        existing_bids = {ba.branchId for ba in existing_access}
        new_bids = set(data.branchIds)
        
        bids_to_remove = existing_bids - new_bids
        bids_to_add = new_bids - existing_bids
        
        if bids_to_remove:
            db.query(UserBranchAccess).filter(
                UserBranchAccess.userId == user.id,
                UserBranchAccess.branchId.in_(bids_to_remove)
            ).delete(synchronize_session=False)
            
        for bid in bids_to_add:
            db.add(UserBranchAccess(
                userId=user.id,
                branchId=bid,
                gymId=current_gym.id,
            ))

    if data.password:
        user.password = get_password_hash(data.password)

    from core.audit_utils import log_audit
    log_audit(db, current_gym.id, "Staff", user.id, "UPDATE",
              {"role": data.role, "branchAccess": data.branchIds, "password_changed": bool(data.password)},
              caller_username)

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
    """Delete a staff member. Only gym OWNERs can remove staff.

    SEC-V-08: Immediately revokes all active RefreshTokens for the deleted user
    so they cannot obtain new JWTs after deletion. Their current access token
    (max 30-min lifetime) will still be valid until expiry, but cannot be renewed.
    """
    user = db.query(User).filter(
        User.id == user_id,
        User.gymId == current_gym.id,
        User.isActive == True
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")

    from datetime import datetime, timezone
    user.isActive = False
    user.deletedAt = datetime.now(timezone.utc)

    # Remove their branch access immediately
    db.query(UserBranchAccess).filter(UserBranchAccess.userId == user.id).delete()

    # SEC-V-08: Revoke all active refresh tokens so they cannot obtain new JWTs.
    # Their current access token (30-min TTL) will expire naturally.
    revoked_count = db.query(RefreshToken).filter(
        RefreshToken.userId == user.id,
        RefreshToken.isRevoked == False,
    ).update({"isRevoked": True}, synchronize_session=False)

    from core.audit_utils import log_audit
    log_audit(db, current_gym.id, "Staff", user.id, "DELETE",
              {"username": user.username, "role": user.role},
              current_gym.username)

    db.commit()
    logger.info(
        "Staff '%s' (id=%s) deleted by gym %s — %d refresh token(s) revoked (SEC-V-08).",
        user.username, user.id, current_gym.id, revoked_count,
    )
    return None
