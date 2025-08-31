from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from api.app.api.routes import router
from api.app.core.config import get_settings
from api.app.core.logging import setup_logging
from api.app.storage.db import init_db
from api.app.storage.s3 import S3Storage


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    setup_logging()
    logger.info("Starting Against Wind API...")
    _ = get_settings()

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Ensure S3 bucket exists
    try:
        s3_storage = S3Storage()
        s3_storage.ensure_bucket_exists()
        logger.info("S3 storage checked and ready")
    except Exception as e:
        logger.critical(f"Failed to initialize S3 storage: {e}")

    yield

    # Shutdown
    logger.info("Shutting down Against Wind API...")


def create_app() -> FastAPI:
    """Create and configure FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="Against Wind API",
        description="Wind analysis API for cycling routes",
        version="0.1.0",
        lifespan=lifespan,
    )

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include API routes
    app.include_router(router, prefix="/api/v1")

    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "healthy", "service": "against-wind-api"}

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
