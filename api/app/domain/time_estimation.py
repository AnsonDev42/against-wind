from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
import math
from typing import Iterable, List, Optional, Sequence

from api.app.domain.models import ForecastPoint, WindSample
from api.app.geo.gpx import RoutePoint


@dataclass(frozen=True)
class RiderPowerProfile:
    ftp_w_per_kg: float = 2.5
    rider_weight_kg: float = 65.0
    bike_weight_kg: float = 9.0
    cda: float = 0.32
    crr: float = 0.005
    air_density_kg_m3: float = 1.225
    min_speed_kmh: float = 4.0
    max_flat_speed_kmh: float = 55.0
    max_descent_speed_kmh: float = 60.0

    @property
    def rider_power_w(self) -> float:
        return self.ftp_w_per_kg * self.rider_weight_kg

    @property
    def total_mass_kg(self) -> float:
        return self.rider_weight_kg + self.bike_weight_kg


@dataclass(frozen=True)
class RouteTimingEstimate:
    eta_offsets_s: List[float]
    total_duration_s: float
    model: str
    warnings: List[str]


def estimate_route_timing(
    route_points: Sequence[RoutePoint],
    profile: RiderPowerProfile,
    wind_samples: Optional[Sequence[WindSample]] = None,
    reference_points: Optional[Sequence[ForecastPoint]] = None,
) -> RouteTimingEstimate:
    """Estimate per-point ETA using a constant rider power model."""
    if not route_points:
        return RouteTimingEstimate([], 0.0, "power", [])

    warnings = _validate_profile(profile)
    eta_offsets = [0.0]
    has_elevation = any(point.elevation is not None for point in route_points)
    has_wind = bool(wind_samples)

    if not has_elevation:
        warnings.append("Route has no elevation data; assuming flat terrain.")

    for i in range(1, len(route_points)):
        prev_point = route_points[i - 1]
        point = route_points[i]
        distance_m = max(0.0, point.distance_m - prev_point.distance_m)
        if distance_m <= 0:
            eta_offsets.append(eta_offsets[-1])
            continue

        grade = _segment_grade(prev_point, point)
        bearing = (
            point.bearing_deg
            if point.bearing_deg is not None
            else prev_point.bearing_deg
        )
        bearing = bearing if bearing is not None else 0.0
        wind_along_ms = _segment_wind_along_route(
            point=point,
            bearing_deg=bearing,
            point_time=reference_points[i].time_utc
            if reference_points and i < len(reference_points)
            else None,
            wind_samples=wind_samples,
        )
        speed_ms = solve_ground_speed_ms(profile, grade, wind_along_ms)
        eta_offsets.append(eta_offsets[-1] + distance_m / speed_ms)

    model = "power_with_wind" if has_wind else "power"
    return RouteTimingEstimate(
        eta_offsets_s=eta_offsets,
        total_duration_s=eta_offsets[-1],
        model=model,
        warnings=warnings,
    )


def build_forecast_points_from_offsets(
    route_points: Sequence[RoutePoint],
    depart_time: datetime,
    eta_offsets_s: Sequence[float],
) -> List[ForecastPoint]:
    return [
        ForecastPoint(
            lat=point.lat,
            lon=point.lon,
            time_utc=depart_time + timedelta(seconds=eta_offsets_s[i]),
        )
        for i, point in enumerate(route_points)
    ]


def route_elevation_stats(route_points: Sequence[RoutePoint]) -> dict:
    total_ascent_m = 0.0
    total_descent_m = 0.0
    previous_elevation = None

    for point in route_points:
        if point.elevation is None:
            continue
        if previous_elevation is not None:
            delta_m = point.elevation - previous_elevation
            if delta_m > 0:
                total_ascent_m += delta_m
            elif delta_m < 0:
                total_descent_m += abs(delta_m)
        previous_elevation = point.elevation

    elevation_count = sum(1 for point in route_points if point.elevation is not None)
    return {
        "has_elevation": elevation_count > 0,
        "elevation_coverage": elevation_count / len(route_points)
        if route_points
        else 0.0,
        "total_ascent_m": total_ascent_m,
        "total_descent_m": total_descent_m,
    }


def solve_ground_speed_ms(
    profile: RiderPowerProfile,
    grade: float,
    wind_along_ms: float = 0.0,
) -> float:
    min_speed_ms = profile.min_speed_kmh / 3.6
    max_speed_kmh = (
        profile.max_descent_speed_kmh if grade < -0.01 else profile.max_flat_speed_kmh
    )
    max_speed_ms = max_speed_kmh / 3.6
    target_power = profile.rider_power_w

    if _required_power_w(min_speed_ms, grade, wind_along_ms, profile) >= target_power:
        return min_speed_ms
    if _required_power_w(max_speed_ms, grade, wind_along_ms, profile) <= target_power:
        return max_speed_ms

    low = min_speed_ms
    high = max_speed_ms
    for _ in range(48):
        mid = (low + high) / 2.0
        if _required_power_w(mid, grade, wind_along_ms, profile) < target_power:
            low = mid
        else:
            high = mid
    return (low + high) / 2.0


def _required_power_w(
    ground_speed_ms: float,
    grade: float,
    wind_along_ms: float,
    profile: RiderPowerProfile,
) -> float:
    mass = profile.total_mass_kg
    gravity = 9.80665
    air_speed_ms = max(0.0, ground_speed_ms - wind_along_ms)
    gravity_power = mass * gravity * grade * ground_speed_ms
    rolling_power = profile.crr * mass * gravity * ground_speed_ms
    aero_power = (
        0.5
        * profile.air_density_kg_m3
        * profile.cda
        * (air_speed_ms**2)
        * ground_speed_ms
    )
    return gravity_power + rolling_power + aero_power


def _segment_grade(prev_point: RoutePoint, point: RoutePoint) -> float:
    if point.grade_pct is not None:
        return point.grade_pct / 100.0

    distance_m = point.distance_m - prev_point.distance_m
    if distance_m <= 0 or prev_point.elevation is None or point.elevation is None:
        return 0.0
    return max(-0.25, min(0.25, (point.elevation - prev_point.elevation) / distance_m))


def _segment_wind_along_route(
    point: RoutePoint,
    bearing_deg: float,
    point_time: Optional[datetime],
    wind_samples: Optional[Sequence[WindSample]],
) -> float:
    if not wind_samples:
        return 0.0

    sample = _find_closest_wind_sample(point, point_time, wind_samples)
    if sample is None:
        return 0.0

    bearing_rad = math.radians(bearing_deg)
    east_unit = math.sin(bearing_rad)
    north_unit = math.cos(bearing_rad)
    return sample.u_ms * east_unit + sample.v_ms * north_unit


def _find_closest_wind_sample(
    point: RoutePoint,
    point_time: Optional[datetime],
    wind_samples: Iterable[WindSample],
) -> Optional[WindSample]:
    candidates = []
    for sample in wind_samples:
        lat = sample.meta.get("lat")
        lon = sample.meta.get("lon")
        if lat is None or lon is None:
            continue

        location_delta = abs(lat - point.lat) + abs(lon - point.lon)
        if location_delta > 0.2:
            continue

        time_delta = 0.0
        if point_time is not None:
            time_delta = abs((sample.valid_from - point_time).total_seconds())
            if time_delta > 7200:
                continue

        candidates.append((location_delta, time_delta, sample))

    if not candidates:
        return None

    _, _, sample = min(candidates, key=lambda item: (item[0], item[1]))
    return sample


def _validate_profile(profile: RiderPowerProfile) -> List[str]:
    warnings = []
    if profile.ftp_w_per_kg <= 0:
        warnings.append(
            "FTP/kg must be positive; using default profile is recommended."
        )
    if profile.rider_weight_kg <= 0 or profile.bike_weight_kg < 0:
        warnings.append(
            "Rider and bike weight must be positive; using default profile is recommended."
        )
    return warnings
