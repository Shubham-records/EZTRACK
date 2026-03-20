"""
core/cache.py — In-Process TTL Cache for GymSettings
======================================================
Simple in-process dict cache — no Redis needed.

At 10K DAU this reduces GymSettings DB queries from ~100,000/day to ~144/day
(one refresh per gym per 10-minute window on each worker process).

Multi-worker note: Each gunicorn/uvicorn worker has its own local in-process
cache. Invalidation is broadcast to all workers immediately via PostgreSQL
LISTEN/NOTIFY, ensuring cache consistency across the cluster without Redis.

ARCH-NEW-07 FIX: The cache now stores a plain dict snapshot, NOT the live ORM
object. Storing the ORM object caused a DetachedInstanceError risk: after the
request-scoped DB session closes (in get_db's finally block), SQLAlchemy
detaches the object. Any subsequent access to a cached ORM object in a new
request's session would fail with DetachedInstanceError if relationships are
ever accessed (e.g., settings.gym.gymname).

The cache returns a dict-like namespace object (_DictNamespace) that supports
attribute-style access (settings.admissionExpiryDays) for backward compat.

Usage
-----
    from core.cache import get_async_gym_settings, invalidate_gym_settings
    from core.database import get_async_db

    async def update_handler(current_gym, db: AsyncSession):
        settings = await get_async_gym_settings(current_gym.id, db)   # in any router
        # ... modify settings ...
        await invalidate_gym_settings(current_gym.id)                # after PUT /settings
"""

import logging
from datetime import datetime
from threading import Lock
from types import SimpleNamespace

from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

logger = logging.getLogger(__name__)

# ─── Configuration ────────────────────────────────────────────────────────────

TTL_SECONDS = 600   # 10 minutes — safe for GymSettings
MAX_CACHE_SIZE = 500  # Max number of gyms to keep in memory (LRU)

# ─── Internal State ───────────────────────────────────────────────────────────

from collections import OrderedDict

class LRUTTLCache:
    def __init__(self, maxsize=MAX_CACHE_SIZE, ttl=TTL_SECONDS):
        self.cache = OrderedDict()
        self.maxsize = maxsize
        self.ttl = ttl
        
    def get(self, key):
        if key in self.cache:
            entry = self.cache[key]
            age = (datetime.now() - entry["ts"]).total_seconds()
            if age < self.ttl:
                # Move to end (most recently used)
                self.cache.move_to_end(key)
                return entry
            else:
                self.cache.pop(key, None)
        return None
        
    def set(self, key, value):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.maxsize:
            # Evict oldest (least recently used)
            self.cache.popitem(last=False)
            
    def pop(self, key, default=None):
        return self.cache.pop(key, default)
        
    def clear(self):
        self.cache.clear()

    def get_all_entries(self):
        return list(self.cache.items())

    def __len__(self):
        return len(self.cache)

_settings_cache = LRUTTLCache()
_lock = Lock()               # thread-safe writes


def _orm_to_dict(settings) -> dict:
    """Convert a GymSettings ORM object to a plain dict snapshot."""
    return {c.name: getattr(settings, c.name) for c in settings.__table__.columns}


def _dict_to_namespace(d: dict) -> SimpleNamespace:
    """
    Wrap a plain dict in a SimpleNamespace so callers can use attribute access
    (settings.admissionExpiryDays) instead of dict access (settings['admissionExpiryDays']).
    This maintains backward compatibility with all router code.
    """
    return SimpleNamespace(**d)


# ─── Public API ───────────────────────────────────────────────────────────────

def get_gym_settings(gym_id: str, db: Session):
    """
    Return GymSettings for the given gym_id as a SimpleNamespace (attribute-accessible).
    Serves from cache if the entry is fresher than TTL_SECONDS.
    Creates default settings if none exist for this gym.

    ARCH-NEW-07: Returns a SimpleNamespace wrapping a plain dict snapshot.
    The ORM object is NOT cached — only its column values are snapshotted at
    query time. This prevents DetachedInstanceError when the DB session closes.
    """
    with _lock:
        cached = _settings_cache.get(gym_id)
        if cached:
            age = (datetime.now() - cached["ts"]).total_seconds()
            if age < TTL_SECONDS:
                return _dict_to_namespace(cached["data"])

    # Cache miss — hit the database
    from models.all_models import GymSettings
    settings = db.query(GymSettings).filter(GymSettings.gymId == gym_id).first()

    if not settings:
        # Auto-create defaults (idempotent — unique constraint on gymId protects
        # against race on very first request)
        settings = GymSettings(gymId=gym_id)
        db.add(settings)
        try:
            db.commit()
            db.refresh(settings)
        except Exception:
            db.rollback()
            settings = db.query(GymSettings).filter(GymSettings.gymId == gym_id).first()
            if not settings:
                # If gymId is invalid or insertion failed for another reason, 
                # fallback to in-memory default to prevent crashing.
                from schemas.settings import GymSettingsBase
                try:
                    defaults = GymSettingsBase().model_dump()
                except Exception:
                    defaults = GymSettingsBase().dict()
                settings = GymSettings(gymId=gym_id, **defaults)

    # ARCH-NEW-07: Store plain dict snapshot — NOT the live ORM object
    data_snapshot = _orm_to_dict(settings)
    with _lock:
        _settings_cache.set(gym_id, {"data": data_snapshot, "ts": datetime.now()})

    logger.debug("GymSettings cache miss for gym %s — refreshed from DB", gym_id)
    return _dict_to_namespace(data_snapshot)


async def get_async_gym_settings(gym_id: str, db: AsyncSession):
    """
    Async equivalent of get_gym_settings.
    """
    with _lock:
        cached = _settings_cache.get(gym_id)
        if cached:
            age = (datetime.now() - cached["ts"]).total_seconds()
            if age < TTL_SECONDS:
                return _dict_to_namespace(cached["data"])

    from models.all_models import GymSettings
    settings_stmt = select(GymSettings).where(GymSettings.gymId == gym_id)
    settings_res = await db.execute(settings_stmt)
    settings = settings_res.scalars().first()

    if not settings:
        settings = GymSettings(gymId=gym_id)
        db.add(settings)
        try:
            await db.commit()
            # await db.refresh(settings)  # not strictly needed here since we only read columns we set
        except Exception:
            await db.rollback()
            retry_stmt = select(GymSettings).where(GymSettings.gymId == gym_id)
            retry_res = await db.execute(retry_stmt)
            settings = retry_res.scalars().first()
            if not settings:
                from schemas.settings import GymSettingsBase
                try:
                    defaults = GymSettingsBase().model_dump()
                except Exception:
                    defaults = GymSettingsBase().dict()
                settings = GymSettings(gymId=gym_id, **defaults)

    data_snapshot = _orm_to_dict(settings)
    with _lock:
        _settings_cache.set(gym_id, {"data": data_snapshot, "ts": datetime.now()})

    logger.debug("GymSettings cache miss for gym %s — refreshed from Async DB", gym_id)
    return _dict_to_namespace(data_snapshot)


def _invalidate_local(gym_id: str) -> None:
    """Internal helper to drop a cache entry without broadcasting."""
    with _lock:
        dropped = _settings_cache.pop(gym_id, None)
    if dropped:
        logger.debug("GymSettings cache invalidated locally for gym %s", gym_id)


async def _broadcast_invalidation(gym_id: str) -> None:
    """Send a NOTIFY signal to PostgreSQL to invalidate this gym's cache on all workers."""
    from core.database import async_engine
    from sqlalchemy import text
    try:
        # Use a fresh connection to send the notification
        async with async_engine.connect() as conn:
            # PostgreSQL NOTIFY channel 'gym_settings_changed'
            await conn.execute(text(f"NOTIFY gym_settings_changed, '{gym_id}'"))
            await conn.commit()
        logger.debug("Broadcasted cache invalidation for gym %s", gym_id)
    except Exception as exc:
        logger.error("Failed to broadcast cache invalidation for gym %s: %s", gym_id, exc)


async def invalidate_gym_settings(gym_id: str) -> None:
    """
    Remove the cached GymSettings for a gym and notify all other worker processes.
    Call this immediately after a successful PUT /settings.
    """
    _invalidate_local(gym_id)
    await _broadcast_invalidation(gym_id)


async def gym_settings_cache_listener():
    """
    Background worker that listens for 'gym_settings_changed' signals via Postgres LISTEN/NOTIFY.
    This ensures that when one worker updates settings, all other workers invalidate their
    local in-process cache immediately instead of waiting for 10-minute TTL.
    """
    import asyncpg
    import asyncio
    from core.config import settings

    # Raw asyncpg connection for LISTEN (SQLAlchemy connection pooling isn't ideal for long-lived LISTEN)
    dsn = settings.DATABASE_URL
    
    while True:
        conn = None
        try:
            logger.info("Connecting to Postgres for GymSettings cache listener...")
            conn = await asyncpg.connect(dsn)
            
            def notify_callback(connection, pid, channel, payload):
                # payload is the gym_id string
                logger.info("Refreshed GymSettings for gym %s (notified by other worker)", payload)
                _invalidate_local(payload)

            await conn.add_listener('gym_settings_changed', notify_callback)
            logger.info("LISTEN 'gym_settings_changed' active.")

            # Keep the connection alive indefinitely
            while True:
                await asyncio.sleep(300)
                # Heartbeat to keep connection from being reaped by firewalls/proxies
                await conn.execute("SELECT 1")

        except asyncio.CancelledError:
            if conn:
                await conn.close()
            break
        except Exception as exc:
            logger.error("GymSettings cache listener connection lost: %s. Retrying in 10s...", exc)
            if conn:
                try:
                    await conn.close()
                except:
                    pass
            await asyncio.sleep(10)


def invalidate_all() -> None:
    """Clear the entire cache. Useful after bulk admin operations."""
    with _lock:
        _settings_cache.clear()
    logger.info("GymSettings cache fully cleared")


def cache_stats() -> dict:
    """Return cache diagnostics — call from an internal /admin/cache-stats endpoint."""
    with _lock:
        now = datetime.now()
        entries = [
            {
                "gymId": gym_id,
                "ageSeconds": int((now - v["ts"]).total_seconds()),
                "isStale": (now - v["ts"]).total_seconds() > TTL_SECONDS,
            }
            for gym_id, v in _settings_cache.get_all_entries()
        ]
    return {
        "backend": "in-process",
        "totalEntries": len(entries),
        "ttlSeconds": TTL_SECONDS,
        "entries": entries,
    }
