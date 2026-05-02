# Hiring Assistant — orchestrates the workflow
import logging
from typing import Any

import httpx

from app.api.websocket import push_update
from app.db.mongo import add_step, upsert_trace
from app.db.redis_client import set_status
from app.config import settings
from app.kafka.producer import publish_event
from app.metrics import record_match_quality

logger = logging.getLogger(__name__)

def _tier_from_score(score: float) -> str:
    if score >= 0.7:
        return "strong"
    if score >= 0.55:
        return "good"
    if score >= 0.35:
        return "weak"
    return "irrelevant"


async def _post_with_retries(url: str, payload: dict, *, timeout_s: float = 30.0, retries: int = 2) -> dict:
    last_err: Exception | None = None
    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout_s) as client:
                r = await client.post(url, json=payload)
                r.raise_for_status()
                return r.json()
        except Exception as e:
            last_err = e
            if attempt == retries:
                break
            # Simple backoff to handle cold-starting skill containers (e.g., matcher model load)
            import asyncio
            await asyncio.sleep(min(2 ** attempt, 8))
    raise RuntimeError(f"Skill call failed url={url} error={last_err}")


async def run_hiring_workflow(task: dict, trace_id: str) -> dict:
    job = task.get("job", {})
    actor_id = task.get("actor_id", "")
    candidates: list[dict[str, Any]] = task.get("candidates") or []
    if not candidates:
        # Backward compatible: treat the single resume_text as one candidate
        candidates = [{"resume_text": task.get("resume_text", "")}]

    results = {
        "trace_id": trace_id,
        "actor_id": actor_id,
        "steps": [],
        "status": "in_progress",
    }

    async def _emit_progress() -> None:
        await push_update(trace_id, results)

    async def _set_status(status: str, extra: dict[str, Any] | None = None) -> None:
        results["status"] = status
        await upsert_trace(trace_id=trace_id, actor_id=actor_id, status=status, job=job)
        await set_status(trace_id, status, extra=extra)
        await _emit_progress()

    ranked: list[dict[str, Any]] = []
    applied_count = len(candidates)
    processed_count = 0
    success_count = 0
    failed_count = 0
    tier_counts: dict[str, int] = {"strong": 0, "good": 0, "weak": 0, "irrelevant": 0}

    # Batch: process each candidate independently, then rank by score.
    for idx, candidate in enumerate(candidates):
        candidate_id = candidate.get("candidate_id") or candidate.get("id") or f"candidate_{idx + 1}"
        resume_text = candidate.get("resume_text", "") or ""
        processed_count += 1

        # Step A — Parse resume
        try:
            await _set_status("in_progress", extra={"current_step": "resume_parsed", "candidate_id": candidate_id})
            parsed_resume = await _post_with_retries(
                f"{settings.resume_parser_url}/run",
                {"resume_text": resume_text},
                timeout_s=45.0,
                retries=4,
            )
            await add_step(
                trace_id=trace_id,
                step="resume_parsed",
                status="completed",
                data={"candidate_id": candidate_id, "parsed_resume": parsed_resume},
            )
            results["steps"].append(
                {"step": "resume_parsed", "status": "completed", "data": {"candidate_id": candidate_id}}
            )
            await _emit_progress()
        except Exception as e:
            await add_step(
                trace_id=trace_id,
                step="resume_parsed",
                status="failed",
                error=str(e),
                data={"candidate_id": candidate_id},
            )
            results["steps"].append(
                {"step": "resume_parsed", "status": "failed", "error": str(e), "data": {"candidate_id": candidate_id}}
            )
            # Skip this candidate but continue with others
            failed_count += 1
            await _emit_progress()
            continue

        # Step B — Compute match score
        try:
            await _set_status("in_progress", extra={"current_step": "match_scored", "candidate_id": candidate_id})
            match = await _post_with_retries(
                f"{settings.matcher_url}/run",
                {"job": job, "candidate": parsed_resume},
                timeout_s=30.0,
                retries=6,
            )
            await record_match_quality(trace_id, match)
            await add_step(
                trace_id=trace_id,
                step="match_scored",
                status="completed",
                data={"candidate_id": candidate_id, "match": match},
            )
            results["steps"].append(
                {"step": "match_scored", "status": "completed", "data": {"candidate_id": candidate_id}}
            )
            await _emit_progress()
        except Exception as e:
            await add_step(
                trace_id=trace_id,
                step="match_scored",
                status="failed",
                error=str(e),
                data={"candidate_id": candidate_id},
            )
            results["steps"].append(
                {"step": "match_scored", "status": "failed", "error": str(e), "data": {"candidate_id": candidate_id}}
            )
            failed_count += 1
            await _emit_progress()
            continue

        ranking_explanation: dict[str, Any] | None = None
        interview_questions: dict[str, Any] | None = None

        # Step B1 — Explain match ranking (transparency for recruiter review)
        try:
            await _set_status(
                "in_progress",
                extra={"current_step": "ranking_explained", "candidate_id": candidate_id},
            )
            ranking_explanation = await _post_with_retries(
                f"{settings.ranking_explainer_url}/run",
                {"job": job, "candidate": parsed_resume, "match": match},
                timeout_s=45.0,
                retries=3,
            )
            await add_step(
                trace_id=trace_id,
                step="ranking_explained",
                status="completed",
                data={"candidate_id": candidate_id, "ranking_explanation": ranking_explanation},
            )
            results["steps"].append(
                {"step": "ranking_explained", "status": "completed", "data": {"candidate_id": candidate_id}}
            )
            await _emit_progress()
        except Exception as e:
            ranking_explanation = {"error": str(e)}
            await add_step(
                trace_id=trace_id,
                step="ranking_explained",
                status="failed",
                error=str(e),
                data={"candidate_id": candidate_id},
            )
            results["steps"].append(
                {
                    "step": "ranking_explained",
                    "status": "failed",
                    "error": str(e),
                    "data": {"candidate_id": candidate_id},
                }
            )
            await _emit_progress()

        # Step B2 — Interview questions from skill gaps (technical + behavioral)
        try:
            await _set_status(
                "in_progress",
                extra={"current_step": "interview_questions_generated", "candidate_id": candidate_id},
            )
            interview_questions = await _post_with_retries(
                f"{settings.interview_questions_url}/run",
                {"job": job, "candidate": parsed_resume, "match": match},
                timeout_s=45.0,
                retries=3,
            )
            await add_step(
                trace_id=trace_id,
                step="interview_questions_generated",
                status="completed",
                data={"candidate_id": candidate_id, "interview_questions": interview_questions},
            )
            results["steps"].append(
                {
                    "step": "interview_questions_generated",
                    "status": "completed",
                    "data": {"candidate_id": candidate_id},
                }
            )
            await _emit_progress()
        except Exception as e:
            interview_questions = {"error": str(e)}
            await add_step(
                trace_id=trace_id,
                step="interview_questions_generated",
                status="failed",
                error=str(e),
                data={"candidate_id": candidate_id},
            )
            results["steps"].append(
                {
                    "step": "interview_questions_generated",
                    "status": "failed",
                    "error": str(e),
                    "data": {"candidate_id": candidate_id},
                }
            )
            await _emit_progress()

        # Step C — Generate outreach draft
        try:
            await _set_status("in_progress", extra={"current_step": "outreach_drafted", "candidate_id": candidate_id})
            outreach = await _post_with_retries(
                f"{settings.outreach_drafter_url}/run",
                {"job": job, "candidate": parsed_resume, "match": match},
                timeout_s=45.0,
                retries=3,
            )
            await add_step(
                trace_id=trace_id,
                step="outreach_drafted",
                status="completed",
                data={"candidate_id": candidate_id, "outreach": outreach},
            )
            results["steps"].append(
                {"step": "outreach_drafted", "status": "completed", "data": {"candidate_id": candidate_id}}
            )
            await _emit_progress()
        except Exception as e:
            await add_step(
                trace_id=trace_id,
                step="outreach_drafted",
                status="failed",
                error=str(e),
                data={"candidate_id": candidate_id},
            )
            results["steps"].append(
                {
                    "step": "outreach_drafted",
                    "status": "failed",
                    "error": str(e),
                    "data": {"candidate_id": candidate_id},
                }
            )
            failed_count += 1
            await _emit_progress()
            continue

        success_count += 1
        match_score = float((match or {}).get("score") or 0)
        match_tier = _tier_from_score(match_score)
        tier_counts[match_tier] = tier_counts.get(match_tier, 0) + 1

        ranked.append(
            {
                "candidate_id": candidate_id,
                "candidate": candidate,
                "parsed_resume": parsed_resume,
                "match": match,
                "match_score": match_score,
                "match_tier": match_tier,
                "ranking_explanation": ranking_explanation,
                "interview_questions": interview_questions,
                "outreach": outreach,
            }
        )

    ranked.sort(key=lambda x: float(x.get("match_score") or 0), reverse=True)

    stats = {
        "applied_count": applied_count,
        "processed_count": processed_count,
        "success_count": success_count,
        "failed_count": failed_count,
        "strong_count": tier_counts.get("strong", 0),
        "good_count": tier_counts.get("good", 0),
        "weak_count": tier_counts.get("weak", 0),
        "irrelevant_count": tier_counts.get("irrelevant", 0),
    }

    results["ranked_candidates"] = ranked
    results["ranked_count"] = len(ranked)
    results["stats"] = stats
    await add_step(
        trace_id=trace_id,
        step="candidates_ranked",
        status="completed",
        data={"count": len(ranked), "stats": stats, "ranked_candidates": ranked},
    )
    results["steps"].append(
        {"step": "candidates_ranked", "status": "completed", "data": {"count": len(ranked)}}
    )

    await _set_status(
        "awaiting_approval",
        extra={
            "requires_human_review": True,
            "ranked_count": len(ranked),
            "applied_count": applied_count,
            "good_count": stats["good_count"],
            "irrelevant_count": stats["irrelevant_count"],
        },
    )
    return results
