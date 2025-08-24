import pytest
import boto3
from botocore.exceptions import ClientError
from api.app.core.config import get_settings

@pytest.fixture(scope="session", autouse=True)
def create_s3_bucket():
    """Create the S3 bucket before tests run."""
    settings = get_settings()
    s3_client = boto3.client(
        's3',
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key
    )

    try:
        s3_client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError as e:
        if e.response['Error']['Code'] == '404':
            s3_client.create_bucket(Bucket=settings.s3_bucket)
        else:
            raise
