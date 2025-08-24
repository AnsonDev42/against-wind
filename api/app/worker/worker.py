import asyncio
import logging
from rq import SimpleWorker
from api.app.storage.cache import get_redis_connection
from api.app.core.config import get_settings
from api.app.services.analyze import AnalysisService
from api.app.domain.models import AnalysisRequest
import json

logger = logging.getLogger(__name__)


async def analyze_route_job(request_data: dict):
    """Background job to analyze route wind conditions."""
    try:
        # Parse request
        request = AnalysisRequest(**request_data)
        
        # Initialize analysis service
        analysis_service = AnalysisService()
        
        # Process analysis (simplified for background job)
        # In production, this would stream results to a job status cache
        async for event in analysis_service.analyze_route_stream(request):
            # Store progress in Redis for job status tracking
            logger.info(f"Analysis progress: {event.event}")
            
        logger.info(f"Analysis completed for route {request.route_id}")
        return {"status": "completed", "route_id": request.route_id}
        
    except Exception as e:
        logger.error(f"Analysis job failed: {e}")
        raise


def run_worker():
    """Run RQ worker for background jobs."""
    redis_conn = get_redis_connection()
    
    queues = ['default']
    worker = SimpleWorker(queues, connection=redis_conn)
    logger.info(f"Starting RQ worker on queues: {', '.join(queues)}")
    worker.work()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    run_worker()
