"""Client for the Job Service (job postings)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.clients.errors import raise_for_status, wrap_http_errors
from app.config import settings

logger = logging.getLogger(__name__)


@wrap_http_errors(service="job")
async def fetch_job(job_id: str) -> dict[str, Any]:
    """Return the job posting identified by `job_id`.

    Raises `ServiceError` on non-2xx (404 is preserved so route handlers can
    translate it to an HTTP 404 response) and on transport failures.
    """

    url = f"{settings.job_service_url}/jobs/{job_id}"
    async with httpx.AsyncClient(timeout=settings.http_client_timeout) as client:
        response = await client.get(url)
    raise_for_status(response, service="job")
    return response.json()
