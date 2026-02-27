"""
EZTRACK — all_models.py  (v2 — clean slate)
============================================
Changes from v1:
  - All LargeBinary (BYTEA) columns removed → replaced with VARCHAR URL columns
  - MembershipStatus stored column removed → use computed_status hybrid_property exclusively
  - AccessStatus deprecated column removed
  - PendingBalance model removed (all logic via Invoice)
  - Phone/Whatsapp/Aadhaar: BigInteger → String(15) / String(12)
  - AuditLog partition hint removed (caused INSERT failures)
  - DateTime → DateTime(timezone=True) (TIMESTAMPTZ) on all timestamp columns
  - PaymentEvent table added (replaces paymentLogs JSON blob)
  - GymSubscription table added (SaaS plan/limits — stubbed, no enforcement yet)
  - Gym soft-delete fields added (isDeleted, deletedAt)
  - run_startup_migrations() removed from main.py — use Base.metadata.create_all() only
"""

from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Date, ForeignKey,
    Text, JSON, Index, DateTime, Numeric
)
# ARCH-03: Numeric(12,2) used for ALL currency fields — Float silently drops precision
# e.g. 1999.99 stored as Float can become 1999.9899999... causing balance drift.
# Float is still used for non-currency measurements (e.g. Member.height).
MONEY = Numeric(12, 2)  # up to ₹999,999,999,999.99 — sufficient for any gym
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy import case
from core.database import Base
import uuid


def generate_uuid() -> str:
    return str(uuid.uuid4())


# ─────────────────────────────────────────────────────────────────────────────
# Gym  (root tenant)
# ─────────────────────────────────────────────────────────────────────────────

class Gym(Base):
    __tablename__ = "Gym"

    id         = Column(String, primary_key=True, default=generate_uuid)
    gymname    = Column(String, nullable=False)
    email      = Column(String, unique=True, nullable=False)
    username   = Column(String, unique=True, nullable=False)
    password   = Column(String, nullable=False)

    # Soft-delete (SaaS safety — never hard-delete immediately)
    isDeleted    = Column(Boolean, default=False, nullable=False)
    deletedAt    = Column(DateTime(timezone=True), nullable=True)
    deleteReason = Column(String, nullable=True)

    createdAt  = Column(DateTime(timezone=True), default=func.now())
    updatedAt  = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    # Relationships
    members          = relationship("Member",          back_populates="gym", cascade="all, delete-orphan")
    proteinStocks    = relationship("ProteinStock",    back_populates="gym", cascade="all, delete-orphan")
    users            = relationship("User",            back_populates="gym", cascade="all, delete-orphan")
    invoices         = relationship("Invoice",         back_populates="gym", cascade="all, delete-orphan")
    termsAndConditions = relationship("TermsAndConditions", back_populates="gym", cascade="all, delete-orphan")


# SEC-1: Prevent hard deletes of Gym — must soft-delete instead
from sqlalchemy import event

@event.listens_for(Gym, "before_delete")
def prevent_gym_hard_delete(mapper, connection, target):
    raise RuntimeError(
        f"Hard delete of Gym {target.id} is not allowed. "
        "Set isDeleted=True and deletedAt=datetime.utcnow() instead."
    )


# ─────────────────────────────────────────────────────────────────────────────
# GymSubscription  (SaaS plan/limits — stubbed for future billing)
# ─────────────────────────────────────────────────────────────────────────────

class GymSubscription(Base):
    """
    Stubbed for future SaaS billing.  No enforcement middleware yet — add
    plan-limit checks in routers when you are ready to monetise.
    """
    __tablename__ = "GymSubscription"

    id          = Column(String, primary_key=True, default=generate_uuid)
    gymId       = Column(String, ForeignKey("Gym.id"), unique=True, nullable=False)

    plan        = Column(String, default="free")     # free | starter | pro | enterprise
    status      = Column(String, default="active")   # active | past_due | cancelled | trial

    maxBranches = Column(Integer, default=1)
    maxMembers  = Column(Integer, default=200)
    maxStaff    = Column(Integer, default=3)

    trialEndsAt   = Column(DateTime(timezone=True), nullable=True)
    currentPeriodStart = Column(DateTime(timezone=True), nullable=True)
    currentPeriodEnd   = Column(DateTime(timezone=True), nullable=True)

    # External billing reference (Razorpay / Stripe subscription id)
    externalSubId = Column(String, nullable=True)

    createdAt   = Column(DateTime(timezone=True), default=func.now())
    updatedAt   = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    gym = relationship("Gym", backref="subscription")


# ─────────────────────────────────────────────────────────────────────────────
# User  (staff accounts within a gym)
# ─────────────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "User"
    __table_args__ = (
        Index("ix_user_gym_id",       "gymId"),
        # Prevent two staff members with the same username in the same gym.
        # Without this, two concurrent POST /staff requests both pass the
        # Python duplicate check before either commits, creating duplicates.
        Index("uq_user_gym_username", "gymId", "username", unique=True),
    )

    id       = Column(String, primary_key=True, default=generate_uuid)
    gymId    = Column(String, ForeignKey("Gym.id"), nullable=False)

    username    = Column(String, nullable=False)
    password    = Column(String, nullable=False)
    role        = Column(String, default="STAFF")        # OWNER | MANAGER | STAFF
    permissions = Column(ARRAY(String), nullable=True)   # granular permission list

    # Multi-branch access control
    branchIds      = Column(JSON, nullable=True)   # list of Branch.id this user can access
    activeBranchId = Column(String, nullable=True)

    createdAt = Column(DateTime(timezone=True), default=func.now())
    updatedAt = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())


    gym = relationship("Gym", back_populates="users")


# ─────────────────────────────────────────────────────────────────────────────
# RefreshToken  (SEC-03: short-lived access tokens + revocable refresh tokens)
# ─────────────────────────────────────────────────────────────────────────────

class RefreshToken(Base):
    """
    Stores refresh tokens for gym owners and staff.
    Access tokens are short-lived (30 min). Refresh tokens live 7 days.
    On logout, the refresh token is revoked (isRevoked=True).
    The token stored here is the SHA-256 hash of the actual token string
    so raw token values never appear in the database.
    """
    __tablename__ = "RefreshToken"
    __table_args__ = (
        Index("ix_refresh_gym",  "gymId"),
        Index("ix_refresh_token", "tokenHash", unique=True),
    )

    id         = Column(String, primary_key=True, default=generate_uuid)
    gymId      = Column(String, ForeignKey("Gym.id"), nullable=False)
    userId     = Column(String, ForeignKey("User.id"), nullable=True)  # null = gym owner

    tokenHash  = Column(String(64), nullable=False)   # SHA-256 hex of the raw token
    isRevoked  = Column(Boolean, default=False)
    expiresAt  = Column(DateTime(timezone=True), nullable=False)

    createdAt  = Column(DateTime(timezone=True), default=func.now())

    gym  = relationship("Gym")
    user = relationship("User")


# Branch  (physical location within a Gym)
# ─────────────────────────────────────────────────────────────────────────────

class Branch(Base):
    __tablename__ = "Branch"
    __table_args__ = (
        # SCH-01: Only ONE default branch per gym.
        # This partial unique index enforces the constraint at the DB level.
        Index(
            "uq_branch_gym_default",
            "gymId",
            unique=True,
            postgresql_where="\"isDefault\" = TRUE",
        ),
    )
    id      = Column(String, primary_key=True, default=generate_uuid)
    gymId   = Column(String, ForeignKey("Gym.id"), nullable=False)

    name        = Column(String, nullable=False)
    displayName = Column(String, nullable=True)
    address     = Column(Text, nullable=True)
    city        = Column(String, nullable=True)
    state       = Column(String, nullable=True)
    pincode     = Column(String, nullable=True)
    phone       = Column(String, nullable=True)
    phoneCountryCode = Column(String, nullable=True, default="+91")
    whatsapp    = Column(String, nullable=True)
    email       = Column(String, nullable=True)
    slogan      = Column(String, nullable=True)
    website     = Column(String, nullable=True)
    isActive    = Column(Boolean, default=True)
    isDefault   = Column(Boolean, default=False)

    # Object storage — logo URL (Supabase / R2 / S3)
    logoUrl      = Column(String, nullable=True)   # signed URL generated on demand
    logoMimeType = Column(String, nullable=True)

    createdAt = Column(DateTime(timezone=True), default=func.now())
    updatedAt = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    gym          = relationship("Gym", backref="branches")
    members      = relationship("Member",       back_populates="branch")
    invoices     = relationship("Invoice",      back_populates="branch")
    proteinStocks = relationship("ProteinStock", back_populates="branch")


# ─────────────────────────────────────────────────────────────────────────────
# Invoice
# ─────────────────────────────────────────────────────────────────────────────

class Invoice(Base):
    __tablename__ = "Invoice"
    __table_args__ = (
        Index("ix_invoice_gym_id",     "gymId"),
        Index("ix_invoice_gym_date",   "gymId", "invoiceDate"),
        Index("ix_invoice_gym_status", "gymId", "status"),
        Index("ix_invoice_gym_member", "gymId", "memberId"),
    )

    id     = Column(String, primary_key=True, default=generate_uuid)
    gymId  = Column(String, ForeignKey("Gym.id"), nullable=False)

    memberId     = Column(String, ForeignKey("Member.id"), nullable=True)
    customerName = Column(String, nullable=True)

    invoiceDate = Column(DateTime(timezone=True), default=func.now())
    dueDate     = Column(DateTime(timezone=True), nullable=True)

    # Line items — structured JSON array
    # Each item: { description, quantity, rate, amount }
    items    = Column(JSON, nullable=False)

    subTotal = Column(MONEY, nullable=False)  # ARCH-03: was Float
    tax      = Column(MONEY, default=0)
    discount = Column(MONEY, default=0)
    total    = Column(MONEY, nullable=False)

    # FIX: paidAmount is now the ONLY source of truth for payment state.
    # editReason must NEVER encode financial data (e.g. "Paid: ₹500").
    paidAmount = Column(MONEY, default=0)  # ARCH-03: was Float

    status      = Column(String, default="PENDING")   # PENDING | PARTIAL | PAID
    paymentMode = Column(String, nullable=True)        # CASH | UPI | CARD | BANK

    # editReason is a CATEGORY TAG only: Admission | Renewal | Re-Admission | Protein
    lastEditedBy      = Column(String, nullable=True)
    editReason        = Column(String, nullable=True)   # category tag — NOT financial data
    termsAndConditions = Column(JSON, nullable=True)    # snapshot of T&C at invoice time

    branchId = Column(String, ForeignKey("Branch.id"), nullable=True)

    # SCH-08: Soft-delete — never hard-delete invoices (financial audit trail)
    isDeleted = Column(Boolean, default=False, index=True)
    deletedAt = Column(DateTime(timezone=True), nullable=True)

    createdAt = Column(DateTime(timezone=True), default=func.now())
    updatedAt = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    gym     = relationship("Gym",    back_populates="invoices")
    member  = relationship("Member", back_populates="invoices")
    branch  = relationship("Branch", back_populates="invoices")

    # paymentLogs JSON column removed.
    # Payment history now lives in PaymentEvent table (append-only, queryable).
    paymentEvents = relationship("PaymentEvent", back_populates="invoice",
                                 cascade="all, delete-orphan")


# ─────────────────────────────────────────────────────────────────────────────
# PaymentEvent  (replaces Invoice.paymentLogs JSON blob)
# ─────────────────────────────────────────────────────────────────────────────

class PaymentEvent(Base):
    """
    One row per payment action on an invoice.  Append-only.
    Eliminates the TOAST rewrite problem from paymentLogs JSON growing large.
    paidAmount on Invoice = SUM(PaymentEvent.amount WHERE invoiceId = X).
    """
    __tablename__ = "PaymentEvent"
    __table_args__ = (
        Index("ix_payment_invoice", "invoiceId"),
        Index("ix_payment_gym",     "gymId"),
    )

    id        = Column(String, primary_key=True, default=generate_uuid)
    invoiceId = Column(String, ForeignKey("Invoice.id"), nullable=False)
    gymId     = Column(String, ForeignKey("Gym.id"),     nullable=False)

    amount      = Column(MONEY, nullable=False)          # ARCH-03: was Float
    paymentMode = Column(String(20), nullable=False)   # CASH | UPI | CARD | BANK
    notes       = Column(Text, nullable=True)
    recordedBy  = Column(String, nullable=True)        # username of staff recording payment

    createdAt = Column(DateTime(timezone=True), default=func.now())

    invoice = relationship("Invoice", back_populates="paymentEvents")
    gym     = relationship("Gym",     backref="paymentEvents")


# ─────────────────────────────────────────────────────────────────────────────
# Member
# ─────────────────────────────────────────────────────────────────────────────

class Member(Base):
    __tablename__ = "Member"
    __table_args__ = (
        Index("ix_member_gym_id",      "gymId"),
        # FIX: removed ix_member_gym_status index on stale MembershipStatus column.
        # Filter on NextDuedate using computed_status.expression instead.
        Index("ix_member_gym_receipt", "gymId", "MembershipReceiptnumber"),
        Index("ix_member_gym_expiry",  "gymId", "MembershipExpiryDate"),
        Index("ix_member_gym_nextdue", "gymId", "NextDuedate"),
        # PERF-1: partial index for computed_status == "Active" queries
        # Covers the majority of dashboard/member-list filters at fraction of full-table cost
        Index("ix_member_gym_active", "gymId", "NextDuedate",
              postgresql_where=Column("NextDuedate").isnot(None)),
    )

    id    = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    Name                    = Column(String, nullable=False)
    MembershipReceiptnumber = Column(Integer, nullable=True)
    Gender                  = Column(String, nullable=True)
    Age                     = Column(Integer, nullable=True)

    # FIX: AccessStatus removed (was deprecated — popped from every response)
    # FIX: MembershipStatus stored column removed — use computed_status exclusively

    height = Column(Float, nullable=True)
    weight = Column(Integer, nullable=True)

    DateOfJoining  = Column(Date, nullable=True)
    DateOfReJoin   = Column(Date, nullable=True)
    Billtype       = Column(String, nullable=True)
    Address        = Column(String, nullable=True)

    # FIX: Phone numbers stored as String — BigInteger silently drops leading zeros
    # and cannot store international numbers.
    Whatsapp = Column(String(15), nullable=True)
    Mobile   = Column(String(15), nullable=True)

    # SCH-07: Aadhaar ENCRYPTED at rest using Fernet AES-128 (core/aadhaar_crypto.py).
    # The column stores Fernet ciphertext (base64 ~200 chars), never plaintext.
    # API responses return 'XXXX-XXXX-NNNN' via mask_aadhaar().
    Aadhaar     = Column(String(300), nullable=True)   # Fernet ciphertext
    # AadhaarHash: HMAC-SHA256 for duplicate detection (WHERE AadhaarHash = ?).
    # Cannot be reversed — used only for dedup, never returned to clients.
    AadhaarHash = Column(String(64), nullable=True, index=True)

    PlanPeriod = Column(String, nullable=True)
    PlanType   = Column(String, nullable=True)

    MembershipExpiryDate = Column(Date, nullable=True)
    LastPaymentDate      = Column(Date, nullable=True)
    NextDuedate          = Column(Date, nullable=True)
    LastPaymentAmount    = Column(Integer, nullable=True)
    RenewalReceiptNumber = Column(Integer, nullable=True)
    Remark               = Column(String, nullable=True)
    extraDays            = Column(Integer, nullable=True, default=0)
    agreeTerms           = Column(Boolean, default=False)

    # Object storage — profile photo URL (Supabase / R2 / S3)
    # FIX: replaced LargeBinary imageData with a URL column
    imageUrl      = Column(String, nullable=True)   # signed URL generated on demand
    imageMimeType = Column(String, nullable=True)
    hasImage      = Column(Boolean, default=False)  # fast flag for list endpoints

    # Multi-branch support
    branchId = Column(String, ForeignKey("Branch.id"), nullable=True)

    lastEditedBy = Column(String, nullable=True)
    editReason   = Column(String, nullable=True)

    createdAt = Column(DateTime(timezone=True), default=func.now())
    updatedAt = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    # SCH-08: Soft-delete — never hard-delete members (audit trail, unpaid invoices)
    isDeleted = Column(Boolean, default=False, index=True)
    deletedAt = Column(DateTime(timezone=True), nullable=True)

    gym     = relationship("Gym",    back_populates="members")
    invoices = relationship("Invoice", back_populates="member")
    branch  = relationship("Branch", back_populates="members")

    # ── Computed membership status ────────────────────────────────────────────
    # This is the ONLY source of truth for member status.
    # Do NOT store a MembershipStatus column — it will drift from NextDuedate.

    @hybrid_property
    def computed_status(self):
        from datetime import datetime
        today = datetime.now().date()
        if not self.NextDuedate:
            return "Inactive"
        return "Active" if self.NextDuedate >= today else "Expired"

    @computed_status.expression
    def computed_status(cls):
        return case(
            (cls.NextDuedate.is_(None), "Inactive"),
            (cls.NextDuedate >= func.current_date(), "Active"),
            else_="Expired",
        )


# ─────────────────────────────────────────────────────────────────────────────
# ProteinStock  (product catalogue entry)
# ─────────────────────────────────────────────────────────────────────────────

class ProteinStock(Base):
    __tablename__ = "ProteinStock"
    __table_args__ = (
        Index("ix_protein_gym_id", "gymId"),
    )

    id    = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    Year        = Column(String, nullable=True)
    Month       = Column(String, nullable=True)
    Brand       = Column(String, nullable=True)
    ProductName = Column(String, nullable=True)
    Flavour     = Column(String, nullable=True)
    Weight      = Column(String, nullable=True)
    Quantity    = Column(Integer, default=0)   # synced from sum of ProteinLot.quantity
    MRPPrice    = Column(MONEY, default=0)     # ARCH-03: was Float
    LandingPrice = Column(MONEY, default=0)
    Remark      = Column(String, nullable=True)

    MarginPrice  = Column(MONEY, nullable=True)
    OfferPrice   = Column(MONEY, nullable=True)
    SellingPrice = Column(MONEY, nullable=True)
    ProfitAmount = Column(MONEY, nullable=True)   # SellingPrice - LandingPrice per unit
    ExpiryDate   = Column(Date, nullable=True)
    StockThreshold = Column(Integer, default=5)

    # Object storage — product image URL (Supabase / R2 / S3)
    # FIX: replaced LargeBinary imageData with a URL column
    imageUrl      = Column(String, nullable=True)
    imageMimeType = Column(String, nullable=True)
    hasImage      = Column(Boolean, default=False)

    # Multi-branch support
    branchId = Column(String, ForeignKey("Branch.id"), nullable=True)

    createdAt = Column(DateTime(timezone=True), default=func.now())
    updatedAt = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    gym    = relationship("Gym",    back_populates="proteinStocks")
    branch = relationship("Branch", back_populates="proteinStocks")
    lots   = relationship("ProteinLot", back_populates="protein",
                          cascade="all, delete-orphan")


# ─────────────────────────────────────────────────────────────────────────────
# ProteinLot  (individual purchase batches for a product)
# ─────────────────────────────────────────────────────────────────────────────

class ProteinLot(Base):
    __tablename__ = "ProteinLot"
    __table_args__ = (
        Index("ix_lot_gym_protein", "gymId", "proteinId"),
    )

    id        = Column(String, primary_key=True, default=generate_uuid)
    gymId     = Column(String, ForeignKey("Gym.id"),          nullable=False)
    proteinId = Column(String, ForeignKey("ProteinStock.id"), nullable=False)

    lotNumber     = Column(String, nullable=True)
    quantity      = Column(Integer, default=0)
    purchasePrice = Column(MONEY, nullable=True)   # ARCH-03: was Float
    sellingPrice  = Column(MONEY, nullable=True)
    marginType    = Column(String, nullable=True)   # percentage | fixed
    marginValue   = Column(MONEY, nullable=True)
    offerPrice    = Column(MONEY, nullable=True)
    expiryDate    = Column(Date, nullable=True)

    createdAt = Column(DateTime(timezone=True), default=func.now())
    updatedAt = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    protein = relationship("ProteinStock", back_populates="lots")
    gym     = relationship("Gym", backref="proteinLots")


# ─────────────────────────────────────────────────────────────────────────────
# GymDailySummary  (pre-computed dashboard cache — written by background job)
# ─────────────────────────────────────────────────────────────────────────────

class GymDailySummary(Base):
    __tablename__ = "GymDailySummary"
    __table_args__ = (
        Index("ix_summary_gym_date", "gymId", "summaryDate", unique=True),
    )

    id          = Column(String, primary_key=True, default=generate_uuid)
    gymId       = Column(String, ForeignKey("Gym.id"), nullable=False, index=True)
    summaryDate = Column(Date, nullable=False)

    activeMembers  = Column(Integer, default=0)
    newMembers     = Column(Integer, default=0)
    renewals       = Column(Integer, default=0)
    expiringToday  = Column(Integer, default=0)

    totalIncome    = Column(MONEY, default=0)   # ARCH-03
    totalExpenses  = Column(MONEY, default=0)
    pendingBalance = Column(MONEY, default=0)
    lowStockCount  = Column(Integer, default=0)

    # SCH-06: Week/month aggregates so dashboard doesn't run live SUM queries
    weekToDateIncome  = Column(MONEY, default=0)   # Mon–today income
    monthToDateIncome = Column(MONEY, default=0)   # 1st–today income

    createdAt = Column(DateTime(timezone=True), default=func.now())
    updatedAt = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    gym = relationship("Gym", backref="dailySummaries")


# ─────────────────────────────────────────────────────────────────────────────
# GymSettings  (per-gym configuration — cache for 10 min via core/cache.py)
# ─────────────────────────────────────────────────────────────────────────────

class GymSettings(Base):
    __tablename__ = "GymSettings"

    id    = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False, unique=True)

    # General
    currency           = Column(String, default="INR")
    dateFormat         = Column(String, default="DD/MM/YYYY")
    timezone           = Column(String, default="Asia/Kolkata")
    financialYearStart = Column(String, default="April")

    # GST
    enableGST        = Column(Boolean, default=False)
    memberGSTPercent = Column(MONEY, default=18.0)   # ARCH-03
    proteinGSTPercent = Column(MONEY, default=18.0)
    gstin            = Column(String, nullable=True)
    showGSTBreakup   = Column(Boolean, default=True)
    hsnService       = Column(String, default="99979")
    hsnGoods         = Column(String, default="21069099")

    # Billing
    invoicePrefix      = Column(String, default="EZT-")
    receiptPrefix      = Column(String, default="RCP-")
    invoiceStartNumber = Column(Integer, default=1001)
    showLogoOnInvoice  = Column(Boolean, default=True)
    showTermsOnInvoice = Column(Boolean, default=True)
    invoiceTermsText   = Column(Text, nullable=True)

    # Stock
    lowStockThreshold   = Column(Integer, default=5)
    reorderPoint        = Column(Integer, default=10)
    expiryWarningDays   = Column(Integer, default=30)
    expiryRange         = Column(Integer, default=30)
    postExpiryGraceDays = Column(Integer, default=30)
    admissionExpiryDays = Column(Integer, default=365)
    readmissionDiscount = Column(Integer, default=50)
    admissionFee        = Column(MONEY, default=0.0)   # ARCH-03
    reAdmissionFee      = Column(MONEY, default=0.0)

    # Personal Training
    enablePersonalTraining = Column(Boolean, default=False)

    # Notifications
    enableWhatsAppReminders = Column(Boolean, default=True)
    reminderDaysBefore      = Column(Integer, default=3)

    createdAt = Column(DateTime(timezone=True), default=func.now())
    updatedAt = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    gym = relationship("Gym", backref="settings")


# ─────────────────────────────────────────────────────────────────────────────
# Expense
# ─────────────────────────────────────────────────────────────────────────────

class Expense(Base):
    __tablename__ = "Expense"
    __table_args__ = (
        Index("ix_expense_gym_date",     "gymId", "date"),
        Index("ix_expense_gym_category", "gymId", "category"),
    )

    id    = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    category    = Column(String, nullable=False)
    amount      = Column(MONEY, nullable=False)   # ARCH-03: was Float
    date        = Column(Date, nullable=False)
    paymentMode = Column(String, nullable=True)
    reference   = Column(String, nullable=True)
    notes       = Column(Text, nullable=True)

    # Object storage — receipt image URL
    # FIX: replaced LargeBinary receiptImage with a URL column
    receiptUrl      = Column(String, nullable=True)
    receiptMimeType = Column(String, nullable=True)
    hasReceipt      = Column(Boolean, default=False)

    # Multi-branch support
    branchId = Column(String, ForeignKey("Branch.id"), nullable=True)

    lastEditedBy = Column(String, nullable=True)
    editReason   = Column(String, nullable=True)

    createdAt = Column(DateTime(timezone=True), default=func.now())
    updatedAt = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    gym    = relationship("Gym", backref="expenses")
    branch = relationship("Branch", backref="expenses")


# ─────────────────────────────────────────────────────────────────────────────
# ExternalContact  (vendors, consultants, partners with pending balances)
# ─────────────────────────────────────────────────────────────────────────────

class ExternalContact(Base):
    __tablename__ = "ExternalContact"
    __table_args__ = (
        Index("ix_contact_gym_id",   "gymId"),
        Index("ix_contact_gym_type", "gymId", "isActive"),
    )

    id    = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    name        = Column(String, nullable=False)
    phone       = Column(String, nullable=True)
    email       = Column(String, nullable=True)
    contactType = Column(String, nullable=True)   # vendor | service | consultant | partner | other
    company     = Column(String, nullable=True)
    address     = Column(Text, nullable=True)
    notes       = Column(Text, nullable=True)
    isActive    = Column(Boolean, default=True)

    # Object storage — contact photo URL (optional)
    # FIX: replaced LargeBinary imageData with a URL column
    imageUrl      = Column(String, nullable=True)
    imageMimeType = Column(String, nullable=True)

    createdAt = Column(DateTime(timezone=True), default=func.now())
    updatedAt = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    gym = relationship("Gym", backref="externalContacts")


# ─────────────────────────────────────────────────────────────────────────────
# PricingConfig  (member plan pricing matrix + protein brand defaults)
# ─────────────────────────────────────────────────────────────────────────────

class PricingConfig(Base):
    __tablename__ = "PricingConfig"
    __table_args__ = (
        Index("ix_pricing_gym_id",     "gymId"),
        Index("ix_pricing_gym_active", "gymId", "isActive"),
        # Prevent duplicate configs for the same plan×period per gym.
        # The bulk-upsert endpoint uses SELECT+INSERT in Python; without this
        # constraint two concurrent bulk updates can create conflicting rows.
        Index("uq_pricing_member",  "gymId", "configType", "planType",  "periodType",
              unique=True, postgresql_where="\"configType\" = 'member'"),
        Index("uq_pricing_protein", "gymId", "configType", "brandName",
              unique=True, postgresql_where="\"configType\" = 'protein'"),
    )

    id    = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    configType  = Column(String, nullable=False)   # member | protein | pt
    planType    = Column(String, nullable=True)     # Strength, Cardio, etc.
    periodType  = Column(String, nullable=True)     # Monthly, Quarterly, etc.
    brandName   = Column(String, nullable=True)     # for protein pricing

    basePrice    = Column(MONEY, nullable=False)   # ARCH-03: was Float
    marginType   = Column(String, nullable=True)   # percentage | fixed
    marginValue  = Column(MONEY, nullable=True)
    offerDiscount = Column(MONEY, default=0)

    effectiveFrom = Column(Date, nullable=True)
    isActive      = Column(Boolean, default=True)

    createdAt = Column(DateTime(timezone=True), default=func.now())
    updatedAt = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    gym = relationship("Gym", backref="pricingConfigs")


# ─────────────────────────────────────────────────────────────────────────────
# AuditLog  (change tracking)
# FIX: removed postgresql_partition_by — caused INSERT failures when child
#      partitions were not manually created. Add back via Alembic DDL at scale.
# ─────────────────────────────────────────────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "AuditLog"
    __table_args__ = (
        Index("ix_audit_gym_created", "gymId", "createdAt"),
        Index("ix_audit_gym_entity",  "gymId", "entityType", "entityId"),
    )

    id     = Column(String, primary_key=True, default=generate_uuid)
    gymId  = Column(String, ForeignKey("Gym.id"), nullable=False)

    entityType = Column(String, nullable=False)   # Member | ProteinStock | Invoice | Expense
    entityId   = Column(String, nullable=False)
    action     = Column(String, nullable=False)   # CREATE | UPDATE | DELETE

    # Diff only: { "fieldName": { "from": oldValue, "to": newValue } }
    changes = Column(JSON, nullable=True)

    userId    = Column(String, nullable=True)
    userName  = Column(String, nullable=True)
    ipAddress = Column(String, nullable=True)

    createdAt = Column(DateTime(timezone=True), default=func.now())

    gym = relationship("Gym", backref="auditLogs")


# ─────────────────────────────────────────────────────────────────────────────
# TermsAndConditions
# ─────────────────────────────────────────────────────────────────────────────

class TermsAndConditions(Base):
    __tablename__ = "TermsAndConditions"
    __table_args__ = (
        Index("ix_terms_gym_id", "gymId"),
    )

    id    = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    text      = Column(Text, nullable=False)
    appliesTo = Column(ARRAY(String), nullable=False)   # ["Admission", "Renewal", ...]
    sortOrder = Column(Integer, default=0)
    isActive  = Column(Boolean, default=True)

    createdAt = Column(DateTime(timezone=True), default=func.now())
    updatedAt = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    gym = relationship("Gym", back_populates="termsAndConditions")


# ─────────────────────────────────────────────────────────────────────────────
# WhatsAppTemplate
# ─────────────────────────────────────────────────────────────────────────────

class WhatsAppTemplate(Base):
    __tablename__ = "WhatsAppTemplate"
    __table_args__ = (
        Index("ix_whatsapp_gym_id",   "gymId"),
        # One template per type per gym.  Prevents duplicates from concurrent
        # ensure_default_templates() calls (called on every GET /whatsapp-templates).
        Index("uq_whatsapp_gym_type", "gymId", "templateType", unique=True),
    )

    id    = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    templateType    = Column(String, nullable=False)   # Admission | Re-Admission | Renewal | Protein
    messageTemplate = Column(Text, nullable=False)
    isActive        = Column(Boolean, default=True)

    createdAt = Column(DateTime(timezone=True), default=func.now())
    updatedAt = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    gym = relationship("Gym", backref="whatsappTemplates")
