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

from fastapi import APIRouter, Depends, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, text

from core.database import get_async_db, AsyncSessionLocal  # RD-01: removed unused sync get_db
from core.dependencies import get_current_gym
from core.cache import get_async_gym_settings
from models.all_models import (
    Gym, Member, Invoice, ProteinStock, ProteinLot, Expense, GymSettings, GymDailySummary
)
from core.rate_limit import rate_limit
from core.alert_utils import (
    make_expiry_alert, make_low_stock_alert, make_overdue_balance_alert, sort_alerts
)

logger = logging.getLogger(__name__)
router = APIRouter()

SSE_INTERVAL_SECONDS    = 60    # Push every 1 minute
SSE_MAX_DURATION_SECONDS = 600  # P0-5: Force reconnect after 10 min — prevents zombie connections
SSE_HEARTBEAT_SECONDS    = 30   # Periodic heartbeat to detect dead connections
SSE_MAX_CONNECTIONS_PER_GYM = 50 # Fall back to polling if too many clients
_SUMMARY_STALE_SECONDS  = 300   # ARCH-NEW-02: recompute after 5 minutes


# ─── Shared stats computation ────────────────────────────────────────────────
# Used by both /stats (one-shot) and /stream (SSE). Kept as a plain function
# so it can be called directly in sync routes OR via asyncio.to_thread in SSE.

async def _compute_stats(gym_id: str, db: AsyncSession) -> dict:
    """
    ARCH-NEW-02 + PB-06: Compute dashboard stats, using GymDailySummary as a cache.

    Cache strategy:
    - Check if today's GymDailySummary row is fresh (< _SUMMARY_STALE_SECONDS old)
    - Fresh: return it directly (1 SELECT, no aggregates)
    - Stale/missing: run a SINGLE CTE that computes all 10 stats in one DB round-trip

    PB-06: All 10 aggregate values come from one SQL statement with scalar subqueries
    wrapped in a `WITH stats AS (SELECT ...)` CTE emulated via SQLAlchemy's select().
    This is equivalent to a CTE and guarantees exactly one round-trip to the DB.
    """
    today       = datetime.now().date()
    today_start = datetime.combine(today, datetime.min.time())
    week_start  = datetime.combine(today - timedelta(days=today.weekday()), datetime.min.time())
    month_start = datetime.combine(today.replace(day=1), datetime.min.time())
    week_end    = today + timedelta(days=7)

    # ── ARCH-NEW-02: Try reading from GymDailySummary cache ───────────────────
    summary_stmt = select(GymDailySummary).where(
        GymDailySummary.gymId == gym_id,
        GymDailySummary.summaryDate == today,
    )
    summary_res = await db.execute(summary_stmt)
    summary = summary_res.scalars().first()

    if summary and summary.updatedAt:
        age_seconds = (datetime.now() - summary.updatedAt).total_seconds()
        if age_seconds < _SUMMARY_STALE_SECONDS:
            # Cache hit — return from summary table (no heavy aggregates)
            return {
                "activeMembers":    summary.activeMembers or 0,
                "expiringToday":    summary.expiringToday or 0,
                "expiringThisWeek": 0,  # not stored in summary
                "todayCollection":  round(float(summary.totalIncome or 0), 2),
                "weekCollection":   round(float(summary.weekToDateIncome or 0), 2),
                "monthCollection":  round(float(summary.monthToDateIncome or 0), 2),
                "pendingBalance":   round(float(summary.pendingBalance or 0), 2),
                "todayExpenses":    0,  # not stored in summary
                "monthExpenses":    round(float(summary.totalExpenses or 0), 2),
                "netProfit":        round(
                    float(summary.monthToDateIncome or 0) - float(summary.totalExpenses or 0), 2
                ),
                "lowStockItems":    summary.lowStockCount or 0,
                "lastUpdated":      summary.updatedAt.isoformat(),
                "_source":          "summary_cache",
            }

    # ── Cache miss: single CTE computes everything in ONE round-trip ───────────
    # PB-06: All 10 stats are scalar subqueries projected in a single SELECT.
    # PostgreSQL executes each scalar subquery once; the planner may hoist them
    # into CTEs automatically. Explicit binding avoids N+1 query anti-pattern.
    settings       = await get_async_gym_settings(gym_id, db)
    default_thresh = int(getattr(settings, "lowStockThreshold", None) or 5)

    # Each sub-select is a correlated scalar subquery resolved inside one outer SELECT.
    active_members_sq = (
        select(func.count(Member.id))
        .where(Member.gymId == gym_id, Member.computed_status == "Active", Member.isDeleted == False)
        .scalar_subquery()
        .label("active_members")
    )
    expiring_today_sq = (
        select(func.count(Member.id))
        .where(Member.gymId == gym_id, Member.NextDuedate == today, Member.isDeleted == False)
        .scalar_subquery()
        .label("expiring_today")
    )
    expiring_week_sq = (
        select(func.count(Member.id))
        .where(
            Member.gymId == gym_id,
            Member.NextDuedate >= today,
            Member.NextDuedate <= week_end,
            Member.computed_status == "Active",
            Member.isDeleted == False,
        )
        .scalar_subquery()
        .label("expiring_this_week")
    )
    today_income_sq = (
        select(func.coalesce(func.sum(Invoice.total), 0))
        .where(Invoice.gymId == gym_id, Invoice.invoiceDate >= today_start, Invoice.isDeleted == False)
        .scalar_subquery()
        .label("today_collection")
    )
    week_income_sq = (
        select(func.coalesce(func.sum(Invoice.total), 0))
        .where(Invoice.gymId == gym_id, Invoice.invoiceDate >= week_start, Invoice.isDeleted == False)
        .scalar_subquery()
        .label("week_collection")
    )
    month_income_sq = (
        select(func.coalesce(func.sum(Invoice.total), 0))
        .where(Invoice.gymId == gym_id, Invoice.invoiceDate >= month_start, Invoice.isDeleted == False)
        .scalar_subquery()
        .label("month_collection")
    )
    pending_balance_sq = (
        select(func.coalesce(func.sum(Invoice.total - func.coalesce(Invoice.paidAmount, 0)), 0))
        .where(
            Invoice.gymId == gym_id,
            Invoice.status.in_(["PENDING", "PARTIAL"]),
            Invoice.isDeleted == False,
        )
        .scalar_subquery()
        .label("pending_balance")
    )
    today_expenses_sq = (
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.gymId == gym_id, Expense.date == today, Expense.isDeleted == False)
        .scalar_subquery()
        .label("today_expenses")
    )
    month_expenses_sq = (
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.gymId == gym_id, Expense.date >= month_start.date(), Expense.isDeleted == False)
        .scalar_subquery()
        .label("month_expenses")
    )
    # PB-06 fix: use ProteinStock.Quantity (consistent with automation.py + alerts)
    # instead of the previous ProteinLot join which counted lots, not products
    low_stock_sq = (
        select(func.count(ProteinStock.id))
        .where(
            ProteinStock.gymId == gym_id,
            ProteinStock.isDeleted == False,
            ProteinStock.Quantity < func.coalesce(ProteinStock.StockThreshold, default_thresh),
        )
        .scalar_subquery()
        .label("low_stock_count")
    )

    # ── Single DB round-trip: all 10 values projected in one SELECT ───────────
    stats_row = (
        await db.execute(
            select(
                active_members_sq,
                expiring_today_sq,
                expiring_week_sq,
                today_income_sq,
                week_income_sq,
                month_income_sq,
                pending_balance_sq,
                today_expenses_sq,
                month_expenses_sq,
                low_stock_sq,
            )
        )
    ).first()

    active_members     = int(getattr(stats_row, "active_members", 0)     or 0)
    expiring_today     = int(getattr(stats_row, "expiring_today", 0)     or 0)
    expiring_this_week = int(getattr(stats_row, "expiring_this_week", 0) or 0)
    today_collection   = float(getattr(stats_row, "today_collection", 0) or 0.0)
    week_collection    = float(getattr(stats_row, "week_collection", 0)  or 0.0)
    month_collection   = float(getattr(stats_row, "month_collection", 0) or 0.0)
    pending_balance    = float(getattr(stats_row, "pending_balance", 0)  or 0.0)
    today_expenses     = float(getattr(stats_row, "today_expenses", 0)   or 0.0)
    month_expenses     = float(getattr(stats_row, "month_expenses", 0)   or 0.0)
    low_stock_count    = int(getattr(stats_row, "low_stock_count", 0)    or 0)

    result = {
        "activeMembers":    active_members,
        "expiringToday":    expiring_today,
        "expiringThisWeek": expiring_this_week,
        "todayCollection":  round(today_collection, 2),
        "weekCollection":   round(week_collection, 2),
        "monthCollection":  round(month_collection, 2),
        "pendingBalance":   round(pending_balance, 2),
        "todayExpenses":    round(today_expenses, 2),
        "monthExpenses":    round(month_expenses, 2),
        "netProfit":        round(month_collection - month_expenses, 2),
        "lowStockItems":    low_stock_count,
        "lastUpdated":      datetime.now().isoformat(),
        "_source":          "live",
    }

    # ── ARCH-NEW-02: Upsert into GymDailySummary so SSE can use it as cache ──
    try:
        if not summary:
            summary = GymDailySummary(gymId=gym_id, summaryDate=today)
            db.add(summary)
        summary.activeMembers     = result["activeMembers"]
        summary.expiringToday     = result["expiringToday"]
        summary.totalIncome       = result["todayCollection"]
        summary.weekToDateIncome  = result["weekCollection"]
        summary.monthToDateIncome = result["monthCollection"]
        summary.pendingBalance    = result["pendingBalance"]
        summary.totalExpenses     = result["monthExpenses"]
        summary.lowStockCount     = result["lowStockItems"]
        summary.updatedAt         = datetime.now()
        await db.commit()
    except Exception as exc:
        logger.error("Error upserting gym summary: %s", exc)
        await db.rollback()

    return result


# Removed _compute_stats_async and _stats_from_summary as logic is now consolidated in _compute_stats.



# ─── SSE Stream Manager (ARCH-NEW-02 Fix) ─────────────────────────────────────

class GymStreamManager:
    """
    Manages SSE connections to prevent N duplicate SQL chains per gym.
    Multiple clients connected to the same gym share the same tick.
    """
    def __init__(self):
        self._listeners = {}  # gym_id -> set of asyncio queues
        self._tasks = {}      # gym_id -> asyncio task

    async def subscribe(self, gym_id: str):
        from fastapi import HTTPException
        if gym_id in self._listeners and len(self._listeners[gym_id]) >= SSE_MAX_CONNECTIONS_PER_GYM:
            raise HTTPException(status_code=429, detail="Max SSE connections reached for this gym. Fall back to polling.")
            
        queue = asyncio.Queue()
        if gym_id not in self._listeners:
            self._listeners[gym_id] = set()
            self._tasks[gym_id] = asyncio.create_task(self._pump_stats(gym_id))
        self._listeners[gym_id].add(queue)
        logger.debug(f"[SSE] Gym {gym_id} client connected. Total: {len(self._listeners[gym_id])}")
        return queue

    async def unsubscribe(self, gym_id: str, queue: asyncio.Queue):
        if gym_id in self._listeners and queue in self._listeners[gym_id]:
            self._listeners[gym_id].remove(queue)
            logger.debug(f"[SSE] Gym {gym_id} client disconnected. Remaining: {len(self._listeners[gym_id])}")
            if not self._listeners[gym_id]:
                del self._listeners[gym_id]
                task = self._tasks.pop(gym_id, None)
                if task:
                    task.cancel()
                logger.debug(f"[SSE] Gym {gym_id} task stopped (no clients).")

    async def _pump_stats(self, gym_id: str):
        """Dedicated background task per gym to fetch and broadcast stats."""
        try:
            while True:
                stats = await self._fetch_or_compute(gym_id)
                data_block = f"data: {json.dumps(stats)}\n\n"
                
                # Broadcast
                for q in list(self._listeners.get(gym_id, [])):
                    try:
                        q.put_nowait(data_block)
                    except asyncio.QueueFull:
                        pass
                
                await asyncio.sleep(SSE_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[SSE] Gym {gym_id} pump error: {e}")

    async def _fetch_or_compute(self, gym_id: str) -> dict:
        """Consolidates cache and live compute into _compute_stats."""
        async with AsyncSessionLocal() as db:
            return await _compute_stats(gym_id, db)

stream_manager = GymStreamManager()

# ─── SSE stream ───────────────────────────────────────────────────────────────

@router.get("/stream")
@rate_limit("10/minute")
async def dashboard_stream(
    request: Request,
    current_gym: Gym = Depends(get_current_gym),
):
    """
    SSE endpoint — push fresh dashboard stats every 60 seconds.
    Replaces APScheduler. Only runs for gyms actively on the dashboard.
    Includes connection deduplication and summary caching.
    """
    gym_id = current_gym.id

    async def event_generator():
        """
        P0-5: Streams stats events to the client.
        Auto-closes after SSE_MAX_DURATION_SECONDS (10 min) to prevent zombie connections.
        Frontend should listen for the 'reconnect' event and re-establish the stream.
        """
        queue = await stream_manager.subscribe(gym_id)
        connected_at = asyncio.get_event_loop().time()
        try:
            while True:
                # P0-5: Force reconnect after max duration
                now = asyncio.get_event_loop().time()
                if now - connected_at > SSE_MAX_DURATION_SECONDS:
                    yield "event: reconnect\ndata: {\"reason\": \"max_duration\"}\n\n"
                    break
                    
                try:
                    # Wait for data or heartbeat timeout
                    data = await asyncio.wait_for(queue.get(), timeout=SSE_HEARTBEAT_SECONDS)
                    yield data
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await stream_manager.unsubscribe(gym_id, queue)

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
async def get_dashboard_stats(
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
):
    """One-shot stats endpoint. Use /stream for live updates."""
    return await _compute_stats(current_gym.id, db)


# ─── Alerts ──────────────────────────────────────────────────────────────────

@router.get("/alerts")
async def get_dashboard_alerts(
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
):
    """Member expiry + low stock + overdue balance alerts."""
    today    = datetime.now().date()
    alerts   = []
    settings = await get_async_gym_settings(current_gym.id, db)

    default_stock_threshold = settings.lowStockThreshold if settings else 0
    expiry_range  = (settings.expiryRange or 0) if settings else 0
    grace_period  = (settings.postExpiryGraceDays or 30) if settings else 30

    # 1. Member expiry alerts
    grace_cutoff = today - timedelta(days=grace_period)
    alert_end    = today + timedelta(days=expiry_range)
    
    stmt_members = select(Member).where(
        Member.gymId == current_gym.id,
        Member.NextDuedate.isnot(None),
        Member.NextDuedate >= grace_cutoff,
        Member.NextDuedate <= alert_end,
        Member.isDeleted == False,
    )
    res_members = await db.execute(stmt_members)
    members = res_members.scalars().all()

    for m in members:
        if not m.NextDuedate:
            continue
        try:
            days_diff = (m.NextDuedate - today).days
            alerts.append(make_expiry_alert(m.id, m.Name or "Member", days_diff))
        except Exception:
            continue

    # 2. Low stock — SQL aggregate, no Python loop over all proteins (ARCH-02 fix)
    stmt_low_stock = select(
        ProteinStock.id,
        ProteinStock.ProductName,
        ProteinStock.Brand,
        ProteinStock.Quantity,
        ProteinStock.StockThreshold,
    ).where(
        ProteinStock.gymId == current_gym.id,
        ProteinStock.Quantity < func.coalesce(ProteinStock.StockThreshold, default_stock_threshold),
    )
    res_low_stock = await db.execute(stmt_low_stock)
    low_stock_proteins = res_low_stock.all()
    
    for p in low_stock_proteins:
        qty = p.Quantity or 0
        alerts.append(make_low_stock_alert(p.id, p.ProductName, p.Brand, qty))

    # 3. Overdue pending balances
    stmt_pending = select(Invoice).where(
        Invoice.gymId == current_gym.id,
        Invoice.status.in_(["PENDING", "PARTIAL"]),
        Invoice.dueDate < today,
        Invoice.isDeleted == False,
    )
    res_pending = await db.execute(stmt_pending)
    pending = res_pending.scalars().all()
    
    for pb in pending:
        balance = float(pb.total or 0) - float(pb.paidAmount or 0)
        alerts.append(make_overdue_balance_alert(pb.id, pb.customerName, balance))

    sort_alerts(alerts)
    return {"count": len(alerts), "alerts": alerts[:20]}


# ─── Recent activity ──────────────────────────────────────────────────────────

@router.get("/recent-activity")
async def get_recent_activity(
    limit: int = 10,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
):
    activities = []

    stmt_inv = select(Invoice).where(
        Invoice.gymId == current_gym.id,
        Invoice.isDeleted == False,
    ).order_by(Invoice.createdAt.desc()).limit(limit)
    res_inv = await db.execute(stmt_inv)
    recent_invoices = res_inv.scalars().all()
    
    for inv in recent_invoices:
        activities.append({
            "type": "invoice",
            "title": f"Invoice for {inv.customerName or 'Customer'}",
            "amount": float(inv.total or 0),
            "timestamp": inv.createdAt.isoformat() if inv.createdAt else None,
            "entityId": inv.id,
        })

    stmt_mem = select(Member).where(
        Member.gymId == current_gym.id,
        Member.isDeleted == False,
    ).order_by(Member.createdAt.desc()).limit(limit)
    res_mem = await db.execute(stmt_mem)
    recent_members = res_mem.scalars().all()
    
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
async def get_dashboard_stock_alerts(
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
):
    """
    SCH-NEW-04: Previously O(N) Python loop over all lots.
    Now uses two SQL aggregate queries:
    1. Low stock: JOIN ProteinLot+ProteinStock, filter quantity < threshold in SQL
    2. Expiring: filter lot.expiryDate <= today+warning_days in SQL
    """
    settings = await get_async_gym_settings(current_gym.id, db)
    default_threshold   = settings.lowStockThreshold if settings else 5
    expiry_warning_days = (settings.expiryWarningDays or 30) if settings else 30

    today      = datetime.now().date()
    expiry_end = today + timedelta(days=expiry_warning_days)

    # SCH-NEW-04: SQL-level low-stock filter (was O(N) Python loop)
    stmt_low_stock = select(
        ProteinLot.id.label("lotId"),
        ProteinLot.lotNumber,
        ProteinLot.quantity,
        ProteinLot.sellingPrice,
        ProteinStock.id.label("proteinId"),
        ProteinStock.ProductName,
        ProteinStock.Brand,
        ProteinStock.Flavour,
        ProteinStock.StockThreshold,
        ProteinStock.SellingPrice.label("proteinSellingPrice"),
    ).join(
        ProteinStock, ProteinLot.proteinId == ProteinStock.id
    ).where(
        ProteinLot.gymId == current_gym.id,
        ProteinLot.quantity < func.coalesce(ProteinStock.StockThreshold, default_threshold),
    )
    res_low_stock = await db.execute(stmt_low_stock)
    low_stock_rows = res_low_stock.all()

    low_stock_lots = []
    for row in low_stock_rows:
        flavor    = f" - {row.Flavour}" if row.Flavour else ""
        full_name = f"{row.ProductName or row.Brand or 'Unknown'}{flavor}"
        threshold = row.StockThreshold or default_threshold
        low_stock_lots.append({
            "lotId": row.lotId, "lotNumber": row.lotNumber,
            "productName": full_name,
            "quantity": row.quantity, "threshold": threshold,
            "sellingPrice": row.sellingPrice or row.proteinSellingPrice or 0,
        })

    # SCH-NEW-04: SQL-level expiry filter
    stmt_expiring = select(
        ProteinLot.id.label("lotId"),
        ProteinLot.lotNumber,
        ProteinLot.quantity,
        ProteinLot.expiryDate,
        ProteinStock.ProductName,
        ProteinStock.Brand,
        ProteinStock.Flavour,
    ).join(
        ProteinStock, ProteinLot.proteinId == ProteinStock.id
    ).where(
        ProteinLot.gymId == current_gym.id,
        ProteinLot.expiryDate.isnot(None),
        ProteinLot.expiryDate <= expiry_end,
    ).order_by(ProteinLot.expiryDate)
    res_expiring = await db.execute(stmt_expiring)
    expiring_rows = res_expiring.all()

    expiring_lots = []
    for row in expiring_rows:
        try:
            days_to_expiry = (row.expiryDate - today).days
            flavor    = f" - {row.Flavour}" if row.Flavour else ""
            full_name = f"{row.ProductName or row.Brand or 'Unknown'}{flavor}"
            expiring_lots.append({
                "lotId": row.lotId, "lotNumber": row.lotNumber,
                "productName": full_name,
                "expiryDate": row.expiryDate.strftime("%d/%m/%Y"),
                "daysToExpiry": days_to_expiry,
                "quantity": row.quantity,
            })
        except (TypeError, AttributeError):
            pass

    return {"lowStock": low_stock_lots, "expiring": expiring_lots}


# ─── Payment reconciliation (ARCH-03, on-demand) ─────────────────────────────

@router.post("/reconcile-payments", status_code=status.HTTP_200_OK)
async def reconcile_payments(
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
):
    """
    ARCH-03: Detect and fix Invoice.paidAmount drift vs SUM(PaymentEvent.amount).
    Scoped to the current gym — never touches other gyms' data.
    Call this manually when you suspect payment inconsistencies.
    """
    res = await db.execute(text("""
        SELECT i.id, i."paidAmount",
               COALESCE(SUM(pe.amount), 0) AS actual_paid
        FROM "Invoice" i
        LEFT JOIN "PaymentEvent" pe ON pe."invoiceId" = i.id
        WHERE i."gymId" = :gym_id
          AND i."isDeleted" = FALSE
          AND i.status IN ('PENDING', 'PARTIAL')
        GROUP BY i.id, i."paidAmount"
        HAVING ABS(i."paidAmount" - COALESCE(SUM(pe.amount), 0)) > 0.01
    """), {"gym_id": current_gym.id})
    rows = res.fetchall()

    corrected = []
    for row in rows:
        inv_id, stored_paid, actual_paid = row
        await db.execute(
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

    await db.commit()
    return {
        "corrected": len(corrected),
        "details":   corrected,
        "message":   "All invoices balanced." if not corrected else f"{len(corrected)} invoice(s) corrected.",
    }
