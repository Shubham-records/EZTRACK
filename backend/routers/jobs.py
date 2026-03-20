"""
routers/jobs.py — SW-06: Job status polling endpoint
=====================================================
Frontend polls GET /api/jobs/{job_id} to track bulk import progress.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from models.all_models import Gym
from core.dependencies import get_current_gym
from core.job_utils import get_job, job_to_dict

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{job_id}")
async def get_job_status(
    job_id: str,
    current_gym: Gym = Depends(get_current_gym),
):
    """
    SW-06: Poll background job status.
    Returns progress, percentage complete, and final result once done.
    Scoped to the calling gym — no cross-tenant job leakage.
    """
    job = get_job(job_id, current_gym.id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    return job_to_dict(job)
