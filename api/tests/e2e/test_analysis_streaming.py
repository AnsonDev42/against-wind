import json
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from api.app.geo.gpx import RoutePoint
from api.app.domain.models import WindSample
from api.app.main import app
from api.app.services.analyze import AnalysisService


client = TestClient(app)


def parse_sse_events(body: str) -> list[tuple[str, dict]]:
    events = []
    for raw_event in body.strip().split("\n\n"):
        event_type = None
        event_data = None

        for line in raw_event.splitlines():
            if line.startswith("event: "):
                event_type = line.removeprefix("event: ")
            elif line.startswith("data: "):
                event_data = json.loads(line.removeprefix("data: "))

        if event_type and event_data is not None:
            events.append((event_type, event_data))

    return events


class StreamingForecastProvider:
    name = "test-provider"

    async def stream_wind(self, points):
        for point in points:
            yield [
                WindSample(
                    u_ms=1.0,
                    v_ms=0.0,
                    height_m=10.0,
                    model_run_id="test-run",
                    source=self.name,
                    valid_from=point.time_utc,
                    valid_to=point.time_utc,
                    meta={"lat": point.lat, "lon": point.lon},
                )
            ]


async def load_route_points(self, route_id):
    return [
        RoutePoint(lat=53.0, lon=-1.0, distance_m=0.0, bearing_deg=90.0),
        RoutePoint(lat=53.01, lon=-1.01, distance_m=1000.0, bearing_deg=90.0),
    ]


async def load_repeated_coordinate_route_points(self, route_id):
    return [
        RoutePoint(lat=53.0, lon=-1.0, distance_m=0.0, bearing_deg=90.0),
        RoutePoint(lat=53.0, lon=-1.0, distance_m=1000.0, bearing_deg=90.0),
    ]


def test_analyze_stream_emits_partial_results_before_complete(monkeypatch):
    monkeypatch.setattr(AnalysisService, "_load_route_points", load_route_points)
    monkeypatch.setattr(
        "api.app.services.analyze.get_provider",
        lambda provider_name: StreamingForecastProvider(),
    )

    response = client.get(
        "/api/v1/analyze",
        params={
            "route_id": "streaming-test-route",
            "depart": datetime(2026, 5, 12, 10, tzinfo=timezone.utc).isoformat(),
            "provider": "test-provider",
        },
    )

    assert response.status_code == 200

    events = parse_sse_events(response.text)
    event_names = [event_name for event_name, _ in events]
    partial_events = [
        event_data for event_name, event_data in events if event_name == "partial"
    ]
    complete_events = [
        event_data for event_name, event_data in events if event_name == "complete"
    ]

    assert event_names[0] == "accepted"
    assert len(partial_events) == 2
    assert len(complete_events) == 1
    assert event_names.index("partial") < event_names.index("complete")
    assert [event["processed"] for event in partial_events] == [1, 2]
    assert [event["total"] for event in partial_events] == [2, 2]
    assert [event["segments"][0]["seq"] for event in partial_events] == [0, 1]
    assert len(complete_events[0]["segments"]) == 2


def test_analyze_stream_batches_repeated_coordinates_by_time(monkeypatch):
    monkeypatch.setattr(
        AnalysisService, "_load_route_points", load_repeated_coordinate_route_points
    )
    monkeypatch.setattr(
        "api.app.services.analyze.get_provider",
        lambda provider_name: StreamingForecastProvider(),
    )

    response = client.get(
        "/api/v1/analyze",
        params={
            "route_id": "streaming-repeated-coordinate-route",
            "depart": datetime(2026, 5, 12, 10, tzinfo=timezone.utc).isoformat(),
            "provider": "test-provider",
        },
    )

    assert response.status_code == 200

    partial_events = [
        event_data
        for event_name, event_data in parse_sse_events(response.text)
        if event_name == "partial"
    ]

    assert len(partial_events) == 2
    assert [event["processed"] for event in partial_events] == [1, 2]
    assert [event["segments"][0]["seq"] for event in partial_events] == [0, 1]
