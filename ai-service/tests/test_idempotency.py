"""Verify the Kafka consumer short-circuits duplicate events."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.kafka.consumer import _run_candidate_workflow
from app.models.task import AgentTask, TaskStatus


def _make_event(task_id: str) -> dict[str, Any]:
    return {
        "event_type": "ai.requested",
        "trace_id": task_id,
        "actor_id": "recruiter-1",
        "entity": {"entity_type": "ai_task", "entity_id": task_id},
        "payload": {
            "task_id": task_id,
            "job_id": "j1",
            "recruiter_id": "recruiter-1",
            "top_k": 3,
            "generate_outreach": False,
        },
        "idempotency_key": task_id,
    }


def test_duplicate_event_is_skipped(monkeypatch, fake_task_store) -> None:
    """A second delivery with the same idempotency_key must not re-run the pipeline."""

    # Seed a completed task so the consumer sees it as already processed.
    completed = AgentTask(
        task_id="dup-1",
        trace_id="dup-1",
        recruiter_id="recruiter-1",
        job_id="j1",
        idempotency_key="dup-1",
        status=TaskStatus.COMPLETED,
    )
    fake_task_store.tasks["dup-1"] = completed

    # Track whether the Job/Profile clients get called.
    calls = {"job": 0, "pool": 0}

    async def boom_job(job_id: str) -> dict[str, Any]:
        calls["job"] += 1
        return {"job_id": job_id, "skills_required": ["python"]}

    async def boom_pool(job_id: str, limit: int = 100) -> list[dict[str, Any]]:
        calls["pool"] += 1
        return []

    from app.clients import job_client, profile_client
    monkeypatch.setattr(job_client, "fetch_job", boom_job)
    monkeypatch.setattr(profile_client, "fetch_candidate_pool", boom_pool)
    # Consumer imports module-level names, so also patch the consumer's view.
    from app.kafka import consumer as consumer_module
    monkeypatch.setattr(consumer_module.job_client, "fetch_job", boom_job)
    monkeypatch.setattr(consumer_module.profile_client, "fetch_candidate_pool", boom_pool)

    asyncio.run(_run_candidate_workflow(_make_event("dup-1")))

    # Neither downstream service should have been contacted.
    assert calls == {"job": 0, "pool": 0}
    # Status unchanged.
    assert fake_task_store.tasks["dup-1"].status == TaskStatus.COMPLETED
