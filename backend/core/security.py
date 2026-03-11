"""
core/security.py
================
Password hashing and JWT token creation.

SEC-NEW-02: JWTs now include 'iss' (issuer) and 'aud' (audience) claims.
            jwt.decode() in core/dependencies.py validates these, ensuring
            that tokens from other services using the same secret key are rejected.
"""
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from passlib.context import CryptContext
from core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# SEC-NEW-02: Fixed issuer and audience for all tokens issued by this service.
JWT_ISSUER  = "eztrack-api"
JWT_AUDIENCE = "eztrack-client"

# SEC-V-05: Pre-computed bcrypt hash used for timing-safe login.
# When a gym or user is not found, run verify_password(input, DUMMY_HASH) to
# ensure the response time equals a real failed bcrypt comparison (~80-150ms).
# This prevents timing-based enumeration of valid usernames/gym IDs.
DUMMY_HASH = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36zLtKlIVVPdL.rXY66qIq2"


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)




def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """
    Create a signed JWT access token.

    SEC-NEW-02: Injects 'iss' (issuer) and 'aud' (audience) claims so that
    tokens from this service cannot be accepted by a different service
    even if they share the same JWT_SECRET_KEY.
    """
    to_encode = data.copy()
    from datetime import datetime, timezone
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({
        "exp": expire,
        "iss": JWT_ISSUER,   # SEC-NEW-02: issuer claim
        "aud": JWT_AUDIENCE, # SEC-NEW-02: audience claim
    })
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> dict:
    """
    Decode a JWT access token. 
    SEC-V-06: Evaluates against JWT_SECRET_KEY first. If signature fails,
    tries JWT_SECRET_KEY_PREVIOUS to support key rotation without invalidating
    all active sessions simultaneously.
    """
    algorithms = [settings.ALGORITHM]
    kwargs = {
        "audience": JWT_AUDIENCE,
        "issuer": JWT_ISSUER
    }
    
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=algorithms, **kwargs)
    except jwt.JWTError as e:
        if settings.JWT_SECRET_KEY_PREVIOUS:
            try:
                return jwt.decode(token, settings.JWT_SECRET_KEY_PREVIOUS, algorithms=algorithms, **kwargs)
            except jwt.JWTError:
                raise e
        raise e
