from sqlalchemy import Column, Integer, String, ForeignKey, Float
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="user")
    properties = relationship("Property", back_populates="owner")

class Property(Base):
    __tablename__ = "properties"
    id = Column(Integer, primary_key=True, index=True)
    address = Column(String, index=True)
    units = Column(Integer)
    description = Column(String, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="properties")
    tenants = relationship("Tenant", back_populates="property", cascade="all, delete-orphan")

class Tenant(Base):
    __tablename__ = "tenants"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String)
    rent_amount = Column(Float)
    
    # --- NEW LEASE DATA ---
    lease_start_date = Column(String) 
    lease_end_date = Column(String)   
    
    property_id = Column(Integer, ForeignKey("properties.id"))
    property = relationship("Property", back_populates="tenants")
    # Link back to payment history
    payments = relationship("Payment", back_populates="tenant", cascade="all, delete-orphan")

class Payment(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Float)
    date = Column(String)
    tenant_id = Column(Integer, ForeignKey("tenants.id"))
    tenant = relationship("Tenant", back_populates="payments")