from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    database_url: str

    # Redis
    redis_url: str

    # S3 Storage
    s3_endpoint: str
    s3_access_key: str
    s3_secret_key: str
    s3_bucket: str = "gpx-files"

    # API Configuration
    secret_key: str
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
    cors_origins: str = "http://localhost:3000,http://localhost:3001"

    # Wind Analysis Settings
    default_sample_distance_km: float = 1.0
    default_time_resolution_minutes: int = 15
    default_rider_height_m: float = 1.5

    # Performance Settings
    max_route_length_km: float = 500.0
    max_concurrent_forecasts: int = 10
    forecast_timeout_seconds: int = 30
    cache_ttl_seconds: int = 7200  # 2 hours

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins string into a list."""
        if self.cors_origins == "*":
            return ["*"]
        return [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    """Get application settings."""
    return settings
