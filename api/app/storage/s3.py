import boto3
from botocore.exceptions import ClientError
from typing import Optional
import logging
from api.app.core.config import get_settings

logger = logging.getLogger(__name__)


class S3Storage:
    """S3-compatible storage service for GPX files and other assets."""
    
    def __init__(self):
        self.settings = get_settings()
        self.client = boto3.client(
            's3',
            endpoint_url=self.settings.s3_endpoint,
            aws_access_key_id=self.settings.s3_access_key,
            aws_secret_access_key=self.settings.s3_secret_key,
            region_name='us-east-1'  # MinIO default
        )
        self.bucket = self.settings.s3_bucket
    
    async def upload_text(self, key: str, content: str) -> str:
        """Upload text content to S3 and return the URL."""
        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=content.encode('utf-8'),
                ContentType='application/gpx+xml'
            )
            
            # Generate URL
            url = f"{self.settings.s3_endpoint}/{self.bucket}/{key}"
            return url
            
        except ClientError as e:
            logger.error(f"Failed to upload to S3: {e}")
            raise
    
    async def download_text(self, key: str) -> Optional[str]:
        """Download text content from S3."""
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            return response['Body'].read().decode('utf-8')
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                return None
            logger.error(f"Failed to download from S3: {e}")
            raise
    
    async def delete_object(self, key: str) -> bool:
        """Delete object from S3."""
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
            return True
            
        except ClientError as e:
            logger.error(f"Failed to delete from S3: {e}")
            return False
    
    def ensure_bucket_exists(self):
        """Ensure the S3 bucket exists."""
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                # Bucket doesn't exist, create it
                try:
                    self.client.create_bucket(Bucket=self.bucket)
                    logger.info(f"Created S3 bucket: {self.bucket}")
                except ClientError as create_error:
                    logger.error(f"Failed to create bucket: {create_error}")
                    raise
            else:
                logger.error(f"Error checking bucket: {e}")
                raise
