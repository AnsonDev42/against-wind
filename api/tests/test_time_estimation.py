from datetime import datetime, timezone

from api.app.domain.models import WindSample
from api.app.domain.time_estimation import (
    RiderPowerProfile,
    build_forecast_points_from_offsets,
    estimate_route_timing,
)
from api.app.geo.gpx import RoutePoint


def _route(
    elevations: list[float | None], spacing_m: float = 1000.0
) -> list[RoutePoint]:
    points = []
    for index, elevation in enumerate(elevations):
        previous_elevation = elevations[index - 1] if index > 0 else elevation
        grade_pct = 0.0
        if index > 0 and elevation is not None and previous_elevation is not None:
            grade_pct = ((elevation - previous_elevation) / spacing_m) * 100

        points.append(
            RoutePoint(
                lat=51.0,
                lon=-1.0 + index * 0.01,
                elevation=elevation,
                distance_m=index * spacing_m,
                bearing_deg=90.0,
                grade_pct=grade_pct,
            )
        )
    return points


def _wind_sample(u_ms: float, point: RoutePoint, time: datetime) -> WindSample:
    return WindSample(
        u_ms=u_ms,
        v_ms=0.0,
        height_m=10.0,
        model_run_id="test",
        source="test",
        valid_from=time,
        valid_to=time,
        meta={"lat": point.lat, "lon": point.lon},
    )


def test_climb_takes_longer_than_flat_route():
    profile = RiderPowerProfile(ftp_w_per_kg=2.5, rider_weight_kg=75, bike_weight_kg=10)

    flat = estimate_route_timing(_route([100, 100, 100]), profile)
    climb = estimate_route_timing(_route([100, 160, 220]), profile)

    assert climb.total_duration_s > flat.total_duration_s


def test_tailwind_is_faster_than_headwind():
    profile = RiderPowerProfile(ftp_w_per_kg=2.5, rider_weight_kg=75, bike_weight_kg=10)
    points = _route([100, 100, 100])
    start = datetime(2026, 5, 12, 8, tzinfo=timezone.utc)
    reference_points = build_forecast_points_from_offsets(
        points,
        start,
        estimate_route_timing(points, profile).eta_offsets_s,
    )

    tailwind = estimate_route_timing(
        points,
        profile,
        wind_samples=[
            _wind_sample(6.0, point, reference_points[index].time_utc)
            for index, point in enumerate(points)
        ],
        reference_points=reference_points,
    )
    headwind = estimate_route_timing(
        points,
        profile,
        wind_samples=[
            _wind_sample(-6.0, point, reference_points[index].time_utc)
            for index, point in enumerate(points)
        ],
        reference_points=reference_points,
    )

    assert tailwind.total_duration_s < headwind.total_duration_s


def test_missing_elevation_uses_flat_fallback():
    estimate = estimate_route_timing(_route([None, None, None]), RiderPowerProfile())

    assert estimate.total_duration_s > 0
    assert "assuming flat terrain" in " ".join(estimate.warnings)


def test_forecast_points_are_monotonic_and_non_linear_on_hilly_route():
    points = _route([100, 100, 200, 200, 120])
    start = datetime(2026, 5, 12, 8, tzinfo=timezone.utc)
    estimate = estimate_route_timing(points, RiderPowerProfile())
    forecast_points = build_forecast_points_from_offsets(
        points, start, estimate.eta_offsets_s
    )
    segment_seconds = [
        (forecast_points[i].time_utc - forecast_points[i - 1].time_utc).total_seconds()
        for i in range(1, len(forecast_points))
    ]

    assert all(seconds > 0 for seconds in segment_seconds)
    assert len(set(round(seconds) for seconds in segment_seconds)) > 1
