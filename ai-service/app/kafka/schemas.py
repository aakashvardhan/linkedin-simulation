"""Canonical Kafka event envelope for topics `ai.requests` and `ai.results`.

This module exists as the shared schema surface for both the candidate and
recruiter sides. It re-exports `KafkaEnvelope` from `app.models.events` to
keep a single source of truth and adds typed event-type constants.
"""

from __future__ import annotations

from enum import Enum

from app.models.events import KafkaEnvelope

__all__ = ["KafkaEnvelope", "AIEventType", "AIEntityType", "AI_REQUESTS_TOPIC", "AI_RESULTS_TOPIC"]

AI_REQUESTS_TOPIC = "ai.requests"
AI_RESULTS_TOPIC = "ai.results"


class AIEventType(str, Enum):
    """Enumerated event_type values recognized by the AI service."""

    AI_REQUESTED = "ai.requested"
    AI_COMPLETED = "ai.completed"
    AI_FAILED = "ai.failed"
    AI_APPROVAL_RECORDED = "ai.approval.recorded"


class AIEntityType(str, Enum):
    AI_TASK = "ai_task"
