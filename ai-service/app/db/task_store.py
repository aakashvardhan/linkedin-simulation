"""Persistence layer for AgentTask documents.

Encapsulates all reads and writes to the `ai_tasks` collection so route
handlers and the Kafka consumer never touch Motor directly. This also gives
us a single place to enforce idempotency semantics.
"""

from __future__ import annotations

import datetime
import logging
from typing import Any

from pymongo import ReturnDocument

from app.db.mongo import get_ai_tasks_collection
from app.models.task import AgentTask, StepResult, StepStatus, TaskStatus

logger = logging.getLogger(__name__)


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _to_document(task: AgentTask) -> dict[str, Any]:
    """Serialize an AgentTask to a Mongo document keyed by task_id."""

    doc = task.model_dump(mode="json")
    doc["_id"] = task.task_id
    return doc


def _from_document(doc: dict[str, Any] | None) -> AgentTask | None:
    if doc is None:
        return None
    doc = dict(doc)
    doc.pop("_id", None)
    return AgentTask.model_validate(doc)


async def create_task(task: AgentTask) -> AgentTask:
    """Insert a new AgentTask. Raises if the task_id already exists."""

    await get_ai_tasks_collection().insert_one(_to_document(task))
    logger.info("Task created task_id=%s trace_id=%s", task.task_id, task.trace_id)
    return task


async def get_task(task_id: str) -> AgentTask | None:
    doc = await get_ai_tasks_collection().find_one({"_id": task_id})
    return _from_document(doc)


async def get_task_by_idempotency_key(idempotency_key: str) -> AgentTask | None:
    """Look up an existing task by its idempotency key.

    Used by the Kafka consumer to short-circuit duplicate deliveries.
    """

    doc = await get_ai_tasks_collection().find_one(
        {"idempotency_key": idempotency_key}
    )
    return _from_document(doc)


async def update_status(task_id: str, status: TaskStatus) -> AgentTask | None:
    doc = await get_ai_tasks_collection().find_one_and_update(
        {"_id": task_id},
        {"$set": {"status": status.value, "updated_at": _now().isoformat()}},
        return_document=ReturnDocument.AFTER,
    )
    return _from_document(doc)


async def append_step(task_id: str, step: StepResult) -> AgentTask | None:
    """Append a completed step and bump updated_at atomically."""

    doc = await get_ai_tasks_collection().find_one_and_update(
        {"_id": task_id},
        {
            "$push": {"steps": step.model_dump(mode="json")},
            "$set": {"updated_at": _now().isoformat()},
        },
        return_document=ReturnDocument.AFTER,
    )
    return _from_document(doc)


async def set_result(
    task_id: str,
    result: dict[str, Any],
    status: TaskStatus,
) -> AgentTask | None:
    doc = await get_ai_tasks_collection().find_one_and_update(
        {"_id": task_id},
        {
            "$set": {
                "result": result,
                "status": status.value,
                "updated_at": _now().isoformat(),
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return _from_document(doc)


async def record_approval(
    task_id: str,
    approval: dict[str, Any],
) -> AgentTask | None:
    doc = await get_ai_tasks_collection().find_one_and_update(
        {"_id": task_id},
        {
            "$set": {
                "approval": approval,
                "status": TaskStatus.COMPLETED.value,
                "updated_at": _now().isoformat(),
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return _from_document(doc)


async def revert_approval_to_awaiting(task_id: str) -> AgentTask | None:
    """Undo `record_approval` when downstream publish fails (Mongo + Kafka consistency)."""

    doc = await get_ai_tasks_collection().find_one_and_update(
        {"_id": task_id},
        {
            "$set": {
                "status": TaskStatus.AWAITING_APPROVAL.value,
                "updated_at": _now().isoformat(),
            },
            "$unset": {"approval": ""},
        },
        return_document=ReturnDocument.AFTER,
    )
    return _from_document(doc)


async def mark_step_failed(
    task_id: str,
    step: StepResult,
    error: str,
) -> AgentTask | None:
    """Append a failed step and set the overall task status to failed."""

    failed_step = step.model_copy(
        update={"status": StepStatus.FAILED, "error": error, "finished_at": _now()}
    )
    doc = await get_ai_tasks_collection().find_one_and_update(
        {"_id": task_id},
        {
            "$push": {"steps": failed_step.model_dump(mode="json")},
            "$set": {
                "status": TaskStatus.FAILED.value,
                "updated_at": _now().isoformat(),
            },
        },
        return_document=ReturnDocument.AFTER,
    )
    return _from_document(doc)
