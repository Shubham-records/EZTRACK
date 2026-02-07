"""
Database Migration Script for EZTRACK
Run this script to add all new columns to the existing database tables.

Usage: python migrations/add_new_columns.py
"""
import psycopg2
from psycopg2 import sql

# Database credentials from .env
DB_CONFIG = {
    'host': '10.0.2.2',
    'port': 5432,
    'database': 'eztrack',
    'user': 'eztrack',
    'password': 'eztrack'
}

MIGRATIONS = [
    # Member table - new columns
    'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "imageData" BYTEA',
    'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "imageMimeType" VARCHAR(50)',
    'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "branchId" VARCHAR(255)',
    'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "lastEditedBy" VARCHAR(255)',
    'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "editReason" TEXT',
    
    # ProteinStock table - new columns
    'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "MarginPrice" FLOAT',
    'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "OfferPrice" FLOAT',
    'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "SellingPrice" FLOAT',
    'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "AvailableStock" INTEGER DEFAULT 0',
    'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "StockThreshold" INTEGER DEFAULT 5',
    'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "imageData" BYTEA',
    'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "imageMimeType" VARCHAR(50)',
    'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "branchId" VARCHAR(255)',
    
    # Invoice table - new columns
    'ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "branchId" VARCHAR(255)',
    
    # Create new tables
    '''CREATE TABLE IF NOT EXISTS "Branch" (
        id VARCHAR(255) PRIMARY KEY,
        "gymId" VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        phone VARCHAR(50),
        "managerName" VARCHAR(255),
        "isActive" BOOLEAN DEFAULT TRUE,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
    )''',
    
    '''CREATE TABLE IF NOT EXISTS "GymSettings" (
        id VARCHAR(255) PRIMARY KEY,
        "gymId" VARCHAR(255) NOT NULL UNIQUE,
        "gstEnabled" BOOLEAN DEFAULT FALSE,
        "memberGSTPercent" FLOAT DEFAULT 18,
        "proteinGSTPercent" FLOAT DEFAULT 12,
        "lowStockThreshold" INTEGER DEFAULT 5,
        "membershipExpiryAlertDays" INTEGER DEFAULT 7,
        "defaultMemberPlan" VARCHAR(50) DEFAULT 'Monthly',
        "allowPartialPayments" BOOLEAN DEFAULT TRUE,
        "autoGenerateReceipts" BOOLEAN DEFAULT TRUE,
        "receiptPrefix" VARCHAR(20) DEFAULT 'EZ',
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
    )''',
    
    '''CREATE TABLE IF NOT EXISTS "Expense" (
        id VARCHAR(255) PRIMARY KEY,
        "gymId" VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        amount FLOAT NOT NULL,
        date VARCHAR(20),
        "paymentMode" VARCHAR(50),
        "vendorName" VARCHAR(255),
        "receiptNumber" VARCHAR(100),
        notes TEXT,
        "receiptImage" BYTEA,
        "receiptMimeType" VARCHAR(50),
        "branchId" VARCHAR(255),
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
    )''',
    
    '''CREATE TABLE IF NOT EXISTS "ExternalContact" (
        id VARCHAR(255) PRIMARY KEY,
        "gymId" VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        email VARCHAR(255),
        "contactType" VARCHAR(50),
        company VARCHAR(255),
        address TEXT,
        notes TEXT,
        "isActive" BOOLEAN DEFAULT TRUE,
        "imageData" BYTEA,
        "imageMimeType" VARCHAR(50),
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
    )''',
    
    '''CREATE TABLE IF NOT EXISTS "PricingConfig" (
        id VARCHAR(255) PRIMARY KEY,
        "gymId" VARCHAR(255) NOT NULL,
        "configType" VARCHAR(50) NOT NULL,
        "planType" VARCHAR(100),
        "periodType" VARCHAR(100),
        "brandName" VARCHAR(255),
        "basePrice" FLOAT NOT NULL,
        "marginType" VARCHAR(20),
        "marginValue" FLOAT,
        "offerDiscount" FLOAT DEFAULT 0,
        "effectiveFrom" VARCHAR(20),
        "isActive" BOOLEAN DEFAULT TRUE,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
    )''',
    
    '''CREATE TABLE IF NOT EXISTS "PendingBalance" (
        id VARCHAR(255) PRIMARY KEY,
        "gymId" VARCHAR(255) NOT NULL,
        "entityType" VARCHAR(50) NOT NULL,
        "entityName" VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        "memberId" VARCHAR(255),
        "externalContactId" VARCHAR(255),
        amount FLOAT NOT NULL,
        "paidAmount" FLOAT DEFAULT 0,
        "dueDate" VARCHAR(20),
        description TEXT,
        notes TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
    )''',
    
    '''CREATE TABLE IF NOT EXISTS "AuditLog" (
        id VARCHAR(255) PRIMARY KEY,
        "gymId" VARCHAR(255) NOT NULL,
        "entityType" VARCHAR(100) NOT NULL,
        "entityId" VARCHAR(255) NOT NULL,
        action VARCHAR(50) NOT NULL,
        "beforeData" JSONB,
        "afterData" JSONB,
        "changedFields" JSONB,
        "userId" VARCHAR(255),
        "userName" VARCHAR(255),
        "ipAddress" VARCHAR(50),
        "createdAt" TIMESTAMP DEFAULT NOW()
    )'''
]


def run_migrations():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        print("Starting database migrations...")
        
        for i, migration in enumerate(MIGRATIONS, 1):
            try:
                cursor.execute(migration)
                print(f"✓ Migration {i}/{len(MIGRATIONS)} completed")
            except Exception as e:
                print(f"✗ Migration {i} failed: {str(e)[:100]}")
        
        conn.commit()
        print("\n✅ All migrations completed successfully!")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        print("\nPlease update DB_CONFIG with your database credentials:")
        print("  host, port, database, user, password")


if __name__ == "__main__":
    run_migrations()
