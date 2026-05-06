from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.mysql_url,
    pool_pre_ping=True,      # test connections before using them
    future=True,
    pool_size=10,            # number of persistent connections
    max_overflow=20,         # extra connections under heavy load
    pool_recycle=1800,       # recycle connections every 30 minutes
    pool_timeout=30,         # wait max 30s for a connection from pool
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    future=True,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
