"""
main.py  (v2 — clean slate)
============================
Architecture decisions:
  - APScheduler REMOVED — dashboard updates delivered via SSE (GET /api/dashboard/stream).
    Pushes fresh stats every 60s only for gyms actively on the dashboard.
  - Payment reconciliation is on-demand: POST /api/dashboard/reconcile-payments.
  - Redis REMOVED — in-process GymSettings cache is sufficient (core/cache.py).
  - CORS wildcard '*' blocked — set ALLOWED_ORIGINS in .env.
  - redirect_slashes=False kept (all routers register both '' and '/' variants).
  - SEC-09: CORS startup validation — refuse to start if '*' + allow_credentials.
  - ARCH-10: slowapi rate limiting middleware added.
  - SEC-13: Structured logging throughout (no print() calls).

Environment variables required:
    DATABASE_URL              — PostgreSQL connection string
    JWT_SECRET_KEY            — secret for JWT signing
    ENCRYPTION_KEY            — 64 hex chars (32 bytes) for Aadhaar Fernet encryption
    STORAGE_BACKEND           — supabase | r2 | s3
    STORAGE_ENDPOINT_URL      — storage endpoint
    STORAGE_ACCESS_KEY        — storage access key
    STORAGE_SECRET_KEY        — storage secret key
    STORAGE_BUCKET            — bucket name (default: eztrack)
    STORAGE_REGION            — region (default: ap-south-1)
    STORAGE_SIGNED_URL_EXPIRY — signed URL TTL in seconds (default: 3600)
    ALLOWED_ORIGINS           — comma-separated allowed CORS origins
                                e.g. "https://app.yourdomain.com,http://localhost:3000"
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from routers import (
    auth, members, staff, proteins, invoices, dashboard,
    settings, expenses, contacts, automation, audit,
    terms, branch_details, whatsapp_templates,
)
from core.database import Base, engine

logger = logging.getLogger(__name__)


# ─── Database Init ────────────────────────────────────────────────────────────

def init_db():
    """
    Create all tables that do not yet exist.
    Safe to run on every startup — SQLAlchemy checks IF NOT EXISTS.
    For schema changes after initial deployment, use migrate.py.
    """
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables verified / created.")


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: verify DB tables. No background jobs — SSE handles live data."""
    init_db()

    # SEC-08: Ensure seed data is NEVER enabled in production
    allow_seed = os.getenv("ALLOW_SEED_DATA", "false").lower() == "true"
    if allow_seed:
        env_name = os.getenv("VERCEL_ENV", "development").lower()
        db_url = os.getenv("DATABASE_URL", "")
        is_prod_env = env_name == "production" or ("localhost" not in db_url and "127.0.0.1" not in db_url and "sqlite" not in db_url)
        if is_prod_env:
            raise RuntimeError("CRITICAL SEC-08: ALLOW_SEED_DATA is True in a production environment. Failing fast to prevent data corruption.")
        logger.warning("🚨 SEC-08: SEED DATA ENDPOINT ENABLED. DO NOT USE IN PRODUCTION.")

    yield
    # SSE connections clean up automatically on client disconnect — nothing to shut down


# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="EZTRACK Gym Management API",
    version="2.0.0",
    redirect_slashes=False,
    lifespan=lifespan,
)


# ─── Rate Limiting (ARCH-10) ──────────────────────────────────────────────────

try:
    from slowapi import _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware
    from core.rate_limit import limiter

    if limiter:
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        app.add_middleware(SlowAPIMiddleware)
        logger.info("slowapi rate limiting enabled with gymId keying.")
    else:
        logger.warning("slowapi not installed — rate limiting DISABLED. Run: pip install slowapi")
except ImportError:
    limiter = None
    logger.warning("slowapi not installed — rate limiting DISABLED. Run: pip install slowapi")


# ─── CORS (SEC-09) ───────────────────────────────────────────────────────────

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001")
origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

if "*" in origins:
    raise RuntimeError(
        "SEC-09: ALLOWED_ORIGINS='*' is incompatible with allow_credentials=True. "
        "Set explicit origins, e.g. ALLOWED_ORIGINS=https://app.yourgym.com"
    )

# SEC-NEW-10: Warn if any HTTP (non-TLS) origins are in production
_env = os.getenv("VERCEL_ENV", "development").lower()
if _env == "production":
    _http_origins = [o for o in origins if o.startswith("http://")]
    if _http_origins:
        logger.warning(
            "SEC-NEW-10: HTTP origins detected in production ALLOWED_ORIGINS: %s. "
            "All traffic should use HTTPS to protect JWT tokens and Aadhaar data.",
            _http_origins,
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)


# ─── HSTS Middleware (SEC-NEW-10) ─────────────────────────────────────────────

class HSTSMiddleware(BaseHTTPMiddleware):
    """
    SEC-NEW-10: Add Strict-Transport-Security header to all responses.
    max-age=63072000 = 2 years (HSTS preload minimum is 1 year).
    This ensures browsers always use HTTPS for this domain, protecting
    JWT tokens and Aadhaar-encrypted payloads even if Nginx is misconfigured.
    """
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["Strict-Transport-Security"] = (
            "max-age=63072000; includeSubDomains; preload"
        )
        return response

app.add_middleware(HSTSMiddleware)


# ─── Request IP Middleware (SEC-NEW-08) ───────────────────────────────────────

class RequestIPMiddleware(BaseHTTPMiddleware):
    """
    SEC-NEW-08: Capture originating IP address for audit logs.
    Stores the IP address in a context variable.
    """
    async def dispatch(self, request: Request, call_next):
        from core.audit_utils import request_ip_var
        client_host = request.client.host if request.client else None
        
        # Check for proxy headers (like X-Forwarded-For or X-Real-IP)
        forwarded_for = request.headers.get("x-forwarded-for")
        real_ip = request.headers.get("x-real-ip")
        
        if forwarded_for:
            # X-Forwarded-For can be a comma-separated list of IPs. First is the original client.
            client_host = forwarded_for.split(",")[0].strip()
        elif real_ip:
            client_host = real_ip

        if client_host:
            token = request_ip_var.set(client_host)
        else:
            token = request_ip_var.set(None)

        try:
            response = await call_next(request)
            return response
        finally:
            request_ip_var.reset(token)

app.add_middleware(RequestIPMiddleware)


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
