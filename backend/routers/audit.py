import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
import random
import os

from core.database import get_db
from core.dependencies import get_current_gym, require_owner
from models.all_models import Gym, Member, ProteinStock, Expense, Invoice, AuditLog

from core.audit_utils import log_audit  # imported if needed
from core.rate_limit import rate_limit
router = APIRouter()



@router.get("/")
def get_audit_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    limit: int = 100,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """
    Get audit logs with optional filtering.
    ARCH-13: Date range is applied automatically. Defaults to last 7 days.
    Maximum window is 30 days to prevent full-table scans.
    """
    from datetime import timezone

    now = datetime.now(tz=timezone.utc)
    DEFAULT_DAYS = 7
    MAX_DAYS = 30

    if since:
        try:
            since_dt = datetime.fromisoformat(since).replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid 'since' date. Use YYYY-MM-DD.")
    else:
        since_dt = now - timedelta(days=DEFAULT_DAYS)

    if until:
        try:
            until_dt = datetime.fromisoformat(until).replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid 'until' date. Use YYYY-MM-DD.")
    else:
        until_dt = now

    if (until_dt - since_dt).days > MAX_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Date range cannot exceed {MAX_DAYS} days. Narrow the window with since/until."
        )

    limit = min(limit, 500)

    query = db.query(AuditLog).filter(
        AuditLog.gymId == current_gym.id,
        AuditLog.createdAt >= since_dt,
        AuditLog.createdAt <= until_dt,
    )

    if entity_type:
        query = query.filter(AuditLog.entityType == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entityId == entity_id)
    if action:
        query = query.filter(AuditLog.action == action)

    logs = query.order_by(AuditLog.createdAt.desc()).limit(limit).all()

    return [
        {
            'id': log.id,
            'entityType': log.entityType,
            'entityId': log.entityId,
            'action': log.action,
            'changes': log.changes,
            'userName': log.userName,
            'createdAt': log.createdAt.isoformat() if log.createdAt else None
        }
        for log in logs
    ]



@router.get("/entity-types")
def get_entity_types():
    """Get list of auditable entity types."""
    return ["Member", "ProteinStock", "Invoice", "Expense", "GymSettings"]


@router.get("/price-history/{protein_id}")
def get_price_history(
    protein_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get price change history for a protein product."""
    # SEC-06: Verify the protein belongs to the requesting gym (IDOR prevention)
    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id
    ).first()
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")

    logs = db.query(AuditLog).filter(
        AuditLog.gymId == current_gym.id,
        AuditLog.entityType == "ProteinStock",
        AuditLog.entityId == protein_id,
        AuditLog.action == "UPDATE"
    ).order_by(AuditLog.createdAt.desc()).all()
    
    price_changes = []
    for log in logs:
        if log.changes:
            price_fields = ['SellingPrice', 'LandingPrice', 'MarginPrice', 'OfferPrice', 'MRPPrice']
            changed_prices = [f for f in price_fields if f in log.changes]
            if changed_prices:
                price_changes.append({
                    'date': log.createdAt.isoformat() if log.createdAt else None,
                    'changedFields': changed_prices,
                    'changes': {k: log.changes[k] for k in changed_prices},
                    'userName': log.userName
                })
    
    return price_changes


