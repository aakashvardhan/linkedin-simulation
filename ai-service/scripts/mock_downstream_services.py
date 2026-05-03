"""Local stubs for Job (8002) and Profile (8001) services.

The ai-service calls:
  GET {JOB_SERVICE_URL}/jobs/{job_id}
  GET {PROFILE_SERVICE_URL}/members/candidates?job_id=...&limit=...
  GET {PROFILE_SERVICE_URL}/members/{member_id}

Run from `ai-service/` (with deps installed):

  python scripts/mock_downstream_services.py

Then `POST /ai/match-candidates` with job_id `job-1` should return 200.

Set JOB_SERVICE_URL / PROFILE_SERVICE_URL to http://127.0.0.1:8002 and :8001 in
`.env` (not `localhost`) so clients match these IPv4-bound stubs on macOS.

Teardown: Ctrl+C stops both stub servers.
"""

from __future__ import annotations

import multiprocessing
import os
import signal

import uvicorn
from fastapi import FastAPI


def _job_app() -> FastAPI:
    app = FastAPI(title="Mock Job Service")

    @app.get("/jobs/{job_id}")
    async def get_job(job_id: str) -> dict:
        return {
            "job_id": job_id,
            "title": "Software Engineer",
            "description": "Backend APIs and distributed systems.",
            "skills_required": ["python", "sql"],
        }

    return app


def _profile_app() -> FastAPI:
    app = FastAPI(title="Mock Profile Service")

    _members: dict[str, dict] = {
        "member-1": {
            "member_id": "member-1",
            "skills": ["python", "django", "postgresql"],
            "years_experience": 3,
            "current_title": "Software Engineer",
        },
        "member-a": {
            "member_id": "member-a",
            "skills": ["python", "django"],
            "years_experience": 4,
            "current_title": "Backend Engineer",
        },
        "member-b": {
            "member_id": "member-b",
            "skills": ["go", "kubernetes"],
            "years_experience": 6,
            "current_title": "Platform Engineer",
        },
    }

    @app.get("/members/candidates")
    async def candidates(job_id: str, limit: int = 100) -> dict:
        _ = (job_id, limit)
        return {
            "candidates": [
                {
                    "member_id": "member-a",
                    "skills": ["python", "django"],
                    "years_experience": 4,
                    "current_title": "Backend Engineer",
                },
                {
                    "member_id": "member-b",
                    "skills": ["go", "kubernetes"],
                    "years_experience": 6,
                    "current_title": "Platform Engineer",
                },
            ]
        }

    @app.get("/members/{member_id}")
    async def get_member(member_id: str) -> dict:
        if member_id in _members:
            return _members[member_id]
        return {
            "member_id": member_id,
            "skills": ["python"],
            "years_experience": 2,
            "current_title": "Developer",
        }

    return app


def _run_job() -> None:
    uvicorn.run(_job_app(), host="127.0.0.1", port=8002, log_level="info")


def _run_profile() -> None:
    uvicorn.run(_profile_app(), host="127.0.0.1", port=8001, log_level="info")


if __name__ == "__main__":
    children = [
        multiprocessing.Process(target=_run_job),
        multiprocessing.Process(target=_run_profile),
    ]

    def _stop(*_: object) -> None:
        for p in children:
            if p.is_alive():
                p.terminate()
        for p in children:
            p.join(timeout=2)
        os._exit(0)

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    for p in children:
        p.start()
    for p in children:
        p.join()
