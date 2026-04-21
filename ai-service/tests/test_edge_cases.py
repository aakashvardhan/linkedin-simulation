"""Regression tests for edge-case hardening.

Groups:
- Input validation: whitespace-only fields return 400.
- Approval state machine: 409 on wrong status / duplicate.
- Downstream failures: ServiceError translation (502 / 504 / preserved 4xx).
- LLM resilience: invalid JSON from parser surfaces a clear 502.
- Kafka failure in hiring-assistant rolls task to FAILED + 502.
- Consumer malformed payload does not crash; task marked FAILED.
- WS fan-out to multiple subscribers.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest

from app.clients.errors import ServiceError
from app.models.task import AgentTask, TaskStatus


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "body",
    [
        {"member_id": "   ", "resume_text": "ok"},
        {"member_id": "m1", "resume_text": "   "},
        {"member_id": "", "resume_text": "ok"},
    ],
)
def test_parse_resume_rejects_whitespace_only(client, recruiter_headers, body) -> None:
    response = client.post("/ai/parse-resume", json=body, headers=recruiter_headers)
    assert response.status_code == 422  # Pydantic validation error


def test_approve_outreach_rejects_whitespace_final_message(
    client, recruiter_headers, fake_task_store
) -> None:
    task = AgentTask(
        task_id="ws-1",
        trace_id="ws-1",
        recruiter_id="recruiter-1",
        job_id="j1",
        idempotency_key="ws-1",
        status=TaskStatus.AWAITING_APPROVAL,
    )
    fake_task_store.tasks["ws-1"] = task

    response = client.post(
        "/ai/approve-outreach",
        json={
            "task_id": "ws-1",
            "recruiter_id": "recruiter-1",
            "candidate_id": "c1",
            "action": "approved",
            "final_message": "   ",
        },
        headers=recruiter_headers,
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Approval state machine
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "existing_status",
    [TaskStatus.PROCESSING, TaskStatus.COMPLETED, TaskStatus.FAILED],
)
def test_approve_outreach_409_when_not_awaiting(
    client, recruiter_headers, fake_task_store, existing_status
) -> None:
    task = AgentTask(
        task_id="st-1",
        trace_id="st-1",
        recruiter_id="recruiter-1",
        job_id="j1",
        idempotency_key="st-1",
        status=existing_status,
    )
    fake_task_store.tasks["st-1"] = task

    response = client.post(
        "/ai/approve-outreach",
        json={
            "task_id": "st-1",
            "recruiter_id": "recruiter-1",
            "candidate_id": "c1",
            "action": "rejected",
        },
        headers=recruiter_headers,
    )
    assert response.status_code == 409


def test_approve_outreach_409_on_duplicate_candidate_approval(
    client, recruiter_headers, fake_task_store
) -> None:
    task = AgentTask(
        task_id="dup-apv",
        trace_id="dup-apv",
        recruiter_id="recruiter-1",
        job_id="j1",
        idempotency_key="dup-apv",
        status=TaskStatus.AWAITING_APPROVAL,
        approval={"candidate_id": "c1", "action": "rejected"},
    )
    fake_task_store.tasks["dup-apv"] = task

    response = client.post(
        "/ai/approve-outreach",
        json={
            "task_id": "dup-apv",
            "recruiter_id": "recruiter-1",
            "candidate_id": "c1",
            "action": "approved",
            "final_message": "Hi there",
        },
        headers=recruiter_headers,
    )
    assert response.status_code == 409


# ---------------------------------------------------------------------------
# Downstream service failures
# ---------------------------------------------------------------------------


def test_hiring_assistant_returns_404_when_job_not_found(
    monkeypatch, client, recruiter_headers
) -> None:
    async def not_found(job_id: str) -> dict[str, Any]:
        raise ServiceError(status_code=404, service="job", detail="not found")

    from app.api import candidate_routes as cr
    monkeypatch.setattr(cr.job_client, "fetch_job", not_found)

    response = client.post(
        "/ai/hiring-assistant",
        json={"job_id": "missing", "recruiter_id": "r1", "top_k": 3},
        headers=recruiter_headers,
    )
    assert response.status_code == 404


def test_match_candidates_returns_504_on_upstream_timeout(
    monkeypatch, client, recruiter_headers
) -> None:
    async def timeout_job(job_id: str) -> dict[str, Any]:
        raise ServiceError(status_code=504, service="job", detail="Upstream request timed out")

    from app.api import candidate_routes as cr
    monkeypatch.setattr(cr.job_client, "fetch_job", timeout_job)

    response = client.post(
        "/ai/match-candidates",
        json={"job_id": "j1", "top_k": 3},
        headers=recruiter_headers,
    )
    assert response.status_code == 504


def test_wrap_http_errors_translates_timeout_to_service_error(monkeypatch) -> None:
    """Unit-level check: the decorator converts httpx.TimeoutException."""

    from app.clients import job_client

    class _FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url: str) -> httpx.Response:
            raise httpx.ReadTimeout("simulated")

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: _FakeClient())

    with pytest.raises(ServiceError) as excinfo:
        asyncio.run(job_client.fetch_job("j1"))
    assert excinfo.value.status_code == 504


# ---------------------------------------------------------------------------
# LLM resilience
# ---------------------------------------------------------------------------


def test_parse_resume_502_on_invalid_json(monkeypatch, client, recruiter_headers) -> None:
    import json

    async def bad_json(text: str) -> dict[str, Any]:
        raise json.JSONDecodeError("Expecting value", "", 0)

    from app.agents import resume_parser
    monkeypatch.setattr(resume_parser, "parse_resume", bad_json)

    response = client.post(
        "/ai/parse-resume",
        json={"member_id": "m1", "resume_text": "ignored"},
        headers=recruiter_headers,
    )
    assert response.status_code == 502
    assert "invalid JSON" in response.json()["detail"]


def test_parse_resume_502_on_unexpected_shape(
    monkeypatch, client, recruiter_headers
) -> None:
    async def wrong_shape(text: str) -> list:
        return ["not", "a", "dict"]

    from app.agents import resume_parser
    monkeypatch.setattr(resume_parser, "parse_resume", wrong_shape)

    response = client.post(
        "/ai/parse-resume",
        json={"member_id": "m1", "resume_text": "ignored"},
        headers=recruiter_headers,
    )
    assert response.status_code == 502


# ---------------------------------------------------------------------------
# Kafka publish failure rolls task to FAILED
# ---------------------------------------------------------------------------


def test_hiring_assistant_rolls_task_to_failed_on_kafka_error(
    monkeypatch, client, recruiter_headers, fake_task_store
) -> None:
    async def ok_job(job_id: str) -> dict[str, Any]:
        return {"job_id": job_id, "skills_required": []}

    async def kafka_down(topic: str, event: dict[str, Any]) -> None:
        raise RuntimeError("Kafka broker unavailable")

    from app.api import candidate_routes as cr
    monkeypatch.setattr(cr.job_client, "fetch_job", ok_job)
    monkeypatch.setattr(cr, "publish_event", kafka_down)

    response = client.post(
        "/ai/hiring-assistant",
        json={"job_id": "j1", "recruiter_id": "r1", "top_k": 3},
        headers=recruiter_headers,
    )
    assert response.status_code == 502
    # A task record was created and then rolled to FAILED.
    failed_tasks = [t for t in fake_task_store.tasks.values() if t.status == TaskStatus.FAILED]
    assert len(failed_tasks) == 1


# ---------------------------------------------------------------------------
# Consumer malformed payload
# ---------------------------------------------------------------------------


def test_consumer_marks_task_failed_on_missing_job_id(
    monkeypatch, fake_task_store
) -> None:
    from app.kafka.consumer import _run_candidate_workflow

    task = AgentTask(
        task_id="bad-1",
        trace_id="bad-1",
        recruiter_id="recruiter-1",
        job_id=None,
        idempotency_key="bad-1",
        status=TaskStatus.PROCESSING,
    )
    fake_task_store.tasks["bad-1"] = task

    # If the guard is missing, this test crashes with a ServiceError or
    # KeyError from the downstream call instead of returning cleanly.
    async def boom(*args: object, **kwargs: object) -> Any:
        raise AssertionError("downstream services should not be called")

    from app.kafka import consumer as consumer_module
    monkeypatch.setattr(consumer_module.job_client, "fetch_job", boom)
    monkeypatch.setattr(consumer_module.profile_client, "fetch_candidate_pool", boom)

    event = {
        "event_type": "ai.requested",
        "trace_id": "bad-1",
        "actor_id": "recruiter-1",
        "entity": {"entity_type": "ai_task", "entity_id": "bad-1"},
        "payload": {"task_id": "bad-1", "recruiter_id": "recruiter-1"},  # no job_id
        "idempotency_key": "bad-1",
    }
    asyncio.run(_run_candidate_workflow(event))

    assert fake_task_store.tasks["bad-1"].status == TaskStatus.FAILED


# ---------------------------------------------------------------------------
# WebSocket fan-out
# ---------------------------------------------------------------------------


def test_push_update_fans_out_to_multiple_subscribers() -> None:
    """Both subscribers to the same key receive the message."""

    from app.api import websocket as ws_module

    delivered: list[tuple[str, dict]] = []

    class _FakeWS:
        def __init__(self, name: str) -> None:
            self.name = name

        async def send_json(self, data: dict) -> None:
            delivered.append((self.name, data))

    ws_module._connections.clear()
    a, b = _FakeWS("a"), _FakeWS("b")
    ws_module._register("task-fan", a)
    ws_module._register("task-fan", b)

    asyncio.run(ws_module.push_update("task-fan", {"step": "done", "progress": 100}))

    assert sorted(name for name, _ in delivered) == ["a", "b"]

    ws_module._connections.clear()


def test_push_update_prunes_dead_sockets() -> None:
    from app.api import websocket as ws_module

    class _GoodWS:
        async def send_json(self, data: dict) -> None:
            pass

    class _BadWS:
        async def send_json(self, data: dict) -> None:
            raise RuntimeError("connection reset")

    ws_module._connections.clear()
    ws_module._register("task-prune", _GoodWS())
    ws_module._register("task-prune", _BadWS())
    assert len(ws_module._connections["task-prune"]) == 2

    asyncio.run(ws_module.push_update("task-prune", {"x": 1}))

    # Dead socket pruned; good one retained.
    assert len(ws_module._connections["task-prune"]) == 1
    ws_module._connections.clear()
