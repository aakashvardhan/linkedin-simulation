"""Shared error types for downstream HTTP clients.

Clients raise `ServiceError` rather than returning ad-hoc dicts so route
handlers can translate upstream failures into the correct HTTP status via
`translate_service_error` below.
"""

from __future__ import annotations

import functools
import logging
from typing import Awaitable, Callable, TypeVar

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

T = TypeVar("T")


class ServiceError(Exception):
    """Represents a failed call to a downstream service.

    Covers both non-2xx HTTP responses and transport failures (timeout,
    connection refused, DNS failure, unreadable JSON body). Route handlers
    use `translate_service_error` to map these to FastAPI HTTPExceptions.
    """

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


def wrap_http_errors(service: str) -> Callable[[Callable[..., Awaitable[T]]], Callable[..., Awaitable[T]]]:
    """Decorator that converts transport failures into `ServiceError(502)`.

    HTTP-status errors are surfaced by `raise_for_status` and propagate
    unchanged. Everything else httpx can raise at the transport layer
    (timeouts, connection errors, malformed bodies) is normalized so route
    handlers never have to reason about raw httpx exception types.
    """

    def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        @functools.wraps(func)
        async def wrapper(*args: object, **kwargs: object) -> T:
            try:
                return await func(*args, **kwargs)
            except ServiceError:
                raise
            except httpx.TimeoutException as exc:
                logger.warning("%s service timeout: %s", service, exc)
                raise ServiceError(
                    status_code=504,
                    service=service,
                    detail="Upstream request timed out",
                ) from exc
            except httpx.HTTPError as exc:
                logger.warning("%s service HTTP error: %s", service, exc)
                raise ServiceError(
                    status_code=502,
                    service=service,
                    detail="Upstream transport error",
                ) from exc
            except ValueError as exc:
                # `response.json()` raises ValueError on malformed bodies.
                logger.warning("%s service malformed response: %s", service, exc)
                raise ServiceError(
                    status_code=502,
                    service=service,
                    detail="Upstream returned malformed JSON",
                ) from exc

        return wrapper

    return decorator


def translate_service_error(exc: ServiceError) -> HTTPException:
    """Map a ServiceError to an HTTPException suitable for FastAPI.

    - 4xx from upstream is preserved so the caller sees the real status
      (e.g. 404 Not Found, 403 Forbidden).
    - 504 (our synthetic timeout code) is preserved so clients can back off.
    - Other 5xx / transport failures collapse to 502 Bad Gateway to hide
      implementation details of the downstream service.
    """

    if 400 <= exc.status_code < 500:
        return HTTPException(
            status_code=exc.status_code,
            detail=f"{exc.service}: {exc.detail}",
        )
    if exc.status_code == 504:
        return HTTPException(
            status_code=504,
            detail=f"{exc.service} service timed out",
        )
    return HTTPException(
        status_code=502,
        detail=f"{exc.service} service unavailable",
    )
