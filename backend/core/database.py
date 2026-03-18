from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from core.config import settings

SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL
ASYNC_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

# Sync engine
# ARCH-01: Increased pool_size 20→50, max_overflow 30→100 for 10K DAU.
#          Use PgBouncer in front of PostgreSQL in production for best results.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=50,           # ARCH-01: raised from 20 — handles sustained 10K DAU
    max_overflow=100,       # ARCH-01: raised from 30 — burst headroom
    pool_timeout=30,        # Seconds to wait for a connection from pool
    pool_recycle=300,       # PB-02: Recycle connections after 5 mins (prevents stale connections)
    pool_pre_ping=True,     # Validate connections before use (handles dropped connections)
    connect_args={"options": "-c statement_timeout=30000"}  # PB-08: 30s timeout
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Async engine (new)
async_engine = create_async_engine(
    ASYNC_DATABASE_URL,
    pool_size=50,           # ARCH-01: matches sync pool sizing
    max_overflow=100,
    pool_recycle=300,       # PB-02: 300 instead of 3600
    pool_pre_ping=True,
    connect_args={"server_settings": {"statement_timeout": "30000"}}  # PB-08: asyncpg syntax
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
