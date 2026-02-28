"""
core/dependencies.py — FastAPI dependency injection
=====================================================
SEC-01 / SEC-02: RBAC dependencies added.
  - get_current_gym()   — validates JWT, returns Gym object (unchanged)
  - get_current_user()  — extracts calling User (staff) if present in JWT; falls
                          back to gym-owner context so existing routes are unaffected
  - require_owner()     — raises 403 if caller is not a gym OWNER
  - require_owner_or_manager() — raises 403 if caller is below MANAGER level

Usage in routers
----------------
    from core.dependencies import get_current_gym, require_owner

    @router.delete("/{id}")
    def delete_member(id: str, current_gym: Gym = Depends(get_current_gym),
                      _=Depends(require_owner)):
        ...
"""
import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from core.database import get_db
from core.config import settings
from core.security import JWT_AUDIENCE  # SEC-NEW-02
from models.all_models import Gym, User

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

ROLE_RANK = {"OWNER": 3, "MANAGER": 2, "STAFF": 1}


# ─── Primary gym dependency (unchanged — all existing routes use this) ─────────

def get_current_gym(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Gym:
    """
    Decode the JWT, validate the gymId, and return the Gym entity.
    Used by every authenticated route.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # SEC-NEW-02: Validate audience claim — rejects tokens from other services
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            audience=JWT_AUDIENCE,
        )
        gymId: str = payload.get("gymId")
        if gymId is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    gym = db.query(Gym).filter(Gym.id == gymId, Gym.isDeleted == False).first()
    if gym is None:
        raise credentials_exception
    return gym


# ─── Token payload extractor ──────────────────────────────────────────────────

def _decode_payload(token: str) -> dict:
    """Decode JWT and return payload dict; raises 401 on failure.
    SEC-NEW-02: Validates audience claim.
    """
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            audience=JWT_AUDIENCE,   # SEC-NEW-02: reject foreign tokens
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ─── Caller identity: returns (role, username) ────────────────────────────────

def get_caller_role(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> tuple[str, str]:
    """
    Return (role, username) of the caller.
    - If token contains 'userId' → look up the User and return their role.
    - Otherwise (gym-owner token) → return ('OWNER', gym.username).
    This is the source of truth for RBAC checks.
    """
    payload = _decode_payload(token)
    gymId: str = payload.get("gymId")
    userId: str = payload.get("userId")  # staff tokens include this
    username: str = payload.get("username", "")

    if userId:
        user = db.query(User).filter(
            User.id == userId, User.gymId == gymId
        ).first()
        if user:
            return (user.role or "STAFF", user.username)
        # token has userId but no DB record → treat as STAFF for safety
        return ("STAFF", username)

    # Gym-owner token — no userId in payload
    gym = db.query(Gym).filter(Gym.id == gymId, Gym.isDeleted == False).first()
    if not gym:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
    return ("OWNER", gym.username)


# ─── RBAC gate dependencies ───────────────────────────────────────────────────

def require_owner(
    caller: tuple = Depends(get_caller_role),
) -> None:
    """
    Dependency that blocks non-OWNER callers with HTTP 403.
    Inject with: _rbac=Depends(require_owner)
    """
    role, _ = caller
    if ROLE_RANK.get(role, 0) < ROLE_RANK["OWNER"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner access required",
        )


def require_owner_or_manager(
    caller: tuple = Depends(get_caller_role),
) -> None:
    """
    Dependency that blocks STAFF-only callers.
    OWNERs and MANAGERs pass through.
    """
    role, _ = caller
    if ROLE_RANK.get(role, 0) < ROLE_RANK["MANAGER"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manager or Owner access required",
        )
