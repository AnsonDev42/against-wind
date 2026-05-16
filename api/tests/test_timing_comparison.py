from datetime import datetime, timedelta, timezone

from api.app.services.analyze import AnalysisService


def test_power_timing_payload_includes_no_wind_delta():
    service = AnalysisService()
    depart_time = datetime(2026, 5, 15, 9, tzinfo=timezone.utc)
    no_wind_timing = {
        "model": "power",
        "estimated_duration_hours": 2.0,
        "estimated_completion_time": depart_time + timedelta(hours=2),
        "warnings": [],
    }
    wind_timing = {
        "model": "power_with_wind",
        "estimated_duration_hours": 2.25,
        "estimated_completion_time": depart_time + timedelta(hours=2, minutes=15),
        "warnings": [],
    }

    payload = service._add_no_wind_timing_comparison(
        wind_timing, no_wind_timing, "power"
    )

    assert payload["no_wind_estimated_duration_hours"] == 2.0
    assert payload["no_wind_estimated_completion_time"] == depart_time + timedelta(
        hours=2
    )
    assert payload["wind_duration_delta_s"] == 900
    assert payload["wind_duration_delta_minutes"] == 15
    assert payload["wind_duration_delta_pct"] == 12.5


def test_non_power_timing_payload_skips_no_wind_delta():
    service = AnalysisService()
    timing = {"model": "manual_duration", "estimated_duration_hours": 2.0}

    payload = service._add_no_wind_timing_comparison(timing, timing, "manual_duration")

    assert payload == timing
