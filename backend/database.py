from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# This is the exact address and password we set up in your docker-compose file!
SQLALCHEMY_DATABASE_URL = "postgresql://harmaal_admin:supersecretpassword@db:5432/harmaal_erp"

# The "Engine" is what actually dials the phone and connects to Postgres
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# The "Session" is the actual conversation we have with the database
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# "Base" is the blueprint we will use later to build our tables
Base = declarative_base()