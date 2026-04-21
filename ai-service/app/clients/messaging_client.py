"""Client for the Messaging Service (outreach delivery)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.clients.errors import raise_for_status, wrap_http_errors
from app.config import settings

logger = logging.getLogger(__name__)


@wrap_http_errors(service="messaging")
async def send_message(
    sender_id: str,
    recipient_id: str,
    body: str,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Deliver a message via the Messaging Service.

    The AI service never stores message content long-term; it only forwards
    to the Messaging Service and records the delivery ID locally.
    """

    payload = {
        "sender_id": sender_id,
        "recipient_id": recipient_id,
        "body": body,
        "context": context or {},
    }
    url = f"{settings.messaging_service_url}/messages/send"
    async with httpx.AsyncClient(timeout=settings.http_client_timeout) as client:
        response = await client.post(url, json=payload)
    raise_for_status(response, service="messaging")
    return response.json()
