"""Async MongoDB client used by the AI service.

Motor is used for async I/O; collection accessors are exposed as simple
functions so callers don't need to know about the driver internals.
"""

from __future__ import annotations

import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.config import settings

logger = logging.getLogger(__name__)

# Collection names are declared here so they remain consistent everywhere.
AI_TASKS_COLLECTION = "ai_tasks"
AI_METRICS_COLLECTION = "ai_metrics"

_cached_client: AsyncIOMotorClient | None = None


def _client() -> AsyncIOMotorClient:
    """Return a process-wide Motor client."""

    global _cached_client
    if _cached_client is None:
        logger.debug("Creating Motor client for %s", settings.mongo_uri)
        _cached_client = AsyncIOMotorClient(settings.mongo_uri)
    return _cached_client


def get_database() -> AsyncIOMotorDatabase:
    return _client()[settings.mongo_db_name]


def get_collection(name: str) -> AsyncIOMotorCollection:
    return get_database()[name]


def get_ai_tasks_collection() -> AsyncIOMotorCollection:
    return get_collection(AI_TASKS_COLLECTION)


async def close_client() -> None:
    """Close the cached Motor client. Intended for FastAPI shutdown hooks."""

    global _cached_client
    if _cached_client is not None:
        _cached_client.close()
        _cached_client = None
        logger.info("Motor client closed")
