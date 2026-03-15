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
from fastapi.middleware.gzip import GZipMiddleware
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
    
    SW-10: Retired Base.metadata.create_all for production environments.
    Production uses Alembic migrations entirely.
    """
    env_name = os.getenv("VERCEL_ENV", "development").lower()
    
    if env_name != "production":
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables verified / created (DEV mode).")
    else:
        logger.info("Production mode: skipping Base.metadata.create_all. Using Alembic.")

    # Install performance indexes (safe on every startup — IF NOT EXISTS)
    try:
        from db_setup import install_indexes
        install_indexes()
    except Exception as exc:
        # Non-fatal: indexes are for performance only. Log and continue.
        logger.warning("Could not install performance indexes: %s", exc)



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


# ─── Pagination Header Middleware ─────────────────────────────────────────────

class PaginationHeaderMiddleware(BaseHTTPMiddleware):
    """
    Translates X-Page and X-Page-Size headers into query parameters.
    This allows the frontend to keep URLs clean while the backend's
    existing Query-param dependencies remain functional.
    """
    async def dispatch(self, request: Request, call_next):
        from urllib.parse import urlencode, parse_qs
        
        x_page = request.headers.get("X-Page")
        x_page_size = request.headers.get("X-Page-Size")
        
        if x_page or x_page_size:
            # Parse existing query string
            query_params = parse_qs(request.scope.get('query_string', b'').decode())
            
            # Update with header values if not already present in query (Query takes precedence)
            if x_page and 'page' not in query_params:
                query_params['page'] = [x_page]
            if x_page_size and 'page_size' not in query_params:
                query_params['page_size'] = [x_page_size]
            
            # Re-encode and update scope
            request.scope['query_string'] = urlencode(query_params, doseq=True).encode()
            
        return await call_next(request)

app.add_middleware(PaginationHeaderMiddleware)


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

# ─── GZip Compression (P0-6 / PB-08) ─────────────────────────────────────────
# Compress responses > 1KB. Reduces bandwidth ~60-80% for JSON lists.
# minimum_size=1000 skips compression for tiny responses (health checks, etc.)
app.add_middleware(GZipMiddleware, minimum_size=1000)


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


# ─── Request Body Size Limit (P0-7 / SEC-V-04) ───────────────────────────────
# Reject requests with Content-Length > 10MB BEFORE reading the body.
# Prevents OOM attacks via oversized uploads (the storage.py check runs AFTER
# the entire file is read into memory — this guard fires before that).
MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024  # 10 MB

class ContentSizeLimitMiddleware(BaseHTTPMiddleware):
    """
    P0-7 / SEC-V-04: Reject any request whose Content-Length header exceeds
    MAX_REQUEST_BODY_SIZE (10 MB). SSE GET streams are excluded (no body).
    Zero-payload requests are excluded (Content-Length: 0 or absent).
    """
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                size = int(content_length)
            except ValueError:
                size = 0
            if size > MAX_REQUEST_BODY_SIZE:
                from fastapi.responses import JSONResponse
                return JSONResponse(
                    status_code=413,
                    content={"detail": f"Request body too large. Maximum allowed size is 10 MB."},
                )
        return await call_next(request)

app.add_middleware(ContentSizeLimitMiddleware)


# ─── Request IP Middleware (SEC-NEW-08) ───────────────────────────────────────

# SEC-NEW-08: Only trust proxy headers from known proxies (e.g. Vercel, Cloudflare).
# Without this, any client can spoof X-Forwarded-For to corrupt audit logs.
_trusted_proxies_raw = os.getenv("TRUSTED_PROXY_IPS", "")
TRUSTED_PROXY_IPS = {ip.strip() for ip in _trusted_proxies_raw.split(",") if ip.strip()}

class RequestIPMiddleware(BaseHTTPMiddleware):
    """
    SEC-NEW-08: Capture originating IP address for audit logs.
    Only reads proxy headers (X-Forwarded-For, X-Real-IP) when the direct
    connection comes from a trusted proxy IP.
    """
    async def dispatch(self, request: Request, call_next):
        from core.audit_utils import request_ip_var
        direct_ip = request.client.host if request.client else None

        client_host = direct_ip
        if direct_ip in TRUSTED_PROXY_IPS:
            forwarded_for = request.headers.get("x-forwarded-for")
            real_ip = request.headers.get("x-real-ip")
            if forwarded_for:
                client_host = forwarded_for.split(",")[0].strip()
            elif real_ip:
                client_host = real_ip

        token = request_ip_var.set(client_host)
        try:
            response = await call_next(request)
            return response
        finally:
            request_ip_var.reset(token)

app.add_middleware(RequestIPMiddleware)


# ─── Request ID Middleware (P3-22) ────────────────────────────────────────────

import uuid

class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    P3-22: Ensure trace correlation by returning X-Request-ID
    """
    async def dispatch(self, request: Request, call_next):
        req_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        response = await call_next(request)
        response.headers["X-Request-ID"] = req_id
        return response

app.add_middleware(RequestIDMiddleware)

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
async def read_root():
    return {"message": "EZTRACK API v2", "status": "ok"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}


# ─── Dev Entry Point ──────────────────────────────────────────────────────────
# Dev only. For 10K DAU production deploy, use:
#
#   SW-01: uvicorn main:app \
#       --host 0.0.0.0 --port 8001 \
#       --workers 4 \                     # 1 worker per vCPU
#       --limit-concurrency 200 \         # max simultaneous connections
#       --timeout-keep-alive 5            # release idle HTTP connections fast
#
# Do NOT use --reload in production.

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
