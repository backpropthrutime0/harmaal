from passlib.context import CryptContext
from datetime import datetime, timedelta
import jwt

# The Password Shredder
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# The Wristband Machine Settings
SECRET_KEY = "harmaal-super-secret-master-key" # In production, this gets hidden!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 # The wristband expires after 1 hour

def get_password_hash(password: str):
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    # Make a copy of the data (like the user's email and role)
    to_encode = data.copy()
    
    # Calculate the expiration time
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # Add the expiration time to the data
    to_encode.update({"exp": expire})
    
    # Print the final digital wristband
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt