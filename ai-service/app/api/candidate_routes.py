"""Candidate-facing REST endpoints mounted at `/ai`.

Each handler is intentionally thin: it parses input, invokes one or more
agents or clients, and shapes the response. Long-running orchestration
(the Hiring Assistant) is deferred to Kafka + the supervisor consumer.
"""

from __future__ import annotations

import datetime
import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.agents import career_coach, job_matcher, outreach_drafter, resume_parser
from app.api.auth import Principal, get_principal, require_member, require_recruiter
from app.clients import job_client, messaging_client, profile_client
from app.clients.errors import ServiceError, translate_service_error
from app.db import task_store
from app.kafka.producer import publish_event
from app.kafka.schemas import (
    AI_REQUESTS_TOPIC,
    AI_RESULTS_TOPIC,
    AIEntityType,
    AIEventType,
    KafkaEnvelope,
)
from app.models.task import (
    AgentTask,
    ApprovalAction,
    StepName,
    StepResult,
    StepStatus,
    TaskStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["candidate-ai"])


def _principal_can_access_task(principal: Principal, task: AgentTask) -> bool:
    """Owner or admin may read task details and sensitive fields."""

    if principal.role == "admin":
        return True
    if task.task_kind == "member":
        return principal.subject_id == (task.member_id or "")
    return principal.subject_id == task.recruiter_id


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


def _non_blank(value: str | None) -> str | None:
    """Pydantic validator helper: coerce whitespace-only strings to an error.

    Returns the stripped value on success; raises ValueError for None is
    handled by the model's Optional annotation (callers can still pass
    `None` when the field is optional).
    """

    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        raise ValueError("must not be empty or whitespace")
    return stripped


class ParseResumeRequest(BaseModel):
    member_id: str
    resume_url: str | None = None
    resume_text: str | None = None

    @field_validator("member_id")
    @classmethod
    def _member_id_not_blank(cls, value: str) -> str:
        result = _non_blank(value)
        if result is None:
            raise ValueError("member_id must not be blank")
        return result

    @field_validator("resume_text", "resume_url")
    @classmethod
    def _optional_not_blank(cls, value: str | None) -> str | None:
        return _non_blank(value)


class ParseResumeResponse(BaseModel):
    member_id: str
    parsed: dict[str, Any]
    confidence_score: float


class MatchFilters(BaseModel):
    min_experience_years: int | None = Field(default=None, ge=0)
    required_skills: list[str] | None = None


class MatchCandidatesRequest(BaseModel):
    job_id: str
    top_k: int = Field(default=5, ge=1, le=50)
    filters: MatchFilters | None = None

    @field_validator("job_id")
    @classmethod
    def _job_id_not_blank(cls, value: str) -> str:
        result = _non_blank(value)
        if result is None:
            raise ValueError("job_id must not be blank")
        return result


class OutreachDraftRequest(BaseModel):
    job_id: str
    member_id: str
    recruiter_id: str
    tone: str | None = Field(default="professional")

    @field_validator("job_id", "member_id", "recruiter_id")
    @classmethod
    def _ids_not_blank(cls, value: str) -> str:
        result = _non_blank(value)
        if result is None:
            raise ValueError("must not be blank")
        return result


class HiringAssistantRequest(BaseModel):
    job_id: str
    recruiter_id: str
    top_k: int = Field(default=5, ge=1, le=50)
    generate_outreach: bool = False

    @field_validator("job_id", "recruiter_id")
    @classmethod
    def _ids_not_blank(cls, value: str) -> str:
        result = _non_blank(value)
        if result is None:
            raise ValueError("must not be blank")
        return result


class ApproveOutreachRequest(BaseModel):
    task_id: str
    recruiter_id: str
    candidate_id: str
    action: ApprovalAction
    final_message: str | None = None

    @field_validator("task_id", "recruiter_id", "candidate_id")
    @classmethod
    def _ids_not_blank(cls, value: str) -> str:
        result = _non_blank(value)
        if result is None:
            raise ValueError("must not be blank")
        return result

    @field_validator("final_message")
    @classmethod
    def _final_message_not_blank(cls, value: str | None) -> str | None:
        # None is acceptable here; validators downstream decide whether
        # `final_message` is required based on `action`.
        return _non_blank(value)


class CareerCoachRequest(BaseModel):
    member_id: str
    target_job_id: str

    @field_validator("member_id", "target_job_id")
    @classmethod
    def _ids_not_blank(cls, value: str) -> str:
        result = _non_blank(value)
        if result is None:
            raise ValueError("must not be blank")
        return result


class CareerCoachApproveRequest(BaseModel):
    """Human-in-the-loop decision after async Career Coach finishes."""

    task_id: str
    member_id: str
    action: ApprovalAction
    edited_summary: str | None = None

    @field_validator("task_id", "member_id")
    @classmethod
    def _ids_not_blank(cls, value: str) -> str:
        result = _non_blank(value)
        if result is None:
            raise ValueError("must not be blank")
        return result

    @field_validator("edited_summary")
    @classmethod
    def _optional_not_blank(cls, value: str | None) -> str | None:
        return _non_blank(value)



# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _handle_service_error(exc: ServiceError) -> HTTPException:
    """Re-raise downstream client errors with an appropriate HTTP status."""

    return translate_service_error(exc)


def _confidence_for(parsed: dict[str, Any]) -> float:
    """Heuristic confidence score based on completeness of parsed fields.

    We prefer a cheap deterministic heuristic over asking the LLM for
    self-scored confidence (which is unreliable). Each expected field
    present contributes equally.
    """

    expected_fields = ("skills", "years_experience", "education", "current_title")
    present = sum(1 for f in expected_fields if parsed.get(f))
    return round(present / len(expected_fields), 3)


def _resume_text_from_request(req: ParseResumeRequest) -> str:
    if req.resume_text:
        return req.resume_text
    # Fetching remote PDFs is out of scope for Part 2; require inline text
    # until the document-ingest pipeline is built.
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="resume_text is required (resume_url ingestion is not yet supported)",
    )


# ---------------------------------------------------------------------------
# 2.2 POST /ai/parse-resume
# ---------------------------------------------------------------------------


@router.post("/parse-resume", response_model=ParseResumeResponse)
async def parse_resume(
    body: ParseResumeRequest,
    principal: Principal = Depends(require_member),
) -> ParseResumeResponse:
    """Extract structured fields from a resume.

    Callers must use the member role; `member_id` must match the authenticated
    principal (no parsing another member's resume through this endpoint).
    """

    if principal.subject_id != body.member_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot parse resume for another member",
        )

    logger.info(
        "parse-resume called member_id=%s actor=%s", body.member_id, principal.subject_id
    )
    resume_text = _resume_text_from_request(body)
    try:
        parsed = await resume_parser.parse_resume(resume_text)
    except (json.JSONDecodeError, ValueError) as e:
        # The LLM returned something that wasn't valid JSON (prompt drift,
        # truncation, etc.). Surface this distinctly so clients can retry.
        logger.error("parse-resume JSON error member_id=%s: %s", body.member_id, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Resume parser returned invalid JSON; try again",
        ) from e
    except Exception as e:
        logger.error("parse-resume failed member_id=%s error=%s", body.member_id, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Resume parser failed",
        ) from e

    if not isinstance(parsed, dict):
        # Defensive: the parser contract says it returns a dict. If an LLM
        # response happens to decode to a list or scalar, reject it clearly.
        logger.error(
            "parse-resume unexpected shape member_id=%s type=%s",
            body.member_id,
            type(parsed).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Resume parser returned unexpected shape",
        )

    return ParseResumeResponse(
        member_id=body.member_id,
        parsed=parsed,
        confidence_score=_confidence_for(parsed),
    )


# ---------------------------------------------------------------------------
# 2.3 POST /ai/match-candidates
# ---------------------------------------------------------------------------


@router.post("/match-candidates")
async def match_candidates(
    body: MatchCandidatesRequest,
    principal: Principal = Depends(require_recruiter),
) -> dict[str, Any]:
    """Rank the candidate pool for a job by semantic + skills overlap.

    Note: the scoring weights follow `agents.job_matcher.compute_match_score`
    (0.6 semantic, 0.4 skills overlap). PLAN.md originally described
    0.4/0.3/0.2/0.1 weights \u2014 tracked in the Integration Changelog.
    """

    try:
        job = await job_client.fetch_job(body.job_id)
        candidates = await profile_client.fetch_candidate_pool(body.job_id)
    except ServiceError as exc:
        raise _handle_service_error(exc) from exc

    filters = body.filters or MatchFilters()
    if filters.min_experience_years is not None:
        candidates = [
            c for c in candidates
            if (c.get("years_experience") or 0) >= filters.min_experience_years
        ]
    if filters.required_skills:
        required = {s.lower() for s in filters.required_skills}
        candidates = [
            c for c in candidates
            if required.issubset({s.lower() for s in c.get("skills", [])})
        ]

    job_skills = {s.lower() for s in job.get("skills_required", [])}
    ranked: list[dict[str, Any]] = []
    for candidate in candidates:
        match = job_matcher.compute_match_score(job, candidate)
        member_skills = {s.lower() for s in candidate.get("skills", [])}
        ranked.append(
            {
                "member_id": candidate.get("member_id") or candidate.get("_id"),
                "match_score": match["score"],
                "semantic_score": match["semantic_score"],
                "skills_overlap": match["skills_overlap"],
                "skills_missing": sorted(job_skills - member_skills),
            }
        )

    ranked.sort(key=lambda row: row["match_score"], reverse=True)
    return {
        "job_id": body.job_id,
        "recruiter_id": principal.subject_id,
        "top_k": body.top_k,
        "results": ranked[: body.top_k],
    }


# ---------------------------------------------------------------------------
# 2.4 POST /ai/outreach-draft
# ---------------------------------------------------------------------------


@router.post("/outreach-draft")
async def outreach_draft(
    body: OutreachDraftRequest,
    principal: Principal = Depends(require_recruiter),
) -> dict[str, Any]:
    """Generate a personalized outreach message."""

    if body.recruiter_id != principal.subject_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="recruiter_id does not match authenticated user",
        )

    try:
        job = await job_client.fetch_job(body.job_id)
        member = await profile_client.fetch_member(body.member_id)
    except ServiceError as exc:
        raise _handle_service_error(exc) from exc

    match = job_matcher.compute_match_score(job, member)
    outreach = await outreach_drafter.generate_outreach(job, member, match)
    return {
        "job_id": body.job_id,
        "member_id": body.member_id,
        "recruiter_id": principal.subject_id,
        "tone": body.tone,
        "draft_message": outreach["draft"],
        "match_score": outreach.get("match_score"),
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# 2.5 POST /ai/hiring-assistant
# ---------------------------------------------------------------------------


@router.post("/hiring-assistant", status_code=status.HTTP_202_ACCEPTED)
async def hiring_assistant(
    body: HiringAssistantRequest,
    principal: Principal = Depends(require_recruiter),
) -> dict[str, Any]:
    """Kick off a multi-step hiring workflow asynchronously.

    Returns 202 with the task identifiers and a WebSocket URL so the caller
    can subscribe to progress updates while Kafka drives the pipeline.
    """

    if body.recruiter_id != principal.subject_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="recruiter_id does not match authenticated user",
        )
    recruiter_id = principal.subject_id

    try:
        await job_client.fetch_job(body.job_id)  # 404 propagates if unknown
    except ServiceError as exc:
        raise _handle_service_error(exc) from exc

    task_id = str(uuid.uuid4())
    trace_id = task_id  # identical on creation; see AgentTask docstring

    task = AgentTask(
        task_id=task_id,
        trace_id=trace_id,
        recruiter_id=recruiter_id,
        job_id=body.job_id,
        top_k=body.top_k,
        generate_outreach=body.generate_outreach,
        idempotency_key=task_id,
        status=TaskStatus.PROCESSING,
    )
    await task_store.create_task(task)

    envelope = KafkaEnvelope(
        event_type=AIEventType.AI_REQUESTED.value,
        trace_id=trace_id,
        actor_id=recruiter_id,
        entity={"entity_type": AIEntityType.AI_TASK.value, "entity_id": task_id},
        payload={
            "task_id": task_id,
            "job_id": body.job_id,
            "recruiter_id": recruiter_id,
            "top_k": body.top_k,
            "generate_outreach": body.generate_outreach,
        },
        idempotency_key=task_id,
    )

    # If Kafka publish fails AFTER the task row was inserted, the task
    # would never be picked up by the consumer. Roll the row forward to
    # FAILED and surface a 502 so the caller can retry.
    try:
        await publish_event(AI_REQUESTS_TOPIC, envelope.model_dump(mode="json"))
    except Exception as e:
        logger.error("Kafka publish failed for task_id=%s: %s", task_id, e)
        await task_store.update_status(task_id, TaskStatus.FAILED)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to enqueue task; please retry",
        ) from e

    return {
        "task_id": task_id,
        "trace_id": trace_id,
        "status": TaskStatus.PROCESSING.value,
        "websocket_url": f"/ai/ws/{task_id}",
    }


# ---------------------------------------------------------------------------
# 2.7 GET /ai/task/{task_id}
# ---------------------------------------------------------------------------


@router.get("/task/{task_id}")
async def get_task(
    task_id: str,
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    task = await task_store.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if not _principal_can_access_task(principal, task):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this task",
        )

    if task.task_kind == "member":
        total_steps = 1
    else:
        total_steps = 3 if task.generate_outreach else 2
    steps_remaining = max(total_steps - task.steps_completed, 0)
    payload: dict[str, Any] = {
        "task_id": task.task_id,
        "trace_id": task.trace_id,
        "status": task.status.value,
        "current_step": task.steps[-1].step.value if task.steps else None,
        "steps_completed": task.steps_completed,
        "steps_remaining": steps_remaining,
        "progress_percent": task.progress_percent,
    }
    if task.status in (TaskStatus.COMPLETED, TaskStatus.AWAITING_APPROVAL):
        payload["result"] = task.result
    if task.approval:
        payload["approval"] = task.approval
    return payload


# ---------------------------------------------------------------------------
# 2.8 POST /ai/approve-outreach
# ---------------------------------------------------------------------------


def _is_duplicate_approval(existing: dict[str, Any] | None, candidate_id: str) -> bool:
    """True iff `existing` already records a decision for this candidate."""

    if not existing:
        return False
    return existing.get("candidate_id") == candidate_id


@router.post("/approve-outreach")
async def approve_outreach(
    body: ApproveOutreachRequest,
    principal: Principal = Depends(require_recruiter),
) -> dict[str, Any]:
    if principal.subject_id != body.recruiter_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="recruiter_id does not match authenticated user",
        )

    task = await task_store.get_task(body.task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    if task.recruiter_id != body.recruiter_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Recruiter does not own this task",
        )
    if task.status != TaskStatus.AWAITING_APPROVAL:
        # Approval is only meaningful while the task is waiting for HITL.
        # Reject with 409 Conflict rather than 400 so clients can
        # distinguish bad input from wrong-state.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Task is in status '{task.status.value}'; cannot record approval",
        )
    if _is_duplicate_approval(task.approval, body.candidate_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Approval already recorded for this candidate",
        )

    approval: dict[str, Any] = {
        "candidate_id": body.candidate_id,
        "action": body.action.value,
        "final_message": body.final_message,
        "recorded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }

    if body.action in (ApprovalAction.APPROVED, ApprovalAction.EDITED):
        if not body.final_message:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="final_message is required when approving or editing",
            )
        try:
            delivery = await messaging_client.send_message(
                sender_id=body.recruiter_id,
                recipient_id=body.candidate_id,
                body=body.final_message,
                context={"task_id": body.task_id, "trace_id": task.trace_id},
            )
        except ServiceError as exc:
            raise _handle_service_error(exc) from exc
        approval["delivery"] = delivery

    await task_store.record_approval(body.task_id, approval)

    envelope = KafkaEnvelope(
        event_type=AIEventType.AI_APPROVAL_RECORDED.value,
        trace_id=task.trace_id,
        actor_id=body.recruiter_id,
        entity={"entity_type": AIEntityType.AI_TASK.value, "entity_id": body.task_id},
        payload=approval,
        idempotency_key=f"{body.task_id}:{body.candidate_id}:{body.action.value}",
    )
    dump = envelope.model_dump(mode="json")
    try:
        await publish_event(AI_RESULTS_TOPIC, dump)
    except Exception as e:
        logger.error(
            "Kafka publish failed after task_store.record_approval "
            "event_type=%s trace_id=%s idempotency_key=%s envelope=%s error=%s",
            AIEventType.AI_APPROVAL_RECORDED.value,
            task.trace_id,
            envelope.idempotency_key,
            dump,
            e,
            exc_info=True,
        )
        await task_store.revert_approval_to_awaiting(body.task_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to publish approval event; please retry",
        ) from e

    return {
        "task_id": body.task_id,
        "candidate_id": body.candidate_id,
        "action": body.action.value,
        "status": "recorded",
    }


# ---------------------------------------------------------------------------
# 2.9 POST /ai/career-coach/kickoff — async Career Coach + Kafka + HITL
# ---------------------------------------------------------------------------


@router.post("/career-coach/kickoff", status_code=status.HTTP_202_ACCEPTED)
async def career_coach_kickoff(
    body: CareerCoachRequest,
    principal: Principal = Depends(require_member),
) -> dict[str, Any]:
    """Enqueue a Career Coach run; consumer produces suggestions then `awaiting_approval`."""

    if principal.subject_id != body.member_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot start coaching for another member",
        )
    try:
        await job_client.fetch_job(body.target_job_id)
    except ServiceError as exc:
        raise _handle_service_error(exc) from exc

    task_id = str(uuid.uuid4())
    trace_id = task_id

    task = AgentTask(
        task_id=task_id,
        trace_id=trace_id,
        member_id=body.member_id,
        task_kind="member",
        job_id=body.target_job_id,
        idempotency_key=task_id,
        status=TaskStatus.PROCESSING,
    )
    await task_store.create_task(task)

    envelope = KafkaEnvelope(
        event_type=AIEventType.AI_REQUESTED.value,
        trace_id=trace_id,
        actor_id=body.member_id,
        entity={"entity_type": AIEntityType.AI_TASK.value, "entity_id": task_id},
        payload={
            "task_id": task_id,
            "career_coach": True,
            "member_id": body.member_id,
            "target_job_id": body.target_job_id,
        },
        idempotency_key=task_id,
    )
    try:
        await publish_event(AI_REQUESTS_TOPIC, envelope.model_dump(mode="json"))
    except Exception as e:
        logger.error("Kafka publish failed for career coach task_id=%s: %s", task_id, e)
        await task_store.update_status(task_id, TaskStatus.FAILED)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to enqueue career coach task; please retry",
        ) from e

    return {
        "task_id": task_id,
        "trace_id": trace_id,
        "status": TaskStatus.PROCESSING.value,
        "websocket_url": f"/ai/ws/{task_id}",
    }


@router.post("/career-coach/approve")
async def approve_career_coach(
    body: CareerCoachApproveRequest,
    principal: Principal = Depends(require_member),
) -> dict[str, Any]:
    """Record the member's approve / edit / reject decision on coaching output."""

    task = await task_store.get_task(body.task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    if task.task_kind != "member":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Not a career coach task",
        )
    if task.member_id != body.member_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Member does not own this task",
        )
    if principal.subject_id != body.member_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Caller does not match member_id",
        )
    if task.status != TaskStatus.AWAITING_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Task is in status '{task.status.value}'; cannot record approval",
        )
    if task.approval is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Approval already recorded for this task",
        )

    if body.action == ApprovalAction.EDITED and not (body.edited_summary or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="edited_summary is required when action is edited",
        )

    approval = {
        "member_id": body.member_id,
        "action": body.action.value,
        "edited_summary": body.edited_summary,
        "recorded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }

    await task_store.record_approval(body.task_id, approval)

    envelope = KafkaEnvelope(
        event_type=AIEventType.AI_APPROVAL_RECORDED.value,
        trace_id=task.trace_id,
        actor_id=body.member_id,
        entity={"entity_type": AIEntityType.AI_TASK.value, "entity_id": body.task_id},
        payload=approval,
        idempotency_key=f"{body.task_id}:career_coach:{body.action.value}",
    )
    dump = envelope.model_dump(mode="json")
    try:
        await publish_event(AI_RESULTS_TOPIC, dump)
    except Exception as e:
        logger.error(
            "Kafka publish failed after task_store.record_approval "
            "event_type=%s trace_id=%s idempotency_key=%s envelope=%s error=%s",
            AIEventType.AI_APPROVAL_RECORDED.value,
            task.trace_id,
            envelope.idempotency_key,
            dump,
            e,
            exc_info=True,
        )
        await task_store.revert_approval_to_awaiting(body.task_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to publish approval event; please retry",
        ) from e

    return {
        "task_id": body.task_id,
        "member_id": body.member_id,
        "action": body.action.value,
        "status": "recorded",
    }


# ---------------------------------------------------------------------------
# 2.10 POST /ai/career-coach (optional)
# ---------------------------------------------------------------------------


@router.post("/career-coach")
async def run_career_coach(
    body: CareerCoachRequest,
    principal: Principal = Depends(require_member),
) -> dict[str, Any]:
    if principal.subject_id != body.member_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot run career coach for another member",
        )

    try:
        member = await profile_client.fetch_member(body.member_id)
        job = await job_client.fetch_job(body.target_job_id)
    except ServiceError as exc:
        raise _handle_service_error(exc) from exc

    result = await career_coach.coach(job, member)
    return {
        "member_id": body.member_id,
        "target_job_id": body.target_job_id,
        **result,
    }


# ---------------------------------------------------------------------------
# Step helper used by the Kafka consumer (2.6)
# ---------------------------------------------------------------------------


def build_step(step: StepName, status_: StepStatus, data: dict[str, Any] | None = None) -> StepResult:
    """Factory kept here so the consumer and tests share one construction path."""

    return StepResult(step=step, status=status_, data=data)
