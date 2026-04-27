# REST endpoints (/agent/request, /agent/status)

import logging
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.mongo import get_latest_result, get_ranked_candidate_count, upsert_trace
from app.db.redis_client import get_status as get_cached_status, set_status
from app.kafka.producer import publish_event
from fastapi import Query

from app.metrics import approval_rate_summary, match_quality_summary

logger = logging.getLogger(__name__)

router = APIRouter()

class AgentRequest(BaseModel):
    actor_id: str
    job: dict
    # Backward compatible: old clients send a single resume in `resume_text`.
    resume_text: str | None = None
    # New: batch mode for all applicants for a job.
    # Each item should minimally include `resume_text` and may include identifiers like `candidate_id`.
    candidates: list[dict] | None = None


class ApprovalRequest(BaseModel):
    action: str  # "approve" | "edit" | "reject"
    edited_draft: str | None = None
    candidate_id: str | None = None


@router.post("/request")
async def request_agent(body: AgentRequest) -> dict:
    trace_id = str(uuid.uuid4())
    await upsert_trace(trace_id=trace_id, actor_id=body.actor_id, status="queued", job=body.job)
    await set_status(trace_id, "queued")

    payload: dict = {
        "actor_id": body.actor_id,
        "job": body.job,
    }
    if body.candidates is not None:
        payload["candidates"] = body.candidates
    else:
        payload["resume_text"] = body.resume_text or ""

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
            "payload": payload,
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
async def approve_outreach(trace_id: str, body: ApprovalRequest) -> dict:
    if body.action not in ("approve", "edit", "reject"):
        raise HTTPException(
            status_code=400,
            detail="action must be one of: approve, edit, reject",
        )

    expected = await get_ranked_candidate_count(trace_id)
    if expected > 0:
        if not (body.candidate_id or "").strip():
            raise HTTPException(
                status_code=400,
                detail="candidate_id is required for batch traces (multi-candidate workflows)",
            )

    await publish_event(
        "ai.results",
        {
            "event_type": "ai.approval.recorded",
            "trace_id": trace_id,
            "actor_id": "recruiter",
            "entity": {
                "entity_type": "ai_task",
                "entity_id": trace_id,
            },
            "payload": {
                "action": body.action,
                "edited_draft": body.edited_draft,
                "candidate_id": (body.candidate_id or "").strip() or None,
            },
            "idempotency_key": str(uuid.uuid4()),
        },
    )

    logger.info(
        "Approval recorded trace_id=%s action=%s candidate_id=%s",
        trace_id,
        body.action,
        (body.candidate_id or "").strip(),
    )

    return {
        "trace_id": trace_id,
        "action": body.action,
        "candidate_id": (body.candidate_id or "").strip() or None,
        "status": "recorded",
    }


@router.get("/status/{trace_id}")
async def get_status(trace_id: str) -> dict:
    cached = await get_cached_status(trace_id)
    latest = await get_latest_result(trace_id)
    if cached is None and latest is None:
        raise HTTPException(status_code=404, detail="Unknown trace_id")
    return {
        "trace_id": trace_id,
        "status": (cached or {}).get("status") or (latest or {}).get("trace", {}).get("status"),
        "cache": cached,
        "trace": (latest or {}).get("trace"),
    }

@router.get("/result/{trace_id}")
async def get_result(trace_id: str) -> dict:
    latest = await get_latest_result(trace_id)
    if latest is None:
        raise HTTPException(status_code=404, detail="No result found for this trace_id")
    return latest


@router.get("/metrics/approval-rate")
async def get_approval_rate() -> dict:
    return await approval_rate_summary()


@router.get("/metrics/match-quality")
async def get_match_quality(
    window_days: int = Query(default=7, ge=1, le=365),
    sample_limit: int = Query(default=20, ge=0, le=200),
) -> dict:
    return await match_quality_summary(window_days=window_days, sample_limit=sample_limit)