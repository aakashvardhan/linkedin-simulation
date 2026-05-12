# WebSocket handler for real-time UI updates

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

ws_router = APIRouter()

# Maps trace_id -> active WebSocket connection
_connections: dict[str, WebSocket] = {}


def get_connections() -> dict[str, WebSocket]:
    return _connections


@ws_router.websocket("/ws/{trace_id}")
async def websocket_endpoint(websocket: WebSocket, trace_id: str) -> None:
    await websocket.accept()
    _connections[trace_id] = websocket
    logger.info("WebSocket connected trace_id=%s", trace_id)

    try:
        while True:
            # Keep connection alive, wait for client messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected trace_id=%s", trace_id)
    finally:
        _connections.pop(trace_id, None)


async def push_update(trace_id: str, data: dict) -> None:
    websocket = _connections.get(trace_id)
    if websocket is None:
        logger.debug("No active WebSocket for trace_id=%s", trace_id)
        return
    try:
        await websocket.send_json(data)
        logger.info("Pushed update to trace_id=%s", trace_id)
    except Exception as e:
        logger.error("Failed to push update trace_id=%s error=%s", trace_id, str(e))
        _connections.pop(trace_id, None)
