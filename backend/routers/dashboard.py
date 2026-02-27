"""
routers/dashboard.py — Dashboard Stats, Alerts, SSE Stream
============================================================
All dashboard-related endpoints in one file.

SSE (Server-Sent Events) replaces APScheduler background job:
  - GET  /api/dashboard/stream            → push stats every 60s while client is connected
  - GET  /api/dashboard/stats             → one-shot stats (for fallback / initial load)
  - GET  /api/dashboard/alerts            → member expiry + low stock alerts
  - GET  /api/dashboard/stock-alerts      → detailed lot-level stock alerts
  - GET  /api/dashboard/recent-activity   → latest invoices + members
  - POST /api/dashboard/reconcile-payments → on-demand paidAmount drift correction (ARCH-03)

Nginx / reverse-proxy config for SSE:
    proxy_buffering          off;
    proxy_cache              off;
    proxy_read_timeout       3600s;
    proxy_set_header         Connection '';
    chunked_transfer_encoding on;
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta, date

from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from core.database import get_db, SessionLocal
from core.dependencies import get_current_gym
from core.cache import get_gym_settings
from models.all_models import (
    Gym, Member, Invoice, ProteinStock, ProteinLot, Expense, GymSettings, GymDailySummary
)

logger = logging.getLogger(__name__)
router = APIRouter()

SSE_INTERVAL_SECONDS = 60   # Push every 1 minute


# ─── Shared stats computation ────────────────────────────────────────────────
# Used by both /stats (one-shot) and /stream (SSE). Kept as a plain function
# so it can be called directly in sync routes OR via asyncio.to_thread in SSE.

def _compute_stats(gym_id: str, db: Session) -> dict:
    """Compute all dashboard stats for a gym using the provided session."""
    today       = datetime.now().date()
    today_start = datetime.combine(today, datetime.min.time())
    week_start  = datetime.combine(today - timedelta(days=today.weekday()), datetime.min.time())
    month_start = datetime.combine(today.replace(day=1), datetime.min.time())
    week_end    = today + timedelta(days=7)

    active_members = db.query(func.count(Member.id)).filter(
        Member.gymId == gym_id,
        Member.computed_status == "Active",
        Member.isDeleted == False,
    ).scalar() or 0

    expiring_today = db.query(func.count(Member.id)).filter(
        Member.gymId == gym_id,
        Member.MembershipExpiryDate == today,
        Member.isDeleted == False,
    ).scalar() or 0

    expiring_this_week = db.query(func.count(Member.id)).filter(
        Member.gymId == gym_id,
        Member.MembershipExpiryDate >= today,
        Member.MembershipExpiryDate <= week_end,
        Member.computed_status == "Active",
        Member.isDeleted == False,
    ).scalar() or 0

    today_collection = db.query(func.sum(Invoice.total)).filter(
        Invoice.gymId == gym_id,
        Invoice.invoiceDate >= today_start,
        Invoice.isDeleted == False,
    ).scalar() or 0.0

    week_collection = db.query(func.sum(Invoice.total)).filter(
        Invoice.gymId == gym_id,
        Invoice.invoiceDate >= week_start,
        Invoice.isDeleted == False,
    ).scalar() or 0.0

    month_collection = db.query(func.sum(Invoice.total)).filter(
        Invoice.gymId == gym_id,
        Invoice.invoiceDate >= month_start,
        Invoice.isDeleted == False,
    ).scalar() or 0.0

    pending_balance = db.query(
        func.sum(Invoice.total - func.coalesce(Invoice.paidAmount, 0))
    ).filter(
        Invoice.gymId == gym_id,
        Invoice.status.in_(["PENDING", "PARTIAL"]),
        Invoice.isDeleted == False,
    ).scalar() or 0.0

    month_expenses = db.query(func.sum(Expense.amount)).filter(
        Expense.gymId == gym_id,
        Expense.date >= month_start.date(),
    ).scalar() or 0.0

    today_expenses = db.query(func.sum(Expense.amount)).filter(
        Expense.gymId == gym_id,
        Expense.date == today,
    ).scalar() or 0.0

    settings        = get_gym_settings(gym_id, db)
    default_thresh  = (getattr(settings, "lowStockThreshold", None) or 5)

    low_stock_count = db.query(func.count(ProteinLot.id)).join(
        ProteinStock, ProteinLot.proteinId == ProteinStock.id
    ).filter(
        ProteinLot.gymId == gym_id,
        ProteinLot.quantity < func.coalesce(ProteinStock.StockThreshold, default_thresh),
    ).scalar() or 0

    return {
        "activeMembers":    active_members,
        "expiringToday":    expiring_today,
        "expiringThisWeek": expiring_this_week,
        "todayCollection":  round(float(today_collection), 2),
        "weekCollection":   round(float(week_collection), 2),
        "monthCollection":  round(float(month_collection), 2),
        "pendingBalance":   round(float(pending_balance), 2),
        "todayExpenses":    round(float(today_expenses), 2),
        "monthExpenses":    round(float(month_expenses), 2),
        "netProfit":        round(float(month_collection) - float(month_expenses), 2),
        "lowStockItems":    low_stock_count,
        "lastUpdated":      datetime.now().isoformat(),
    }


def _compute_stats_new_session(gym_id: str) -> dict:
    """
    Same as _compute_stats but opens its own DB session.
    Used only by the SSE generator (runs in a thread pool via asyncio.to_thread).
    """
    db = SessionLocal()
    try:
        return _compute_stats(gym_id, db)
    finally:
        db.close()


# ─── SSE stream ───────────────────────────────────────────────────────────────

@router.get("/stream")
async def dashboard_stream(current_gym: Gym = Depends(get_current_gym)):
    """
    SSE endpoint — push fresh dashboard stats every 60 seconds.
    Replaces APScheduler. Only runs for gyms actively on the dashboard.

    Frontend usage:
        const es = new EventSource('/api/dashboard/stream', { withCredentials: true });
        es.onmessage = (e) => updateDashboard(JSON.parse(e.data));
        es.onerror = () => es.close();
    """
    gym_id = current_gym.id

    async def event_generator():
        try:
            # Push immediately on connect — no 60s wait on page load
            stats = await asyncio.to_thread(_compute_stats_new_session, gym_id)
            yield f"data: {json.dumps(stats)}\n\n"

            while True:
                await asyncio.sleep(SSE_INTERVAL_SECONDS)
                stats = await asyncio.to_thread(_compute_stats_new_session, gym_id)
                yield f"data: {json.dumps(stats)}\n\n"

        except asyncio.CancelledError:
            logger.debug("SSE stream closed for gym %s", gym_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "Connection":        "keep-alive",
            "X-Accel-Buffering": "no",   # disable nginx response buffering
        },
    )


# ─── One-shot stats (fallback / initial load) ─────────────────────────────────

@router.get("/stats")
def get_dashboard_stats(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    """One-shot stats endpoint. Use /stream for live updates."""
    return _compute_stats(current_gym.id, db)


# ─── Alerts ──────────────────────────────────────────────────────────────────

@router.get("/alerts")
def get_dashboard_alerts(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    """Member expiry + low stock + overdue balance alerts."""
    today    = datetime.now().date()
    alerts   = []
    settings = get_gym_settings(current_gym.id, db)

    default_stock_threshold = settings.lowStockThreshold if settings else 0
    expiry_range  = (settings.expiryRange or 0) if settings else 0
    grace_period  = (settings.postExpiryGraceDays or 30) if settings else 30

    # 1. Member expiry alerts
    grace_cutoff = today - timedelta(days=grace_period)
    alert_end    = today + timedelta(days=expiry_range)
    members = db.query(Member).filter(
        Member.gymId == current_gym.id,
        Member.NextDuedate.isnot(None),
        Member.NextDuedate >= grace_cutoff,
        Member.NextDuedate <= alert_end,
        Member.isDeleted == False,
    ).all()

    for m in members:
        if not m.NextDuedate:
            continue
        try:
            days_diff = (m.NextDuedate - today).days
            if days_diff < 0:
                msg, severity = f"Expired {abs(days_diff)} days ago", "high"
            elif days_diff == 0:
                msg, severity = "Expires today", "high"
            else:
                msg = f"Expires in {days_diff} days"
                severity = "high" if days_diff <= 3 else "medium"
            alerts.append({
                "type": "expiry", "severity": severity,
                "title": f"{m.Name}: {msg}",
                "entityId": m.id, "entityType": "member_expiry",
            })
        except Exception:
            continue

    # 2. Low stock — SQL aggregate, no Python loop over all proteins (ARCH-02 fix)
    from sqlalchemy import func
    low_stock_proteins = db.query(
        ProteinStock.id,
        ProteinStock.ProductName,
        ProteinStock.Brand,
        ProteinStock.Quantity,
        ProteinStock.StockThreshold,
    ).filter(
        ProteinStock.gymId == current_gym.id,
        ProteinStock.Quantity < func.coalesce(ProteinStock.StockThreshold, default_stock_threshold),
    ).all()
    for p in low_stock_proteins:
        qty = p.Quantity or 0
        threshold = p.StockThreshold or default_stock_threshold
        name = p.ProductName or p.Brand or "Unknown"
        alerts.append({
            "type": "low_stock", "severity": "medium",
            "title": f"{name} is low ({qty} remaining)",
            "entityId": p.id, "entityType": "protein",
        })

    # 3. Overdue pending balances
    pending = db.query(Invoice).filter(
        Invoice.gymId == current_gym.id,
        Invoice.status.in_(["PENDING", "PARTIAL"]),
        Invoice.dueDate < today,
        Invoice.isDeleted == False,
    ).all()
    for pb in pending:
        balance = float(pb.total or 0) - float(pb.paidAmount or 0)
        alerts.append({
            "type": "overdue_balance", "severity": "high",
            "title": f"Overdue ₹{balance:.0f} ({pb.customerName or 'Customer'})",
            "entityId": pb.id, "entityType": "pending_balance",
        })

    alerts.sort(key=lambda x: 0 if x["severity"] == "high" else 1)
    return {"count": len(alerts), "alerts": alerts[:20]}


# ─── Recent activity ──────────────────────────────────────────────────────────

@router.get("/recent-activity")
def get_recent_activity(
    limit: int = 10,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    activities = []

    recent_invoices = db.query(Invoice).filter(
        Invoice.gymId == current_gym.id,
        Invoice.isDeleted == False,
    ).order_by(Invoice.createdAt.desc()).limit(limit).all()
    for inv in recent_invoices:
        activities.append({
            "type": "invoice",
            "title": f"Invoice for {inv.customerName or 'Customer'}",
            "amount": float(inv.total or 0),
            "timestamp": inv.createdAt.isoformat() if inv.createdAt else None,
            "entityId": inv.id,
        })

    recent_members = db.query(Member).filter(
        Member.gymId == current_gym.id,
        Member.isDeleted == False,
    ).order_by(Member.createdAt.desc()).limit(limit).all()
    for m in recent_members:
        activities.append({
            "type": "member",
            "title": f"New member: {m.Name}",
            "amount": m.LastPaymentAmount,
            "timestamp": m.createdAt.isoformat() if m.createdAt else None,
            "entityId": m.id,
        })

    activities.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
    return activities[:limit]


# ─── Stock alerts ─────────────────────────────────────────────────────────────

@router.get("/stock-alerts")
def get_dashboard_stock_alerts(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    settings = get_gym_settings(current_gym.id, db)
    default_threshold      = settings.lowStockThreshold if settings else 5
    expiry_warning_days    = (settings.expiryWarningDays or 30) if settings else 30

    today    = datetime.now().date()
    lots     = db.query(ProteinLot).filter(ProteinLot.gymId == current_gym.id).all()
    proteins = {p.id: p for p in db.query(ProteinStock).filter(ProteinStock.gymId == current_gym.id).all()}

    low_stock_lots = []
    expiring_lots  = []

    for lot in lots:
        protein = proteins.get(lot.proteinId)
        if not protein:
            continue

        threshold = protein.StockThreshold or default_threshold
        flavor    = f" - {protein.Flavour}" if protein.Flavour else ""
        full_name = f"{protein.ProductName or protein.Brand or 'Unknown'}{flavor}"

        if lot.quantity is not None and lot.quantity < threshold:
            low_stock_lots.append({
                "lotId": lot.id, "lotNumber": lot.lotNumber,
                "productName": full_name,
                "quantity": lot.quantity, "threshold": threshold,
                "sellingPrice": lot.sellingPrice or protein.SellingPrice or 0,
            })

        if lot.expiryDate:
            try:
                days_to_expiry = (lot.expiryDate - today).days
                if days_to_expiry <= expiry_warning_days:
                    expiring_lots.append({
                        "lotId": lot.id, "lotNumber": lot.lotNumber,
                        "productName": full_name,
                        "expiryDate": lot.expiryDate.strftime("%d/%m/%Y"),
                        "daysToExpiry": days_to_expiry,
                        "quantity": lot.quantity,
                    })
            except (TypeError, AttributeError):
                pass

    expiring_lots.sort(key=lambda x: x["daysToExpiry"])
    return {"lowStock": low_stock_lots, "expiring": expiring_lots}


# ─── Payment reconciliation (ARCH-03, on-demand) ─────────────────────────────

@router.post("/reconcile-payments", status_code=status.HTTP_200_OK)
def reconcile_payments(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    """
    ARCH-03: Detect and fix Invoice.paidAmount drift vs SUM(PaymentEvent.amount).
    Scoped to the current gym — never touches other gyms' data.
    Call this manually when you suspect payment inconsistencies.
    """
    rows = db.execute(text("""
        SELECT i.id, i."paidAmount",
               COALESCE(SUM(pe.amount), 0) AS actual_paid
        FROM "Invoice" i
        LEFT JOIN "PaymentEvent" pe ON pe."invoiceId" = i.id
        WHERE i."gymId" = :gym_id
          AND i."isDeleted" = FALSE
        GROUP BY i.id, i."paidAmount"
        HAVING ABS(i."paidAmount" - COALESCE(SUM(pe.amount), 0)) > 0.01
    """), {"gym_id": current_gym.id}).fetchall()

    corrected = []
    for row in rows:
        inv_id, stored_paid, actual_paid = row
        db.execute(
            text('UPDATE "Invoice" SET "paidAmount" = :p WHERE id = :id'),
            {"p": float(actual_paid), "id": inv_id},
        )
        corrected.append({
            "invoiceId": inv_id,
            "was": float(stored_paid),
            "correctedTo": float(actual_paid),
        })
        logger.warning(
            "Reconciliation: Invoice %s corrected %s -> %s (gym %s)",
            inv_id, stored_paid, actual_paid, current_gym.id,
        )

    db.commit()
    return {
        "corrected": len(corrected),
        "details":   corrected,
        "message":   "All invoices balanced." if not corrected else f"{len(corrected)} invoice(s) corrected.",
    }
