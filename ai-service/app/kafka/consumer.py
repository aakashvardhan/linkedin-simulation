"""Kafka consumer for `ai.requests`.

Dispatches one of two payload shapes:
- Legacy recruiter flow (partner): `{actor_id, job, resume_text}` — delegated
  to the existing `run_hiring_workflow` supervisor.
- Candidate flow (this branch): `{task_id, job_id, recruiter_id, top_k,
  generate_outreach}` — orchestrated in `_run_candidate_workflow` below
  with per-step Mongo persistence, WebSocket updates, and idempotency.
"""

import asyncio
import datetime
import json
import logging
import uuid
from typing import Any

from aiokafka import AIOKafkaConsumer

from app.agents import career_coach, job_matcher, outreach_drafter
from app.agents.supervisor import run_hiring_workflow
from app.api.websocket import push_update
from app.db.agent_result_store import set_agent_result
from app.clients import job_client, profile_client
from app.clients.errors import ServiceError
from app.config import settings
from app.db import task_store
from app.kafka.producer import publish_event
from app.kafka.schemas import (
    AI_REQUESTS_TOPIC,
    AI_RESULTS_TOPIC,
    AIEntityType,
    AIEventType,
)
from app.models.task import (
    StepName,
    StepResult,
    StepStatus,
    TaskStatus,
)

logger = logging.getLogger(__name__)


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _progress_message(step: StepName, status_: StepStatus, progress: int, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    message: dict[str, Any] = {
        "step": step.value,
        "status": status_.value,
        "progress": progress,
    }
    if extra:
        message.update(extra)
    return message


async def _run_candidate_workflow(event: dict[str, Any]) -> None:
    """Execute the candidate hiring pipeline for a task created via `/ai/hiring-assistant`.

    Idempotency: if a task with the same idempotency_key is already beyond
    PROCESSING, the event is skipped. Otherwise each step is persisted to
    Mongo and pushed over the WebSocket as it completes.
    """

    payload = event.get("payload", {})
    task_id = payload.get("task_id")
    idempotency_key = event.get("idempotency_key") or task_id
    if not task_id:
        logger.warning("Candidate event missing task_id; skipping")
        return

    existing = await task_store.get_task_by_idempotency_key(idempotency_key)
    if existing is not None and existing.status not in (TaskStatus.QUEUED, TaskStatus.PROCESSING):
        logger.info(
            "Skipping duplicate task_id=%s idempotency_key=%s status=%s",
            task_id,
            idempotency_key,
            existing.status.value,
        )
        return

    job_id = payload.get("job_id")
    if not job_id:
        # Guard against malformed events so a single bad message can't
        # crash the consumer loop with a KeyError.
        error = "payload missing required field 'job_id'"
        logger.warning("Candidate workflow aborted task_id=%s: %s", task_id, error)
        await task_store.mark_step_failed(
            task_id,
            StepResult(step=StepName.MATCH_CANDIDATES, status=StepStatus.RUNNING),
            error=error,
        )
        await push_update(
            task_id,
            {"step": "done", "status": TaskStatus.FAILED.value, "progress": 0, "error": error},
        )
        return

    total_steps = 2 if payload.get("generate_outreach") else 1
    steps_done = 0

    # --- Step 1: match candidates ------------------------------------------
    await push_update(
        task_id,
        _progress_message(StepName.MATCH_CANDIDATES, StepStatus.RUNNING, 0),
    )
    try:
        job = await job_client.fetch_job(job_id)
        pool = await profile_client.fetch_candidate_pool(job_id)
    except ServiceError as exc:
        await task_store.mark_step_failed(
            task_id,
            StepResult(step=StepName.MATCH_CANDIDATES, status=StepStatus.RUNNING),
            error=str(exc),
        )
        await push_update(
            task_id,
            _progress_message(
                StepName.MATCH_CANDIDATES,
                StepStatus.FAILED,
                int(100 * steps_done / total_steps),
                {"error": str(exc)},
            ),
        )
        return

    job_skills = {s.lower() for s in job.get("skills_required", [])}
    ranked: list[dict[str, Any]] = []
    for candidate in pool:
        match = job_matcher.compute_match_score(job, candidate)
        member_skills = {s.lower() for s in candidate.get("skills", [])}
        ranked.append(
            {
                "member_id": candidate.get("member_id") or candidate.get("_id"),
                "match_score": match["score"],
                "skills_overlap": match["skills_overlap"],
                "skills_missing": sorted(job_skills - member_skills),
                "candidate": candidate,
            }
        )
    ranked.sort(key=lambda row: row["match_score"], reverse=True)
    top = ranked[: payload.get("top_k", 5)]

    await task_store.append_step(
        task_id,
        StepResult(
            step=StepName.MATCH_CANDIDATES,
            status=StepStatus.COMPLETED,
            data={"top": [{k: v for k, v in row.items() if k != "candidate"} for row in top]},
            finished_at=_now(),
        ),
    )
    steps_done += 1
    await push_update(
        task_id,
        _progress_message(
            StepName.MATCH_CANDIDATES,
            StepStatus.COMPLETED,
            int(100 * steps_done / total_steps),
            {"count": len(top)},
        ),
    )

    # --- Step 2 (optional): generate outreach drafts -----------------------
    drafts: list[dict[str, Any]] = []
    if payload.get("generate_outreach"):
        await push_update(
            task_id,
            _progress_message(
                StepName.OUTREACH_DRAFT,
                StepStatus.RUNNING,
                int(100 * steps_done / total_steps),
            ),
        )
        for row in top:
            match = {
                "score": row["match_score"],
                "skills_overlap": row["skills_overlap"],
            }
            try:
                outreach = await outreach_drafter.generate_outreach(job, row["candidate"], match)
            except Exception as e:
                logger.error("Outreach draft failed task_id=%s: %s", task_id, e)
                outreach = {"draft": "", "error": str(e)}
            drafts.append(
                {
                    "member_id": row["member_id"],
                    "draft": outreach.get("draft", ""),
                    "match_score": row["match_score"],
                }
            )
        await task_store.append_step(
            task_id,
            StepResult(
                step=StepName.OUTREACH_DRAFT,
                status=StepStatus.COMPLETED,
                data={"drafts": drafts},
                finished_at=_now(),
            ),
        )
        steps_done += 1
        await push_update(
            task_id,
            _progress_message(
                StepName.OUTREACH_DRAFT,
                StepStatus.COMPLETED,
                int(100 * steps_done / total_steps),
            ),
        )

    # --- Finalize ----------------------------------------------------------
    final_status = (
        TaskStatus.AWAITING_APPROVAL if payload.get("generate_outreach") else TaskStatus.COMPLETED
    )
    result = {
        "shortlist": [{k: v for k, v in row.items() if k != "candidate"} for row in top],
        "outreach_drafts": drafts,
    }
    await task_store.set_result(task_id, result, final_status)
    await set_agent_result(event.get("trace_id", task_id), result)

    await publish_event(
        AI_RESULTS_TOPIC,
        {
            "event_type": AIEventType.AI_COMPLETED.value,
            "trace_id": event.get("trace_id", task_id),
            "actor_id": event.get("actor_id", ""),
            "entity": {"entity_type": AIEntityType.AI_TASK.value, "entity_id": task_id},
            "payload": result,
            "idempotency_key": idempotency_key,
        },
    )
    await push_update(
        task_id,
        {
            "step": "done",
            "status": final_status.value,
            "progress": 100,
        },
    )



async def _run_career_coach_workflow(event: dict[str, Any]) -> None:
    """Member Career Coach: fetch job + profile, run LLM coach, then await HITL approval.

    Triggered when `payload.career_coach` is true (see `/ai/career-coach/kickoff`).
    """

    payload = event.get("payload", {})
    task_id = payload.get("task_id")
    idempotency_key = event.get("idempotency_key") or task_id
    if not task_id:
        logger.warning("Career coach event missing task_id; skipping")
        return

    existing = await task_store.get_task_by_idempotency_key(idempotency_key)
    if existing is not None and existing.status not in (TaskStatus.QUEUED, TaskStatus.PROCESSING):
        logger.info(
            "Skipping duplicate career coach task_id=%s status=%s",
            task_id,
            existing.status.value,
        )
        return

    member_id = payload.get("member_id")
    target_job_id = payload.get("target_job_id")
    if not member_id or not target_job_id:
        error = "payload missing member_id or target_job_id"
        logger.warning("Career coach aborted task_id=%s: %s", task_id, error)
        await task_store.mark_step_failed(
            task_id,
            StepResult(step=StepName.CAREER_COACH, status=StepStatus.RUNNING),
            error=error,
        )
        await push_update(
            task_id,
            {"step": StepName.CAREER_COACH.value, "status": StepStatus.FAILED.value, "progress": 0, "error": error},
        )
        return

    await push_update(
        task_id,
        _progress_message(StepName.CAREER_COACH, StepStatus.RUNNING, 0),
    )

    try:
        job = await job_client.fetch_job(target_job_id)
        member = await profile_client.fetch_member(member_id)
    except ServiceError as exc:
        await task_store.mark_step_failed(
            task_id,
            StepResult(step=StepName.CAREER_COACH, status=StepStatus.RUNNING),
            error=str(exc),
        )
        await push_update(
            task_id,
            _progress_message(
                StepName.CAREER_COACH,
                StepStatus.FAILED,
                0,
                {"error": str(exc)},
            ),
        )
        return

    try:
        coach_result = await career_coach.coach(job, member)
    except Exception as e:
        logger.exception("Career coach LLM failed task_id=%s", task_id)
        await task_store.mark_step_failed(
            task_id,
            StepResult(step=StepName.CAREER_COACH, status=StepStatus.RUNNING),
            error=str(e),
        )
        await push_update(
            task_id,
            _progress_message(StepName.CAREER_COACH, StepStatus.FAILED, 0, {"error": str(e)}),
        )
        return

    await task_store.append_step(
        task_id,
        StepResult(
            step=StepName.CAREER_COACH,
            status=StepStatus.COMPLETED,
            data=coach_result,
            finished_at=_now(),
        ),
    )
    await push_update(
        task_id,
        _progress_message(StepName.CAREER_COACH, StepStatus.COMPLETED, 100),
    )

    result = {
        "member_id": member_id,
        "target_job_id": target_job_id,
        "job_title": job.get("title"),
        **coach_result,
    }
    await task_store.set_result(task_id, result, TaskStatus.AWAITING_APPROVAL)
    await set_agent_result(event.get("trace_id", task_id), result)

    await publish_event(
        AI_RESULTS_TOPIC,
        {
            "event_type": AIEventType.AI_COMPLETED.value,
            "trace_id": event.get("trace_id", task_id),
            "actor_id": member_id,
            "entity": {"entity_type": AIEntityType.AI_TASK.value, "entity_id": task_id},
            "payload": result,
            "idempotency_key": idempotency_key,
        },
    )
    await push_update(
        task_id,
        {
            "step": "done",
            "status": TaskStatus.AWAITING_APPROVAL.value,
            "progress": 100,
            "requires_human_review": True,
        },
    )



async def _run_legacy_recruiter_workflow(event: dict[str, Any]) -> None:
    """Partner's original flow, preserved verbatim for backwards compatibility."""

    trace_id = event.get("trace_id", str(uuid.uuid4()))
    result = await run_hiring_workflow(event.get("payload", {}), trace_id)
    await set_agent_result(trace_id, result)
    await publish_event(
        AI_RESULTS_TOPIC,
        {
            "event_type": AIEventType.AI_COMPLETED.value,
            "trace_id": trace_id,
            "actor_id": event.get("actor_id", ""),
            "entity": event.get("entity", {}),
            "payload": result,
            "idempotency_key": event.get("idempotency_key", trace_id),
        },
    )
    await push_update(trace_id, result)


async def _handle_event(event: dict[str, Any]) -> None:
    """Dispatch an `ai.requests` event by payload shape."""

    event_type = event.get("event_type", "")
    if event_type != AIEventType.AI_REQUESTED.value:
        logger.debug("Skipping event_type=%s", event_type)
        return

    payload = event.get("payload", {})
    if "task_id" in payload:
        if payload.get("career_coach"):
            await _run_career_coach_workflow(event)
        else:
            await _run_candidate_workflow(event)
    elif "resume_text" in payload:
        await _run_legacy_recruiter_workflow(event)
    else:
        logger.warning("Unrecognized payload shape for event trace_id=%s", event.get("trace_id"))


async def start_consumer() -> None:
    consumer = AIOKafkaConsumer(
        AI_REQUESTS_TOPIC,
        bootstrap_servers=settings.kafka_bootstrap,
        group_id="ai-agent-group",
        auto_offset_reset="earliest",
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )

    await consumer.start()
    logger.info("Kafka consumer started — listening on %s", AI_REQUESTS_TOPIC)

    try:
        async for msg in consumer:
            try:
                await _handle_event(msg.value)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                # Never let a bad event kill the consumer loop.
                logger.exception("Error handling event: %s", e)
    except asyncio.CancelledError:
        logger.info("Consumer cancelled")
    except Exception as e:
        logger.error("Consumer error: %s", str(e))
    finally:
        await consumer.stop()
        logger.info("Kafka consumer stopped")
