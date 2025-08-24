from fastapi.testclient import TestClient
import os
from api.app.main import app

client = TestClient(app)

def test_gpx_upload():
    """Test uploading a GPX file to the /api/v1/gpx/upload endpoint."""
    # Construct the absolute path to the test file
    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_name = "glossop-sheffield-without-imestamp.gpx"
    file_path = os.path.join(current_dir, "..", "gpx_samples", file_name)

    with open(file_path, "rb") as f:
        response = client.post(
            "/api/v1/routes",
            files={"file": (file_name, f, "application/gpx+xml")}
        )

    assert response.status_code == 200
    data = response.json()
    assert "route_id" in data
    assert "message" in data
    assert data["message"] == "Route created successfully"
    assert "metadata" in data
