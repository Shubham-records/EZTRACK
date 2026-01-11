from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, BigInteger, JSON
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

    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

    gym = relationship("Gym", back_populates="invoices")
    member = relationship("Member", back_populates="Invoice")

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

    lastEditedBy = Column(String, nullable=True)
    editReason = Column(String, nullable=True)

    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

    gym = relationship("Gym", back_populates="members")
    Invoice = relationship("Invoice", back_populates="member")

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

    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

    gym = relationship("Gym", back_populates="proteinStocks")
