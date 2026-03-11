from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
import urllib.parse

from core.database import get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, Member, ProteinStock, Invoice

router = APIRouter()


@router.get("/expiring-memberships")
def get_expiring_memberships(
    days: int = 7,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get memberships expiring within the specified days."""
    today = datetime.now().date()
    end_date = today + timedelta(days=days)

    # FIX: filter using computed_status expression (DB-level CASE, not stored column)
    members = db.query(Member).filter(
        Member.gymId == current_gym.id,
        Member.computed_status == "Active",
        Member.NextDuedate >= today,
        Member.NextDuedate <= end_date,
    ).all()

    expiring = []
    for m in members:
        exp_date = m.NextDuedate          # Native Date — no parsing
        expiring.append({
            "id":          m.id,
            "name":        m.Name,
            "phone":       m.Mobile or m.Whatsapp,
            "expiryDate":  exp_date.strftime("%d/%m/%Y"),
            "daysLeft":    (exp_date - today).days,
            "planType":    m.PlanType,
            "planPeriod":  m.PlanPeriod,
        })

    expiring.sort(key=lambda x: x["daysLeft"])
    return expiring


@router.get("/low-stock-items")
def get_low_stock_items(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get products with low stock."""
    from sqlalchemy import func
    proteins = db.query(ProteinStock).filter(
        ProteinStock.gymId == current_gym.id,
        ProteinStock.isDeleted == False,
        ProteinStock.Quantity < func.coalesce(ProteinStock.StockThreshold, 5)
    ).order_by(ProteinStock.Quantity.asc()).all()

    low_stock = []
    for p in proteins:
        low_stock.append({
            "id":           p.id,
            "productName":  p.ProductName,
            "brand":        p.Brand,
            "currentStock": p.Quantity or 0,
            "threshold":    p.StockThreshold or 5,
            "sellingPrice": p.SellingPrice or p.LandingPrice,
        })
    return low_stock


@router.get("/overdue-payments")
def get_overdue_payments(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get overdue pending payments. P9: Use date() comparison to avoid timezone drift."""
    # P9: dueDate is TIMESTAMPTZ — compare using today's date to avoid 5.5-hour IST offset
    today = datetime.now().date()

    pending = db.query(Invoice).filter(
        Invoice.gymId == current_gym.id,
        Invoice.status.in_(["PENDING", "PARTIAL"]),
        Invoice.dueDate < today,
        Invoice.isDeleted == False,
    ).all()

    return [{
        "id":         p.id,
        "entityName": p.customerName,
        "entityType": "member" if p.memberId else "external",
        "phone":      None,
        "amount":     (p.total or 0) - (p.paidAmount or 0),
        "dueDate":    str(p.dueDate) if p.dueDate else None,
    } for p in pending]


@router.get("/smart-suggestions")
def get_smart_suggestions(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Generate smart suggestions based on current data."""
    suggestions = []
    today = datetime.now().date()
    upcoming = today + timedelta(days=3)

    # FIX: push expiry window filter to DB using computed_status expression
    expiring_soon = db.query(Member).filter(
        Member.gymId == current_gym.id,
        Member.computed_status == "Active",
        Member.NextDuedate >= today,
        Member.NextDuedate <= upcoming,
    ).count()

    if expiring_soon > 0:
        suggestions.append({
            "type":    "warning",
            "title":   "Memberships Expiring Soon",
            "message": f"{expiring_soon} membership(s) expiring in the next 3 days. Send renewal reminders.",
            "action":  "view_expiring",
        })

    from sqlalchemy import func
    low_stock_count = db.query(func.count(ProteinStock.id)).filter(
        ProteinStock.gymId == current_gym.id,
        ProteinStock.isDeleted == False,
        ProteinStock.Quantity < func.coalesce(ProteinStock.StockThreshold, 5)
    ).scalar() or 0

    if low_stock_count > 0:
        suggestions.append({
            "type":    "alert",
            "title":   "Low Stock Alert",
            "message": f"{low_stock_count} product(s) are running low on stock. Consider restocking.",
            "action":  "view_low_stock",
        })

    overdue = db.query(Invoice).filter(
        Invoice.gymId == current_gym.id,
        Invoice.status.in_(["PENDING", "PARTIAL"]),
        Invoice.dueDate < today,   # P9: today is already datetime.now().date() above
        Invoice.isDeleted == False,
    ).count()

    if overdue > 0:
        suggestions.append({
            "type":    "warning",
            "title":   "Overdue Payments",
            "message": f"{overdue} payment(s) are overdue. Follow up for collection.",
            "action":  "view_overdue",
        })

    return suggestions


@router.post("/bulk-whatsapp-reminder")
def generate_bulk_whatsapp_links(
    reminder_type: str = "expiring",   # 'expiring' | 'overdue'
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Generate WhatsApp links for bulk reminders."""
    links = []

    if reminder_type == "expiring":
        today = datetime.now().date()
        end_date = today + timedelta(days=7)

        # FIX: DB-level filter using computed_status + NextDuedate range
        members = db.query(Member).filter(
            Member.gymId == current_gym.id,
            Member.computed_status == "Active",
            Member.NextDuedate >= today,
            Member.NextDuedate <= end_date,
        ).all()

        for m in members:
            exp_date = m.NextDuedate    # Native Date
            phone = m.Mobile or m.Whatsapp
            if phone:
                phone_clean = str(phone).replace("+", "").replace(" ", "")
                if not phone_clean.startswith("91"):
                    phone_clean = "91" + phone_clean

                days_left = (exp_date - today).days
                message = (
                    f"Hi {m.Name}, your gym membership expires in {days_left} day(s) "
                    f"on {exp_date.strftime('%d/%m/%Y')}. "
                    "Please renew to continue your fitness journey! "
                    "Visit us or call for renewal."
                )
                encoded = urllib.parse.quote(message)

                links.append({
                    "name":       m.Name,
                    "phone":      str(phone),
                    "expiryDate": exp_date.strftime("%d/%m/%Y"),
                    "daysLeft":   days_left,
                    "link":       f"https://web.whatsapp.com/send?phone={phone_clean}&text={encoded}",
                })

    elif reminder_type == "overdue":
        pending = db.query(Invoice).filter(
            Invoice.gymId == current_gym.id,
            Invoice.status.in_(["PENDING", "PARTIAL"]),
            Invoice.dueDate < datetime.now().date(),  # P9: date comparison avoids IST offset
            Invoice.isDeleted == False,
        ).all()

        for p in pending:
            phone = None
            if p.member:
                phone = p.member.Mobile or p.member.Whatsapp
            if phone:
                phone_clean = str(phone).replace("+", "").replace(" ", "")
                if not phone_clean.startswith("91"):
                    phone_clean = "91" + phone_clean

                remaining = (p.total or 0) - (p.paidAmount or 0)
                message = (
                    f"Hi {p.customerName}, this is a reminder about your pending payment "
                    f"of ₹{remaining:.2f}. The due date was {p.dueDate}. "
                    "Please clear at your earliest convenience. Thank you!"
                )
                encoded = urllib.parse.quote(message)

                links.append({
                    "name":    p.customerName,
                    "phone":   str(phone),
                    "amount":  remaining,
                    "dueDate": str(p.dueDate) if p.dueDate else None,
                    "link":    f"https://web.whatsapp.com/send?phone={phone_clean}&text={encoded}",
                })

    return links
