"""Shared error types for downstream HTTP clients.

Clients raise `ServiceError` rather than returning ad-hoc dicts so route
handlers can translate upstream failures into the correct HTTP status via
`translate_service_error` below.
"""

from __future__ import annotations

import httpx
from fastapi import HTTPException


class ServiceError(Exception):
    """Represents a non-2xx response from a downstream service."""

    def __init__(self, status_code: int, service: str, detail: str) -> None:
        super().__init__(f"{service} service returned {status_code}: {detail}")
        self.status_code = status_code
        self.service = service
        self.detail = detail


def raise_for_status(response: httpx.Response, *, service: str) -> None:
    """Raise `ServiceError` if the response is non-2xx."""

    if response.is_success:
        return
    try:
        detail = response.json().get("detail", response.text)
    except ValueError:
        detail = response.text
    raise ServiceError(
        status_code=response.status_code,
        service=service,
        detail=str(detail),
    )


def translate_service_error(exc: ServiceError) -> HTTPException:
    """Map a ServiceError to an HTTPException suitable for FastAPI.

    Client errors (4xx) are preserved so the caller sees the upstream
    status. Server errors (5xx) and transport failures are collapsed to
    502 Bad Gateway to hide implementation details.
    """

    if 400 <= exc.status_code < 500:
        return HTTPException(
            status_code=exc.status_code,
            detail=f"{exc.service}: {exc.detail}",
        )
    return HTTPException(
        status_code=502,
        detail=f"{exc.service} service unavailable",
    )
