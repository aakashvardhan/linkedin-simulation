"""Async Redis client used by the AI service.

redis-py asyncio API; a single cached client shares the connection pool across
handlers and background tasks. Prefer prefixing keys with `REDIS_KEY_PREFIX`
(or helpers in dedicated modules) so namespaced keys stay collision-free.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from redis.asyncio import Redis

from app.config import settings

logger = logging.getLogger(__name__)

REDIS_KEY_PREFIX = "ai_service:"


@lru_cache(maxsize=1)
def _redis() -> Redis:
    """Return a process-wide asyncio Redis client.

    Cached so request handlers and consumers reuse one pool. Connections are
    opened lazily on first command.
    """

    logger.debug("Creating Redis client for %s", settings.redis_url)
    return Redis.from_url(settings.redis_url, decode_responses=True)


def get_redis() -> Redis:
    return _redis()


async def close_redis() -> None:
    """Close the cached Redis client. Intended for FastAPI shutdown hooks."""

    if _redis.cache_info().currsize:
        await _redis().aclose()
        _redis.cache_clear()
        logger.info("Redis client closed")
