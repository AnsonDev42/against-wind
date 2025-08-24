from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Query
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime
import json
import asyncio
import uuid
from api.app.domain.models import (
    RouteCreate, Route, AnalysisRequest, AnalysisResponse,
    SSEEvent, ProgressEvent, CompleteResultEvent, ErrorEvent
)
from api.app.services.analyze import AnalysisService
from api.app.storage.db import get_db_session
from api.app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/routes", response_model=dict)
async def create_route(file: UploadFile = File(...), name: Optional[str] = None):
    """Upload GPX file and create a new route."""
    try:
        # Validate file type
        if not file.filename.lower().endswith('.gpx'):
            raise HTTPException(status_code=400, detail="File must be a GPX file")
        
        # Read GPX content
        gpx_content = await file.read()
        gpx_text = gpx_content.decode('utf-8')
        
        # Create route using analysis service
        analysis_service = AnalysisService()
        route = await analysis_service.create_route(gpx_text, name)
        
        return {
            "route_id": route.id,
            "message": "Route created successfully",
            "metadata": {
                "length_km": route.length_km,
                "bbox": route.bbox
            }
        }
        
    except Exception as e:
        logger.error(f"Error creating route: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/routes/{route_id}", response_model=Route)
async def get_route(route_id: str):
    """Get route metadata."""
    try:
        analysis_service = AnalysisService()
        route = await analysis_service.get_route(route_id)
        
        if not route:
            raise HTTPException(status_code=404, detail="Route not found")
        
        return route
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting route: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analyze")
async def analyze_route(
    route_id: str = Query(..., description="Route ID to analyze"),
    depart: str = Query(..., description="Departure time in ISO format"),
    provider: str = Query("open-meteo", description="Forecast provider"),
    speed_profile: str = Query("preset", description="Speed profile")
):
    """Analyze route wind conditions with Server-Sent Events."""
    try:
        # Parse departure time
        depart_time = datetime.fromisoformat(depart.replace('Z', '+00:00'))
        
        # Create analysis request
        request = AnalysisRequest(
            route_id=route_id,
            depart_time=depart_time,
            provider=provider,
            speed_profile=speed_profile
        )
        
        # Return SSE stream
        return StreamingResponse(
            analyze_stream(request),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Cache-Control"
            }
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid departure time: {e}")
    except Exception as e:
        logger.error(f"Error starting analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def analyze_stream(request: AnalysisRequest):
    """Stream analysis results via Server-Sent Events."""
    try:
        analysis_service = AnalysisService()
        
        # Send initial accepted event
        job_id = str(uuid.uuid4())
        yield format_sse_event("accepted", {"job_id": job_id, "status": "started"})
        
        # Process analysis with progress updates
        async for event in analysis_service.analyze_route_stream(request):
            yield format_sse_event(event.event, event.data)
            
            # Small delay to prevent overwhelming the client
            await asyncio.sleep(0.1)
        
    except Exception as e:
        logger.error(f"Error in analysis stream: {e}")
        error_event = ErrorEvent(data={"error": "analysis_failed", "message": str(e)})
        yield format_sse_event(error_event.event, error_event.data)


def format_sse_event(event_type: str, data: dict) -> str:
    """Format data as Server-Sent Event."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


@router.get("/providers")
async def list_providers():
    """List available forecast providers."""
    return {
        "providers": [
            {
                "name": "open-meteo",
                "display_name": "Open-Meteo",
                "description": "Free global weather API",
                "coverage": "Global"
            }
            # Add more providers as they're implemented
        ]
    }


@router.get("/routes/{route_id}/results")
async def get_route_results(route_id: str, limit: int = Query(10, ge=1, le=100)):
    """Get recent analysis results for a route."""
    try:
        analysis_service = AnalysisService()
        results = await analysis_service.get_route_results(route_id, limit)
        return {"results": results}
        
    except Exception as e:
        logger.error(f"Error getting route results: {e}")
        raise HTTPException(status_code=500, detail=str(e))
