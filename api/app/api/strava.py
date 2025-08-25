"""Strava integration API endpoints."""

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger

from api.app.core.config import get_settings

router = APIRouter(prefix="/strava", tags=["strava"])


class StravaConnectionStatus(BaseModel):
    """Strava connection status response."""

    connected: bool
    athlete_id: Optional[int] = None
    athlete_name: Optional[str] = None


class StravaSettings(BaseModel):
    """Strava integration settings."""

    auto_analyze: bool = True
    update_description: bool = True
    cycling_only: bool = True


@router.get("/status", response_model=StravaConnectionStatus)
async def get_strava_status(user_id: str):
    """Get Strava connection status for a user."""
    # This would typically check your database for stored Strava tokens
    # For now, we'll return a placeholder response
    return StravaConnectionStatus(connected=False, athlete_id=None, athlete_name=None)


@router.get("/auth-url")
async def get_strava_auth_url(user_id: str):
    """Get Strava OAuth authorization URL."""
    settings = get_settings()

    # This should point to your Cloudflare Worker
    worker_url = settings.strava_worker_url
    if not worker_url:
        raise HTTPException(status_code=500, detail="Strava integration not configured")

    auth_url = f"{worker_url}/auth/strava?user_id={user_id}"

    return {"auth_url": auth_url}


@router.post("/disconnect")
async def disconnect_strava(user_id: str):
    """Disconnect Strava account."""
    settings = get_settings()

    worker_url = settings.strava_worker_url
    if not worker_url:
        raise HTTPException(status_code=500, detail="Strava integration not configured")

    # Call worker to disconnect
    import httpx

    async with httpx.AsyncClient() as client:
        response = await client.get(f"{worker_url}/auth/disconnect?user_id={user_id}")
        if response.status_code != 200:
            raise HTTPException(
                status_code=500, detail="Failed to disconnect Strava account"
            )

    return {"success": True}


@router.get("/settings", response_model=StravaSettings)
async def get_strava_settings(user_id: str):
    """Get Strava integration settings for a user."""
    # This would typically fetch from database
    # For now, return default settings
    return StravaSettings(auto_analyze=True, update_description=True, cycling_only=True)


@router.put("/settings")
async def update_strava_settings(user_id: str, settings: StravaSettings):
    """Update Strava integration settings for a user."""
    # This would typically save to database
    logger.info(f"Updated Strava settings for user {user_id}: {settings}")
    return {"success": True}


@router.post("/webhook/setup")
async def setup_webhook():
    """Setup Strava webhook subscription."""
    settings = get_settings()

    if not all([settings.strava_client_id, settings.strava_client_secret]):
        raise HTTPException(status_code=500, detail="Strava credentials not configured")

    # Setup webhook subscription
    import httpx

    webhook_data = {
        "client_id": settings.strava_client_id,
        "client_secret": settings.strava_client_secret,
        "callback_url": f"{settings.strava_worker_url}/webhook",
        "verify_token": settings.strava_webhook_verify_token,
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://www.strava.com/api/v3/push_subscriptions", json=webhook_data
        )

        if response.status_code not in [200, 201]:
            raise HTTPException(
                status_code=500, detail=f"Failed to setup webhook: {response.text}"
            )

    return {"success": True, "subscription": response.json()}


@router.get("/webhook/status")
async def get_webhook_status():
    """Get current webhook subscription status."""
    settings = get_settings()

    if not all([settings.strava_client_id, settings.strava_client_secret]):
        raise HTTPException(status_code=500, detail="Strava credentials not configured")

    import httpx

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://www.strava.com/api/v3/push_subscriptions",
            params={
                "client_id": settings.strava_client_id,
                "client_secret": settings.strava_client_secret,
            },
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=500, detail=f"Failed to get webhook status: {response.text}"
            )

    return response.json()
