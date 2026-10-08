from datetime import datetime, timezone
from sqlalchemy import DateTime, JSON, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from .config import get_settings

class Base(DeclarativeBase):
    pass

class Farmer(Base):
    __tablename__ = 'farmers'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    profile: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args={'check_same_thread': False} if settings.database_url.startswith('sqlite') else {})
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
def get_db():
    with SessionLocal() as session:
        yield session

def utcnow():
    return datetime.now(timezone.utc)
