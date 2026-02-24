from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from routers import auth, members, staff, proteins, invoices, dashboard, settings, expenses, contacts, pending, automation, audit, terms, branch_details, whatsapp_templates
from core.database import Base, engine
from sqlalchemy import text

# Create the database tables
Base.metadata.create_all(bind=engine)

# Run migrations for new columns on existing tables
def run_startup_migrations():
    migration_sqls = [
        # Member table columns
        'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "imageData" BYTEA',
        'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "imageMimeType" VARCHAR(50)',
        'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "branchId" VARCHAR(255)',
        'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "lastEditedBy" VARCHAR(255)',
        'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "editReason" TEXT',
        # ProteinStock table columns
        'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "MarginPrice" FLOAT',
        'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "OfferPrice" FLOAT',
        'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "SellingPrice" FLOAT',
        'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "AvailableStock" INTEGER DEFAULT 0',
        'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "StockThreshold" INTEGER DEFAULT 5',
        'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "imageData" BYTEA',
        'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "imageMimeType" VARCHAR(50)',
        'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "branchId" VARCHAR(255)',
        'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "ProfitAmount" FLOAT',
        'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "ExpiryDate" VARCHAR(255)',
        'ALTER TABLE "ProteinStock" DROP COLUMN IF EXISTS "ProfitPercentage"',
        # Invoice table columns
        'ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "branchId" VARCHAR(255)',
        'ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paymentLogs" JSON',
        'ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paidAmount" FLOAT DEFAULT 0',
        'ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "termsAndConditions" JSON',
        # PendingBalance table columns
        'ALTER TABLE "PendingBalance" ADD COLUMN IF NOT EXISTS "entityType" VARCHAR(50)',
        'ALTER TABLE "PendingBalance" ADD COLUMN IF NOT EXISTS "invoiceId" VARCHAR(255)',
        'ALTER TABLE "PendingBalance" ADD COLUMN IF NOT EXISTS "entityName" VARCHAR(255)',
        'ALTER TABLE "PendingBalance" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(50)',
        'ALTER TABLE "PendingBalance" ADD COLUMN IF NOT EXISTS "paidAmount" FLOAT DEFAULT 0',
        'ALTER TABLE "PendingBalance" ADD COLUMN IF NOT EXISTS "notes" TEXT',
        # GymSettings table columns
        'ALTER TABLE "GymSettings" ADD COLUMN IF NOT EXISTS "invoiceStartNumber" INTEGER DEFAULT 1001',
        'ALTER TABLE "GymSettings" ADD COLUMN IF NOT EXISTS "admissionExpiryDays" INTEGER DEFAULT 365',
        'ALTER TABLE "GymSettings" ADD COLUMN IF NOT EXISTS "readmissionDiscount" INTEGER DEFAULT 50',
        'ALTER TABLE "GymSettings" ADD COLUMN IF NOT EXISTS "expiryRange" INTEGER DEFAULT 30',
        'ALTER TABLE "GymSettings" ADD COLUMN IF NOT EXISTS "postExpiryGraceDays" INTEGER DEFAULT 30',
        'ALTER TABLE "GymSettings" ADD COLUMN IF NOT EXISTS "reminderDaysBefore" INTEGER DEFAULT 3',
        'ALTER TABLE "GymSettings" ADD COLUMN IF NOT EXISTS "enablePersonalTraining" BOOLEAN DEFAULT FALSE',
        # User table — branch access columns
        'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "branchIds" JSON',
        'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeBranchId" VARCHAR(255)',
    ]
    
    try:
        with engine.connect() as conn:
            for sql in migration_sqls:
                try:
                    conn.execute(text(sql))
                    conn.commit()
                except Exception:
                    pass  # Column may already exist or table doesn't exist
        print("✓ Startup migrations completed")
    except Exception as e:
        print(f"Migration warning: {e}")

run_startup_migrations()

app = FastAPI(title="EZTRACK Gym Management API", redirect_slashes=False)

# Origins for CORS
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(members.router, prefix="/api/members", tags=["Members"])
app.include_router(staff.router, prefix="/api/staff", tags=["Staff"])
app.include_router(proteins.router, prefix="/api/proteins", tags=["Proteins"])
app.include_router(invoices.router, prefix="/api/invoices", tags=["Invoices"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(expenses.router, prefix="/api/expenses", tags=["Expenses"])
app.include_router(contacts.router, prefix="/api/contacts", tags=["Contacts"])
app.include_router(pending.router, prefix="/api/pending", tags=["Pending Balance"])
app.include_router(automation.router, prefix="/api/automation", tags=["Automation"])
app.include_router(audit.router, prefix="/api/audit", tags=["Audit Logs"])
app.include_router(terms.router, prefix="/api/terms", tags=["Terms"])
app.include_router(branch_details.router, prefix="/api/branch-details", tags=["Branch Details"])
app.include_router(whatsapp_templates.router, prefix="/api/whatsapp-templates", tags=["WhatsApp Templates"])

@app.get("/")
def read_root():
    return {"message": "Welcome to EZTRACK API"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
