from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import Dict, Any

from core.database import get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, Member, Invoice

router = APIRouter()

@router.get("/stats")
def get_dashboard_stats(current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    # 1. Active Members
    active_members = db.query(Member).filter(
        Member.gymId == current_gym.id,
        Member.MembershipStatus.in_(['Active', 'active'])
    ).count()
    
    # 2. Today's Collection
    # Using Invoices
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Calculate sum of Invoice.total for today
    today_collection_query = db.query(func.sum(Invoice.total)).filter(
        Invoice.gymId == current_gym.id,
        Invoice.invoiceDate >= today_start
    )
    today_collection = today_collection_query.scalar() or 0.0
    
    return {
        "activeMembers": active_members,
        "todayExpiry": 0,
        "todayCollection": today_collection,
        "weekCollection": 0,
        "pendingBalance": 0,
        "todayRenewal": 0,
        "lastMonthRenewal": 0,
        "memberPresent": 0
    }
