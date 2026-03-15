from pydantic_settings import BaseSettings, SettingsConfigDict
import os
from pydantic import field_validator

class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET_KEY: str
    JWT_SECRET_KEY_PREVIOUS: str | None = None
    ENCRYPTION_KEY: str
    ALGORITHM: str = "HS256"
    # SEC-03: Reduced from 720 (12 hours) → 30 minutes.
    # Short-lived tokens limit exposure of stolen tokens.
    # TODO Sprint 2: implement refresh tokens (SEC-03) so frontend can silently renew.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    @field_validator("ENCRYPTION_KEY")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        if len(v) != 64:
            raise ValueError("ENCRYPTION_KEY must be exactly 64 characters long.")
        try:
            bytes.fromhex(v)
        except ValueError:
            raise ValueError("ENCRYPTION_KEY must be a valid hex string.")
        return v

    model_config = SettingsConfigDict(
        env_file=(".env", "fastapi_app/.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
