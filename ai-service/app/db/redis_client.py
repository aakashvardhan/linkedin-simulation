"""Async Redis client used by the AI service.

redis-py asyncio API; a single cached client shares the connection pool across
handlers and background tasks. Prefer prefixing keys with `REDIS_KEY_PREFIX`
(or helpers in dedicated modules) so namespaced keys stay collision-free.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from urllib.parse import urlparse, urlunparse

from redis.asyncio import Redis

from app.config import settings

logger = logging.getLogger(__name__)

REDIS_KEY_PREFIX = "ai_service:"


def _redacted_redis_url(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.scheme:
        return url
    netloc = parsed.netloc
    if "@" in netloc:
        host_part = netloc.rsplit("@", 1)[-1]
        netloc = f"REDACTED@{host_part}"
    safe = parsed._replace(netloc=netloc)
    return urlunparse(safe)


@lru_cache(maxsize=1)
def _redis() -> Redis:
    """Return a process-wide asyncio Redis client.

    Cached so request handlers and consumers reuse one pool. Connections are
    opened lazily on first command.
    """

    logger.debug("Creating Redis client for %s", _redacted_redis_url(settings.redis_url))
    return Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=5.0,
        socket_timeout=5.0,
    )


def get_redis() -> Redis:
    return _redis()


async def close_redis() -> None:
    """Close the cached Redis client. Intended for FastAPI shutdown hooks."""

    if _redis.cache_info().currsize:
        await _redis().aclose()
        _redis.cache_clear()
        logger.info("Redis client closed")
