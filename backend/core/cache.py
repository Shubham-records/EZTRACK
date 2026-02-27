"""
core/cache.py — In-Process TTL Cache for GymSettings
======================================================
Simple in-process dict cache — no Redis needed.

At 10K DAU this reduces GymSettings DB queries from ~100,000/day to ~144/day
(one refresh per gym per 10-minute window on each worker process).

Multi-worker note: Each gunicorn/uvicorn worker has its own cache. A settings
update will take up to TTL_SECONDS to propagate to other workers (max 10 min).
This is acceptable for GymSettings — gym owners change settings infrequently.

Usage
-----
    from core.cache import get_gym_settings, invalidate_gym_settings

    settings = get_gym_settings(current_gym.id, db)   # in any router
    invalidate_gym_settings(current_gym.id)            # after PUT /settings
"""

import logging
from datetime import datetime
from threading import Lock

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ─── Configuration ────────────────────────────────────────────────────────────

TTL_SECONDS = 600   # 10 minutes — safe for GymSettings

# ─── Internal State ───────────────────────────────────────────────────────────

_settings_cache: dict = {}   # { gym_id: { "data": GymSettings, "ts": datetime } }
_lock = Lock()               # thread-safe writes


# ─── Public API ───────────────────────────────────────────────────────────────

def get_gym_settings(gym_id: str, db: Session):
    """
    Return GymSettings for the given gym_id.
    Serves from cache if the entry is fresher than TTL_SECONDS.
    Creates default settings if none exist for this gym.
    """
    with _lock:
        cached = _settings_cache.get(gym_id)
        if cached:
            age = (datetime.now() - cached["ts"]).total_seconds()
            if age < TTL_SECONDS:
                return cached["data"]

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

    with _lock:
        _settings_cache[gym_id] = {"data": settings, "ts": datetime.now()}

    logger.debug("GymSettings cache miss for gym %s — refreshed from DB", gym_id)
    return settings


def invalidate_gym_settings(gym_id: str) -> None:
    """
    Remove the cached GymSettings for a gym.
    Call this immediately after a successful PUT /settings.
    """
    with _lock:
        dropped = _settings_cache.pop(gym_id, None)
    if dropped:
        logger.debug("GymSettings cache invalidated for gym %s", gym_id)


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
            for gym_id, v in _settings_cache.items()
        ]
    return {
        "backend": "in-process",
        "totalEntries": len(entries),
        "ttlSeconds": TTL_SECONDS,
        "entries": entries,
    }
