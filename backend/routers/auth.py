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

from core.database import get_db
from core.dependencies import get_current_gym
from core.security import verify_password, create_access_token, get_password_hash
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


def _create_refresh_token(
    db: Session,
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


def _revoke_all_refresh_tokens(db: Session, gym_id: str, user_id: str | None = None):
    """Revoke all outstanding refresh tokens for this gym (or user)."""
    q = db.query(RefreshToken).filter(
        RefreshToken.gymId == gym_id,
        RefreshToken.isRevoked == False,
    )
    if user_id:
        q = q.filter(RefreshToken.userId == user_id)
    q.update({"isRevoked": True}, synchronize_session=False)

_login_counter = 0
_CLEANUP_EVERY_N_LOGINS = 50


def _maybe_cleanup_tokens(db: Session) -> None:
    """Run token cleanup every N logins to prevent unbounded table growth."""
    global _login_counter
    _login_counter += 1
    if _login_counter % _CLEANUP_EVERY_N_LOGINS != 0:
        return
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=1)
    deleted = db.query(RefreshToken).filter(
        RefreshToken.expiresAt < cutoff,
    ).delete(synchronize_session=False)
    if deleted:
        logger.info("Cleaned up %d expired refresh tokens", deleted)


from core.rate_limit import rate_limit as _rate_limit


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
@router.post("/login/", include_in_schema=False)
@_rate_limit("10/minute")
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """
    Authenticate gym owner. Returns short-lived access_token + long-lived refresh_token.
    ARCH-10: Rate limited to 10 req/min/IP.
    """
    gym = db.query(Gym).filter(Gym.username == body.username, Gym.isDeleted == False).first()
    if not gym or not verify_password(body.password, gym.password):
        # SEC-03: Use generic error — don't reveal whether username exists
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    access_token = create_access_token(data={"gymId": gym.id, "username": gym.username})

    # Revoke old refresh tokens and issue a new one
    _revoke_all_refresh_tokens(db, gym.id)
    _maybe_cleanup_tokens(db)
    raw_refresh = _create_refresh_token(db, gym.id)
    db.commit()

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
def staff_login(body: StaffLoginRequest, request: Request, db: Session = Depends(get_db)):
    """
    SEC-NEW-01: Authenticate staff member. Returns JWT that includes both gymId AND userId.
    """
    gym = db.query(Gym).filter(Gym.id == body.gym_id, Gym.isDeleted == False).first()
    if not gym:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user = db.query(User).filter(
        User.gymId == gym.id,
        User.username == body.username,
        User.isActive == True
    ).first()
    
    if not user or not verify_password(body.password, user.password):
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
    _revoke_all_refresh_tokens(db, gym.id, user_id=user.id)
    raw_refresh = _create_refresh_token(db, gym.id, user_id=user.id)
    db.commit()

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
def refresh_access_token(body: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    """
    Exchange a valid refresh token for a new access token.
    SEC-12: Token family rotation with theft detection.
    If the token was already revoked (reuse attack), ALL tokens in the family are revoked.
    """
    token_hash = _hash_token(body.refresh_token)
    now = datetime.now(tz=timezone.utc)

    rt = db.query(RefreshToken).filter(
        RefreshToken.tokenHash == token_hash,
    ).first()

    if not rt:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or expired.",
        )

    # SEC-12: If this token was already revoked, it means theft — nuke the entire family
    if rt.isRevoked:
        db.query(RefreshToken).filter(
            RefreshToken.tokenFamily == rt.tokenFamily,
        ).update({"isRevoked": True}, synchronize_session=False)
        db.commit()
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

    gym = db.query(Gym).filter(Gym.id == rt.gymId, Gym.isDeleted == False).first()
    if not gym:
        raise HTTPException(status_code=401, detail="Gym not found.")

    # Rotate: revoke old token, issue new pair in the SAME family
    rt.isRevoked = True

    # If this was a staff refresh token, preserve userId in the new access token
    if rt.userId:
        user = db.query(User).filter(User.id == rt.userId, User.gymId == rt.gymId).first()
        if user:
            new_access = create_access_token(data={
                "gymId": gym.id,
                "userId": user.id,
                "username": user.username,
            })
            new_refresh_raw = _create_refresh_token(db, gym.id, user_id=user.id, token_family=rt.tokenFamily)
        else:
            new_access = create_access_token(data={"gymId": gym.id, "username": gym.username})
            new_refresh_raw = _create_refresh_token(db, gym.id, token_family=rt.tokenFamily)
    else:
        new_access = create_access_token(data={"gymId": gym.id, "username": gym.username})
        new_refresh_raw = _create_refresh_token(db, gym.id, token_family=rt.tokenFamily)

    db.commit()

    return {
        "access_token": new_access,
        "refresh_token": new_refresh_raw,
        "token_type": "bearer",
    }


@router.post("/logout")
@router.post("/logout/")
def logout(body: RefreshRequest | None = None, db: Session = Depends(get_db)):
    """
    SEC-03: Actual server-side logout — revokes the refresh token.
    If refresh_token not provided, this is a best-effort logout.
    """
    if body and body.refresh_token:
        token_hash = _hash_token(body.refresh_token)
        db.query(RefreshToken).filter(
            RefreshToken.tokenHash == token_hash
        ).update({"isRevoked": True}, synchronize_session=False)
        db.commit()

    return {"message": "Logged out successfully"}


@router.post("/signup", status_code=status.HTTP_201_CREATED)
@router.post("/signup/", status_code=status.HTTP_201_CREATED, include_in_schema=False)
@_rate_limit("5/minute")
def signup(body: SignupRequest, request: Request, db: Session = Depends(get_db)):
    """ARCH-10: Rate limited to 5 req/min/IP."""
    existing_user = db.query(Gym).filter(Gym.username == body.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered!")

    existing_email = db.query(Gym).filter(Gym.email == body.EMAILID).first()
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
    db.flush()   # get new_gym.id without committing

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

    db.commit()
    logger.info("New gym '%s' registered", new_gym.username)
    return "User registered successfully!"


@router.get("/me")
@router.get("/me/")
def get_me(current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    branches = db.query(Branch).filter(
        Branch.gymId == current_gym.id, Branch.isActive == True
    ).all()
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
