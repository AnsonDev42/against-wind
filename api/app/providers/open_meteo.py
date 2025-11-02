import httpx
import asyncio
from typing import List
from datetime import datetime, timezone, timedelta
from api.app.providers.base import BaseForecastProvider
from api.app.domain.models import ForecastPoint, WindSample
from api.app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)


class OpenMeteoProvider(BaseForecastProvider):
    """Open-Meteo forecast provider implementation."""

    def __init__(self):
        super().__init__("open-meteo")
        self.settings = get_settings()
        self.base_url = self.settings.open_meteo_base_url
        self.timeout = self.settings.forecast_timeout_seconds

    def supports_region(self, lat: float, lon: float) -> bool:
        """Open-Meteo supports global coverage."""
        return self._validate_coordinates(lat, lon)

    async def get_model_run_id(self) -> str:
        """Get current model run ID from Open-Meteo."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/forecast",
                    params={
                        "latitude": 0,
                        "longitude": 0,
                        "hourly": "windspeed_10m",
                        "forecast_days": 1,
                    },
                )
                response.raise_for_status()
                data = response.json()

                # Extract model run from response metadata
                # Open-Meteo includes generation time which we can use as model run ID
                generation_time = data.get("generationtime_ms", 0)
                return f"openmeteo_{int(generation_time)}"

        except Exception as e:
            logger.warning(f"Failed to get model run ID: {e}")
            # Fallback to current hour as model run ID
            return f"openmeteo_{datetime.now(timezone.utc).strftime('%Y%m%d_%H')}"

    async def batch_wind(self, points: List[ForecastPoint]) -> List[WindSample]:
        """Fetch wind data for multiple points from Open-Meteo."""
        if not points:
            return []

        # Deduplicate points to minimize API calls
        unique_points = self._deduplicate_points(points)

        logger.info(f"Fetching wind data for {len(unique_points)} unique points")

        model_run_id = await self.get_model_run_id()

        # Make concurrent requests with asyncio.gather for better performance
        # Process in batches to avoid overwhelming the API
        batch_size = 10  # Fetch 10 points concurrently
        wind_samples = []

        for i in range(0, len(unique_points), batch_size):
            batch = unique_points[i : i + batch_size]
            logger.info(
                f"Fetching batch {i//batch_size + 1}/{(len(unique_points) + batch_size - 1)//batch_size}"
            )

            # Create tasks for concurrent fetching
            tasks = [self._fetch_point_wind(point, model_run_id) for point in batch]

            # Execute all tasks concurrently
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Process results
            for point, result in zip(batch, results):
                if isinstance(result, Exception):
                    logger.error(
                        f"Failed to fetch wind for point {point.lat:.4f}, {point.lon:.4f}: {result}"
                    )
                    continue

                wind_samples.extend(result)
                logger.debug(
                    f"Fetched {len(result)} samples for point {point.lat:.4f}, {point.lon:.4f}"
                )

        logger.info(f"Total wind samples fetched: {len(wind_samples)}")
        return wind_samples

    async def _fetch_point_wind(
        self, point: ForecastPoint, model_run_id: str
    ) -> List[WindSample]:
        now = datetime.now(timezone.utc)
        today = now.date()
        target_date = point.time_utc.date()

        # Choose API by recency
        within_recent_window = target_date >= (today - timedelta(days=16))
        hourly_vars = "windspeed_10m,winddirection_10m,windgusts_10m"

        if within_recent_window:
            # Use forecast API with past_days to fetch recent history
            past_days = max(0, (today - target_date).days)
            forecast_days = max(0, (target_date - today).days + 1)

            params = {
                "latitude": point.lat,
                "longitude": point.lon,
                "hourly": hourly_vars,
                "timezone": "UTC",
            }
            if past_days > 0:
                params["past_days"] = min(past_days, 16)
            if forecast_days > 0:
                # up to 16 is allowed, default is 7
                params["forecast_days"] = min(forecast_days, 16)

            api_url = f"{self.base_url}/forecast"
            logger.info(
                f"Fetching forecast (past_days={params.get('past_days', 0)}, "
                f"forecast_days={params.get('forecast_days', 0)}) for {point.lat:.4f},{point.lon:.4f}"
            )
        else:
            # Use ERA5 archive for older dates
            earliest_date = datetime(1940, 1, 1, tzinfo=timezone.utc).date()
            if target_date < earliest_date:
                raise ValueError(
                    f"Historical weather data not available before {earliest_date}"
                )

            params = {
                "latitude": point.lat,
                "longitude": point.lon,
                "start_date": target_date.isoformat(),
                "end_date": target_date.isoformat(),
                "hourly": hourly_vars,
                "timezone": "UTC",
            }

            # IMPORTANT: archive uses a different base host and dataset (era5 or era5-land)
            api_url = "https://archive-api.open-meteo.com/v1/era5"
            logger.info(
                f"Fetching ERA5 archive for {target_date} at {point.lat:.4f},{point.lon:.4f}"
            )

        # Use a longer timeout for individual requests (default is 30s which might be too short)
        # Each request should be allowed to complete, with overall batch timeout managed at higher level
        timeout = httpx.Timeout(60.0, connect=10.0)  # 60s total, 10s connect

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(api_url, params=params)
            resp.raise_for_status()
            data = resp.json()

        return self._parse_response(data, point, model_run_id)

    def _parse_response(
        self, data: dict, point: ForecastPoint, model_run_id: str
    ) -> List[WindSample]:
        """Parse Open-Meteo response into WindSample objects."""
        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        wind_speeds = hourly.get("windspeed_10m", [])
        wind_directions = hourly.get("winddirection_10m", [])
        wind_gusts = hourly.get("windgusts_10m", [])

        samples = []

        logger.debug(
            f"Processing {len(times)} time points for location {point.lat:.4f}, {point.lon:.4f}"
        )

        for i, time_str in enumerate(times):
            if i >= len(wind_speeds) or i >= len(wind_directions):
                continue

            time_utc = datetime.fromisoformat(time_str.replace("Z", "+00:00"))

            # Ensure both datetimes are timezone-aware for comparison
            if time_utc.tzinfo is None:
                time_utc = time_utc.replace(tzinfo=timezone.utc)

            if point.time_utc.tzinfo is None:
                point_time_utc = point.time_utc.replace(tzinfo=timezone.utc)
            else:
                point_time_utc = point.time_utc

            # Skip if this time is too far from our requested point time
            time_diff = abs((time_utc - point_time_utc).total_seconds())
            if time_diff > 7200:  # More than 2 hours difference (was 1 hour)
                continue

            wind_speed = wind_speeds[i]
            wind_direction = wind_directions[i]
            wind_gust = wind_gusts[i] if i < len(wind_gusts) else None

            if wind_speed is None or wind_direction is None:
                continue

            # Convert wind direction and speed to u/v components
            # Wind direction is "from" direction in meteorological convention
            import math

            wind_dir_rad = math.radians(wind_direction)
            u_ms = -wind_speed * math.sin(wind_dir_rad)  # Eastward component
            v_ms = -wind_speed * math.cos(wind_dir_rad)  # Northward component

            sample = WindSample(
                u_ms=u_ms,
                v_ms=v_ms,
                height_m=10.0,  # Open-Meteo provides 10m wind
                model_run_id=model_run_id,
                source=self.name,
                valid_from=time_utc,
                valid_to=time_utc,  # Point forecast
                meta={
                    "wind_speed_10m": wind_speed,
                    "wind_direction_10m": wind_direction,
                    "wind_gust_10m": wind_gust,
                    "lat": point.lat,
                    "lon": point.lon,
                },
            )
            samples.append(sample)

        return samples


# Provider registry
def get_provider(name: str) -> BaseForecastProvider:
    """Get forecast provider by name."""
    providers = {
        "open-meteo": OpenMeteoProvider,
        # Add more providers here
        # "met-office": MetOfficeProvider,
        # "openweather": OpenWeatherProvider,
    }

    if name not in providers:
        raise ValueError(f"Unknown provider: {name}")

    return providers[name]()
