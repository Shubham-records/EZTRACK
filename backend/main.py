"""
main.py  (v2 — clean slate)
============================
Changes from v1:
  - run_startup_migrations() REMOVED — use Base.metadata.create_all() only.
    Future schema changes go through Alembic (see README).
  - APScheduler added for dashboard summary background job (every 5 min).
  - CORS wildcard '*' removed — set ALLOWED_ORIGINS in .env.
  - redirect_slashes=False kept (all routers register both '' and '/' variants).

Environment variables required:
    DATABASE_URL         — PostgreSQL connection string
    JWT_SECRET_KEY       — secret for JWT signing
    STORAGE_BACKEND      — supabase | r2 | s3
    STORAGE_ENDPOINT_URL — storage endpoint
    STORAGE_ACCESS_KEY   — storage access key
    STORAGE_SECRET_KEY   — storage secret key
    STORAGE_BUCKET       — bucket name (default: eztrack)
    STORAGE_REGION       — region (default: ap-south-1)
    STORAGE_SIGNED_URL_EXPIRY — signed URL TTL in seconds (default: 3600)
    ALLOWED_ORIGINS      — comma-separated list of allowed CORS origins
                           e.g. "https://app.yourdomain.com,http://localhost:3000"
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import (
    auth, members, staff, proteins, invoices, dashboard,
    settings, expenses, contacts, pending, automation, audit,
    terms, branch_details, whatsapp_templates,
)
from core.database import Base, engine, SessionLocal

logger = logging.getLogger(__name__)


# ─── Database Init ────────────────────────────────────────────────────────────

def init_db():
    """
    Create all tables that do not yet exist.
    This is safe to run on every startup — SQLAlchemy checks IF NOT EXISTS.

    DO NOT add ALTER TABLE statements here.  For schema changes after initial
    deployment, use Alembic:
        alembic revision --autogenerate -m "describe_your_change"
        alembic upgrade head   ← run as a pre-deployment step, never at startup
    """
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables verified / created.")


# ─── Background Dashboard Refresh ─────────────────────────────────────────────

def _refresh_dashboard_summaries():
    """
    Recompute GymDailySummary for all active gyms.
    Runs on a schedule — the dashboard endpoint only ever reads this table.
    This eliminates the cache race condition (50+ simultaneous cache-miss queries).
    """
    from datetime import date
    from sqlalchemy import func
    from models.all_models import (
        Gym, Member, Invoice, ProteinStock, ProteinLot,
        Expense, GymSettings, GymDailySummary
    )

    db = SessionLocal()
    today = date.today()

    try:
        gyms = db.query(Gym).filter(Gym.isDeleted == False).all()
        for gym in gyms:
            try:
                # Active members (using computed_status expression)
                active_members = db.query(Member).filter(
                    Member.gymId == gym.id,
                    Member.computed_status == "Active"
                ).count()

                # Expiring today
                expiring_today = db.query(Member).filter(
                    Member.gymId == gym.id,
                    Member.NextDuedate == today,
                ).count()

                # Today's income
                from datetime import datetime
                today_start = datetime.combine(today, datetime.min.time())
                today_income = db.query(func.sum(Invoice.total)).filter(
                    Invoice.gymId == gym.id,
                    Invoice.invoiceDate >= today_start,
                ).scalar() or 0.0

                # Pending balance
                pending_balance = db.query(
                    func.sum(Invoice.total - func.coalesce(Invoice.paidAmount, 0))
                ).filter(
                    Invoice.gymId == gym.id,
                    Invoice.status.in_(["PENDING", "PARTIAL"]),
                ).scalar() or 0.0

                # Today's expenses
                today_expenses = db.query(func.sum(Expense.amount)).filter(
                    Expense.gymId == gym.id,
                    Expense.date == today,
                ).scalar() or 0.0

                # Low stock count (via lots)
                settings = db.query(GymSettings).filter(GymSettings.gymId == gym.id).first()
                default_threshold = settings.lowStockThreshold if settings else 5

                lots = db.query(ProteinLot).filter(ProteinLot.gymId == gym.id).all()
                proteins = {
                    p.id: p for p in
                    db.query(ProteinStock).filter(ProteinStock.gymId == gym.id).all()
                }
                low_stock_count = sum(
                    1 for lot in lots
                    if (lot.quantity or 0) < (proteins.get(lot.proteinId, ProteinStock()).StockThreshold or default_threshold)
                )

                # Upsert summary
                summary = db.query(GymDailySummary).filter(
                    GymDailySummary.gymId == gym.id,
                    GymDailySummary.summaryDate == today,
                ).first()

                if summary:
                    summary.activeMembers  = active_members
                    summary.expiringToday  = expiring_today
                    summary.totalIncome    = today_income
                    summary.pendingBalance = pending_balance
                    summary.totalExpenses  = today_expenses
                    summary.lowStockCount  = low_stock_count
                else:
                    summary = GymDailySummary(
                        gymId=gym.id,
                        summaryDate=today,
                        activeMembers=active_members,
                        expiringToday=expiring_today,
                        totalIncome=today_income,
                        pendingBalance=pending_balance,
                        totalExpenses=today_expenses,
                        lowStockCount=low_stock_count,
                    )
                    db.add(summary)

                db.commit()
            except Exception as e:
                db.rollback()
                logger.warning("Dashboard refresh failed for gym %s: %s", gym.id, e)
    finally:
        db.close()


def _start_scheduler():
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        scheduler = BackgroundScheduler()
        scheduler.add_job(
            _refresh_dashboard_summaries,
            trigger="interval",
            minutes=5,
            id="dashboard_refresh",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("APScheduler started — dashboard refresh every 5 minutes.")
        return scheduler
    except ImportError:
        logger.warning(
            "APScheduler not installed. Dashboard refresh disabled. "
            "Run: pip install apscheduler"
        )
        return None


# ─── Lifespan ────────────────────────────────────────────────────────────────

_scheduler = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler
    init_db()
    _scheduler = _start_scheduler()
    yield
    if _scheduler:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped.")


# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="EZTRACK Gym Management API",
    version="2.0.0",
    redirect_slashes=False,
    lifespan=lifespan,
)


# ─── CORS ────────────────────────────────────────────────────────────────────
# FIX: removed wildcard '*'.  Set ALLOWED_ORIGINS in .env for production.
# Example: ALLOWED_ORIGINS=https://app.yourgym.com,https://yourgym.com

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001")
origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(auth.router,               prefix="/api/auth",               tags=["Auth"])
app.include_router(members.router,            prefix="/api/members",             tags=["Members"])
app.include_router(staff.router,              prefix="/api/staff",               tags=["Staff"])
app.include_router(proteins.router,           prefix="/api/proteins",            tags=["Proteins"])
app.include_router(invoices.router,           prefix="/api/invoices",            tags=["Invoices"])
app.include_router(dashboard.router,          prefix="/api/dashboard",           tags=["Dashboard"])
app.include_router(settings.router,           prefix="/api/settings",            tags=["Settings"])
app.include_router(expenses.router,           prefix="/api/expenses",            tags=["Expenses"])
app.include_router(contacts.router,           prefix="/api/contacts",            tags=["Contacts"])
app.include_router(pending.router,            prefix="/api/pending",             tags=["Pending Balance"])
app.include_router(automation.router,         prefix="/api/automation",          tags=["Automation"])
app.include_router(audit.router,              prefix="/api/audit",               tags=["Audit Logs"])
app.include_router(terms.router,              prefix="/api/terms",               tags=["Terms"])
app.include_router(branch_details.router,     prefix="/api/branch-details",      tags=["Branch Details"])
app.include_router(whatsapp_templates.router, prefix="/api/whatsapp-templates",  tags=["WhatsApp Templates"])


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"message": "EZTRACK API v2", "status": "ok"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


# ─── Dev Entry Point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
