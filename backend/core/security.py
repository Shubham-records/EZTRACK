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
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({
        "exp": expire,
        "iss": JWT_ISSUER,   # SEC-NEW-02: issuer claim
        "aud": JWT_AUDIENCE, # SEC-NEW-02: audience claim
    })
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt
