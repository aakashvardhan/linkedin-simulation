"""Client for the Profile Service (member profiles, candidate pool)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.clients.errors import ServiceError, raise_for_status, wrap_http_errors
from app.config import settings

logger = logging.getLogger(__name__)


@wrap_http_errors(service="profile")
async def fetch_member(member_id: str) -> dict[str, Any]:
    """Return the profile document for a single member.

    Raises `ServiceError` with the upstream status code on non-2xx responses.
    """

    url = f"{settings.profile_service_url}/members/{member_id}"
    async with httpx.AsyncClient(timeout=settings.http_client_timeout) as client:
        response = await client.get(url)
    raise_for_status(response, service="profile")
    return response.json()


@wrap_http_errors(service="profile")
async def fetch_candidate_pool(
    job_id: str,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Return the current candidate pool for a job.

    The Profile service owns the definition of "pool" (e.g. open-to-work
    members in the job's region). We pass `job_id` so it can filter.
    """

    url = f"{settings.profile_service_url}/members/candidates"
    params = {"job_id": job_id, "limit": limit}
    async with httpx.AsyncClient(timeout=settings.http_client_timeout) as client:
        response = await client.get(url, params=params)
    raise_for_status(response, service="profile")
    body = response.json()
    candidates = body.get("candidates") if isinstance(body, dict) else body
    if not isinstance(candidates, list):
        raise ServiceError(
            status_code=502,
            service="profile",
            detail="Expected list of candidates in response",
        )
    return candidates
