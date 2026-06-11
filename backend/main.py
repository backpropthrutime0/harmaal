from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import jwt
from jwt.exceptions import InvalidTokenError

# Import your custom modules
from database import engine, SessionLocal
import models
import schemas
import security

# Create all database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Harmaal Master API")

# --- SECURITY SETUP ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# Database dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# The Bouncer: Authentication checker
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired wristband",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except InvalidTokenError:
        raise credentials_exception
        
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception
    return user

# Admin Bouncer
def require_admin(current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return current_user

# --- CORE ROUTES ---
@app.get("/")
def read_root():
    return {"message": "Welcome to the Harmaal Holding Enterprise API"}

# --- USER MANAGEMENT ---
@app.post("/users/", response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    hashed_pw = security.get_password_hash(user.password)
    db_user = models.User(email=user.email, hashed_password=hashed_pw, role=user.role)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/login/")
def login(user_credentials: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == user_credentials.username).first()
    if not user or not security.verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Credentials")
    access_token = security.create_access_token(data={"sub": user.email, "role": user.role})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=schemas.UserResponse)
def get_my_profile(current_user: models.User = Depends(get_current_user)):
    return current_user

# --- PROPERTY MANAGEMENT ---
@app.post("/properties/", response_model=schemas.PropertyResponse)
def create_new_property(property_data: schemas.PropertyCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    new_property = models.Property(**property_data.dict(), owner_id=current_user.id)
    db.add(new_property)
    db.commit()
    db.refresh(new_property)
    return new_property

@app.get("/properties/", response_model=list[schemas.PropertyResponse])
def get_all_properties(db: Session = Depends(get_db)):
    return db.query(models.Property).all()

@app.put("/properties/{property_id}", response_model=schemas.PropertyResponse)
def update_property(property_id: int, property_data: schemas.PropertyCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_prop = db.query(models.Property).filter(models.Property.id == property_id, models.Property.owner_id == current_user.id).first()
    if not db_prop:
        raise HTTPException(status_code=404, detail="Property not found or unauthorized")
    for key, value in property_data.dict().items():
        setattr(db_prop, key, value)
    db.commit()
    db.refresh(db_prop)
    return db_prop

@app.delete("/properties/{property_id}")
def delete_property(property_id: int, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    db_prop = db.query(models.Property).filter(models.Property.id == property_id).first()
    if not db_prop:
        raise HTTPException(status_code=404, detail="Property not found")
    db.delete(db_prop)
    db.commit()
    return {"message": "Building completely demolished"}

# --- TENANT & RENT COLLECTION ---
@app.post("/properties/{property_id}/tenants/", response_model=schemas.TenantResponse)
def add_tenant_to_property(property_id: int, tenant_data: schemas.TenantCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_prop = db.query(models.Property).filter(models.Property.id == property_id, models.Property.owner_id == current_user.id).first()
    if not db_prop:
        raise HTTPException(status_code=404, detail="Property not found or unauthorized")
    new_tenant = models.Tenant(**tenant_data.dict(), property_id=property_id)
    db.add(new_tenant)
    db.commit()
    db.refresh(new_tenant)
    return new_tenant

@app.post("/tenants/{tenant_id}/payments/", response_model=schemas.PaymentResponse)
def collect_rent(tenant_id: int, payment_data: schemas.PaymentCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_tenant = db.query(models.Tenant).filter(models.Tenant.id == tenant_id, models.Tenant.property.has(owner_id=current_user.id)).first()
    if not db_tenant:
        raise HTTPException(status_code=404, detail="Tenant not found or unauthorized")
    new_payment = models.Payment(**payment_data.dict(), tenant_id=tenant_id)
    db.add(new_payment)
    db.commit()
    db.refresh(new_payment)
    return new_payment

# --- BUSINESS INTELLIGENCE ---
@app.get("/business/summary", response_model=schemas.BusinessSummary)
def get_business_summary(db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    properties = db.query(models.Property).all()
    tenants = db.query(models.Tenant).all()
    payments = db.query(models.Payment).all()
    return {
        "total_properties": len(properties),
        "total_tenants": len(tenants),
        "total_revenue": sum(p.amount for p in payments)
    }