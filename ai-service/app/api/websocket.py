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

# Maps trace_id/task_id -> the set of active WebSocket connections.
# Using a set (instead of a single socket) supports multiple simultaneous
# subscribers (e.g. recruiter dashboard + candidate UI both watching the
# same task) and tolerates reconnects without dropping earlier clients.
_connections: dict[str, set[WebSocket]] = {}


def get_connections() -> dict[str, set[WebSocket]]:
    return _connections


def _register(key: str, websocket: WebSocket) -> None:
    _connections.setdefault(key, set()).add(websocket)


def _unregister(key: str, websocket: WebSocket) -> None:
    sockets = _connections.get(key)
    if not sockets:
        return
    sockets.discard(websocket)
    if not sockets:
        _connections.pop(key, None)


async def _serve(websocket: WebSocket, key: str) -> None:
    """Shared connection loop for both websocket paths."""

    _register(key, websocket)
    logger.info("WebSocket connected key=%s subscribers=%d", key, len(_connections[key]))
    try:
        while True:
            # Keep connection alive; we don't use client messages yet.
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected key=%s", key)
    finally:
        _unregister(key, websocket)


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
    """Fan out a JSON message to every WS subscribed under `key`.

    Silently drops if no connection is registered; callers should not block
    on WebSocket availability since clients may not be subscribed yet.
    Dead sockets (send raised) are pruned so a stuck client doesn't leak.
    """

    sockets = _connections.get(key)
    if not sockets:
        logger.debug("No active WebSocket for key=%s", key)
        return
    dead: list[WebSocket] = []
    # Iterate a copy: we mutate `sockets` via _unregister below.
    for websocket in list(sockets):
        try:
            await websocket.send_json(data)
        except Exception as e:
            logger.error("Failed to push update key=%s error=%s", key, str(e))
            dead.append(websocket)
    for websocket in dead:
        _unregister(key, websocket)
    if sockets:
        logger.info("Pushed update to key=%s subscribers=%d", key, len(sockets) - len(dead))
