from __future__ import annotations

import json
import os
import subprocess
import sys
import time

import httpx


BASE_URL = os.getenv("E2E_BASE_URL", "http://localhost:8000")


def sh(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)


def main() -> int:
    # 1) Run the in-container e2e suite (includes idempotency Kafka duplicate check)
    print("[host-e2e] running container e2e_smoke")
    subprocess.run(["docker", "exec", "ai_service", "python", "-m", "app.tools.e2e_smoke"], check=True)

    # 2) Failure injection: stop matcher container and ensure workflow fails cleanly
    print("[host-e2e] stopping matcher for failure injection")
    sh(["docker", "stop", "matcher"])
    try:
        with httpx.Client(timeout=30.0) as client:
            body = {
                "actor_id": "recruiter_fail",
                "job": {
                    "job_id": "job_fail",
                    "title": "Data Engineer",
                    "company_name": "Nimbus",
                    "description": "Kafka Python",
                    "skills_required": ["Python", "Kafka"],
                },
                "resume_text": "Data Engineer\nSKILLS\nPython, Kafka\n",
            }
            r = client.post(f"{BASE_URL}/agent/request", json=body)
            r.raise_for_status()
            trace_id = r.json()["trace_id"]
            print("[host-e2e] trace_id", trace_id)

            # Wait a bit for consumer
            # With retries/backoff in the supervisor, allow enough time for it to exhaust
            deadline = time.time() + 150
            status = None
            while time.time() < deadline:
                s = client.get(f"{BASE_URL}/agent/status/{trace_id}")
                if s.status_code == 200:
                    status = (s.json() or {}).get("status")
                    if status in ("failed", "awaiting_approval"):
                        break
                time.sleep(1)

            # With matcher down, we expect failure at match_scored
            _ = client.get(f"{BASE_URL}/agent/result/{trace_id}").json()
            steps = [(x.get("step"), x.get("status")) for x in _.get("steps", [])]
            print("[host-e2e] status", status, "steps", steps)
            if status != "failed":
                raise RuntimeError(f"expected failed with matcher down; got status={status}")
            if not any(step == "match_scored" and st == "failed" for step, st in steps):
                raise RuntimeError(f"expected match_scored failed; got steps={steps}")

            print("[host-e2e] failure handling ok")
    finally:
        print("[host-e2e] restarting matcher")
        sh(["docker", "start", "matcher"])

    print("[host-e2e] PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

