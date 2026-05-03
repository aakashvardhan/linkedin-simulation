# REST endpoints (/agent/request, /agent/status)

import hashlib
import logging
import uuid

import redis.exceptions as redis_exc
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.auth import Principal, get_principal
from app.db.agent_result_store import get_agent_result
from app.kafka.producer import publish_event

logger = logging.getLogger(__name__)

router = APIRouter()


class AgentRequest(BaseModel):
    actor_id: str
    job: dict
    resume_text: str


class ApprovalRequest(BaseModel):
    action: str  # "approve" | "edit" | "reject"
    edited_draft: str | None = None


@router.post("/request")
async def request_agent(body: AgentRequest) -> dict:
    trace_id = str(uuid.uuid4())

    await publish_event(
        "ai.requests",
        {
            "event_type": "ai.requested",
            "trace_id": trace_id,
            "actor_id": body.actor_id,
            "entity": {
                "entity_type": "ai_task",
                "entity_id": trace_id,
            },
            "payload": {
                "actor_id": body.actor_id,
                "job": body.job,
                "resume_text": body.resume_text,
            },
            "idempotency_key": trace_id,
        },
    )

    logger.info(
        "Agent request published trace_id=%s actor_id=%s", trace_id, body.actor_id
    )

    return {
        "trace_id": trace_id,
        "status": "queued",
        "message": "Connect to /ws/{trace_id} for real-time updates",
    }


@router.post("/approve/{trace_id}")
async def approve_outreach(
    trace_id: str,
    body: ApprovalRequest,
    principal: Principal = Depends(get_principal),
) -> dict:
    if body.action not in ("approve", "edit", "reject"):
        raise HTTPException(
            status_code=400,
            detail="action must be one of: approve, edit, reject",
        )

    actor_id = principal.subject_id
    idempotency_key = hashlib.sha256(f"{trace_id}:{body.action}".encode()).hexdigest()

    await publish_event(
        "ai.results",
        {
            "event_type": "ai.approval.recorded",
            "trace_id": trace_id,
            "actor_id": actor_id,
            "entity": {
                "entity_type": "ai_task",
                "entity_id": trace_id,
            },
            "payload": {
                "action": body.action,
                "edited_draft": body.edited_draft,
            },
            "idempotency_key": idempotency_key,
        },
    )

    logger.info(
        "Approval recorded trace_id=%s action=%s actor_id=%s",
        trace_id,
        body.action,
        actor_id,
    )

    return {
        "trace_id": trace_id,
        "action": body.action,
        "status": "recorded",
    }


@router.get("/status/{trace_id}")
async def get_status(trace_id: str) -> dict:
    return {
        "trace_id": trace_id,
        "message": "Connect to /ws/{trace_id} for real-time status updates",
    }


@router.get("/result/{trace_id}")
async def get_result(trace_id: str) -> dict:
    try:
        result = await get_agent_result(trace_id)
    except redis_exc.RedisError as exc:
        logger.exception("Redis error loading agent result trace_id=%s", trace_id)
        raise HTTPException(
            status_code=503,
            detail="Redis unavailable; fix REDIS_URL and ensure Redis is running",
        ) from exc
    except Exception as exc:
        logger.exception("Failed to load agent result trace_id=%s", trace_id)
        raise HTTPException(
            status_code=502,
            detail="Could not load task result",
        ) from exc
    if result is None:
        raise HTTPException(
            status_code=404,
            detail="No result found for this trace_id",
        )
    return result
