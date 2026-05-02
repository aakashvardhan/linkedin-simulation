"""Redis-backed storage for `/agent/result/{trace_id}` payloads.

Replaces the in-memory dict so multiple workers and restarts share results.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.db.redis_client import REDIS_KEY_PREFIX, get_redis

logger = logging.getLogger(__name__)

_AGENT_RESULT_PREFIX = f"{REDIS_KEY_PREFIX}agent_result:"
_DEFAULT_TTL_SECONDS = 7 * 24 * 3600


def _key(trace_id: str) -> str:
    return f"{_AGENT_RESULT_PREFIX}{trace_id}"


async def set_agent_result(trace_id: str, result: dict[str, Any], *, ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> None:
    redis = get_redis()
    try:
        await redis.set(_key(trace_id), json.dumps(result), ex=ttl_seconds)
    except Exception:
        logger.exception("Failed to persist agent result trace_id=%s", trace_id)
        raise


async def get_agent_result(trace_id: str) -> dict[str, Any] | None:
    redis = get_redis()
    try:
        raw = await redis.get(_key(trace_id))
    except Exception:
        logger.exception("Failed to load agent result trace_id=%s", trace_id)
        raise
    if raw is None:
        return None
    return json.loads(raw)
