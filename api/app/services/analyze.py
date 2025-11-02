from typing import AsyncGenerator, List, Optional, Dict
from datetime import datetime, timedelta
import uuid
import hashlib
import logging
import json
import asyncio
from pathlib import Path
from api.app.domain.models import (
    AnalysisRequest,
    Route,
    ForecastResult,
    SegmentWind,
    AnalysisSummary,
    ProgressEvent,
    CompleteResultEvent,
    ErrorEvent,
    ForecastPoint,
    WindClass,
)
from api.app.geo.gpx import GPXProcessor, RoutePoint
from api.app.geo.interp import WindInterpolator
from api.app.providers.open_meteo import get_provider
from api.app.storage.db import (
    RouteDB,
    RouteSampleDB,
    ForecastResultDB,
    SegmentWindDB,
    SummaryDB,
    async_session_maker,
)
from api.app.storage.s3 import S3Storage
from api.app.core.config import get_settings
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)

# In-memory cache
_route_storage: Dict[str, Route] = {}
_route_points_storage: Dict[str, List[RoutePoint]] = {}
_analysis_cache: Dict[str, dict] = {}

# Fixed demo route ID used by the UI
DEMO_ROUTE_ID = "demo-glossop-sheffield"


class AnalysisService:
    """Service for route analysis orchestration."""

    def __init__(self):
        self.settings = get_settings()
        self.gpx_processor = GPXProcessor()
        self.wind_interpolator = WindInterpolator()
        self.s3_storage = S3Storage()

    async def create_route(self, gpx_content: str, name: Optional[str] = None) -> Route:
        """Create a new route from GPX content."""
        try:
            # Generate a deterministic ID from the GPX content hash
            route_hash = hashlib.sha256(gpx_content.encode("utf-8")).hexdigest()
            route_id = f"sha256-{route_hash[:32]}"  # Use a truncated hash for the ID

            # Check if route already exists
            if existing_route := await self.get_route(route_id):
                logger.info(f"Returning existing route for ID {route_id}")
                return existing_route

            # Process GPX content if it's a new route
            route_points, metadata = self.gpx_processor.process_route(gpx_content)

            # Store GPX file in S3
            gpx_key = f"routes/{route_id}/original.gpx"
            gpx_url = await self.s3_storage.upload_text(gpx_key, gpx_content)

            # Create route object
            route = Route(
                id=route_id,
                gpx_url=gpx_url,
                bbox=metadata["bbox"],
                length_km=metadata["total_distance_km"],
                created_at=datetime.utcnow(),
                name=name,
            )

            # Store route in database (placeholder - implement with actual DB)
            await self._store_route(route, route_points)

            return route

        except Exception as e:
            logger.error(f"Error creating route: {e}")
            raise

    async def get_route(self, route_id: str) -> Optional[Route]:
        """Get route by ID from database."""
        try:
            # Check in-memory cache first
            if route_id in _route_storage:
                return _route_storage[route_id]

            # Query database
            if async_session_maker is None:
                logger.error("Database not initialized")
                return None

            async with async_session_maker() as session:
                stmt = select(RouteDB).where(RouteDB.id == route_id)
                result = await session.execute(stmt)
                route_db = result.scalar_one_or_none()

                if not route_db:
                    logger.error(f"Route not found in database: {route_id}")
                    return None

                # Convert database model to domain model
                route = Route(
                    id=route_db.id,
                    user_id=route_db.user_id,
                    gpx_url=route_db.gpx_url,
                    bbox=json.loads(route_db.bbox),
                    length_km=route_db.length_km,
                    created_at=route_db.created_at,
                    name=route_db.name,
                )

                # Cache in memory
                _route_storage[route_id] = route
                return route

        except Exception as e:
            logger.error(f"Error getting route {route_id}: {e}")
            return None

    async def get_route_results(self, route_id: str, limit: int = 10) -> List[dict]:
        """Get recent analysis results for a route from database."""
        try:
            if async_session_maker is None:
                logger.error("Database not initialized")
                return []

            async with async_session_maker() as session:
                # Get recent forecast results for this route
                stmt = (
                    select(ForecastResultDB)
                    .where(ForecastResultDB.route_id == route_id)
                    .order_by(ForecastResultDB.created_at.desc())
                    .limit(limit)
                )
                result = await session.execute(stmt)
                results_db = result.scalars().all()

                # Convert to dict format
                results = []
                for result_db in results_db:
                    results.append(
                        {
                            "id": result_db.id,
                            "route_id": result_db.route_id,
                            "depart_time": result_db.depart_time.isoformat(),
                            "provider": result_db.provider,
                            "model_run_id": result_db.model_run_id,
                            "created_at": result_db.created_at.isoformat(),
                            "status": result_db.status,
                        }
                    )

                return results

        except Exception as e:
            logger.error(f"Error getting route results for {route_id}: {e}")
            return []

    async def analyze_route_stream(
        self, request: AnalysisRequest
    ) -> AsyncGenerator[dict, None]:
        """Analyze route and stream progress updates."""
        try:
            # Attempt to serve from cache first
            cache_key = self._cache_key(
                request.route_id, request.provider, request.depart_time
            )
            if cache_key in _analysis_cache:
                cached = _analysis_cache[cache_key]
                yield ProgressEvent(
                    data={
                        "stage": "cache_hit",
                        "progress": 0.95,
                        "message": "Serving cached analysis result",
                    }
                )
                yield CompleteResultEvent(data=cached)
                return

            # Step 1: Load route data
            yield ProgressEvent(
                data={
                    "stage": "loading_route",
                    "progress": 0.1,
                    "message": "Loading route data...",
                }
            )

            route_points = await self._load_route_points(request.route_id)
            if not route_points:
                raise ValueError(f"Route {request.route_id} not found")

            # Step 2: Generate forecast points
            yield ProgressEvent(
                data={
                    "stage": "generating_forecast_points",
                    "progress": 0.2,
                    "message": "Generating forecast points...",
                }
            )

            forecast_points = self._generate_forecast_points(
                route_points,
                request.depart_time,
                request.use_gpx_timestamps,
                request.estimated_duration_hours,
                request.use_historical_mode,
            )

            # Step 3: Fetch wind data
            yield ProgressEvent(
                data={
                    "stage": "fetching_wind_data",
                    "progress": 0.3,
                    "message": f"Fetching wind data from {request.provider}...",
                }
            )
            # Small delay to ensure progress update is sent
            await asyncio.sleep(0.1)

            provider = get_provider(request.provider)
            try:
                # Update progress during fetch - await async call
                wind_samples = await provider.batch_wind(forecast_points)
            except ValueError as e:
                # Handle specific errors from the provider (e.g., historical data not available)
                error_msg = str(e)
                if "Historical weather data not available" in error_msg:
                    raise ValueError(
                        f"Historical wind data not available for the requested dates. {error_msg}"
                    )
                else:
                    raise ValueError(f"Wind data provider error: {error_msg}")
            except Exception as e:
                # Handle other exceptions (timeouts, network errors, etc.)
                logger.error(f"Error fetching wind data: {e}")
                raise ValueError(f"Failed to fetch wind data: {str(e)}")

            if not wind_samples:
                logger.error(
                    f"No wind samples returned from provider {request.provider}"
                )
                logger.error(f"Forecast points: {len(forecast_points)} points")
                if forecast_points:
                    logger.error(
                        f"First point: lat={forecast_points[0].lat}, lon={forecast_points[0].lon}, time={forecast_points[0].time_utc}"
                    )

                # Provide more specific error message based on timing mode
                if request.use_historical_mode:
                    raise ValueError(
                        "No historical wind data available for the requested time and location. "
                        "Historical data may not be available for dates older than 7 days or before 1940."
                    )
                else:
                    raise ValueError(
                        "No wind data available for the requested time and location"
                    )

            logger.info(
                f"Retrieved {len(wind_samples)} wind samples from {request.provider}"
            )

            # Progress update after fetching completes
            yield ProgressEvent(
                data={
                    "stage": "fetching_wind_data",
                    "progress": 0.4,
                    "message": f"Retrieved {len(wind_samples)} wind samples",
                }
            )
            await asyncio.sleep(0.1)

            # Step 4: Process wind data
            yield ProgressEvent(
                data={
                    "stage": "processing_wind_data",
                    "progress": 0.5,
                    "message": "Processing wind data...",
                }
            )

            segments = await self._process_wind_segments(
                route_points, wind_samples, forecast_points
            )

            # Step 5: Generate summary
            yield ProgressEvent(
                data={
                    "stage": "generating_summary",
                    "progress": 0.8,
                    "message": "Generating analysis summary...",
                }
            )

            summary = self._generate_summary(segments)

            # Step 6: Store results
            yield ProgressEvent(
                data={
                    "stage": "storing_results",
                    "progress": 0.9,
                    "message": "Storing results...",
                }
            )
            logger.info(f"Storing results for route {request.route_id}...")

            result = await self._store_analysis_result(request, segments, summary)

            # Step 7: Complete
            payload = {
                "result": result.model_dump(),
                "segments": [seg.model_dump() for seg in segments],
                "summary": summary.model_dump(),
                "map_style_url": self._generate_map_style_url(segments),
            }
            # Cache the completed payload
            _analysis_cache[cache_key] = payload
            logger.info(f"Stored results for route {request.route_id}")
            # Send a final 100% progress update before completing
            yield ProgressEvent(
                data={
                    "stage": "finalizing",
                    "progress": 1.0,
                    "message": "Finalizing analysis...",
                }
            )

            yield CompleteResultEvent(data=payload)

        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            yield ErrorEvent(data={"error": "analysis_failed", "message": str(e)})

    def _generate_forecast_points(
        self,
        route_points: List[RoutePoint],
        depart_time: datetime,
        use_gpx_timestamps: bool = False,
        estimated_duration_hours: Optional[float] = None,
        use_historical_mode: bool = False,
    ) -> List[ForecastPoint]:
        """Generate forecast points from route points with different timing modes."""
        forecast_points = []

        if use_historical_mode and any(p.timestamp for p in route_points):
            # Mode 1: Historical analysis - use GPX timestamps as-is for historical wind data
            timestamped_points = [p for p in route_points if p.timestamp is not None]
            if timestamped_points:
                logger.info(
                    "Using historical mode - GPX timestamps used as actual times for historical wind analysis"
                )

                for point in route_points:
                    if point.timestamp is not None:
                        # Use GPX timestamp directly for historical analysis
                        point_time = point.timestamp
                    else:
                        # Fallback: interpolate based on surrounding timestamped points
                        # Find nearest timestamped points before and after
                        before_points = [
                            p
                            for p in timestamped_points
                            if p.distance_m <= point.distance_m
                        ]
                        after_points = [
                            p
                            for p in timestamped_points
                            if p.distance_m > point.distance_m
                        ]

                        if before_points and after_points:
                            before_point = max(
                                before_points, key=lambda p: p.distance_m
                            )
                            after_point = min(after_points, key=lambda p: p.distance_m)

                            # Linear interpolation between timestamps
                            distance_ratio = (
                                point.distance_m - before_point.distance_m
                            ) / (after_point.distance_m - before_point.distance_m)
                            time_diff = (
                                after_point.timestamp - before_point.timestamp
                            ).total_seconds()
                            interpolated_seconds = time_diff * distance_ratio
                            point_time = before_point.timestamp + timedelta(
                                seconds=interpolated_seconds
                            )
                        elif before_points:
                            # Use last known timestamp
                            point_time = max(
                                before_points, key=lambda p: p.distance_m
                            ).timestamp
                        elif after_points:
                            # Use first known timestamp
                            point_time = min(
                                after_points, key=lambda p: p.distance_m
                            ).timestamp
                        else:
                            # Fallback to distance-based calculation from GPX start
                            gpx_start_time = min(
                                p.timestamp for p in timestamped_points
                            )
                            avg_speed_kmh = 25.0
                            eta_hours = point.distance_m / 1000.0 / avg_speed_kmh
                            point_time = gpx_start_time + timedelta(hours=eta_hours)

                    forecast_points.append(
                        ForecastPoint(lat=point.lat, lon=point.lon, time_utc=point_time)
                    )
        elif use_gpx_timestamps and any(p.timestamp for p in route_points):
            # Mode 2: Use GPX timestamps with offset from departure time
            timestamped_points = [p for p in route_points if p.timestamp is not None]
            if timestamped_points:
                # Calculate offset between desired departure time and GPX start time
                gpx_start_time = min(p.timestamp for p in timestamped_points)
                time_offset = depart_time - gpx_start_time

                for point in route_points:
                    if point.timestamp is not None:
                        # Use GPX timestamp with offset
                        point_time = point.timestamp + time_offset
                    else:
                        # Fallback to distance-based calculation for points without timestamps
                        avg_speed_kmh = 25.0
                        eta_hours = point.distance_m / 1000.0 / avg_speed_kmh
                        point_time = depart_time + timedelta(hours=eta_hours)

                    forecast_points.append(
                        ForecastPoint(lat=point.lat, lon=point.lon, time_utc=point_time)
                    )
        elif estimated_duration_hours is not None:
            # Mode 2: Use estimated duration to distribute time across route
            total_distance_km = (
                route_points[-1].distance_m / 1000.0 if route_points else 0
            )

            for point in route_points:
                # Calculate time based on distance ratio and estimated duration
                distance_ratio = (
                    point.distance_m / (total_distance_km * 1000.0)
                    if total_distance_km > 0
                    else 0
                )
                eta_hours = distance_ratio * estimated_duration_hours
                point_time = depart_time + timedelta(hours=eta_hours)

                forecast_points.append(
                    ForecastPoint(lat=point.lat, lon=point.lon, time_utc=point_time)
                )
        else:
            # Mode 3: Default constant speed calculation
            for point in route_points:
                avg_speed_kmh = 25.0  # Average cycling speed
                eta_hours = point.distance_m / 1000.0 / avg_speed_kmh
                point_time = depart_time + timedelta(hours=eta_hours)

                forecast_points.append(
                    ForecastPoint(lat=point.lat, lon=point.lon, time_utc=point_time)
                )

        return forecast_points

    async def _process_wind_segments(
        self,
        route_points: List[RoutePoint],
        wind_samples: List,
        forecast_points: List[ForecastPoint],
    ) -> List[SegmentWind]:
        """Process wind data into route segments."""
        segments = []

        for i, (point, forecast_point) in enumerate(zip(route_points, forecast_points)):
            # Use the forecast point's calculated time
            point_time = forecast_point.time_utc

            # Find relevant wind samples for this point
            relevant_samples = [
                sample
                for sample in wind_samples
                if abs((sample.valid_from - point_time).total_seconds()) <= 3600
                and abs(sample.meta.get("lat", 0) - point.lat) < 0.1
                and abs(sample.meta.get("lon", 0) - point.lon) < 0.1
            ]

            if not relevant_samples:
                continue

            # Use closest sample or interpolate
            wind_sample = relevant_samples[0]  # Simplified for MVP

            # Convert to speed and direction
            wind_speed, wind_direction = (
                self.wind_interpolator.wind_components_to_speed_direction(
                    wind_sample.u_ms, wind_sample.v_ms
                )
            )

            # Downscale to rider height
            wind_speed_1p5m = self.wind_interpolator.downscale_wind(wind_speed)

            # Calculate yaw angle and classify
            yaw_angle = self.wind_interpolator.calculate_yaw_angle(
                point.bearing_deg or 0, wind_direction
            )
            wind_class = self.wind_interpolator.classify_wind(yaw_angle)

            # Calculate confidence
            confidence = self.wind_interpolator.calculate_confidence(wind_sample)

            segment = SegmentWind(
                result_id="",  # Will be set when storing
                seq=i,
                time_utc=point_time,
                wind_dir_deg10m=wind_direction,
                wind_ms10m=wind_speed,
                wind_ms1p5m=wind_speed_1p5m,
                yaw_deg=yaw_angle,
                wind_class=wind_class,
                confidence=confidence,
            )
            # Add coordinates to segment for frontend visualization
            segment.lat = point.lat
            segment.lon = point.lon
            segments.append(segment)

        return segments

    def _generate_summary(self, segments: List[SegmentWind]) -> AnalysisSummary:
        """Generate analysis summary from segments."""
        if not segments:
            return AnalysisSummary(
                result_id="", head_pct=0, tail_pct=0, cross_pct=0, longest_head_km=0
            )

        # Calculate percentages
        total_segments = len(segments)
        head_count = sum(1 for seg in segments if seg.wind_class == WindClass.HEAD)
        tail_count = sum(1 for seg in segments if seg.wind_class == WindClass.TAIL)
        cross_count = sum(1 for seg in segments if seg.wind_class == WindClass.CROSS)

        head_pct = (head_count / total_segments) * 100
        tail_pct = (tail_count / total_segments) * 100
        cross_pct = (cross_count / total_segments) * 100

        # Calculate longest headwind section
        longest_head_km = self._calculate_longest_headwind(segments)

        return AnalysisSummary(
            result_id="",
            head_pct=head_pct,
            tail_pct=tail_pct,
            cross_pct=cross_pct,
            longest_head_km=longest_head_km,
        )

    def _calculate_longest_headwind(self, segments: List[SegmentWind]) -> float:
        """Calculate longest continuous headwind section in km."""
        longest = 0
        current = 0

        for segment in segments:
            if segment.wind_class == WindClass.HEAD:
                current += 1  # Each segment represents ~1km
            else:
                longest = max(longest, current)
                current = 0

        longest = max(longest, current)  # Check final section
        return float(longest)

    def _generate_map_style_url(self, segments: List[SegmentWind]) -> str:
        """Generate URL for map styling based on wind analysis."""
        # For MVP, return a placeholder URL
        # In production, this would generate a Mapbox style or GeoJSON
        return f"/api/v1/map/style/{uuid.uuid4()}"

    async def _load_route_points(self, route_id: str) -> Optional[List[RoutePoint]]:
        """Load route points from database or cache."""
        try:
            # Check in-memory cache first
            if route_id in _route_points_storage:
                route_points = _route_points_storage[route_id]
                logger.info(
                    f"Loaded {len(route_points)} route points from cache for route {route_id}"
                )
                return route_points

            # Attempt to auto-load the demo route if requested
            if route_id == DEMO_ROUTE_ID:
                loaded = await self._load_demo_route_into_memory()
                if loaded:
                    route_points = _route_points_storage.get(route_id)
                    if route_points:
                        logger.info(
                            f"Loaded {len(route_points)} route points from demo for route {route_id}"
                        )
                        return route_points

            # Query database
            if async_session_maker is None:
                logger.error("Database not initialized")
                return None

            async with async_session_maker() as session:
                stmt = (
                    select(RouteSampleDB)
                    .where(RouteSampleDB.route_id == route_id)
                    .order_by(RouteSampleDB.seq)
                )
                result = await session.execute(stmt)
                samples_db = result.scalars().all()

                if not samples_db:
                    logger.error(
                        f"No route points found in database for route_id: {route_id}"
                    )
                    return None

                # Convert database samples to RoutePoint objects
                route_points = []
                for sample in samples_db:
                    # Calculate estimated timestamp from departure + offset
                    # Note: We don't store timestamp in route_samples, only offset
                    route_point = RoutePoint(
                        lat=sample.lat,
                        lon=sample.lon,
                        distance_m=sample.dist_m,
                        bearing_deg=sample.bearing_deg,
                        timestamp=None,  # Will be calculated during analysis
                    )
                    route_points.append(route_point)

                # Cache in memory
                _route_points_storage[route_id] = route_points
                logger.info(
                    f"Loaded {len(route_points)} route points from database for route {route_id}"
                )
                return route_points

        except Exception as e:
            logger.error(f"Error loading route points for {route_id}: {e}")
            return None

    async def _store_route(self, route: Route, route_points: List[RoutePoint]):
        """Store route and route points in database."""
        try:
            if async_session_maker is None:
                logger.warning("Database not initialized, storing only in memory")
                _route_storage[route.id] = route
                _route_points_storage[route.id] = route_points
                return

            async with async_session_maker() as session:
                # Create route database record
                route_db = RouteDB(
                    id=route.id,
                    user_id=route.user_id,
                    gpx_url=route.gpx_url,
                    bbox=json.dumps(route.bbox),
                    length_km=route.length_km,
                    created_at=route.created_at,
                    name=route.name,
                )
                session.add(route_db)

                # Create route sample records (calculate average speed for eta_offset_s)
                avg_speed_kmh = 25.0  # Default cycling speed
                for i, point in enumerate(route_points):
                    eta_offset_s = int(
                        (point.distance_m / 1000.0 / avg_speed_kmh) * 3600
                    )
                    sample_db = RouteSampleDB(
                        route_id=route.id,
                        seq=i,
                        lat=point.lat,
                        lon=point.lon,
                        dist_m=point.distance_m,
                        bearing_deg=point.bearing_deg or 0.0,
                        eta_offset_s=eta_offset_s,
                    )
                    session.add(sample_db)

                try:
                    await session.commit()
                    logger.info(
                        f"Stored route {route.id} with {len(route_points)} points in database"
                    )
                except IntegrityError:
                    # Route already exists, that's OK
                    await session.rollback()
                    logger.info(f"Route {route.id} already exists in database")

                # Also store in memory cache for quick access
                _route_storage[route.id] = route
                _route_points_storage[route.id] = route_points

        except Exception as e:
            logger.error(f"Error storing route {route.id}: {e}")
            # Still cache in memory even if database fails
            _route_storage[route.id] = route
            _route_points_storage[route.id] = route_points
            raise

    async def _store_analysis_result(
        self,
        request: AnalysisRequest,
        segments: List[SegmentWind],
        summary: AnalysisSummary,
    ) -> ForecastResult:
        """Store analysis result in database."""
        result = ForecastResult(
            id=str(uuid.uuid4()),
            route_id=request.route_id,
            depart_time=request.depart_time,
            provider=request.provider,
            model_run_id="placeholder",
            created_at=datetime.utcnow(),
            status="completed",
        )

        # Update result_id in segments and summary
        for segment in segments:
            segment.result_id = result.id
        summary.result_id = result.id

        # Store in database
        if async_session_maker is None:
            logger.warning("Database not initialized, skipping result storage")
            return result

        try:
            async with async_session_maker() as session:
                # Create forecast result record
                result_db = ForecastResultDB(
                    id=result.id,
                    route_id=result.route_id,
                    depart_time=result.depart_time,
                    provider=result.provider,
                    model_run_id=result.model_run_id,
                    created_at=result.created_at,
                    status=result.status,
                )
                session.add(result_db)

                # Create segment wind records
                for segment in segments:
                    segment_db = SegmentWindDB(
                        result_id=segment.result_id,
                        seq=segment.seq,
                        time_utc=segment.time_utc,
                        wind_dir_deg10m=segment.wind_dir_deg10m,
                        wind_ms10m=segment.wind_ms10m,
                        wind_ms1p5m=segment.wind_ms1p5m,
                        yaw_deg=segment.yaw_deg,
                        wind_class=segment.wind_class.value,
                        gust_ms=segment.gust_ms,
                        confidence=segment.confidence,
                    )
                    session.add(segment_db)

                # Create summary record
                summary_db = SummaryDB(
                    result_id=summary.result_id,
                    head_pct=summary.head_pct,
                    tail_pct=summary.tail_pct,
                    cross_pct=summary.cross_pct,
                    longest_head_km=summary.longest_head_km,
                    window_best_depart=summary.window_best_depart,
                    provider_spread=summary.provider_spread,
                    notes=summary.notes,
                )
                session.add(summary_db)

                await session.commit()
                logger.info(
                    f"Stored analysis result {result.id} with {len(segments)} segments in database"
                )

        except Exception as e:
            logger.error(f"Error storing analysis result {result.id}: {e}")
            # Don't raise - analysis is still usable even if storage fails

        return result

    def _cache_key(self, route_id: str, provider: str, depart_time: datetime) -> str:
        """Normalize cache key to the hour to increase hit rate."""
        depart_hour = depart_time.replace(
            minute=0, second=0, microsecond=0, tzinfo=depart_time.tzinfo
        )
        return f"{route_id}:{provider}:{depart_hour.isoformat()}"

    async def _load_demo_route_into_memory(self) -> bool:
        """Load the demo GPX into in-memory storage with fixed ID if available.

        Looks for demo GPX in multiple locations:
        1. Relative to this module (bundled with deployment)
        2. Project root locations (for local development)
        """
        try:
            # Get project root (assuming we're running from project root)
            project_root = Path.cwd()
            candidate_paths = [
                project_root / "ui/public/demo-route.gpx",
                project_root
                / "api/tests/gpx_samples/glossop-sheffield-without-imestamp.gpx",
            ]
            gpx_path = next((p for p in candidate_paths if p.exists()), None)
            if not gpx_path:
                logger.error(
                    f"Demo GPX file not found in any location. Tried: {[str(p) for p in candidate_paths]}"
                )
                return False

            logger.info(f"Loading demo GPX from: {gpx_path}")
            gpx_text = gpx_path.read_text(encoding="utf-8")

            # Process GPX content
            route_points, metadata = self.gpx_processor.process_route(gpx_text)

            # Create a Route with the fixed demo ID
            route = Route(
                id=DEMO_ROUTE_ID,
                gpx_url=str(gpx_path),
                bbox=metadata["bbox"],
                length_km=metadata["total_distance_km"],
                created_at=datetime.utcnow(),
                name="Glossop to Sheffield (Demo)",
            )

            # Store directly in memory (skip S3 for demo)
            await self._store_route(route, route_points)
            logger.info("Demo route loaded into memory with id %s", DEMO_ROUTE_ID)
            return True
        except Exception as e:
            logger.error(f"Failed to load demo route into memory: {e}")
            return False
