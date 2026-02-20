from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, BigInteger, JSON, LargeBinary
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
import uuid

def generate_uuid():
    return str(uuid.uuid4())

class Gym(Base):
    __tablename__ = "Gym"

    id = Column(String, primary_key=True, default=generate_uuid)
    gymname = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    username = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=False)
    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

    members = relationship("Member", back_populates="gym", cascade="all, delete-orphan")
    proteinStocks = relationship("ProteinStock", back_populates="gym", cascade="all, delete-orphan")
    users = relationship("User", back_populates="gym", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="gym", cascade="all, delete-orphan")

class User(Base):
    __tablename__ = "User"

    id = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    username = Column(String, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, default="STAFF")
    permissions = Column(ARRAY(String)) 
    
    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

    gym = relationship("Gym", back_populates="users")


class Invoice(Base):
    __tablename__ = "Invoice"

    id = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    memberId = Column(String, ForeignKey("Member.id"), nullable=True)
    customerName = Column(String, nullable=True)

    invoiceDate = Column(DateTime, default=func.now())
    dueDate = Column(DateTime, nullable=True)

    items = Column(JSON, nullable=False) # [{ description, quantity, rate, amount }]

    subTotal = Column(Float, nullable=False)
    tax = Column(Float, default=0)
    discount = Column(Float, default=0)
    total = Column(Float, nullable=False)

    status = Column(String, default="PENDING")
    paymentMode = Column(String, nullable=True)

    lastEditedBy = Column(String, nullable=True)
    editReason = Column(String, nullable=True)
    
    # Multi-branch support
    branchId = Column(String, ForeignKey("Branch.id"), nullable=True)

    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

    gym = relationship("Gym", back_populates="invoices")
    member = relationship("Member", back_populates="Invoice")
    branch = relationship("Branch", back_populates="invoices")

class Member(Base):
    __tablename__ = "Member"

    id = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    Name = Column(String, nullable=False)
    MembershipReceiptnumber = Column(Integer, nullable=True)
    Gender = Column(String, nullable=True)
    Age = Column(Integer, nullable=True)
    AccessStatus = Column(String, default="no")
    height = Column(Float, nullable=True)
    weight = Column(Integer, nullable=True)
    DateOfJoining = Column(String, nullable=True)
    DateOfReJoin = Column(String, nullable=True)
    Billtype = Column(String, nullable=True)
    Address = Column(String, nullable=True)
    Whatsapp = Column(BigInteger, nullable=True)
    PlanPeriod = Column(String, nullable=True)
    PlanType = Column(String, nullable=True)
    MembershipStatus = Column(String, default="Inactive")
    MembershipExpiryDate = Column(String, nullable=True)
    LastPaymentDate = Column(String, nullable=True)
    NextDuedate = Column(String, nullable=True)
    LastPaymentAmount = Column(Integer, nullable=True)
    RenewalReceiptNumber = Column(Integer, nullable=True)
    Aadhaar = Column(BigInteger, nullable=True)
    Remark = Column(String, nullable=True)
    Mobile = Column(BigInteger, nullable=True)
    extraDays = Column(String, nullable=True)
    agreeTerms = Column(Boolean, default=False)
    
    # Image storage
    imageData = Column(LargeBinary, nullable=True)
    imageMimeType = Column(String, nullable=True)
    
    # Multi-branch support (future-ready)
    branchId = Column(String, ForeignKey("Branch.id"), nullable=True)

    lastEditedBy = Column(String, nullable=True)
    editReason = Column(String, nullable=True)

    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

    gym = relationship("Gym", back_populates="members")
    Invoice = relationship("Invoice", back_populates="member")
    branch = relationship("Branch", back_populates="members")

class ProteinStock(Base):
    __tablename__ = "ProteinStock"

    id = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    Year = Column(String, nullable=True)
    Month = Column(String, nullable=True)
    Brand = Column(String, nullable=True)
    ProductName = Column(String, nullable=True)
    Flavour = Column(String, nullable=True)
    Weight = Column(String, nullable=True)
    Quantity = Column(String, nullable=True)
    MRPPrice = Column(String, nullable=True)
    LandingPrice = Column(String, nullable=True)
    TotalPrice = Column(String, nullable=True)
    Remark = Column(String, nullable=True)
    
    # New pricing fields
    MarginPrice = Column(Float, nullable=True)
    OfferPrice = Column(Float, nullable=True)
    SellingPrice = Column(Float, nullable=True)
    AvailableStock = Column(Integer, default=0)  # Current stock count
    StockThreshold = Column(Integer, default=5)
    
    # Image storage
    imageData = Column(LargeBinary, nullable=True)
    imageMimeType = Column(String, nullable=True)
    
    # Multi-branch support
    branchId = Column(String, ForeignKey("Branch.id"), nullable=True)

    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

    gym = relationship("Gym", back_populates="proteinStocks")
    branch = relationship("Branch", back_populates="proteinStocks")


class Branch(Base):
    """Multi-branch support - future-ready"""
    __tablename__ = "Branch"

    id = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)
    
    name = Column(String, nullable=False)
    address = Column(Text, nullable=True)
    phone = Column(String, nullable=True)
    isActive = Column(Boolean, default=True)
    isDefault = Column(Boolean, default=False)

    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

    gym = relationship("Gym", backref="branches")
    members = relationship("Member", back_populates="branch")
    invoices = relationship("Invoice", back_populates="branch")
    proteinStocks = relationship("ProteinStock", back_populates="branch")


class GymSettings(Base):
    """Gym-wide configuration settings"""
    __tablename__ = "GymSettings"

    id = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False, unique=True)

    # General Settings
    currency = Column(String, default="INR")
    dateFormat = Column(String, default="DD/MM/YYYY")
    timezone = Column(String, default="Asia/Kolkata")
    financialYearStart = Column(String, default="April")

    # GST Configuration
    enableGST = Column(Boolean, default=False)
    memberGSTPercent = Column(Float, default=18.0)
    proteinGSTPercent = Column(Float, default=18.0)
    gstin = Column(String, nullable=True)
    showGSTBreakup = Column(Boolean, default=True)
    hsnService = Column(String, default="99979")
    hsnGoods = Column(String, default="21069099")

    # Billing Settings
    invoicePrefix = Column(String, default="EZT-")
    receiptPrefix = Column(String, default="RCP-")
    invoiceStartNumber = Column(Integer, default=1001)
    showLogoOnInvoice = Column(Boolean, default=True)
    showTermsOnInvoice = Column(Boolean, default=True)
    invoiceTermsText = Column(Text, nullable=True)

    # Stock Settings
    lowStockThreshold = Column(Integer, default=5)
    reorderPoint = Column(Integer, default=10)
    expiryWarningDays = Column(Integer, default=30)
    expiryRange = Column(Integer, default=30) # Configure expiry range for calculation
    postExpiryGraceDays = Column(Integer, default=30) # Days after expiry to still show in "Expiry Soon"
    admissionExpiryDays = Column(Integer, default=365) # Days after due date when admission expires
    readmissionDiscount = Column(Integer, default=50) # Percentage discount for readmission

    # Fee Settings
    admissionFee = Column(Float, default=0.0)
    reAdmissionFee = Column(Float, default=0.0)

    # Personal Training Settings
    enablePersonalTraining = Column(Boolean, default=False)

    # Notification Settings
    enableWhatsAppReminders = Column(Boolean, default=True)
    reminderDaysBefore = Column(Integer, default=3)

    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

    gym = relationship("Gym", backref="settings")


class Expense(Base):
    """Track gym expenses by category"""
    __tablename__ = "Expense"

    id = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    category = Column(String, nullable=False)  # Rent, Electricity, Salaries, Maintenance, Supplies, Marketing, Other
    amount = Column(Float, nullable=False)
    date = Column(String, nullable=False)  # YYYY-MM-DD format
    paymentMode = Column(String, nullable=True)  # Cash, UPI, Card, Bank Transfer
    reference = Column(String, nullable=True)  # Receipt/Bill number
    notes = Column(Text, nullable=True)
    receiptImage = Column(LargeBinary, nullable=True)
    receiptImageMimeType = Column(String, nullable=True)
    
    # Multi-branch support
    branchId = Column(String, ForeignKey("Branch.id"), nullable=True)

    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

    gym = relationship("Gym", backref="expenses")
    branch = relationship("Branch", backref="expenses")


class ExternalContact(Base):
    """Non-gym members who have pending balances"""
    __tablename__ = "ExternalContact"

    id = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    contactType = Column(String, nullable=True)  # vendor, service, consultant, partner, other
    company = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    isActive = Column(Boolean, default=True)
    
    # Image storage
    imageData = Column(LargeBinary, nullable=True)
    imageMimeType = Column(String, nullable=True)

    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

    gym = relationship("Gym", backref="externalContacts")


class PricingConfig(Base):
    """Configurable pricing for members and proteins"""
    __tablename__ = "PricingConfig"

    id = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    configType = Column(String, nullable=False)  # "member" or "protein"
    planType = Column(String, nullable=True)  # Strength, Cardio, etc. (for members)
    periodType = Column(String, nullable=True)  # Monthly, Quarterly, etc.
    brandName = Column(String, nullable=True)  # For protein pricing
    
    basePrice = Column(Float, nullable=False)
    marginType = Column(String, nullable=True)  # "percentage" or "fixed"
    marginValue = Column(Float, nullable=True)
    offerDiscount = Column(Float, default=0)
    
    effectiveFrom = Column(String, nullable=True)  # YYYY-MM-DD
    isActive = Column(Boolean, default=True)

    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

    gym = relationship("Gym", backref="pricingConfigs")


class PendingBalance(Base):
    """Track pending balances for members and external contacts"""
    __tablename__ = "PendingBalance"

    id = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    # Entity info (who owes money)
    entityType = Column(String, nullable=False)  # "member" or "external"
    entityName = Column(String, nullable=False)  # Name of person/entity
    phone = Column(String, nullable=True)  # Contact phone for WhatsApp reminders
    
    # Optional references
    memberId = Column(String, ForeignKey("Member.id"), nullable=True)
    externalContactId = Column(String, ForeignKey("ExternalContact.id"), nullable=True)
    
    # Balance details
    amount = Column(Float, nullable=False)  # Total amount owed
    paidAmount = Column(Float, default=0)  # Amount already paid
    dueDate = Column(String, nullable=True)  # YYYY-MM-DD format
    description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)  # Payment notes/history
    status = Column(String, default="pending")  # pending, partial, paid
    
    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

    gym = relationship("Gym", backref="pendingBalances")
    member = relationship("Member", backref="pendingBalances")
    externalContact = relationship("ExternalContact", backref="pendingBalances")


class AuditLog(Base):
    """Track all changes for audit purposes"""
    __tablename__ = "AuditLog"

    id = Column(String, primary_key=True, default=generate_uuid)
    gymId = Column(String, ForeignKey("Gym.id"), nullable=False)

    entityType = Column(String, nullable=False)  # Member, ProteinStock, Invoice, Expense, etc.
    entityId = Column(String, nullable=False)
    action = Column(String, nullable=False)  # CREATE, UPDATE, DELETE
    
    beforeData = Column(JSON, nullable=True)
    afterData = Column(JSON, nullable=True)
    changedFields = Column(JSON, nullable=True)  # List of field names that changed
    
    userId = Column(String, nullable=True)
    userName = Column(String, nullable=True)
    ipAddress = Column(String, nullable=True)

    createdAt = Column(DateTime, default=func.now())

    gym = relationship("Gym", backref="auditLogs")
