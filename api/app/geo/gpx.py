import gpxpy
import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta
from shapely.geometry import LineString
from api.app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)


@dataclass
class RoutePoint:
    """A point along a route with metadata."""

    lat: float
    lon: float
    elevation: Optional[float] = None
    distance_m: float = 0.0  # Cumulative distance from start
    bearing_deg: Optional[float] = None
    grade_pct: Optional[float] = None
    timestamp: Optional[datetime] = None  # Original timestamp from GPX


class GPXProcessor:
    """Handles GPX file parsing and route preprocessing."""

    def __init__(self):
        self.settings = get_settings()

    def parse_gpx(self, gpx_content: str) -> List[RoutePoint]:
        """Parse GPX content and extract route points."""
        try:
            gpx = gpxpy.parse(gpx_content)
        except Exception as e:
            raise ValueError(f"Invalid GPX content: {e}")

        points = []

        # Extract points from tracks and routes
        for track in gpx.tracks:
            for segment in track.segments:
                for point in segment.points:
                    points.append(
                        RoutePoint(
                            lat=point.latitude,
                            lon=point.longitude,
                            elevation=point.elevation,
                            timestamp=point.time,
                        )
                    )

        for route in gpx.routes:
            for point in route.points:
                points.append(
                    RoutePoint(
                        lat=point.latitude,
                        lon=point.longitude,
                        elevation=point.elevation,
                        timestamp=point.time,
                    )
                )

        if not points:
            raise ValueError("No route points found in GPX file")

        return points

    def smooth_route(
        self, points: List[RoutePoint], epsilon_m: float = 20.0
    ) -> List[RoutePoint]:
        """Apply Douglas-Peucker smoothing to reduce noise."""
        if len(points) < 3:
            return points

        # Convert to coordinate arrays
        coords = [(p.lat, p.lon) for p in points]
        line = LineString(coords)

        # Apply Douglas-Peucker simplification
        # Convert epsilon from meters to degrees (rough approximation)
        epsilon_deg = epsilon_m / 111000.0  # ~111km per degree
        simplified = line.simplify(epsilon_deg, preserve_topology=True)

        # Convert back to RoutePoints
        smoothed_points = []
        simplified_coords = list(simplified.coords)

        for lat, lon in simplified_coords:
            # Find closest original point to preserve elevation data
            original_point = min(
                points, key=lambda p: (p.lat - lat) ** 2 + (p.lon - lon) ** 2
            )
            smoothed_points.append(
                RoutePoint(
                    lat=lat,
                    lon=lon,
                    elevation=original_point.elevation,
                    timestamp=original_point.timestamp,
                )
            )

        return smoothed_points

    def calculate_distances(self, points: List[RoutePoint]) -> List[RoutePoint]:
        """Calculate cumulative distances along the route."""
        if not points:
            return points

        # Use Haversine formula for distance calculation
        updated_points = [points[0]]  # First point has distance 0
        cumulative_distance = 0.0

        for i in range(1, len(points)):
            prev_point = points[i - 1]
            curr_point = points[i]

            # Calculate distance between consecutive points
            distance = self._haversine_distance(
                prev_point.lat, prev_point.lon, curr_point.lat, curr_point.lon
            )

            cumulative_distance += distance

            updated_point = RoutePoint(
                lat=curr_point.lat,
                lon=curr_point.lon,
                elevation=curr_point.elevation,
                distance_m=cumulative_distance,
                timestamp=curr_point.timestamp,
            )
            updated_points.append(updated_point)

        return updated_points

    def calculate_bearings(
        self, points: List[RoutePoint], window_m: float = 300.0
    ) -> List[RoutePoint]:
        """Calculate bearing (heading) for each point using a sliding window."""
        if len(points) < 2:
            return points

        updated_points = []

        for i, point in enumerate(points):
            # Find points within the window for bearing calculation
            start_dist = max(0, point.distance_m - window_m / 2)
            end_dist = point.distance_m + window_m / 2

            # Find start and end points for bearing calculation
            start_idx = self._find_distance_index(points, start_dist)
            end_idx = self._find_distance_index(points, end_dist)

            if start_idx == end_idx:
                # Fallback to adjacent points
                start_idx = max(0, i - 1)
                end_idx = min(len(points) - 1, i + 1)

            if start_idx != end_idx:
                bearing = self._calculate_bearing(
                    points[start_idx].lat,
                    points[start_idx].lon,
                    points[end_idx].lat,
                    points[end_idx].lon,
                )
            else:
                bearing = 0.0  # Default for single point

            updated_point = RoutePoint(
                lat=point.lat,
                lon=point.lon,
                elevation=point.elevation,
                distance_m=point.distance_m,
                bearing_deg=bearing,
                timestamp=point.timestamp,
            )
            updated_points.append(updated_point)

        return updated_points

    def sample_route(
        self, points: List[RoutePoint], interval_km: float = None
    ) -> List[RoutePoint]:
        """Sample route at regular distance intervals."""
        if interval_km is None:
            interval_km = self.settings.default_sample_distance_km

        interval_m = interval_km * 1000.0

        if not points or len(points) < 2:
            return points

        sampled_points = [points[0]]  # Always include start point
        total_distance = points[-1].distance_m

        # Sample at regular intervals
        current_target = interval_m

        while current_target < total_distance:
            # Find the segment containing this distance
            interpolated_point = self._interpolate_at_distance(points, current_target)
            if interpolated_point:
                sampled_points.append(interpolated_point)

            current_target += interval_m

        # Always include end point if not already included
        if sampled_points[-1].distance_m < points[-1].distance_m:
            sampled_points.append(points[-1])

        return sampled_points

    def calculate_grades(
        self, points: List[RoutePoint], window_m: float = 200.0
    ) -> List[RoutePoint]:
        """Calculate grade percentage for each point."""
        if len(points) < 2:
            return points

        updated_points = []

        for i, point in enumerate(points):
            if point.elevation is None:
                updated_point = RoutePoint(
                    lat=point.lat,
                    lon=point.lon,
                    elevation=point.elevation,
                    distance_m=point.distance_m,
                    bearing_deg=point.bearing_deg,
                    grade_pct=0.0,
                    timestamp=point.timestamp,
                )
                updated_points.append(updated_point)
                continue

            # Find points within window for grade calculation
            start_dist = max(0, point.distance_m - window_m / 2)
            end_dist = point.distance_m + window_m / 2

            start_idx = self._find_distance_index(points, start_dist)
            end_idx = self._find_distance_index(points, end_dist)

            if (
                start_idx != end_idx
                and points[start_idx].elevation is not None
                and points[end_idx].elevation is not None
            ):
                elevation_change = (
                    points[end_idx].elevation - points[start_idx].elevation
                )
                distance_change = (
                    points[end_idx].distance_m - points[start_idx].distance_m
                )

                if distance_change > 0:
                    grade_pct = (elevation_change / distance_change) * 100
                else:
                    grade_pct = 0.0
            else:
                grade_pct = 0.0

            updated_point = RoutePoint(
                lat=point.lat,
                lon=point.lon,
                elevation=point.elevation,
                distance_m=point.distance_m,
                bearing_deg=point.bearing_deg,
                grade_pct=grade_pct,
                timestamp=point.timestamp,
            )
            updated_points.append(updated_point)

        return updated_points

    def process_route(self, gpx_content: str) -> Tuple[List[RoutePoint], dict]:
        """Complete route processing pipeline."""
        # Parse GPX
        points = self.parse_gpx(gpx_content)
        logger.info(f"Parsed {len(points)} points from GPX")

        # Smooth route
        points = self.smooth_route(points)
        logger.info(f"Smoothed to {len(points)} points")

        # Calculate distances
        points = self.calculate_distances(points)

        # Calculate bearings
        points = self.calculate_bearings(points)

        # Calculate grades if elevation data available
        if any(p.elevation is not None for p in points):
            points = self.calculate_grades(points)

        # Sample at regular intervals
        sampled_points = self.sample_route(points)
        logger.info(f"Sampled to {len(sampled_points)} points")

        # Calculate route metadata
        total_distance_km = points[-1].distance_m / 1000.0
        bbox = self._calculate_bbox(points)

        # Check for timestamps
        has_timestamps = any(p.timestamp is not None for p in points)
        timestamp_coverage = 0.0
        if has_timestamps:
            timestamp_count = sum(1 for p in points if p.timestamp is not None)
            timestamp_coverage = timestamp_count / len(points)

        # Get time range if timestamps exist
        start_time = None
        end_time = None
        if has_timestamps:
            timestamped_points = [p for p in points if p.timestamp is not None]
            if timestamped_points:
                start_time = min(p.timestamp for p in timestamped_points)
                end_time = max(p.timestamp for p in timestamped_points)

        metadata = {
            "total_distance_km": total_distance_km,
            "bbox": bbox,
            "total_points": len(points),
            "sampled_points": len(sampled_points),
            "has_elevation": any(p.elevation is not None for p in points),
            "has_timestamps": has_timestamps,
            "timestamp_coverage": timestamp_coverage,
            "start_time": start_time,
            "end_time": end_time,
        }

        return sampled_points, metadata

    def _haversine_distance(
        self, lat1: float, lon1: float, lat2: float, lon2: float
    ) -> float:
        """Calculate distance between two points using Haversine formula."""
        R = 6371000  # Earth radius in meters

        lat1_rad = np.radians(lat1)
        lat2_rad = np.radians(lat2)
        dlat = np.radians(lat2 - lat1)
        dlon = np.radians(lon2 - lon1)

        a = (
            np.sin(dlat / 2) ** 2
            + np.cos(lat1_rad) * np.cos(lat2_rad) * np.sin(dlon / 2) ** 2
        )
        c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))

        return R * c

    def _calculate_bearing(
        self, lat1: float, lon1: float, lat2: float, lon2: float
    ) -> float:
        """Calculate bearing from point 1 to point 2."""
        lat1_rad = np.radians(lat1)
        lat2_rad = np.radians(lat2)
        dlon_rad = np.radians(lon2 - lon1)

        y = np.sin(dlon_rad) * np.cos(lat2_rad)
        x = np.cos(lat1_rad) * np.sin(lat2_rad) - np.sin(lat1_rad) * np.cos(
            lat2_rad
        ) * np.cos(dlon_rad)

        bearing_rad = np.arctan2(y, x)
        bearing_deg = np.degrees(bearing_rad)

        # Normalize to 0-360 degrees
        return (bearing_deg + 360) % 360

    def _find_distance_index(
        self, points: List[RoutePoint], target_distance: float
    ) -> int:
        """Find index of point closest to target distance."""
        return min(
            range(len(points)),
            key=lambda i: abs(points[i].distance_m - target_distance),
        )

    def _interpolate_at_distance(
        self, points: List[RoutePoint], distance: float
    ) -> Optional[RoutePoint]:
        """Interpolate a point at the specified distance along the route."""
        if distance <= 0:
            return points[0]
        if distance >= points[-1].distance_m:
            return points[-1]

        # Find the segment containing this distance
        for i in range(len(points) - 1):
            if points[i].distance_m <= distance <= points[i + 1].distance_m:
                # Linear interpolation
                p1, p2 = points[i], points[i + 1]

                if p2.distance_m == p1.distance_m:
                    return p1

                ratio = (distance - p1.distance_m) / (p2.distance_m - p1.distance_m)

                lat = p1.lat + ratio * (p2.lat - p1.lat)
                lon = p1.lon + ratio * (p2.lon - p1.lon)
                elevation = None
                if p1.elevation is not None and p2.elevation is not None:
                    elevation = p1.elevation + ratio * (p2.elevation - p1.elevation)

                bearing = p1.bearing_deg if p1.bearing_deg is not None else 0.0

                # Interpolate timestamp if both points have timestamps
                timestamp = None
                if p1.timestamp is not None and p2.timestamp is not None:
                    time_diff = (p2.timestamp - p1.timestamp).total_seconds()
                    interpolated_seconds = time_diff * ratio
                    timestamp = p1.timestamp + timedelta(seconds=interpolated_seconds)
                elif p1.timestamp is not None:
                    timestamp = p1.timestamp
                elif p2.timestamp is not None:
                    timestamp = p2.timestamp

                return RoutePoint(
                    lat=lat,
                    lon=lon,
                    elevation=elevation,
                    distance_m=distance,
                    bearing_deg=bearing,
                    timestamp=timestamp,
                )

        return None

    def _calculate_bbox(self, points: List[RoutePoint]) -> List[float]:
        """Calculate bounding box [min_lon, min_lat, max_lon, max_lat]."""
        if not points:
            return [0, 0, 0, 0]

        lats = [p.lat for p in points]
        lons = [p.lon for p in points]

        return [min(lons), min(lats), max(lons), max(lats)]
