"""Async MongoDB client used by the AI service.

Motor is used for async I/O; collection accessors are exposed as simple
functions so callers don't need to know about the driver internals.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.config import settings

logger = logging.getLogger(__name__)

# Collection names are declared here so they remain consistent everywhere.
AI_TASKS_COLLECTION = "ai_tasks"
AI_METRICS_COLLECTION = "ai_metrics"


@lru_cache(maxsize=1)
def _client() -> AsyncIOMotorClient:
    """Return a process-wide Motor client.

    Cached so we share a single connection pool across request handlers and
    background consumers. The client is safe to create at import time because
    Motor defers actual connection establishment until first use.
    """

    logger.debug("Creating Motor client for %s", settings.mongo_uri)
    return AsyncIOMotorClient(settings.mongo_uri)


def get_database() -> AsyncIOMotorDatabase:
    return _client()[settings.mongo_db_name]


def get_collection(name: str) -> AsyncIOMotorCollection:
    return get_database()[name]


def get_ai_tasks_collection() -> AsyncIOMotorCollection:
    return get_collection(AI_TASKS_COLLECTION)


async def close_client() -> None:
    """Close the cached Motor client. Intended for FastAPI shutdown hooks."""

    if _client.cache_info().currsize:
        _client().close()
        _client.cache_clear()
        logger.info("Motor client closed")
