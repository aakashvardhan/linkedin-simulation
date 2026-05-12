from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

import httpx
import asyncio
import datetime
import uuid

from aiokafka import AIOKafkaProducer


BASE_URL = os.getenv("E2E_BASE_URL", "http://localhost:8000")
KAFKA_BOOTSTRAP = os.getenv("E2E_KAFKA_BOOTSTRAP", os.getenv("KAFKA_BOOTSTRAP", "ai_kafka:9092"))


def _assert(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def _poll_status(client: httpx.Client, trace_id: str, want: set[str], timeout_s: int = 60) -> dict[str, Any]:
    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        r = client.get(f"{BASE_URL}/agent/status/{trace_id}")
        if r.status_code == 200:
            last = r.json()
            status = last.get("status")
            if status in want:
                return last
        time.sleep(1)
    raise RuntimeError(f"Timed out waiting for status {want}. last={last}")


async def _publish_kafka(topic: str, event: dict[str, Any]) -> None:
    producer = AIOKafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )
    await producer.start()
    try:
        await producer.send_and_wait(topic, event)
    finally:
        await producer.stop()


def main() -> int:
    print(f"[e2e] BASE_URL={BASE_URL}")
    print(f"[e2e] KAFKA_BOOTSTRAP={KAFKA_BOOTSTRAP}")
    with httpx.Client(timeout=30.0) as client:
        # Health
        r = client.get(f"{BASE_URL}/health")
        _assert(r.status_code == 200, f"/health failed {r.status_code} {r.text}")
        print("[e2e] health ok")

        # Invalid approval action -> 400
        r = client.post(f"{BASE_URL}/agent/approve/bogus", json={"action": "nope"})
        _assert(r.status_code == 400, f"expected 400 for invalid action, got {r.status_code}")
        print("[e2e] approval validation ok")

        good_job = {
            "job_id": "job_1001",
            "title": "Data Engineer (Kafka + Python)",
            "company_name": "Nimbus Analytics",
            "location": "San Jose, CA",
            "employment_type": "Full-time",
            "seniority_level": "Mid",
            "remote": "hybrid",
            "description": "Kafka, Python, FastAPI, MongoDB, Redis, Docker needed.",
            "skills_required": ["Python", "Kafka", "FastAPI", "MongoDB", "Redis", "Docker", "SQL"],
        }
        good_resume = (
            "Sushma R.\nData Engineer\n\nSKILLS\nPython, Kafka, FastAPI, MongoDB, Redis, Docker, SQL, Airflow, Spark\n"
            "EXPERIENCE\nData Engineer (2022-2026)\nBuilt Kafka pipelines.\n"
        )

        low_resume = (
            "Alex T.\nMarketing Specialist\n\nSKILLS\nSEO, Content Marketing, Google Analytics, Social Media, Copywriting\n"
            "EXPERIENCE\nMarketing Specialist (2021-2026)\n"
        )

        def request_trace(actor_id: str, job: dict, candidates: list[dict[str, Any]]) -> str:
            rr = client.post(
                f"{BASE_URL}/agent/request",
                json={"actor_id": actor_id, "job": job, "candidates": candidates},
            )
            _assert(rr.status_code == 200, f"request failed {rr.status_code} {rr.text}")
            trace_id = rr.json().get("trace_id")
            _assert(bool(trace_id), "missing trace_id")
            return trace_id

        # Happy path: should reach awaiting_approval and include all steps
        trace_good = request_trace(
            "recruiter_001",
            good_job,
            [
                {"candidate_id": "good_1", "resume_text": good_resume},
                {"candidate_id": "low_1", "resume_text": low_resume},
            ],
        )
        print(f"[e2e] trace_good={trace_good}")
        _poll_status(client, trace_good, {"awaiting_approval", "failed"}, timeout_s=90)
        res = client.get(f"{BASE_URL}/agent/result/{trace_good}")
        _assert(res.status_code == 200, f"result failed {res.status_code} {res.text}")
        payload = res.json()
        steps = [s.get("step") for s in payload.get("steps", [])]
        for required in [
            "resume_parsed",
            "match_scored",
            "outreach_drafted",
            "candidates_ranked",
        ]:
            _assert(required in steps, f"missing step {required} steps={steps}")
        ranked = payload.get("ranked_candidates") or []
        _assert(len(ranked) >= 1, "missing ranked_candidates")
        _assert((ranked[0].get("candidate_id") == "good_1"), f"expected good_1 top ranked got={ranked[:1]}")
        _assert(payload["trace"]["status"] in ("awaiting_approval", "failed"), "bad trace status")
        print("[e2e] happy path steps ok")

        # Approve via REST endpoint -> status should become approved (eventual, via Kafka consumer)
        rr = client.post(
            f"{BASE_URL}/agent/approve/{trace_good}",
            json={"action": "approve", "edited_draft": None, "candidate_id": "good_1"},
        )
        _assert(rr.status_code == 200, f"approve failed {rr.status_code} {rr.text}")
        _poll_status(client, trace_good, {"approved", "edited", "rejected"}, timeout_s=60)
        res2 = client.get(f"{BASE_URL}/agent/result/{trace_good}").json()
        approval_steps = [s for s in res2.get("steps", []) if s.get("step") == "approval"]
        _assert(len(approval_steps) >= 1, "approval step missing")
        print("[e2e] approval transition ok")

        # Idempotency: create a fresh trace and publish duplicate approval event with same idempotency_key
        trace_idem = request_trace("recruiter_003", good_job, [{"candidate_id": "good_1", "resume_text": good_resume}])
        print(f"[e2e] trace_idem={trace_idem}")
        _poll_status(client, trace_idem, {"awaiting_approval", "failed"}, timeout_s=90)

        idem_key = f"{trace_idem}:approval-dup"
        approval_event = {
            "event_type": "ai.approval.recorded",
            "trace_id": trace_idem,
            "timestamp": datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc).isoformat(),
            "actor_id": "recruiter",
            "entity": {"entity_type": "ai_task", "entity_id": trace_idem},
            "payload": {"action": "approve", "edited_draft": None},
            "idempotency_key": idem_key,
        }
        asyncio.run(_publish_kafka("ai.results", approval_event))
        asyncio.run(_publish_kafka("ai.results", approval_event))
        time.sleep(2)
        _poll_status(client, trace_idem, {"approved", "edited", "rejected"}, timeout_s=60)
        res3 = client.get(f"{BASE_URL}/agent/result/{trace_idem}").json()
        approval_steps2 = [s for s in res3.get("steps", []) if s.get("step") == "approval"]
        _assert(len(approval_steps2) == 1, f"idempotency failed; approval steps={len(approval_steps2)}")
        print("[e2e] idempotency ok")

        # Low match should still work and produce outreach + explanation
        trace_low = request_trace("recruiter_002", good_job, [{"candidate_id": "low_1", "resume_text": low_resume}])
        print(f"[e2e] trace_low={trace_low}")
        _poll_status(client, trace_low, {"awaiting_approval", "failed"}, timeout_s=90)
        low = client.get(f"{BASE_URL}/agent/result/{trace_low}").json()
        ranked_low = low.get("ranked_candidates") or []
        score = (ranked_low[0].get("match_score") if ranked_low else 0) or 0
        _assert(score < 0.25, f"expected low score, got {score}")
        print("[e2e] low match ok")

        # Metrics endpoints should respond
        mr = client.get(f"{BASE_URL}/agent/metrics/match-quality")
        ar = client.get(f"{BASE_URL}/agent/metrics/approval-rate")
        _assert(mr.status_code == 200, f"match-quality failed {mr.status_code}")
        _assert(ar.status_code == 200, f"approval-rate failed {ar.status_code}")
        print("[e2e] metrics endpoints ok")

    print("[e2e] PASS")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print("[e2e] FAIL:", str(e))
        raise

