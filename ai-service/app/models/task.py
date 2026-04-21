"""Domain models for the agentic hiring workflow.

These models describe the shape of documents persisted in the MongoDB
`ai_tasks` collection and the payloads exchanged over Kafka/WebSocket.
"""

from __future__ import annotations

import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


class TaskStatus(str, Enum):
    """Lifecycle states for an AgentTask.

    Using a string Enum keeps serialization simple (Mongo + JSON).
    """

    QUEUED = "queued"
    PROCESSING = "processing"
    AWAITING_APPROVAL = "awaiting_approval"
    COMPLETED = "completed"
    FAILED = "failed"


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class StepName(str, Enum):
    """Canonical step identifiers used across the multi-step pipeline."""

    RESUME_PARSE = "resume_parse"
    MATCH_CANDIDATES = "match_candidates"
    OUTREACH_DRAFT = "outreach_draft"
    AWAIT_APPROVAL = "await_approval"


class ApprovalAction(str, Enum):
    APPROVED = "approved"
    EDITED = "edited"
    REJECTED = "rejected"


class StepResult(BaseModel):
    """Single step execution record stored inside an AgentTask."""

    step: StepName
    status: StepStatus
    data: dict[str, Any] | None = None
    error: str | None = None
    started_at: datetime.datetime = Field(default_factory=_utcnow)
    finished_at: datetime.datetime | None = None


class AgentTask(BaseModel):
    """The authoritative task document persisted in `ai_tasks`.

    `task_id` and `trace_id` are equivalent external identifiers:
    - `task_id` is returned to API callers and used as the Mongo `_id`.
    - `trace_id` is propagated through Kafka events for cross-service tracing.
    They are intentionally identical on creation but modeled separately so
    future fan-out (multiple tasks per trace) remains possible.
    """

    task_id: str
    trace_id: str
    recruiter_id: str
    job_id: str | None = None
    top_k: int = 5
    generate_outreach: bool = False
    idempotency_key: str
    status: TaskStatus = TaskStatus.QUEUED
    steps: list[StepResult] = Field(default_factory=list)
    result: dict[str, Any] | None = None
    approval: dict[str, Any] | None = None
    created_at: datetime.datetime = Field(default_factory=_utcnow)
    updated_at: datetime.datetime = Field(default_factory=_utcnow)

    @property
    def steps_completed(self) -> int:
        return sum(1 for s in self.steps if s.status == StepStatus.COMPLETED)

    @property
    def progress_percent(self) -> int:
        """Coarse-grained progress derived from completed steps.

        Uses a fixed 3-step baseline (parse, match, outreach). When
        `generate_outreach` is False the third step is skipped, so a
        completed task still reaches 100%.
        """

        total_steps = 3 if self.generate_outreach else 2
        if total_steps == 0:
            return 0
        return min(100, int(round(100 * self.steps_completed / total_steps)))
