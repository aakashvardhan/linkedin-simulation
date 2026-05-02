"""End-to-end tests for `/ai/*` routes using FastAPI's TestClient.

External dependencies are replaced by the autouse fixtures in conftest.py.
LLM and HTTP client modules are patched per-test as needed.
"""

from __future__ import annotations

from typing import Any

import pytest


# ---------------------------------------------------------------------------
# Auth / 401 / 403
# ---------------------------------------------------------------------------


def test_parse_resume_requires_auth(client) -> None:
    response = client.post("/ai/parse-resume", json={"member_id": "m1", "resume_text": "x"})
    assert response.status_code == 401


def test_match_candidates_rejects_non_recruiter(client, member_headers) -> None:
    response = client.post(
        "/ai/match-candidates",
        json={"job_id": "j1", "top_k": 3},
        headers=member_headers,
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# 2.2 parse-resume
# ---------------------------------------------------------------------------


def test_parse_resume_happy_path(monkeypatch, client, recruiter_headers) -> None:
    async def fake_parse(text: str) -> dict[str, Any]:
        return {
            "skills": ["python", "sql"],
            "years_experience": 3,
            "education": [{"degree": "BS", "institution": "SJSU", "year": 2022}],
            "current_title": "Data Engineer",
        }

    from app.agents import resume_parser
    monkeypatch.setattr(resume_parser, "parse_resume", fake_parse)

    response = client.post(
        "/ai/parse-resume",
        json={"member_id": "m1", "resume_text": "irrelevant"},
        headers=recruiter_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["member_id"] == "m1"
    assert body["parsed"]["skills"] == ["python", "sql"]
    # All four expected fields present -> confidence 1.0
    assert body["confidence_score"] == 1.0


def test_parse_resume_requires_text(client, recruiter_headers) -> None:
    response = client.post(
        "/ai/parse-resume",
        json={"member_id": "m1"},
        headers=recruiter_headers,
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# 2.5 hiring-assistant + 2.7 task status
# ---------------------------------------------------------------------------


def test_hiring_assistant_creates_task_and_publishes_event(
    monkeypatch, client, recruiter_headers, captured_events, fake_task_store
) -> None:
    from app.clients import job_client

    async def fake_job(job_id: str) -> dict[str, Any]:
        return {"job_id": job_id, "skills_required": ["python"]}

    monkeypatch.setattr(job_client, "fetch_job", fake_job)
    from app.api import candidate_routes as cr
    monkeypatch.setattr(cr.job_client, "fetch_job", fake_job)

    response = client.post(
        "/ai/hiring-assistant",
        json={"job_id": "j1", "recruiter_id": "r1", "top_k": 3, "generate_outreach": False},
        headers=recruiter_headers,
    )
    assert response.status_code == 202
    body = response.json()
    assert body["task_id"]
    assert body["websocket_url"] == f"/ai/ws/{body['task_id']}"
    # Task persisted
    assert body["task_id"] in fake_task_store.tasks
    # Event published to ai.requests
    assert any(topic == "ai.requests" for topic, _ in captured_events)


def test_task_status_404_for_unknown(client, recruiter_headers) -> None:
    response = client.get("/ai/task/does-not-exist", headers=recruiter_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# 2.8 approve-outreach
# ---------------------------------------------------------------------------


def test_approve_outreach_404_for_unknown_task(client, recruiter_headers) -> None:
    response = client.post(
        "/ai/approve-outreach",
        json={
            "task_id": "missing",
            "recruiter_id": "recruiter-1",
            "candidate_id": "c1",
            "action": "rejected",
        },
        headers=recruiter_headers,
    )
    assert response.status_code == 404


def test_approve_outreach_rejects_wrong_recruiter(
    client, recruiter_headers, fake_task_store
) -> None:
    from app.models.task import AgentTask, TaskStatus

    task = AgentTask(
        task_id="t1",
        trace_id="t1",
        recruiter_id="other-recruiter",
        job_id="j1",
        idempotency_key="t1",
        status=TaskStatus.AWAITING_APPROVAL,
    )
    fake_task_store.tasks["t1"] = task

    response = client.post(
        "/ai/approve-outreach",
        json={
            "task_id": "t1",
            "recruiter_id": "recruiter-1",
            "candidate_id": "c1",
            "action": "rejected",
        },
        headers=recruiter_headers,
    )
    assert response.status_code == 403


def test_approve_outreach_requires_final_message_on_approved(
    client, recruiter_headers, fake_task_store
) -> None:
    from app.models.task import AgentTask, TaskStatus

    task = AgentTask(
        task_id="t2",
        trace_id="t2",
        recruiter_id="recruiter-1",
        job_id="j1",
        idempotency_key="t2",
        status=TaskStatus.AWAITING_APPROVAL,
    )
    fake_task_store.tasks["t2"] = task

    response = client.post(
        "/ai/approve-outreach",
        json={
            "task_id": "t2",
            "recruiter_id": "recruiter-1",
            "candidate_id": "c1",
            "action": "approved",
        },
        headers=recruiter_headers,
    )
    assert response.status_code == 400


def test_approve_outreach_rejected_path_does_not_call_messaging(
    monkeypatch, client, recruiter_headers, fake_task_store, captured_events
) -> None:
    from app.clients import messaging_client
    from app.models.task import AgentTask, TaskStatus

    called = {"count": 0}

    async def fake_send(**kwargs: Any) -> dict[str, Any]:
        called["count"] += 1
        return {}

    monkeypatch.setattr(messaging_client, "send_message", fake_send)
    from app.api import candidate_routes as cr
    monkeypatch.setattr(cr.messaging_client, "send_message", fake_send)

    task = AgentTask(
        task_id="t3",
        trace_id="t3",
        recruiter_id="recruiter-1",
        job_id="j1",
        idempotency_key="t3",
        status=TaskStatus.AWAITING_APPROVAL,
    )
    fake_task_store.tasks["t3"] = task

    response = client.post(
        "/ai/approve-outreach",
        json={
            "task_id": "t3",
            "recruiter_id": "recruiter-1",
            "candidate_id": "c1",
            "action": "rejected",
        },
        headers=recruiter_headers,
    )
    assert response.status_code == 200
    assert called["count"] == 0
    assert any(topic == "ai.results" for topic, _ in captured_events)

# ---------------------------------------------------------------------------
# Career Coach async + HITL
# ---------------------------------------------------------------------------


def test_career_coach_kickoff_requires_member_role(client, recruiter_headers, captured_events):
    response = client.post(
        "/ai/career-coach/kickoff",
        json={"member_id": "m1", "target_job_id": "j1"},
        headers=recruiter_headers,
    )
    assert response.status_code == 403


def test_career_coach_kickoff_creates_task_and_publishes(
    monkeypatch, client, member_headers, captured_events, fake_task_store
):
    from app.clients import job_client

    async def fake_job(job_id: str):
        return {"job_id": job_id, "title": "Engineer"}

    monkeypatch.setattr(job_client, "fetch_job", fake_job)
    from app.api import candidate_routes as cr
    monkeypatch.setattr(cr.job_client, "fetch_job", fake_job)

    response = client.post(
        "/ai/career-coach/kickoff",
        json={"member_id": "member-1", "target_job_id": "j1"},
        headers=member_headers,
    )
    assert response.status_code == 202
    body = response.json()
    assert body["task_id"]
    assert body["websocket_url"] == f"/ai/ws/{body['task_id']}"
    assert body["task_id"] in fake_task_store.tasks
    assert any(topic == "ai.requests" for topic, _ in captured_events)


def test_career_coach_approve_rejects_wrong_member(
    client, member_headers, fake_task_store
):
    from app.models.task import AgentTask, TaskStatus

    task = AgentTask(
        task_id="cc1",
        trace_id="cc1",
        member_id="other-member",
        task_kind="member",
        job_id="j1",
        idempotency_key="cc1",
        status=TaskStatus.AWAITING_APPROVAL,
        result={"gap": {}, "suggestions": {}},
    )
    fake_task_store.tasks["cc1"] = task

    response = client.post(
        "/ai/career-coach/approve",
        json={
            "task_id": "cc1",
            "member_id": "other-member",
            "action": "rejected",
        },
        headers=member_headers,
    )
    assert response.status_code == 403


def test_career_coach_approve_happy_path_reject(
    client, member_headers, fake_task_store, captured_events
):
    from app.models.task import AgentTask, TaskStatus

    task = AgentTask(
        task_id="cc2",
        trace_id="cc2",
        member_id="member-1",
        task_kind="member",
        job_id="j1",
        idempotency_key="cc2",
        status=TaskStatus.AWAITING_APPROVAL,
        result={"gap": {}, "suggestions": {}},
    )
    fake_task_store.tasks["cc2"] = task

    response = client.post(
        "/ai/career-coach/approve",
        json={
            "task_id": "cc2",
            "member_id": "member-1",
            "action": "rejected",
        },
        headers=member_headers,
    )
    assert response.status_code == 200
    assert any(topic == "ai.results" for topic, _ in captured_events)

