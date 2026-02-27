import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
import random
import os

from core.database import get_db
from core.dependencies import get_current_gym, require_owner
from models.all_models import Gym, Member, ProteinStock, Expense, Invoice, AuditLog

logger = logging.getLogger(__name__)
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


# Sample data generation
SAMPLE_NAMES = [
    "Rahul Sharma", "Priya Patel", "Amit Kumar", "Sneha Gupta", "Vikram Singh",
    "Ananya Reddy", "Karan Mehta", "Pooja Verma", "Arjun Nair", "Divya Iyer",
    "Rohan Das", "Nisha Joshi", "Aditya Rao", "Megha Shah", "Sanjay Pillai",
    "Kavita Desai", "Nikhil Bose", "Ritika Malhotra", "Deepak Choudhary", "Swati Kapoor",
    "Manish Tiwari", "Anjali Mishra", "Rajesh Agarwal", "Sunita Bhatt", "Vivek Saxena"
]

PROTEIN_BRANDS = ["ON", "MyProtein", "MuscleBlaze", "Dymatize", "BSN", "MuscleTech", "GNC", "Isopure"]
PROTEIN_PRODUCTS = [
    ("Whey Protein", ["Chocolate", "Vanilla", "Strawberry", "Cookies & Cream"]),
    ("Mass Gainer", ["Chocolate", "Banana", "Vanilla"]),
    ("BCAA", ["Fruit Punch", "Watermelon", "Blue Raspberry"]),
    ("Creatine", ["Unflavored", "Lemon", "Orange"]),
    ("Pre-Workout", ["Fruit Punch", "Green Apple", "Blue Raspberry"])
]

EXPENSE_CATEGORIES = ["Rent", "Electricity", "Salaries", "Maintenance", "Supplies", "Marketing", "Equipment", "Insurance"]


@router.post("/seed-sample-data")
def seed_sample_data(
    members_count: int = 100,
    proteins_count: int = 50,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner),  # SEC-08: OWNER only
):
    """Generate sample data for testing. Requires OWNER role and ALLOW_SEED_DATA env var."""
    # SEC-08: Gate behind ALLOW_SEED_DATA env var (checked at request time)
    if not os.getenv("ALLOW_SEED_DATA", "false").lower() == "true":
        raise HTTPException(status_code=403, detail="Seed data not available in production")

    created = {"members": 0, "proteins": 0, "expenses": 0}
    
    # Generate members
    plan_types = ["Strength", "Cardio", "CrossFit", "Yoga", "Mixed"]
    plan_periods = ["Monthly", "Quarterly", "Half-Yearly", "Yearly"]
    statuses = ["Active", "Active", "Active", "Inactive", "Expired"]
    
    for i in range(members_count):
        name = random.choice(SAMPLE_NAMES) + f" {random.randint(1, 99)}"
        join_date = datetime.now() - timedelta(days=random.randint(1, 365))
        plan_period_days = {"Monthly": 30, "Quarterly": 90, "Half-Yearly": 180, "Yearly": 365}
        chosen_period = random.choice(plan_periods)
        expiry_date = join_date + timedelta(days=plan_period_days[chosen_period])
        
        member = Member(
            gymId=current_gym.id,
            Name=name,
            Gender=random.choice(["M", "F"]),
            Age=random.randint(18, 55),
            Mobile=str(9000000000 + random.randint(100000000, 999999999)),
            Whatsapp=str(9000000000 + random.randint(100000000, 999999999)),
            height=round(random.uniform(150, 190), 1),
            weight=random.randint(50, 100),
            PlanType=random.choice(plan_types),
            PlanPeriod=chosen_period,
            DateOfJoining=join_date.date(),
            MembershipExpiryDate=expiry_date.date(),
            NextDuedate=expiry_date.date(),  # computed_status reads NextDuedate
            LastPaymentAmount=random.choice([500, 1000, 1500, 2000, 2500, 3000, 5000]),
            Address=f"{random.randint(1, 500)}, Sector {random.randint(1, 50)}, City"
        )
        db.add(member)
        created["members"] += 1
    
    # Generate proteins
    for i in range(proteins_count):
        brand = random.choice(PROTEIN_BRANDS)
        product, flavours = random.choice(PROTEIN_PRODUCTS)
        landing_price = random.randint(1500, 4000)
        margin = random.randint(100, 500)
        offer = random.randint(0, 200)
        
        protein = ProteinStock(
            gymId=current_gym.id,
            Brand=brand,
            ProductName=f"{brand} {product}",
            Flavour=random.choice(flavours),
            Weight=random.choice(["1kg", "2kg", "2.5kg", "5lb"]),
            Quantity=random.randint(1, 20),
            StockThreshold=random.randint(3, 8),
            LandingPrice=float(landing_price),
            MRPPrice=float(landing_price + margin + 500),
            MarginPrice=float(margin),
            OfferPrice=float(offer),
            SellingPrice=float(landing_price + margin - offer),
            Year=str(datetime.now().year),
            Month=datetime.now().strftime("%B")
        )
        db.add(protein)
        created["proteins"] += 1
    
    # Generate expenses
    for i in range(30):
        expense_date = datetime.now() - timedelta(days=random.randint(1, 90))
        expense = Expense(
            gymId=current_gym.id,
            category=random.choice(EXPENSE_CATEGORIES),
            amount=random.randint(500, 50000),
            date=expense_date.date(),
            paymentMode=random.choice(["Cash", "UPI", "Card", "Bank Transfer"]),
            notes=f"Sample expense #{i+1}"
        )
        db.add(expense)
        created["expenses"] += 1
    
    db.commit()
    
    return {
        "success": True,
        "message": f"Generated {created['members']} members, {created['proteins']} proteins, {created['expenses']} expenses",
        "created": created
    }
