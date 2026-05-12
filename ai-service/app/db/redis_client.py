from __future__ import annotations

import json
from typing import Any

import redis.asyncio as redis

from app.config import settings

_redis: redis.Redis | None = None


async def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def _status_key(trace_id: str) -> str:
    return f"ai:status:{trace_id}"


def _idem_key(topic: str, idempotency_key: str) -> str:
    return f"ai:idempotency:{topic}:{idempotency_key}"


async def set_status(trace_id: str, status: str, extra: dict[str, Any] | None = None) -> None:
    r = await get_redis()
    payload: dict[str, Any] = {"trace_id": trace_id, "status": status}
    if extra:
        payload.update(extra)
    await r.set(_status_key(trace_id), json.dumps(payload), ex=60 * 60 * 24)


async def get_status(trace_id: str) -> dict[str, Any] | None:
    r = await get_redis()
    raw = await r.get(_status_key(trace_id))
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return {"trace_id": trace_id, "status": "unknown"}


async def claim_idempotency(topic: str, idempotency_key: str, ttl_seconds: int = 60 * 60 * 24) -> bool:
    """
    Returns True if this is the first time we see idempotency_key for this topic.
    Consumers should skip processing when False to support at-least-once delivery.
    """
    r = await get_redis()
    key = _idem_key(topic, idempotency_key)
    ok = await r.set(key, "1", nx=True, ex=ttl_seconds)
    return bool(ok)

