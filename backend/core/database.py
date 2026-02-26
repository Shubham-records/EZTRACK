from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from core.config import settings

SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL
ASYNC_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

# Sync engine (legacy)
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=20,           # Base connections (handles normal load)
    max_overflow=30,        # Burst connections (handles peak load)
    pool_timeout=30,        # Seconds to wait for a connection from pool
    pool_recycle=3600,      # Recycle connections after 1 hour (prevents stale connections)
    pool_pre_ping=True,     # Validate connections before use (handles dropped connections)
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Async engine (new)
async_engine = create_async_engine(
    ASYNC_DATABASE_URL,
    pool_size=20,
    max_overflow=30,
    pool_recycle=3600,
    pool_pre_ping=True,
)
AsyncSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=async_engine, class_=AsyncSession
)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

async def get_async_db():
    async with AsyncSessionLocal() as session:
        yield session
