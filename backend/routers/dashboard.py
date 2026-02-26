from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import Dict, Any

from core.database import get_db
from core.dependencies import get_current_gym
from core.cache import get_gym_settings
from models.all_models import Gym, Member, Invoice, ProteinStock, ProteinLot, Expense, GymSettings, GymDailySummary

router = APIRouter()


@router.get("/stats")
def get_dashboard_stats(current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    today = datetime.now().date()
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today.weekday())
    month_start = today_start.replace(day=1)

    # 1. Try to fetch from GymDailySummary for today
    summary = db.query(GymDailySummary).filter(
        GymDailySummary.gymId == current_gym.id,
        GymDailySummary.summaryDate == today
    ).first()

    # Need week/month stats which span multiple days, 
    # so we still need some queries, or we aggregate summaries.
    # For now, let's keep it simple and cache what we can, compute what we must.

    # 4. Week Collection
    week_collection = db.query(func.sum(Invoice.total)).filter(
        Invoice.gymId == current_gym.id,
        Invoice.invoiceDate >= week_start
    ).scalar() or 0.0
    
    # 5. Month Collection
    month_collection = db.query(func.sum(Invoice.total)).filter(
        Invoice.gymId == current_gym.id,
        Invoice.invoiceDate >= month_start
    ).scalar() or 0.0
    
    # 8. Expiring This Week
    week_end = today + timedelta(days=7)
    expiring_this_week = db.query(Member).filter(
        Member.gymId == current_gym.id,
        Member.MembershipExpiryDate >= today,
        Member.MembershipExpiryDate <= week_end,
        Member.MembershipStatus.in_(['Active', 'active'])
    ).count()

    # 10. Month Expenses
    month_start_date = month_start.date()
    month_expenses = db.query(func.sum(Expense.amount)).filter(
        Expense.gymId == current_gym.id,
        Expense.date >= month_start_date
    ).scalar() or 0.0


    # Define a TTL (e.g., 15 minutes)
    cache_ttl = timedelta(minutes=15)
    now = datetime.now()

    if summary and summary.updatedAt and (now - summary.updatedAt) < cache_ttl:
        # We have a cached summary for today that is fresh, use its values
        active_members = summary.activeMembers
        today_expiry = summary.expiringToday
        today_collection = summary.totalIncome
        pending_balance = summary.pendingBalance
        low_stock_count = summary.lowStockCount
        today_expenses = summary.totalExpenses
    else:
        # Cache miss or expired, compute everything
        # 1. Active Members
        active_members = db.query(Member).filter(
            Member.gymId == current_gym.id,
            Member.MembershipStatus.in_(['Active', 'active'])
        ).count()
        
        # 2. Today's Expiry (members whose MembershipExpiryDate is today)
        today_expiry = db.query(Member).filter(
            Member.gymId == current_gym.id,
            Member.MembershipExpiryDate == today
        ).count()
        
        # 3. Today's Collection
        today_collection = db.query(func.sum(Invoice.total)).filter(
            Invoice.gymId == current_gym.id,
            Invoice.invoiceDate >= today_start
        ).scalar() or 0.0
        
        # 6. Pending Balance
        pending_balance = db.query(func.sum(Invoice.total - func.coalesce(Invoice.paidAmount, 0))).filter(
            Invoice.gymId == current_gym.id,
            Invoice.status.in_(['PENDING', 'PARTIAL'])
        ).scalar() or 0.0
        
        # 7. Low Stock Count (Lots)
        # FIX: use cache.py (10-min TTL) — not a raw DB query (25K hits/day bypassing cache)
        settings = get_gym_settings(current_gym.id, db)
        default_threshold = settings.lowStockThreshold if settings else 5
        
        lots = db.query(ProteinLot).filter(ProteinLot.gymId == current_gym.id).all()
        proteins = {p.id: p for p in db.query(ProteinStock).filter(ProteinStock.gymId == current_gym.id).all()}
        
        low_stock_count = 0
        for lot in lots:
            protein = proteins.get(lot.proteinId)
            if not protein:
                continue
            try:
                qty = int(lot.quantity) if lot.quantity else 0
                threshold = protein.StockThreshold or default_threshold
                if qty < threshold:
                    low_stock_count += 1
            except (ValueError, TypeError):
                pass

        # 9. Today's Expenses
        today_expenses = db.query(func.sum(Expense.amount)).filter(
            Expense.gymId == current_gym.id,
            Expense.date == today
        ).scalar() or 0.0

        if summary:
            # Update existing summary record
            summary.activeMembers = active_members
            summary.expiringToday = today_expiry
            summary.totalIncome = today_collection
            summary.pendingBalance = pending_balance
            summary.lowStockCount = low_stock_count
            summary.totalExpenses = today_expenses
            summary.updatedAt = now
        else:
            # Save the computed summary
            summary = GymDailySummary(
                gymId=current_gym.id,
                summaryDate=today,
                activeMembers=active_members,
                expiringToday=today_expiry,
                totalIncome=today_collection,
                pendingBalance=pending_balance,
                lowStockCount=low_stock_count,
                totalExpenses=today_expenses
            )
            db.add(summary)
            
        try:
            db.commit()
        except Exception as e:
            # If there's a unique constraint violation due to race condition, just rollback
            db.rollback()

    
    return {
        "activeMembers": active_members,
        "todayExpiry": today_expiry,
        "expiringThisWeek": expiring_this_week,
        "todayCollection": round(today_collection, 2),
        "weekCollection": round(week_collection, 2),
        "monthCollection": round(month_collection, 2),
        "pendingBalance": round(pending_balance, 2),
        "lowStockItems": low_stock_count,
        "todayExpenses": round(today_expenses, 2),
        "monthExpenses": round(month_expenses, 2),
        "netProfit": round(month_collection - month_expenses, 2)
    }


@router.get("/alerts")
def get_dashboard_alerts(current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Get important alerts for the dashboard."""
    today = datetime.now().date()
    
    alerts = []
    
    # FIX: use cache.py (10-min TTL) instead of raw DB query
    settings = get_gym_settings(current_gym.id, db)
    default_stock_threshold = settings.lowStockThreshold if settings else 0
    expiry_range = settings.expiryRange if settings and settings.expiryRange else 0
    grace_period = settings.postExpiryGraceDays if settings and settings.postExpiryGraceDays else 30
    
    # 1. Members Alerts
    members = db.query(Member).filter(Member.gymId == current_gym.id).all()
    
    for m in members:
        if not m.NextDuedate:
            continue
            
        try:
            due_date = m.NextDuedate  # Native Date — no parsing needed
            days_diff = (due_date - today).days
            
            if days_diff < -grace_period:
                 alerts.append({
                    "type": "overdue",
                    "severity": "high",
                    "title": f"Overdue by {abs(days_diff)} days ({m.Name})",
                    "entityId": m.id,
                    "entityType": "member_overdue"
                })
            
            elif -grace_period <= days_diff <= expiry_range:
                 if days_diff < 0:
                     msg = f"Expired {abs(days_diff)} days ago"
                     severity = "high"
                 elif days_diff == 0:
                     msg = "Expires today"
                     severity = "high"
                 else:
                     msg = f"Expires in {days_diff} days"
                     severity = "high" if days_diff <= 3 else "medium"

                 alerts.append({
                    "type": "expiry",
                    "severity": severity,
                    "title": f"{m.Name}: {msg}",
                    "entityId": m.id,
                    "entityType": "member_expiry"
                })
                
        except Exception:
            continue

    # 2. Low stock items
    proteins = db.query(ProteinStock).filter(ProteinStock.gymId == current_gym.id).all()
    for p in proteins:
        qty = p.Quantity or 0
        threshold = p.StockThreshold or default_stock_threshold
        if qty < threshold:
            alerts.append({
                "type": "low_stock",
                "severity": "medium",
                "title": f"{p.ProductName or p.Brand} is low on stock ({qty} remaining)",
                "entityId": p.id,
                "entityType": "protein"
            })
    
    # 3. Pending balances overdue (External Contacts / Other Pending)
    pending = db.query(Invoice).filter(
        Invoice.gymId == current_gym.id,
        Invoice.status.in_(['PENDING', 'PARTIAL']),
        Invoice.dueDate < today
    ).all()
    
    for pb in pending:
        balance = pb.total - (pb.paidAmount or 0)
        alerts.append({
            "type": "overdue_balance",
            "severity": "high",
            "title": f"Overdue payment of ₹{balance:.0f} ({pb.customerName or 'Customer'})",
            "entityId": pb.id,
            "entityType": "pending_balance"
        })
    
    # Sort alerts by severity (high first)
    alerts.sort(key=lambda x: 0 if x['severity'] == 'high' else 1)

    return {
        "count": len(alerts),
        "alerts": alerts[:20]  # Limit alerts
    }


@router.get("/recent-activity")
def get_recent_activity(
    limit: int = 10,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get recent activity for the dashboard."""
    activities = []
    
    # Recent invoices
    recent_invoices = db.query(Invoice).filter(
        Invoice.gymId == current_gym.id
    ).order_by(Invoice.createdAt.desc()).limit(limit).all()
    
    for inv in recent_invoices:
        activities.append({
            "type": "invoice",
            "title": f"Invoice for {inv.customerName or 'Customer'}",
            "amount": inv.total,
            "timestamp": inv.createdAt.isoformat() if inv.createdAt else None,
            "entityId": inv.id
        })
    
    # Recent members
    recent_members = db.query(Member).filter(
        Member.gymId == current_gym.id
    ).order_by(Member.createdAt.desc()).limit(limit).all()
    
    for m in recent_members:
        activities.append({
            "type": "member",
            "title": f"New member: {m.Name}",
            "amount": m.LastPaymentAmount,
            "timestamp": m.createdAt.isoformat() if m.createdAt else None,
            "entityId": m.id
        })
    
    # Sort by timestamp and return top items
    activities.sort(key=lambda x: x.get('timestamp') or '', reverse=True)
    return activities[:limit]


@router.get("/stock-alerts")
def get_dashboard_stock_alerts(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get stock alerts including low stock lots and expiring soon lots."""
    # FIX: use cache.py (10-min TTL) instead of raw DB query
    settings = get_gym_settings(current_gym.id, db)
    default_threshold = settings.lowStockThreshold if settings else 5
    expiry_warning_days = settings.expiryWarningDays if settings and settings.expiryWarningDays else 30
    
    today = datetime.now().date()
    
    # Get all lots and proteins
    lots = db.query(ProteinLot).filter(ProteinLot.gymId == current_gym.id).all()
    proteins = {p.id: p for p in db.query(ProteinStock).filter(ProteinStock.gymId == current_gym.id).all()}
    
    low_stock_lots = []
    expiring_lots = []
    
    for lot in lots:
        protein = proteins.get(lot.proteinId)
        if not protein:
            continue
            
        threshold = protein.StockThreshold or default_threshold
        
        # Determine product name
        brand_name = protein.Brand or ""
        prod_name = protein.ProductName or brand_name or "Unknown Product"
        flavor = f" - {protein.Flavour}" if protein.Flavour else ""
        full_name = f"{prod_name}{flavor}"
        
        # Low stock check
        if lot.quantity is not None and lot.quantity < threshold:
            low_stock_lots.append({
                "lotId": lot.id,
                "lotNumber": lot.lotNumber,
                "productName": full_name,
                "quantity": lot.quantity,
                "threshold": threshold,
                "sellingPrice": lot.sellingPrice or protein.SellingPrice or 0
            })
            
        # Expiry check
        if lot.expiryDate:
            try:
                days_to_expiry = (lot.expiryDate - today).days
                if days_to_expiry <= expiry_warning_days:
                    expiring_lots.append({
                        "lotId": lot.id,
                        "lotNumber": lot.lotNumber,
                        "productName": full_name,
                        "expiryDate": lot.expiryDate.strftime('%d/%m/%Y'),
                        "daysToExpiry": days_to_expiry,
                        "quantity": lot.quantity
                    })
            except (TypeError, AttributeError):
                pass
                
    # Sort expiring by days to expiry
    expiring_lots.sort(key=lambda x: x['daysToExpiry'])
    
    return {
        "lowStock": low_stock_lots,
        "expiring": expiring_lots
    }

