"""
routers/auth.py
===============
SEC-03: Refresh token flow + revocable JWT.
  - POST /login        → returns access_token (30 min) + refresh_token (7 days)
  - POST /staff-login  → SEC-NEW-01: staff auth, JWT includes userId (makes RBAC functional)
  - POST /refresh      → exchanges refresh_token for new access_token
  - POST /logout       → revokes the refresh_token (actual server-side invalidation)
  - POST /signup       → creates gym + default branch + default WhatsApp templates
  - GET  /me           → returns current gym info

ARCH-10: Rate limiting via slowapi (applied via decorator).
  - /login       → 10 req/min/IP (brute-force protection)
  - /staff-login → 10 req/min/IP
  - /signup      → 5 req/min/IP
  - /refresh     → 30 req/min/IP
"""

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, delete

from core.database import get_async_db
from core.dependencies import get_current_gym
from core.security import verify_password, create_access_token, get_password_hash, DUMMY_HASH
from models.all_models import Gym, Branch, WhatsAppTemplate, RefreshToken, User
from schemas.auth import LoginRequest, LoginResponse, SignupRequest, RefreshRequest, StaffLoginRequest
from routers.whatsapp_templates import DEFAULT_TEMPLATES

logger = logging.getLogger(__name__)
router = APIRouter()

REFRESH_TOKEN_EXPIRE_DAYS = 7


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _hash_token(raw_token: str) -> str:
    """SHA-256 hash of refresh token (we never store the raw value)."""
    return hashlib.sha256(raw_token.encode()).hexdigest()


async def _create_refresh_token(
    db: AsyncSession,
    gym_id: str,
    user_id: str | None = None,
    token_family: str | None = None,
) -> str:
    """Generate a refresh token, store its hash in DB, return raw token.
    SEC-12: If token_family is provided, the new token inherits it (rotation).
    If None, a new family is created (fresh login).
    """
    raw = secrets.token_urlsafe(48)
    expires = datetime.now(tz=timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    rt = RefreshToken(
        gymId=gym_id,
        userId=user_id,
        tokenHash=_hash_token(raw),
        tokenFamily=token_family or str(uuid.uuid4()),
        expiresAt=expires,
    )
    db.add(rt)
    # Caller must commit
    return raw


async def _revoke_all_refresh_tokens(db: AsyncSession, gym_id: str, user_id: str | None = None):
    """Revoke all outstanding refresh tokens for this gym (or user)."""
    stmt = update(RefreshToken).where(
        RefreshToken.gymId == gym_id,
        RefreshToken.isRevoked == False,
    ).values(isRevoked=True)
    
    if user_id:
        stmt = stmt.where(RefreshToken.userId == user_id)
        
    await db.execute(stmt)

_login_counter = 0
_CLEANUP_EVERY_N_LOGINS = 50


async def _maybe_cleanup_tokens(db: AsyncSession) -> None:
    """Run token cleanup every N logins to prevent unbounded table growth."""
    global _login_counter
    _login_counter += 1
    if _login_counter % _CLEANUP_EVERY_N_LOGINS != 0:
        return
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=1)
    
    stmt = delete(RefreshToken).where(RefreshToken.expiresAt < cutoff)
    result = await db.execute(stmt)
    
    if result.rowcount:
        logger.info("Cleaned up %d expired refresh tokens", result.rowcount)


from core.rate_limit import rate_limit as _rate_limit


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
@router.post("/login/", include_in_schema=False)
@_rate_limit("10/minute")
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_async_db)):
    """
    Authenticate gym owner. Returns short-lived access_token + long-lived refresh_token.
    ARCH-10: Rate limited to 10 req/min/IP.
    SEC-V-05: Always runs bcrypt comparison regardless of whether gym exists,
    to prevent timing-based username enumeration.
    """
    stmt = select(Gym).where(Gym.username == body.username, Gym.isDeleted == False)
    result = await db.execute(stmt)
    gym = result.scalars().first()

    # SEC-V-05: Always run a bcrypt comparison to equalize response time.
    # If gym not found, verify against DUMMY_HASH (always False) — same cost as real verify.
    stored_hash = gym.password if gym else DUMMY_HASH
    password_ok = verify_password(body.password, stored_hash)

    if not gym or not password_ok:
        # SEC-03: Use generic error — don't reveal whether username exists
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    access_token = create_access_token(data={"gymId": gym.id, "username": gym.username})

    # Revoke old refresh tokens and issue a new one
    await _revoke_all_refresh_tokens(db, gym.id)
    await _maybe_cleanup_tokens(db)
    raw_refresh = await _create_refresh_token(db, gym.id)
    await db.commit()

    logger.info("Gym '%s' logged in", gym.username)
    return {
        "message": "Login successful!",
        "eztracker_jwt_access_control_token": access_token,
        "eztracker_jwt_databaseName_control_token": gym.id,
        "refresh_token": raw_refresh,
    }


@router.post("/staff-login")
@router.post("/staff-login/", include_in_schema=False)
@_rate_limit("10/minute")
async def staff_login(body: StaffLoginRequest, request: Request, db: AsyncSession = Depends(get_async_db)):
    """
    SEC-NEW-01: Authenticate staff member. Returns JWT that includes both gymId AND userId.
    SEC-V-05: Always runs bcrypt comparison regardless of whether gym/user exists.
    """
    stmt = select(Gym).where(Gym.id == body.gym_id, Gym.isDeleted == False)
    result = await db.execute(stmt)
    gym = result.scalars().first()

    user = None
    if gym:
        user_stmt = select(User).where(
            User.gymId == gym.id,
            User.username == body.username,
            User.isActive == True
        )
        user_result = await db.execute(user_stmt)
        user = user_result.scalars().first()

    # SEC-V-05: Always run bcrypt — use DUMMY_HASH when gym or user not found.
    stored_hash = user.password if user else DUMMY_HASH
    password_ok = verify_password(body.password, stored_hash)

    if not gym or not user or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    # Issue access token with userId — this is what makes RBAC work in get_caller_role()
    access_token = create_access_token(data={
        "gymId": gym.id,
        "userId": user.id,
        "username": user.username,
    })

    # Revoke old staff refresh tokens and issue a new one scoped to this user
    await _revoke_all_refresh_tokens(db, gym.id, user_id=user.id)
    raw_refresh = await _create_refresh_token(db, gym.id, user_id=user.id)
    await db.commit()

    logger.info("Staff '%s' (role=%s) logged into gym '%s'", user.username, user.role, gym.username)
    return {
        "message": "Login successful!",
        "eztracker_jwt_access_control_token": access_token,
        "eztracker_jwt_databaseName_control_token": gym.id,
        "refresh_token": raw_refresh,
        "role": user.role,
    }


@router.post("/refresh")
@_rate_limit("30/minute")
async def refresh_access_token(body: RefreshRequest, request: Request, db: AsyncSession = Depends(get_async_db)):
    """
    Exchange a valid refresh token for a new access token.
    SEC-12: Token family rotation with theft detection.
    If the token was already revoked (reuse attack), ALL tokens in the family are revoked.
    """
    token_hash = _hash_token(body.refresh_token)
    now = datetime.now(tz=timezone.utc)

    stmt = select(RefreshToken).where(RefreshToken.tokenHash == token_hash)
    result = await db.execute(stmt)
    rt = result.scalars().first()

    if not rt:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or expired.",
        )

    # SEC-12: If this token was already revoked, it means theft — nuke the entire family
    if rt.isRevoked:
        await db.execute(
            update(RefreshToken).where(
                RefreshToken.tokenFamily == rt.tokenFamily,
            ).values(isRevoked=True)
        )
        await db.commit()
        logger.warning(
            "SEC-12: Refresh token reuse detected (family=%s, gym=%s). "
            "All tokens in family revoked — possible theft.",
            rt.tokenFamily, rt.gymId,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token reuse detected. All sessions revoked — please log in again.",
        )

    # Token expired?
    if rt.expiresAt < now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired.",
        )

    gym_stmt = select(Gym).where(Gym.id == rt.gymId, Gym.isDeleted == False)
    gym_result = await db.execute(gym_stmt)
    gym = gym_result.scalars().first()
    
    if not gym:
        raise HTTPException(status_code=401, detail="Gym not found.")

    # Rotate: revoke old token, issue new pair in the SAME family
    rt.isRevoked = True

    # If this was a staff refresh token, preserve userId in the new access token
    if rt.userId:
        user_stmt = select(User).where(User.id == rt.userId, User.gymId == rt.gymId)
        user_result = await db.execute(user_stmt)
        user = user_result.scalars().first()
        
        if user:
            new_access = create_access_token(data={
                "gymId": gym.id,
                "userId": user.id,
                "username": user.username,
            })
            new_refresh_raw = await _create_refresh_token(db, gym.id, user_id=user.id, token_family=rt.tokenFamily)
        else:
            new_access = create_access_token(data={"gymId": gym.id, "username": gym.username})
            new_refresh_raw = await _create_refresh_token(db, gym.id, token_family=rt.tokenFamily)
    else:
        new_access = create_access_token(data={"gymId": gym.id, "username": gym.username})
        new_refresh_raw = await _create_refresh_token(db, gym.id, token_family=rt.tokenFamily)

    await db.commit()

    return {
        "access_token": new_access,
        "refresh_token": new_refresh_raw,
        "token_type": "bearer",
    }


@router.post("/logout")
@router.post("/logout/")
async def logout(body: RefreshRequest | None = None, db: AsyncSession = Depends(get_async_db)):
    """
    SEC-03: Actual server-side logout — revokes the refresh token.
    If refresh_token not provided, this is a best-effort logout.
    """
    if body and body.refresh_token:
        token_hash = _hash_token(body.refresh_token)
        await db.execute(
            update(RefreshToken).where(
                RefreshToken.tokenHash == token_hash
            ).values(isRevoked=True)
        )
        await db.commit()

    return {"message": "Logged out successfully"}


@router.post("/signup", status_code=status.HTTP_201_CREATED)
@router.post("/signup/", status_code=status.HTTP_201_CREATED, include_in_schema=False)
@_rate_limit("5/minute")
async def signup(body: SignupRequest, request: Request, db: AsyncSession = Depends(get_async_db)):
    """ARCH-10: Rate limited to 5 req/min/IP."""
    user_stmt = select(Gym).where(Gym.username == body.username)
    user_result = await db.execute(user_stmt)
    existing_user = user_result.scalars().first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered!")

    email_stmt = select(Gym).where(Gym.email == body.EMAILID)
    email_result = await db.execute(email_stmt)
    existing_email = email_result.scalars().first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered!")

    new_gym = Gym(
        id=str(uuid.uuid4()),
        gymname=body.GYMNAME,
        email=body.EMAILID,
        username=body.username,
        password=get_password_hash(body.password),
    )
    db.add(new_gym)
    await db.flush()   # get new_gym.id without committing

    default_branch = Branch(
        id=str(uuid.uuid4()),
        gymId=new_gym.id,
        name=body.GYMNAME,
        displayName=body.GYMNAME,
        isActive=True,
        isDefault=True,
        email=body.EMAILID,
    )
    db.add(default_branch)

    for t_type, t_msg in DEFAULT_TEMPLATES.items():
        db.add(WhatsAppTemplate(
            gymId=new_gym.id,
            templateType=t_type,
            messageTemplate=t_msg,
            isActive=True,
        ))

    await db.commit()
    logger.info("New gym '%s' registered", new_gym.username)
    return "User registered successfully!"


@router.get("/me")
@router.get("/me/")
async def get_me(current_gym: Gym = Depends(get_current_gym), db: AsyncSession = Depends(get_async_db)):
    stmt = select(Branch).where(
        Branch.gymId == current_gym.id, Branch.isActive == True
    )
    result = await db.execute(stmt)
    branches = result.scalars().all()
    branch_list = [{"id": b.id, "name": b.name, "isDefault": b.isDefault} for b in branches]
    default_branch = next((b for b in branch_list if b["isDefault"]), branch_list[0] if branch_list else None)

    return {
        "id": current_gym.id,
        "username": current_gym.username,
        "gymname": current_gym.gymname,
        "email": current_gym.email,
        "role": "OWNER",
        "branches": branch_list,
        "activeBranchId": default_branch["id"] if default_branch else None,
        "isMultiBranch": len(branch_list) > 1,
    }
