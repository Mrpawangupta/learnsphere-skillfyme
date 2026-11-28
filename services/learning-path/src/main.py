from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from .config import settings
from .database import Base, engine
from .routes import health, paths

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Learning Path service", port=settings.PORT)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ready")
    yield
    logger.info("Learning Path service shutting down")


app = FastAPI(
    title="Skillfyme Learning Path Service",
    description="Manages curated learning paths and skill bundles",
    version="1.0.0",
    docs_url="/api/v1/docs",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(paths.router, prefix="/api/v1/paths", tags=["learning-paths"])
