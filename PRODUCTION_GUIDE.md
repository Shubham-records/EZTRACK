# EZTRACK Production Deployment Guide

This document outlines the critical configuration settings, infrastructure requirements, and maintenance jobs required to securely host the EZTRACK backend in a production environment built for 10,000+ Daily Active Users (DAU).

## 1. Environment Variables

Your production server or PaaS (Vercel, AWS, etc.) must have the following meticulously configured.

### Security & Application Mode
- `VERCEL_ENV=production` (Critical: Tells FastAPI to disable DEV tools and seed loops).
- `ALLOW_SEED_DATA=false` (Critical: If True in production, FastAPI will refuse to start to protect against data corruption).
- `JWT_SECRET_KEY` = *Strong highly-random 256-bit string*
- `JWT_AUDIENCE` = `eztrack-frontend` (Used to prevent cross-site token forgery)
- `JWT_ISSUER` = `eztrack-api`
- `ENCRYPTION_KEY` = *Strictly 32-byte (64 hex characters) string for Aadhaar Fernet encryption*

### CORS & Proxy Settings
- `ALLOWED_ORIGINS` = `https://app.eztrack.com,https://api.eztrack.com` (Never use `*`).
- `TRUSTED_PROXY_IPS` = `10.0.0.1,10.0.0.2` (Required for accurate rate-limiting if behind a reverse proxy like Cloudflare, NGINX, or Vercel).

### Database Configuration
- `DATABASE_URL` = `postgresql://user:pass@host:5432/dbname` (Note: Backend automatically converts this to `postgresql+asyncpg://`).

### Object Storage (Supabase / R2 / S3)
- `STORAGE_BACKEND` = `supabase`
- `STORAGE_ENDPOINT_URL` = `https://<project>.supabase.co/storage/v1`
- `STORAGE_ACCESS_KEY` = `<your-access-key>`
- `STORAGE_SECRET_KEY` = `<your-secret-key>`
- `STORAGE_BUCKET` = `eztrack-media`
- `STORAGE_REGION` = `ap-south-1`

## 2. Infrastructure Recommendations

### Uvicorn / Gunicorn Start Command
Do not run `--reload` in production. Use a production setup optimized for asynchronous event loops. 1 worker per vCPU is standard.
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4 --limit-concurrency 200 --timeout-keep-alive 5
```

### PostgreSQL Connections & PgBouncer
FastAPI is using `AsyncSession` with a connection pool size of `50`. If you deploy 4 Uvicorn workers, that is 200 open connections to PostgreSQL. It is highly recommended to run **PgBouncer** (in transaction-pooling mode) in front of PostgreSQL to seamlessly manage these thousands of lightweight async queries.

## 3. Background Scripts & Cron Jobs

### Soft Delete Archiver (WA-03)
EZTRACK uses soft deletes (`isDeleted=True`) to allow gym managers to restore accidentally deleted records and preserve accounting history. To prevent the database from succumbing to index bloat over time, soft-deleted rows older than 90 days must be aggressively moved into the `SoftDeleteArchives` table and dropped from hot storage.

**Requirement:** Configure a Linux Cron Job or scheduled automated task (like GitHub Actions) to run the archiver script.
**Frequency:** Once per week (e.g., Sunday at 3:00 AM server time).

```bash
# Example Linux Cronjob:
0 3 * * 0 cd /path/to/eztrack/backend && /path/to/venv/bin/python scripts/archive_soft_deletes.py
```

*Note: The script establishes its own asynchronous database connection, serializes everything into structured JSON payloads, archives them, and then seamlessly Hard DELETES the bloat from the active tables safely.*

## 4. Alembic Migrations
The application no longer uses `Base.metadata.create_all()` synchronously for table generation in production environments (`VERCEL_ENV=production` explicitly skips this). You must enforce all DB structural changes using standard Alembic migrations.

To apply migrations remotely during your CI/CD redeployment pipeline:
```bash
alembic upgrade head
```
