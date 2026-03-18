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
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, delete, func
from typing import List

from core.database import get_async_db
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
async def get_staff(
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),   # SEC-01: MANAGER+ only
):
    """List all staff members for the gym."""
    stmt = select(User).where(
        User.gymId == current_gym.id,
        User.isActive == True
    )
    result = await db.execute(stmt)
    users = result.scalars().all()
    return users


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_staff(
    data: UserCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner),   # SEC-01: OWNER only
):
    """Create a new staff account. Only gym OWNERs can create staff.
    P14: Enforces GymSubscription.maxStaff limit.
    """
    # P14: Enforce maxStaff subscription limit
    from models.all_models import GymSubscription
    sub_stmt = select(GymSubscription).where(
        GymSubscription.gymId == current_gym.id
    )
    sub_res = await db.execute(sub_stmt)
    subscription = sub_res.scalars().first()
    
    if subscription and subscription.maxStaff:
        count_stmt = select(func.count(User.id)).where(User.gymId == current_gym.id)
        count_res = await db.execute(count_stmt)
        current_count = count_res.scalar() or 0
        if current_count >= subscription.maxStaff:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Staff limit reached ({subscription.maxStaff}). Upgrade subscription to add more staff.",
            )

    # Check for duplicate username within this gym
    exist_stmt = select(User).where(
        User.gymId == current_gym.id,
        User.username == data.username
    )
    exist_res = await db.execute(exist_stmt)
    existing = exist_res.scalars().first()
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
    await db.flush()  # assign new_user.id

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
    # Note: log_audit uses a synchronous write, which is okay as long as it's quick, 
    # but since it takes a session, we should provide the raw values or assume db handles it synchronously for addition. 
    # Actually, log_audit uses db.add(), which is fully async-compatible in SQLAlchemy since it doesn't await block.
    log_audit(db, current_gym.id, "Staff", new_user.id, "CREATE",
              {"username": new_user.username, "role": new_user.role},
              current_gym.username)

    await db.commit()
    # await db.refresh(new_user)
    logger.info("New staff '%s' (role=%s) created for gym %s", new_user.username, new_user.role, current_gym.id)
    return new_user


@router.put("/{user_id}", response_model=UserResponse)
async def update_staff(
    user_id: str,
    data: UserUpdate,   # SEC-NEW-05: typed schema replaces raw dict
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    caller: tuple = Depends(get_caller_role),
    _rbac=Depends(require_owner_or_manager),   # MANAGER+ for edits
):
    """Update staff member details. MANAGERs and OWNERs only.

    SEC-NEW-05: MANAGERs cannot promote a user to OWNER — only OWNERs can.
    This prevents privilege escalation via the update endpoint.
    """
    caller_role, caller_username = caller

    stmt = select(User).where(
        User.id == user_id,
        User.gymId == current_gym.id,
        User.isActive == True
    )
    result = await db.execute(stmt)
    user = result.scalars().first()
    
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
        ba_stmt = select(UserBranchAccess).where(UserBranchAccess.userId == user.id)
        ba_res = await db.execute(ba_stmt)
        existing_access = ba_res.scalars().all()
        existing_bids = {ba.branchId for ba in existing_access}
        new_bids = set(data.branchIds)
        
        bids_to_remove = existing_bids - new_bids
        bids_to_add = new_bids - existing_bids
        
        if bids_to_remove:
            del_stmt = delete(UserBranchAccess).where(
                UserBranchAccess.userId == user.id,
                UserBranchAccess.branchId.in_(bids_to_remove)
            )
            await db.execute(del_stmt)
            
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

    await db.commit()
    # await db.refresh(user)
    logger.info(
        "Staff '%s' updated by '%s' (caller_role=%s)",
        user.username, caller_username, caller_role
    )
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff(
    user_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner),   # OWNER only for deletions
):
    """Delete a staff member. Only gym OWNERs can remove staff.

    SEC-V-08: Immediately revokes all active RefreshTokens for the deleted user
    so they cannot obtain new JWTs after deletion. Their current access token
    (max 30-min lifetime) will still be valid until expiry, but cannot be renewed.
    """
    stmt = select(User).where(
        User.id == user_id,
        User.gymId == current_gym.id,
        User.isActive == True
    )
    result = await db.execute(stmt)
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")

    from datetime import datetime, timezone
    user.isActive = False
    user.deletedAt = datetime.now(timezone.utc)

    # Remove their branch access immediately
    await db.execute(delete(UserBranchAccess).where(UserBranchAccess.userId == user.id))

    # SEC-V-08: Revoke all active refresh tokens so they cannot obtain new JWTs.
    # Their current access token (30-min TTL) will expire naturally.
    rt_result = await db.execute(
        update(RefreshToken).where(
            RefreshToken.userId == user.id,
            RefreshToken.isRevoked == False,
        ).values(isRevoked=True)
    )
    revoked_count = rt_result.rowcount

    from core.audit_utils import log_audit
    log_audit(db, current_gym.id, "Staff", user.id, "DELETE",
              {"username": user.username, "role": user.role},
              current_gym.username)

    await db.commit()
    logger.info(
        "Staff '%s' (id=%s) deleted by gym %s — %d refresh token(s) revoked (SEC-V-08).",
        user.username, user.id, current_gym.id, revoked_count,
    )
    return None
