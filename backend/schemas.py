from pydantic import BaseModel

class PaymentCreate(BaseModel):
    amount: float
    date: str

class PaymentResponse(BaseModel):
    id: int
    amount: float
    date: str
    tenant_id: int
    class Config:
        from_attributes = True

class TenantCreate(BaseModel):
    name: str
    email: str
    rent_amount: float
    lease_start_date: str  # NEW
    lease_end_date: str    # NEW

class TenantResponse(BaseModel):
    id: int
    name: str
    email: str
    rent_amount: float
    lease_start_date: str  # NEW
    lease_end_date: str    # NEW
    property_id: int
    payments: list[PaymentResponse] = [] # Shows rent history
    
    class Config:
        from_attributes = True

class PropertyCreate(BaseModel):
    address: str
    units: int
    description: str | None = None

class PropertyResponse(BaseModel):
    id: int
    address: str
    units: int
    description: str | None = None
    owner_id: int
    tenants: list[TenantResponse] = []
    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    email: str
    password: str
    role: str

class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    properties: list[PropertyResponse] = []
    class Config:
        from_attributes = True

class BusinessSummary(BaseModel):
    total_properties: int
    total_tenants: int
    total_revenue: float