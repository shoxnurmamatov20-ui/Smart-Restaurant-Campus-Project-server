"""CAMPUS AI Services — FastAPI application entrypoint."""

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from src.api.v1 import router as v1_router
from src.core.config import settings
from src.core.logging import configure_logging

configure_logging()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan — runs on startup and shutdown."""
    logger.info("ai_services.startup", env=settings.app_env, version=settings.app_version)
    yield
    logger.info("ai_services.shutdown")


app = FastAPI(
    title="CAMPUS AI Services",
    description="AI/ML microservices for the CAMPUS Smart Campus Platform",
    version=settings.app_version,
    docs_url="/docs" if settings.app_debug else None,
    redoc_url="/redoc" if settings.app_debug else None,
    openapi_url="/openapi.json" if settings.app_debug else None,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics
Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

# API routers
app.include_router(v1_router, prefix="/api/v1")


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "service": "campus-ai-services"}


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {
        "service": "CAMPUS AI Services",
        "version": settings.app_version,
        "docs": "/docs" if settings.app_debug else "disabled",
    }
