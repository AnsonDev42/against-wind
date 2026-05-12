import os

import boto3
import pytest
from botocore.exceptions import ClientError

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:password@localhost:5432/against_wind"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "minioadmin")
os.environ.setdefault("S3_SECRET_KEY", "minioadmin")
os.environ.setdefault("SECRET_KEY", "test-secret")


class FakeS3Storage:
    """In-memory S3 replacement for API tests."""

    def __init__(self):
        self.objects = {}
        self.bucket = "test-bucket"

    async def upload_text(self, key: str, content: str) -> str:
        self.objects[key] = content
        return f"memory://{self.bucket}/{key}"

    async def download_text(self, key: str) -> str | None:
        return self.objects.get(key)

    async def delete_object(self, key: str) -> bool:
        self.objects.pop(key, None)
        return True

    def ensure_bucket_exists(self):
        return None


def create_real_s3_bucket():
    from api.app.core.config import get_settings

    settings = get_settings()
    s3_client = boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
    )

    try:
        s3_client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError as e:
        if e.response["Error"]["Code"] == "404":
            s3_client.create_bucket(Bucket=settings.s3_bucket)
        else:
            raise


@pytest.fixture(autouse=True)
def stub_external_storage(monkeypatch):
    """Avoid requiring MinIO for default test runs."""
    if os.environ.get("AGAINST_WIND_USE_REAL_S3") == "1":
        create_real_s3_bucket()
        return

    monkeypatch.setattr("api.app.services.analyze.S3Storage", FakeS3Storage)
    monkeypatch.setattr("api.app.main.S3Storage", FakeS3Storage)
