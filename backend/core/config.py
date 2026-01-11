from pydantic_settings import BaseSettings, SettingsConfigDict
import os

class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET_KEY: str
    ENCRYPTION_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720  # 12 hours

    model_config = SettingsConfigDict(
        env_file=(".env", "fastapi_app/.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
