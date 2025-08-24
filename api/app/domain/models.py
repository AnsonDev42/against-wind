from typing import Protocol, Iterable, Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, Field
from enum import Enum


# Core domain models matching your design

class WindClass(str, Enum):
    """Wind classification relative to route direction."""
    HEAD = "head"      # >120° yaw angle
    CROSS = "cross"    # 60-120° yaw angle  
    TAIL = "tail"      # <60° yaw angle


class ForecastPoint(BaseModel):
    """A point in space and time for wind forecast."""
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    time_utc: datetime


class WindSample(BaseModel):
    """Wind data sample from a forecast provider."""
    u_ms: float  # eastward wind component
    v_ms: float  # northward wind component
    height_m: float
    model_run_id: str
    source: str
    valid_from: datetime
    valid_to: datetime
    meta: Dict[str, Any] = Field(default_factory=dict)


class ForecastProvider(Protocol):
    """Protocol for wind forecast providers."""
    name: str
    
    def supports_region(self, lat: float, lon: float) -> bool:
        """Check if provider supports this geographic region."""
        ...
    
    def get_model_run_id(self) -> str:
        """Get current model run identifier."""
        ...
    
    def batch_wind(self, points: List[ForecastPoint]) -> List[WindSample]:
        """Fetch wind data for multiple points."""
        ...


# Database models (SQLAlchemy will be defined separately)

class RouteCreate(BaseModel):
    """Request to create a new route."""
    gpx_content: str
    name: Optional[str] = None


class Route(BaseModel):
    """Route metadata."""
    id: str
    user_id: Optional[str] = None
    gpx_url: str
    bbox: List[float]  # [min_lon, min_lat, max_lon, max_lat]
    length_km: float
    created_at: datetime
    name: Optional[str] = None
    
    class Config:
        from_attributes = True


class RouteSample(BaseModel):
    """Preprocessed route sample point."""
    route_id: str
    seq: int
    lat: float
    lon: float
    dist_m: float
    bearing_deg: float
    eta_offset_s: int  # seconds from departure time


class AnalysisRequest(BaseModel):
    """Request for wind analysis."""
    route_id: str
    depart_time: datetime
    provider: str = "open-meteo"
    speed_profile: str = "preset"


class ForecastResult(BaseModel):
    """Analysis result metadata."""
    id: str
    route_id: str
    depart_time: datetime
    provider: str
    model_run_id: str
    created_at: datetime
    status: str = "processing"  # processing, completed, failed
    
    class Config:
        from_attributes = True


class SegmentWind(BaseModel):
    """Wind analysis for a route segment."""
    result_id: str
    seq: int
    time_utc: datetime
    wind_dir_deg10m: float
    wind_ms10m: float
    wind_ms1p5m: float  # downscaled to rider height
    yaw_deg: float
    wind_class: WindClass
    gust_ms: Optional[float] = None
    confidence: float = Field(..., ge=0, le=1)


class AnalysisSummary(BaseModel):
    """Summary statistics for route analysis."""
    result_id: str
    head_pct: float
    tail_pct: float
    cross_pct: float
    longest_head_km: float
    window_best_depart: Optional[datetime] = None
    provider_spread: Optional[float] = None
    notes: Optional[str] = None


class AnalysisResponse(BaseModel):
    """Complete analysis response."""
    result: ForecastResult
    segments: List[SegmentWind]
    summary: AnalysisSummary
    map_style_url: Optional[str] = None


# SSE event models

class SSEEvent(BaseModel):
    """Server-sent event."""
    event: str
    data: Dict[str, Any]


class ProgressEvent(SSEEvent):
    """Progress update event."""
    event: str = "progress"
    data: Dict[str, Any] = Field(default_factory=lambda: {
        "stage": "",
        "progress": 0.0,
        "message": ""
    })


class PartialResultEvent(SSEEvent):
    """Partial results event."""
    event: str = "partial"
    data: Dict[str, Any]  # Contains partial segments


class CompleteResultEvent(SSEEvent):
    """Final results event."""
    event: str = "complete"
    data: Dict[str, Any]  # Contains AnalysisResponse


class ErrorEvent(SSEEvent):
    """Error event."""
    event: str = "error"
    data: Dict[str, Any] = Field(default_factory=lambda: {
        "error": "",
        "message": ""
    })


# Cache models

class CacheKey(BaseModel):
    """Base cache key structure."""
    prefix: str
    
    def to_string(self) -> str:
        """Convert to Redis key string."""
        raise NotImplementedError


class TileCacheKey(CacheKey):
    """Cache key for wind tiles."""
    prefix: str = "wind"
    provider: str
    model_run: str
    lat_bin: int
    lon_bin: int
    time_bin: int
    
    def to_string(self) -> str:
        return f"{self.prefix}:{self.provider}:{self.model_run}:{self.lat_bin}:{self.lon_bin}:{self.time_bin}"


class ResultCacheKey(CacheKey):
    """Cache key for route results."""
    prefix: str = "res"
    route_hash: str
    depart_bin: int
    provider: str
    sample_km: float
    
    def to_string(self) -> str:
        return f"{self.prefix}:{self.route_hash}:{self.depart_bin}:{self.provider}:{self.sample_km}"
