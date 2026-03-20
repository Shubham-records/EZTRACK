"""
core/job_utils.py — SW-06: In-process background job tracker
=============================================================
Tracks bulk operations that are offloaded to asyncio.create_task().
Jobs are stored in a per-process TTL dict and expire after 1 hour.

Usage in routers:
    from core.job_utils import create_job, update_job, fail_job, complete_job

    job = create_job(gym_id, "bulk_create_members", total=len(items))
    # return 202 immediately
    asyncio.create_task(_bg_worker(job.id, ...))
    return {"jobId": job.id, ...}

Frontend polls:
    GET /api/jobs/{job_id}  → { status, progress, total, result, error }
"""

import logging
import uuid
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# How long to keep completed/failed jobs before eviction
_JOB_TTL_SECONDS = 3600  # 1 hour

# Max jobs to keep in memory (prevents OOM if something goes wrong)
_MAX_JOBS = 5000


@dataclass
class Job:
    id: str
    gym_id: str
    job_type: str         # e.g. "bulk_create_members"
    status: str = "pending"  # pending → running → completed | failed
    progress: int = 0
    total: int = 0
    result: dict | None = None
    error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None


# ─── In-process store ────────────────────────────────────────────────────────
_jobs: dict[str, Job] = {}


def _evict_stale_jobs() -> None:
    """Remove expired jobs to prevent unbounded memory growth."""
    if len(_jobs) <= _MAX_JOBS // 2:
        return
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=_JOB_TTL_SECONDS)
    stale_ids = [
        jid for jid, j in _jobs.items()
        if j.status in ("completed", "failed") and j.updated_at < cutoff
    ]
    for jid in stale_ids:
        del _jobs[jid]


def create_job(gym_id: str, job_type: str, total: int = 0) -> Job:
    """Create a new pending job and return it."""
    _evict_stale_jobs()
    job = Job(
        id=str(uuid.uuid4()),
        gym_id=gym_id,
        job_type=job_type,
        total=total,
    )
    _jobs[job.id] = job
    logger.info("Job %s created: type=%s total=%d gym=%s", job.id, job_type, total, gym_id)
    return job


def update_job(job_id: str, progress: int, status: str = "running") -> None:
    """Update progress on an active job."""
    job = _jobs.get(job_id)
    if job:
        job.progress = progress
        job.status = status
        job.updated_at = datetime.now(timezone.utc)


def complete_job(job_id: str, result: dict) -> None:
    """Mark a job as completed with its result."""
    job = _jobs.get(job_id)
    if job:
        job.status = "completed"
        job.progress = job.total
        job.result = result
        job.completed_at = datetime.now(timezone.utc)
        job.updated_at = job.completed_at
        logger.info("Job %s completed: %s", job_id, result)


def fail_job(job_id: str, error: str) -> None:
    """Mark a job as failed with an error message."""
    job = _jobs.get(job_id)
    if job:
        job.status = "failed"
        job.error = error
        job.completed_at = datetime.now(timezone.utc)
        job.updated_at = job.completed_at
        logger.error("Job %s failed: %s", job_id, error)


def get_job(job_id: str, gym_id: str) -> Job | None:
    """Retrieve a job by ID, scoped to gym_id for tenant isolation."""
    job = _jobs.get(job_id)
    if job and job.gym_id == gym_id:
        return job
    return None


def job_to_dict(job: Job) -> dict[str, Any]:
    """Serialize a Job to a JSON-safe dict for API responses."""
    return {
        "jobId": job.id,
        "jobType": job.job_type,
        "status": job.status,
        "progress": job.progress,
        "total": job.total,
        "percentComplete": round((job.progress / job.total * 100) if job.total > 0 else 0, 1),
        "result": job.result,
        "error": job.error,
        "createdAt": job.created_at.isoformat(),
        "updatedAt": job.updated_at.isoformat(),
        "completedAt": job.completed_at.isoformat() if job.completed_at else None,
    }
