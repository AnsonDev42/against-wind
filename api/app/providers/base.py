from typing import Protocol, List
from abc import ABC, abstractmethod
from api.app.domain.models import ForecastPoint, WindSample


class ForecastProvider(Protocol):
    """Protocol defining the interface for wind forecast providers."""
    
    name: str
    
    def supports_region(self, lat: float, lon: float) -> bool:
        """Check if provider supports this geographic region."""
        ...
    
    def get_model_run_id(self) -> str:
        """Get current model run identifier for caching consistency."""
        ...
    
    def batch_wind(self, points: List[ForecastPoint]) -> List[WindSample]:
        """Fetch wind data for multiple points in a single batch request."""
        ...


class BaseForecastProvider(ABC):
    """Abstract base class for forecast providers with common functionality."""
    
    def __init__(self, name: str):
        self.name = name
    
    @abstractmethod
    def supports_region(self, lat: float, lon: float) -> bool:
        """Check if provider supports this geographic region."""
        pass
    
    @abstractmethod
    def get_model_run_id(self) -> str:
        """Get current model run identifier."""
        pass
    
    @abstractmethod
    def batch_wind(self, points: List[ForecastPoint]) -> List[WindSample]:
        """Fetch wind data for multiple points."""
        pass
    
    def _validate_coordinates(self, lat: float, lon: float) -> bool:
        """Validate latitude and longitude ranges."""
        return -90 <= lat <= 90 and -180 <= lon <= 180
    
    def _deduplicate_points(self, points: List[ForecastPoint]) -> List[ForecastPoint]:
        """Remove duplicate forecast points to minimize API calls."""
        seen = set()
        unique_points = []
        
        for point in points:
            # Round to reasonable precision for deduplication
            key = (
                round(point.lat, 4),
                round(point.lon, 4), 
                point.time_utc.replace(second=0, microsecond=0)
            )
            if key not in seen:
                seen.add(key)
                unique_points.append(point)
        
        return unique_points
