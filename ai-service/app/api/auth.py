"""Request authentication dependencies.

.. warning::
    This is a STUB. The Bearer token is required but not cryptographically
    validated. `subject_id` and `role` are read from `X-User-Id` /
    `X-User-Role` headers set by the gateway.

    See PLAN.md > "Replacement Notes" > R1 for the replacement trigger
    (before any shared-environment deploy) and the required work
    (JWT/JWKS validation, drop `X-User-*` headers).

The public surface (`Principal`, `get_principal`, `require_recruiter`) is
stable; swapping the internals for real validation will not require
changes to any route handler.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status


@dataclass(frozen=True)
class Principal:
    """Minimal claims representation for the authenticated caller."""

    subject_id: str
    role: str  # e.g. "recruiter", "member"


def _extract_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Empty bearer token",
        )
    return token


def get_principal(
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Principal:
    """Return the caller's principal.

    STUB: token presence is checked, but not cryptographically verified.
    Replace with JWT/JWKS validation before production (see module docstring).
    """

    _extract_bearer(authorization)
    if not x_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-User-Id header",
        )
    return Principal(subject_id=x_user_id, role=(x_user_role or "member").lower())


def require_recruiter(principal: Principal = Depends(get_principal)) -> Principal:
    """Authorize recruiter-only endpoints (returns 403 for non-recruiters)."""

    if principal.role != "recruiter":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Recruiter role required",
        )
    return principal
