import json
import logging
from typing import Any

import redis

from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

_client = None


def get_redis():
    global _client
    if _client is None:
        try:
            _client = redis.Redis.from_url(
                settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
            )
            _client.ping()
            logger.info("Redis connected at %s", settings.redis_url)
        except Exception as e:
            logger.warning("Redis unavailable: %s. Caching disabled.", e)
            _client = None
    return _client


def cache_get(key: str) -> Any | None:
    r = get_redis()
    if r is None:
        return None
    try:
        value = r.get(key)
        if value:
            logger.debug("Cache HIT: %s", key)
            return json.loads(value)
        logger.debug("Cache MISS: %s", key)
        return None
    except Exception as e:
        logger.warning("Cache get error: %s", e)
        return None


def cache_set(key: str, value: Any, ttl: int = 300) -> None:
    r = get_redis()
    if r is None:
        return
    try:
        r.setex(key, ttl, json.dumps(value, default=str))
        logger.debug("Cache SET: %s (ttl=%ds)", key, ttl)
    except Exception as e:
        logger.warning("Cache set error: %s", e)


def cache_delete(*keys: str) -> None:
    r = get_redis()
    if r is None:
        return
    try:
        r.delete(*keys)
        logger.debug("Cache DELETE: %s", keys)
    except Exception as e:
        logger.warning("Cache delete error: %s", e)


def cache_delete_pattern(pattern: str) -> None:
    r = get_redis()
    if r is None:
        return
    try:
        keys = r.keys(pattern)
        if keys:
            r.delete(*keys)
            logger.debug("Cache DELETE pattern %s — removed %d keys", pattern, len(keys))
    except Exception as e:
        logger.warning("Cache delete pattern error: %s", e)
