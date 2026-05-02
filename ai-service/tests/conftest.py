"""Shared pytest fixtures for the AI service.

These fixtures replace external dependencies (Mongo, Kafka, Groq, downstream
HTTP services) with in-memory or no-op test doubles. They are autouse so
individual tests do not need to opt in.
"""

from __future__ import annotations

import datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db import task_store as real_task_store
from app.kafka import producer as real_producer
from app.main import app
from app.models.task import AgentTask, StepResult, StepStatus, TaskStatus


# ---------------------------------------------------------------------------
# In-memory task store replacement
# ---------------------------------------------------------------------------


class _InMemoryStore:
    """Minimal async stand-in for `app.db.task_store`."""

    def __init__(self) -> None:
        self.tasks: dict[str, AgentTask] = {}

    async def create_task(self, task: AgentTask) -> AgentTask:
        self.tasks[task.task_id] = task
        return task

    async def get_task(self, task_id: str) -> AgentTask | None:
        return self.tasks.get(task_id)

    async def get_task_by_idempotency_key(self, key: str) -> AgentTask | None:
        for task in self.tasks.values():
            if task.idempotency_key == key:
                return task
        return None

    async def update_status(self, task_id: str, status: TaskStatus) -> AgentTask | None:
        task = self.tasks.get(task_id)
        if task is None:
            return None
        updated = task.model_copy(update={"status": status})
        self.tasks[task_id] = updated
        return updated

    async def append_step(self, task_id: str, step: StepResult) -> AgentTask | None:
        task = self.tasks.get(task_id)
        if task is None:
            return None
        updated = task.model_copy(update={"steps": [*task.steps, step]})
        self.tasks[task_id] = updated
        return updated

    async def set_result(
        self,
        task_id: str,
        result: dict[str, Any],
        status: TaskStatus,
    ) -> AgentTask | None:
        task = self.tasks.get(task_id)
        if task is None:
            return None
        updated = task.model_copy(update={"result": result, "status": status})
        self.tasks[task_id] = updated
        return updated

    async def record_approval(self, task_id: str, approval: dict[str, Any]) -> AgentTask | None:
        task = self.tasks.get(task_id)
        if task is None:
            return None
        updated = task.model_copy(
            update={"approval": approval, "status": TaskStatus.COMPLETED}
        )
        self.tasks[task_id] = updated
        return updated

    async def mark_step_failed(
        self,
        task_id: str,
        step: StepResult,
        error: str,
    ) -> AgentTask | None:
        failed = step.model_copy(
            update={
                "status": StepStatus.FAILED,
                "error": error,
                "finished_at": datetime.datetime.now(datetime.timezone.utc),
            }
        )
        task = self.tasks.get(task_id)
        if task is None:
            return None
        updated = task.model_copy(
            update={
                "steps": [*task.steps, failed],
                "status": TaskStatus.FAILED,
            }
        )
        self.tasks[task_id] = updated
        return updated


@pytest.fixture(autouse=True)
def fake_task_store(monkeypatch: pytest.MonkeyPatch) -> _InMemoryStore:
    store = _InMemoryStore()
    for name in (
        "create_task",
        "get_task",
        "get_task_by_idempotency_key",
        "update_status",
        "append_step",
        "set_result",
        "record_approval",
        "mark_step_failed",
    ):
        monkeypatch.setattr(real_task_store, name, getattr(store, name))
    return store


# ---------------------------------------------------------------------------
# Kafka producer stub
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def captured_events(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, dict[str, Any]]]:
    """Capture `publish_event` calls instead of hitting Kafka."""

    captured: list[tuple[str, dict[str, Any]]] = []

    async def _capture(topic: str, event: dict[str, Any]) -> None:
        captured.append((topic, event))

    monkeypatch.setattr(real_producer, "publish_event", _capture)
    # The candidate_routes module imports `publish_event` by name; patch there too.
    from app.api import candidate_routes as cr
    monkeypatch.setattr(cr, "publish_event", _capture)
    return captured


# ---------------------------------------------------------------------------
# FastAPI client + auth headers
# ---------------------------------------------------------------------------


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def recruiter_headers() -> dict[str, str]:
    return {
        "Authorization": "Bearer test-token",
        "X-User-Id": "recruiter-1",
        "X-User-Role": "recruiter",
    }


@pytest.fixture
def member_headers() -> dict[str, str]:
    return {
        "Authorization": "Bearer test-token",
        "X-User-Id": "member-1",
        "X-User-Role": "member",
    }
