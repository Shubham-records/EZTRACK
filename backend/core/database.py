from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from core.config import settings

SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL
ASYNC_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

# Only async engine ensures we don't hold synchronous connection pools hostage.

# Async engine (new)
async_engine = create_async_engine(
    ASYNC_DATABASE_URL,
    pool_size=50,           # ARCH-01: matches sync pool sizing
    max_overflow=100,
    pool_recycle=300,       # PB-02: 300 instead of 3600
    pool_pre_ping=True,
    connect_args={
        "server_settings": {"statement_timeout": "30000"},  # 30s DB side
        "command_timeout": 30                               # 30s Driver side
    }
)
AsyncSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=async_engine, class_=AsyncSession
)

Base = declarative_base()



async def get_async_db():
    async with AsyncSessionLocal() as session:
        from sqlalchemy import text
        # SW-04: Default to no-access state for connection-pool safety
        await session.execute(text("SET app.current_gym_id = ''"))
        yield session
