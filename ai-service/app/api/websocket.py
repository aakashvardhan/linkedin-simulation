"""WebSocket handler for real-time UI updates.

Two paths are exposed:
- `/ws/{trace_id}` (original partner path)
- `/ai/ws/{task_id}` (candidate-side alias used by the Hiring Assistant)

Both resolve to the same connection registry so publishers only need to
call `push_update(task_id_or_trace_id, data)`.
"""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.db import task_store

logger = logging.getLogger(__name__)

ws_router = APIRouter()

# Maps trace_id/task_id -> active WebSocket connection.
_connections: dict[str, WebSocket] = {}


def get_connections() -> dict[str, WebSocket]:
    return _connections


async def _serve(websocket: WebSocket, key: str) -> None:
    """Shared connection loop for both websocket paths."""

    _connections[key] = websocket
    logger.info("WebSocket connected key=%s", key)
    try:
        while True:
            # Keep connection alive; we don't use client messages yet.
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected key=%s", key)
    finally:
        _connections.pop(key, None)


@ws_router.websocket("/ws/{trace_id}")
async def websocket_endpoint(websocket: WebSocket, trace_id: str) -> None:
    """Partner's original path — unauthenticated, accepts any trace_id."""

    await websocket.accept()
    await _serve(websocket, trace_id)


@ws_router.websocket("/ai/ws/{task_id}")
async def candidate_websocket_endpoint(websocket: WebSocket, task_id: str) -> None:
    """Candidate-side alias (2.9) — rejects unknown task_ids with 1008."""

    task = await task_store.get_task(task_id)
    if task is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        logger.info("Rejected WS connect for unknown task_id=%s", task_id)
        return
    await websocket.accept()
    await _serve(websocket, task_id)


async def push_update(key: str, data: dict) -> None:
    """Send a JSON message to the WS identified by `key` (trace_id or task_id).

    Silently drops if no connection is registered; callers should not block
    on WebSocket availability since clients may not be subscribed yet.
    """

    websocket = _connections.get(key)
    if websocket is None:
        logger.debug("No active WebSocket for key=%s", key)
        return
    try:
        await websocket.send_json(data)
        logger.info("Pushed update to key=%s", key)
    except Exception as e:
        logger.error("Failed to push update key=%s error=%s", key, str(e))
        _connections.pop(key, None)
