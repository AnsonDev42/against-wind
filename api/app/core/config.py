from pydantic_settings import BaseSettings
from typing import List, Optional
import os
from pathlib import Path


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file."""
    
    # Database
    database_url: str = "postgresql://postgres:password@localhost:5432/against_wind"
    
    # Redis
    redis_url: str = "redis://localhost:6379"
    
    # S3 Storage
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "gpx-files"
    
    # API Configuration
    secret_key: str = "dev-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # External APIs
    open_meteo_base_url: str = "https://api.open-meteo.com/v1"
    met_office_api_key: Optional[str] = None
    openweather_api_key: Optional[str] = None
    
    # Application Settings
    debug: bool = True
    LOG_LEVEL: str = "INFO"
    JSON_LOGS: bool = False
    cors_origins: List[str] = ["http://localhost:3000","http://localhost:3001"]
    
    # Wind Analysis Settings
    default_sample_distance_km: float = 1.0
    default_time_resolution_minutes: int = 15
    default_rider_height_m: float = 1.5
    
    # Performance Settings
    max_route_length_km: float = 500.0
    max_concurrent_forecasts: int = 10
    forecast_timeout_seconds: int = 30
    cache_ttl_seconds: int = 7200  # 2 hours
    


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    """Get application settings."""
    return settings
