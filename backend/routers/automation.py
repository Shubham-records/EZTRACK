from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import Optional
from datetime import datetime, timedelta
import urllib.parse

from core.database import get_async_db  # RD-01: removed unused sync get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, Member, ProteinStock, Invoice

router = APIRouter()


@router.get("/expiring-memberships")
async def get_expiring_memberships(
    days: int = 7,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get memberships expiring within the specified days."""
    today = datetime.now().date()
    end_date = today + timedelta(days=days)

    # SW-08: Use stored column for index-backed filtering
    stmt = select(Member).where(
        Member.gymId == current_gym.id,
        Member.status_computed == "Active",
        Member.NextDuedate >= today,
        Member.NextDuedate <= end_date,
    )
    res = await db.execute(stmt)
    members = res.scalars().all()

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
async def get_low_stock_items(
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get products with low stock."""
    from sqlalchemy import func
    stmt = select(ProteinStock).where(
        ProteinStock.gymId == current_gym.id,
        ProteinStock.isDeleted == False,
        ProteinStock.Quantity < func.coalesce(ProteinStock.StockThreshold, 5)
    ).order_by(ProteinStock.Quantity.asc())
    
    res = await db.execute(stmt)
    proteins = res.scalars().all()

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
async def get_overdue_payments(
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get overdue pending payments. P9: Use date() comparison to avoid timezone drift."""
    # P9: dueDate is TIMESTAMPTZ — compare using today's date to avoid 5.5-hour IST offset
    today = datetime.now().date()

    stmt = select(Invoice).where(
        Invoice.gymId == current_gym.id,
        Invoice.status.in_(["PENDING", "PARTIAL"]),
        Invoice.dueDate < today,
        Invoice.isDeleted == False,
    )
    res = await db.execute(stmt)
    pending = res.scalars().all()

    return [{
        "id":         p.id,
        "entityName": p.customerName,
        "entityType": "member" if p.memberId else "external",
        "phone":      None,
        "amount":     (p.total or 0) - (p.paidAmount or 0),
        "dueDate":    str(p.dueDate) if p.dueDate else None,
    } for p in pending]


@router.get("/smart-suggestions")
async def get_smart_suggestions(
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Generate smart suggestions based on current data."""
    suggestions = []
    today = datetime.now().date()
    upcoming = today + timedelta(days=3)

    from sqlalchemy import func

    # SW-08: Use stored column for index-backed filtering
    stmt1 = select(func.count(Member.id)).where(
        Member.gymId == current_gym.id,
        Member.status_computed == "Active",
        Member.NextDuedate >= today,
        Member.NextDuedate <= upcoming,
    )
    res1 = await db.execute(stmt1)
    expiring_soon = res1.scalar() or 0

    if expiring_soon > 0:
        suggestions.append({
            "type":    "warning",
            "title":   "Memberships Expiring Soon",
            "message": f"{expiring_soon} membership(s) expiring in the next 3 days. Send renewal reminders.",
            "action":  "view_expiring",
        })

    stmt2 = select(func.count(ProteinStock.id)).where(
        ProteinStock.gymId == current_gym.id,
        ProteinStock.isDeleted == False,
        ProteinStock.Quantity < func.coalesce(ProteinStock.StockThreshold, 5)
    )
    res2 = await db.execute(stmt2)
    low_stock_count = res2.scalar() or 0

    if low_stock_count > 0:
        suggestions.append({
            "type":    "alert",
            "title":   "Low Stock Alert",
            "message": f"{low_stock_count} product(s) are running low on stock. Consider restocking.",
            "action":  "view_low_stock",
        })

    stmt3 = select(func.count(Invoice.id)).where(
        Invoice.gymId == current_gym.id,
        Invoice.status.in_(["PENDING", "PARTIAL"]),
        Invoice.dueDate < today,   # P9: today is already datetime.now().date() above
        Invoice.isDeleted == False,
    )
    res3 = await db.execute(stmt3)
    overdue = res3.scalar() or 0

    if overdue > 0:
        suggestions.append({
            "type":    "warning",
            "title":   "Overdue Payments",
            "message": f"{overdue} payment(s) are overdue. Follow up for collection.",
            "action":  "view_overdue",
        })

    return suggestions


@router.post("/bulk-whatsapp-reminder")
async def generate_bulk_whatsapp_links(
    reminder_type: str = "expiring",   # 'expiring' | 'overdue'
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Generate WhatsApp links for bulk reminders."""
    links = []

    if reminder_type == "expiring":
        today = datetime.now().date()
        end_date = today + timedelta(days=7)

        # SW-08: Use stored column for index-backed filtering
        stmt = select(Member).where(
            Member.gymId == current_gym.id,
            Member.status_computed == "Active",
            Member.NextDuedate >= today,
            Member.NextDuedate <= end_date,
        )
        res = await db.execute(stmt)
        members = res.scalars().all()

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
        from sqlalchemy.orm import joinedload
        stmt = select(Invoice).options(joinedload(Invoice.member)).where(
            Invoice.gymId == current_gym.id,
            Invoice.status.in_(["PENDING", "PARTIAL"]),
            Invoice.dueDate < datetime.now().date(),  # P9: date comparison avoids IST offset
            Invoice.isDeleted == False,
        )
        res = await db.execute(stmt)
        pending = res.scalars().all()

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
