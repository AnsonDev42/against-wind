from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Float, DateTime, Text, Integer, Boolean
from datetime import datetime
from typing import Optional, List
import uuid
from api.app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


class RouteDB(Base):
    """Database model for routes."""
    __tablename__ = "routes"
    
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    gpx_url: Mapped[str] = mapped_column(String, nullable=False)
    bbox: Mapped[str] = mapped_column(Text, nullable=False)  # JSON string
    length_km: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class RouteSampleDB(Base):
    """Database model for route sample points."""
    __tablename__ = "route_samples"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    route_id: Mapped[str] = mapped_column(String, nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    dist_m: Mapped[float] = mapped_column(Float, nullable=False)
    bearing_deg: Mapped[float] = mapped_column(Float, nullable=False)
    eta_offset_s: Mapped[int] = mapped_column(Integer, nullable=False)


class ForecastResultDB(Base):
    """Database model for forecast results."""
    __tablename__ = "forecast_results"
    
    id: Mapped[str] = mapped_column(String, primary_key=True)
    route_id: Mapped[str] = mapped_column(String, nullable=False)
    depart_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    provider: Mapped[str] = mapped_column(String, nullable=False)
    model_run_id: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="processing")


class SegmentWindDB(Base):
    """Database model for segment wind data."""
    __tablename__ = "segment_wind"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    result_id: Mapped[str] = mapped_column(String, nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    time_utc: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    wind_dir_deg10m: Mapped[float] = mapped_column(Float, nullable=False)
    wind_ms10m: Mapped[float] = mapped_column(Float, nullable=False)
    wind_ms1p5m: Mapped[float] = mapped_column(Float, nullable=False)
    yaw_deg: Mapped[float] = mapped_column(Float, nullable=False)
    wind_class: Mapped[str] = mapped_column(String, nullable=False)
    gust_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)


class SummaryDB(Base):
    """Database model for analysis summaries."""
    __tablename__ = "summaries"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    result_id: Mapped[str] = mapped_column(String, nullable=False)
    head_pct: Mapped[float] = mapped_column(Float, nullable=False)
    tail_pct: Mapped[float] = mapped_column(Float, nullable=False)
    cross_pct: Mapped[float] = mapped_column(Float, nullable=False)
    longest_head_km: Mapped[float] = mapped_column(Float, nullable=False)
    window_best_depart: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    provider_spread: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


# Database setup
engine = None
async_session_maker = None


async def init_db():
    """Initialize database connection and create tables."""
    global engine, async_session_maker
    
    settings = get_settings()
    
    # Create async engine
    engine = create_async_engine(
        settings.database_url.replace("postgresql://", "postgresql+asyncpg://"),
        echo=settings.debug,
        future=True
    )
    
    # Create session maker
    async_session_maker = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    logger.info("Database initialized successfully")


async def get_db_session() -> AsyncSession:
    """Get database session."""
    if async_session_maker is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()
