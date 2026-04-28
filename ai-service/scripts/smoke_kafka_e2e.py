"""End-to-end smoke test for the AI Agent Service Kafka workflow.

Verifies that a POST /agent/request:
  1. Is accepted by the FastAPI service (returns 202/200 with a trace_id).
  2. Is published to the `ai.requests` Kafka topic (implicit — we never
     see the request event directly; its effect is the consumer running).
  3. Is consumed by the supervisor, which runs:
       - Resume parser (LLM)
       - Job matcher (embeddings)
       - Outreach drafter (LLM)
  4. Produces an `ai.completed` envelope on `ai.results` whose
     `trace_id` matches the original request.
  5. Makes the final result retrievable via GET /agent/result/{trace_id}.

This script does NOT mock anything. It requires the full docker-compose
stack (Kafka, Mongo, Redis, ai-service) to be running and a valid
`LLM_API_KEY` configured in the service's `.env` so the LLM calls
succeed (default provider: Google Gemini).

Usage:
    python scripts/smoke_kafka_e2e.py
    python scripts/smoke_kafka_e2e.py --base-url http://localhost:8000 \
        --bootstrap localhost:9093 --timeout 90

Exit codes:
    0 — all assertions passed
    1 — any assertion failed or the workflow timed out
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import uuid
from typing import Any

import httpx
from aiokafka import AIOKafkaConsumer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("smoke_kafka_e2e")

AI_RESULTS_TOPIC = "ai.results"
EXPECTED_STEPS = {"resume_parsed", "match_scored", "outreach_drafted"}

# Uvicorn binds the port before the FastAPI startup handler finishes, which
# means /health can respond with ReadError / 502 while the sentence-transformers
# model is still loading. Poll with a generous budget instead of hitting it once.
DEFAULT_HEALTH_TIMEOUT_S = 60.0
HEALTH_POLL_INTERVAL_S = 1.0


# ---------------------------------------------------------------------------
# Fixture data — a realistic-but-minimal job + resume
# ---------------------------------------------------------------------------

SAMPLE_JOB: dict[str, Any] = {
    "job_id": "job-smoke-001",
    "title": "Senior Python Backend Engineer",
    "description": (
        "Build distributed services on AWS. Own Kafka pipelines, design "
        "Postgres/MongoDB schemas, and collaborate with an ML team."
    ),
    "seniority_level": "senior",
    "location": "San Jose, CA",
    "skills_required": ["Python", "Kafka", "FastAPI", "AWS", "PostgreSQL"],
}

SAMPLE_RESUME = """
Jane Doe — Senior Software Engineer
Email: jane.doe@example.com | San Francisco, CA

Summary
Backend engineer with 7 years of experience building distributed systems
in Python. Led the migration of a monolith to microservices backed by
Kafka and PostgreSQL at a fintech startup.

Experience
- Acme Corp (2021–present): Senior Engineer. Designed async event
  pipelines in FastAPI + Kafka. Deployed services on AWS EKS.
- Beta Inc (2018–2021): Backend Engineer. Built RESTful APIs in Django,
  owned schema design for a 10M-row Postgres database.

Skills
Python, FastAPI, Kafka, PostgreSQL, MongoDB, AWS, Docker, Kubernetes

Education
B.S. Computer Science, UC Berkeley, 2017.
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class SmokeTestError(AssertionError):
    """Raised when any end-to-end assertion fails."""


async def _submit_agent_request(
    client: httpx.AsyncClient, actor_id: str
) -> str:
    """POST /agent/request and return the trace_id from the response."""

    response = await client.post(
        "/agent/request",
        json={
            "actor_id": actor_id,
            "job": SAMPLE_JOB,
            "resume_text": SAMPLE_RESUME.strip(),
        },
    )
    if response.status_code >= 400:
        raise SmokeTestError(
            f"/agent/request returned HTTP {response.status_code}: {response.text}"
        )

    body = response.json()
    trace_id = body.get("trace_id")
    if not trace_id:
        raise SmokeTestError(f"Response missing trace_id: {body}")
    if body.get("status") != "queued":
        raise SmokeTestError(f"Expected status=queued, got: {body}")

    logger.info("Submitted agent request trace_id=%s", trace_id)
    return trace_id


async def _await_ai_completed(
    bootstrap: str, trace_id: str, timeout_s: float
) -> dict[str, Any]:
    """Consume `ai.results` until an `ai.completed` envelope for trace_id.

    A fresh consumer group is used per run so we don't accidentally skip
    events committed by a prior run.
    """

    consumer = AIOKafkaConsumer(
        AI_RESULTS_TOPIC,
        bootstrap_servers=bootstrap,
        group_id=f"smoke-e2e-{uuid.uuid4()}",
        auto_offset_reset="earliest",
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )
    await consumer.start()
    try:
        logger.info(
            "Listening on topic=%s for trace_id=%s (timeout=%ss)",
            AI_RESULTS_TOPIC,
            trace_id,
            timeout_s,
        )

        async def _consume() -> dict[str, Any]:
            async for msg in consumer:
                event = msg.value
                if event.get("trace_id") != trace_id:
                    continue
                if event.get("event_type") != "ai.completed":
                    logger.debug(
                        "Ignoring non-completion event event_type=%s trace_id=%s",
                        event.get("event_type"),
                        trace_id,
                    )
                    continue
                return event
            raise SmokeTestError("Consumer exited before a matching event arrived")

        return await asyncio.wait_for(_consume(), timeout=timeout_s)
    finally:
        await consumer.stop()


def _assert_envelope(event: dict[str, Any], trace_id: str) -> None:
    """Validate the event envelope contract defined in PLAN/project spec."""

    required_keys = {"event_type", "trace_id", "actor_id", "entity", "payload"}
    missing = required_keys - event.keys()
    if missing:
        raise SmokeTestError(f"Envelope missing required keys: {sorted(missing)}")

    if event["event_type"] != "ai.completed":
        raise SmokeTestError(
            f"Unexpected event_type: {event['event_type']!r}"
        )
    if event["trace_id"] != trace_id:
        raise SmokeTestError(
            f"trace_id mismatch: got {event['trace_id']!r}, want {trace_id!r}"
        )
    if not isinstance(event.get("entity"), dict):
        raise SmokeTestError("entity must be a dict")
    if not isinstance(event.get("payload"), dict):
        raise SmokeTestError("payload must be a dict")


def _assert_supervisor_result(payload: dict[str, Any], trace_id: str) -> None:
    """Validate the supervisor's result shape inside the completion payload.

    Assertions are ordered so the most informative failure is surfaced
    first: a failed step (with its error message) is strictly more useful
    to debug than a "missing steps" message that's really a symptom.
    """

    if payload.get("trace_id") != trace_id:
        raise SmokeTestError(
            f"Supervisor trace_id mismatch: got {payload.get('trace_id')!r}"
        )

    steps = payload.get("steps")
    if not isinstance(steps, list) or not steps:
        raise SmokeTestError(f"Expected non-empty steps[], got: {steps!r}")

    # 1. Surface the underlying error if any step failed.
    failed = [s for s in steps if s.get("status") == "failed"]
    if failed:
        details = ", ".join(
            f"{s.get('step')}={s.get('error')!r}" for s in failed
        )
        raise SmokeTestError(f"Supervisor reported failed steps: {details}")

    # 2. Surface an unexpected terminal status before tallying steps.
    terminal_status = payload.get("status")
    if terminal_status not in {"awaiting_approval", "completed"}:
        raise SmokeTestError(
            f"Unexpected terminal status: {terminal_status!r}"
        )

    # 3. Last: verify every expected step is present.
    step_names = {s.get("step") for s in steps}
    missing_steps = EXPECTED_STEPS - step_names
    if missing_steps:
        raise SmokeTestError(
            f"Missing expected steps: {sorted(missing_steps)}; got {sorted(step_names)}"
        )


async def _assert_result_endpoint(
    client: httpx.AsyncClient, trace_id: str
) -> dict[str, Any]:
    """Cross-check that /agent/result/{trace_id} returns the same result."""

    response = await client.get(f"/agent/result/{trace_id}")
    if response.status_code != 200:
        raise SmokeTestError(
            f"/agent/result/{trace_id} returned HTTP {response.status_code}: "
            f"{response.text}"
        )
    return response.json()


async def _wait_for_health(
    client: httpx.AsyncClient, timeout_s: float = DEFAULT_HEALTH_TIMEOUT_S
) -> None:
    """Poll /health until it returns 200 or `timeout_s` elapses.

    The service binds its TCP port before the FastAPI startup hook finishes,
    so a single GET right after `docker compose up` can see ReadError or a
    half-open connection. Retrying with a short sleep converts that race
    into a clean wait.
    """

    loop = asyncio.get_event_loop()
    deadline = loop.time() + timeout_s
    attempts = 0
    last_error: str | None = None

    while loop.time() < deadline:
        attempts += 1
        try:
            response = await client.get("/health")
        except (httpx.RequestError, httpx.HTTPError) as exc:
            last_error = f"{type(exc).__name__}: {exc}"
        else:
            if response.status_code == 200:
                logger.info(
                    "Service is healthy at %s (after %d attempt%s)",
                    client.base_url,
                    attempts,
                    "" if attempts == 1 else "s",
                )
                return
            last_error = f"HTTP {response.status_code}: {response.text!r}"

        logger.debug("Health check not ready: %s", last_error)
        await asyncio.sleep(HEALTH_POLL_INTERVAL_S)

    raise SmokeTestError(
        f"Service not healthy within {timeout_s:.1f}s "
        f"(last error: {last_error})"
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def run_smoke(
    base_url: str,
    bootstrap: str,
    timeout_s: float,
    health_timeout_s: float,
) -> None:
    async with httpx.AsyncClient(base_url=base_url, timeout=10.0) as client:
        await _wait_for_health(client, timeout_s=health_timeout_s)

        trace_id = await _submit_agent_request(client, actor_id="recruiter-smoke")
        event = await _await_ai_completed(bootstrap, trace_id, timeout_s)

        _assert_envelope(event, trace_id)
        _assert_supervisor_result(event["payload"], trace_id)

        rest_result = await _assert_result_endpoint(client, trace_id)
        if rest_result.get("trace_id") != trace_id:
            raise SmokeTestError(
                f"/agent/result trace_id mismatch: {rest_result.get('trace_id')!r}"
            )

    logger.info("PASS — trace_id=%s completed full Kafka roundtrip", trace_id)
    logger.info(
        "Steps observed: %s",
        ", ".join(s.get("step") for s in event["payload"]["steps"]),
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="Base URL of the running AI Agent Service",
    )
    parser.add_argument(
        "--bootstrap",
        default="localhost:9093",
        help="Kafka bootstrap servers reachable from the host",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=90.0,
        help="Max seconds to wait for the ai.completed event",
    )
    parser.add_argument(
        "--health-timeout",
        type=float,
        default=DEFAULT_HEALTH_TIMEOUT_S,
        help="Max seconds to wait for /health to return 200 on startup",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    try:
        asyncio.run(
            run_smoke(
                args.base_url,
                args.bootstrap,
                args.timeout,
                args.health_timeout,
            )
        )
    except SmokeTestError as exc:
        logger.error("FAIL — %s", exc)
        return 1
    except asyncio.TimeoutError:
        logger.error(
            "FAIL — timed out after %.1fs waiting for ai.completed on %s",
            args.timeout,
            AI_RESULTS_TOPIC,
        )
        return 1
    except Exception as exc:  # pragma: no cover — defensive catch-all
        logger.exception("FAIL — unexpected error: %s", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
