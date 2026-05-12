from __future__ import annotations

import datetime
from typing import Any, Callable

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import settings

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def _utc_now() -> str:
    return datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc).isoformat()


async def get_db() -> AsyncIOMotorDatabase:
    global _client, _db
    if _db is None:
        _client = AsyncIOMotorClient(settings.mongo_uri)
        _db = _client.get_database("linkedin_ai")
    return _db


async def ensure_indexes() -> None:
    db = await get_db()
    await db.traces.create_index("trace_id", unique=True)
    await db.steps.create_index([("trace_id", 1), ("step", 1), ("created_at", 1)])
    await db.approvals.create_index("trace_id")
    await db.events.create_index("trace_id")
    await db.events.create_index("idempotency_key", unique=True, sparse=True)


async def upsert_trace(
    *,
    trace_id: str,
    actor_id: str,
    status: str,
    job: dict[str, Any] | None = None,
) -> None:
    db = await get_db()
    now = _utc_now()
    set_fields: dict[str, Any] = {"actor_id": actor_id, "status": status, "updated_at": now}
    if job is not None:
        set_fields["job"] = job
    await db.traces.update_one(
        {"trace_id": trace_id},
        {"$setOnInsert": {"trace_id": trace_id, "created_at": now}, "$set": set_fields},
        upsert=True,
    )


async def add_step(
    *,
    trace_id: str,
    step: str,
    status: str,
    data: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    db = await get_db()
    doc: dict[str, Any] = {
        "trace_id": trace_id,
        "step": step,
        "status": status,
        "created_at": _utc_now(),
    }
    if data is not None:
        doc["data"] = data
    if error is not None:
        doc["error"] = error
    await db.steps.insert_one(doc)


async def add_approval(
    *,
    trace_id: str,
    actor_id: str,
    action: str,
    edited_draft: str | None,
    candidate_id: str | None = None,
) -> None:
    db = await get_db()
    doc: dict[str, Any] = {
        "trace_id": trace_id,
        "actor_id": actor_id,
        "action": action,
        "edited_draft": edited_draft,
        "created_at": _utc_now(),
    }
    if candidate_id:
        doc["candidate_id"] = candidate_id
    await db.approvals.insert_one(doc)


async def add_event(event: dict[str, Any]) -> None:
    db = await get_db()
    event = dict(event)
    event.setdefault("persisted_at", _utc_now())
    await db.events.insert_one(event)


async def get_trace(trace_id: str) -> dict[str, Any] | None:
    db = await get_db()
    return await db.traces.find_one({"trace_id": trace_id}, {"_id": 0})


async def get_steps(trace_id: str) -> list[dict[str, Any]]:
    db = await get_db()
    cursor = db.steps.find({"trace_id": trace_id}, {"_id": 0}).sort("created_at", 1)
    return [doc async for doc in cursor]


async def get_ranked_candidate_count(trace_id: str) -> int:
    """
    Returns the number of successfully ranked candidates for a trace, if known.
    Used to determine when a batch trace has received approvals for all candidates.
    """
    db = await get_db()
    doc = await db.steps.find_one(
        {"trace_id": trace_id, "step": "candidates_ranked", "status": "completed"},
        {"_id": 0, "data": 1},
        sort=[("created_at", -1)],
    )
    if not doc:
        return 0
    data = doc.get("data") or {}
    if isinstance(data.get("count"), int):
        return int(data["count"])
    rc = data.get("ranked_candidates")
    if isinstance(rc, list):
        return len(rc)
    return 0


async def count_distinct_candidate_approvals(trace_id: str) -> int:
    db = await get_db()
    pipeline = [
        {"$match": {"trace_id": trace_id, "candidate_id": {"$exists": True, "$ne": ""}}},
        {"$group": {"_id": "$candidate_id"}},
        {"$count": "n"},
    ]
    rows = [r async for r in db.approvals.aggregate(pipeline)]
    if not rows:
        return 0
    return int(rows[0].get("n", 0) or 0)


def _preview_ranking_from_steps(
    raw_steps: list[dict[str, Any]],
    *,
    tier_fn: Callable[[Any], str],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    While the supervisor is still running (no candidates_ranked step yet), derive a
    leaderboard from the latest completed match_scored step per candidate_id.
    """
    latest: dict[str, dict[str, Any]] = {}
    for s in raw_steps:
        if s.get("step") != "match_scored" or s.get("status") != "completed":
            continue
        data = s.get("data") if isinstance(s.get("data"), dict) else {}
        cid = data.get("candidate_id")
        if not cid:
            continue
        match = data.get("match") if isinstance(data.get("match"), dict) else {}
        score = match.get("score") if match else data.get("match_score")
        tier = tier_fn(score)
        latest[str(cid)] = {
            "candidate_id": cid,
            "match_score": score,
            "match_tier": tier,
            "skills_overlap": match.get("skills_overlap") or [],
        }
    if not latest:
        return [], {}
    ordered = sorted(latest.values(), key=lambda x: float(x.get("match_score") or 0), reverse=True)
    tier_counts: dict[str, int] = {"strong": 0, "good": 0, "weak": 0, "irrelevant": 0}
    for i, row in enumerate(ordered):
        row["rank"] = i + 1
        row["score_pct"] = int(round(float(row.get("match_score") or 0) * 100))
        t = str(row.get("match_tier") or "irrelevant")
        if t in tier_counts:
            tier_counts[t] += 1
    preview_stats = {
        "partial": True,
        "candidates_scored": len(ordered),
        "strong_count": tier_counts["strong"],
        "good_count": tier_counts["good"],
        "weak_count": tier_counts["weak"],
        "irrelevant_count": tier_counts["irrelevant"],
    }
    return ordered, preview_stats


async def get_latest_result(trace_id: str) -> dict[str, Any] | None:
    trace = await get_trace(trace_id)
    if trace is None:
        return None
    steps = await get_steps(trace_id)
    ranked_candidates: list[dict[str, Any]] | None = None
    ranked_count: int | None = None
    stats: dict[str, Any] | None = None
    for s in reversed(steps):
        if (s.get("step") == "candidates_ranked") and (s.get("status") == "completed"):
            data = (s.get("data") or {}) if isinstance(s.get("data"), dict) else {}
            rc = data.get("ranked_candidates")
            if isinstance(rc, list):
                ranked_candidates = rc
                ranked_count = data.get("count") if isinstance(data.get("count"), int) else len(rc)
            st = data.get("stats")
            if isinstance(st, dict):
                stats = st
            break

    # Build a presentation-friendly response by default:
    # - Keep full persistence in Mongo (steps are stored as-is),
    # - But avoid returning duplicate large blobs to the UI.
    def _tier_from_score(score: Any | None) -> str:
        try:
            s = float(score) if score is not None else 0.0
        except Exception:
            s = 0.0
        if s >= 0.7:
            return "strong"
        if s >= 0.55:
            return "good"
        if s >= 0.35:
            return "weak"
        return "irrelevant"

    def _slim_ranked(rc: list[dict[str, Any]]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for i, c in enumerate(rc):
            match = c.get("match") or {}
            outreach = c.get("outreach") or {}
            score = c.get("match_score")
            tier = _tier_from_score(score)
            re = c.get("ranking_explanation")
            slim_re: dict[str, Any] | None = None
            if isinstance(re, dict):
                if re.get("error"):
                    slim_re = {"error": re.get("error")}
                else:
                    slim_re = {
                        "explanation": re.get("explanation"),
                        "score": re.get("score"),
                        "overlap_ratio": re.get("overlap_ratio"),
                    }
            iq = c.get("interview_questions")
            slim_iq: dict[str, Any] | None = None
            if isinstance(iq, dict):
                if iq.get("error"):
                    slim_iq = {"error": iq.get("error")}
                else:
                    slim_iq = {
                        "skill_gaps": iq.get("skill_gaps") or [],
                        "technical_questions": iq.get("technical_questions") or [],
                        "behavioral_questions": iq.get("behavioral_questions") or [],
                    }
            row: dict[str, Any] = {
                "rank": i + 1,
                "candidate_id": c.get("candidate_id"),
                "match_score": score,
                "score_pct": int(round(float(score or 0) * 100)),
                "match_tier": tier,
                "skills_overlap": match.get("skills_overlap") or [],
                "outreach": {
                    "draft": outreach.get("draft"),
                    "status": outreach.get("status"),
                    "requires_human_review": outreach.get("requires_human_review", True),
                },
            }
            if slim_re is not None:
                row["ranking_explanation"] = slim_re
            if slim_iq is not None:
                row["interview_questions"] = slim_iq
            out.append(row)
        return out

    def _slim_steps(raw_steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
        slimmed: list[dict[str, Any]] = []
        for s in raw_steps:
            step = s.get("step")
            data = s.get("data") if isinstance(s.get("data"), dict) else {}
            if step == "resume_parsed":
                # Full observability: include parsed fields in steps.
                slimmed.append(
                    {
                        **{k: v for k, v in s.items() if k not in ("data",)},
                        "data": {
                            "candidate_id": data.get("candidate_id"),
                            "parsed_resume": data.get("parsed_resume"),
                        },
                    }
                )
            elif step == "match_scored":
                match = data.get("match") if isinstance(data.get("match"), dict) else {}
                score = match.get("score")
                slimmed.append(
                    {
                        **{k: v for k, v in s.items() if k not in ("data",)},
                        "data": {
                            "candidate_id": data.get("candidate_id"),
                            "match_score": score,
                            "match_tier": _tier_from_score(score),
                            # Keep overlap for in-progress preview (get_latest_result uses raw steps).
                            "match": {"skills_overlap": match.get("skills_overlap") or []},
                        },
                    }
                )
            elif step == "outreach_drafted":
                outreach = data.get("outreach") if isinstance(data.get("outreach"), dict) else {}
                tier = _tier_from_score(outreach.get("match_score"))
                slimmed.append(
                    {
                        **{k: v for k, v in s.items() if k not in ("data",)},
                        "data": {
                            "candidate_id": data.get("candidate_id"),
                            "match_score": outreach.get("match_score"),
                            "match_tier": tier,
                            "status": outreach.get("status"),
                        },
                    }
                )
            elif step == "candidates_ranked":
                # Avoid duplicating ranked_candidates inside steps (already top-level).
                slimmed.append(
                    {
                        **{k: v for k, v in s.items() if k not in ("data",)},
                        "data": {"count": data.get("count"), "stats": data.get("stats")},
                    }
                )
            else:
                slimmed.append(s)
        return slimmed

    result: dict[str, Any] = {"trace": trace, "steps": _slim_steps(steps)}
    if ranked_candidates is not None:
        slim_ranked = _slim_ranked(ranked_candidates)
        result["ranked_candidates"] = slim_ranked
        result["ranked_count"] = ranked_count
        if slim_ranked:
            result["summary"] = {
                "top_candidate_id": slim_ranked[0].get("candidate_id"),
                "top_match_score": slim_ranked[0].get("match_score"),
                "requires_human_review": True,
            }
    if stats is not None:
        result["stats"] = stats
    elif ranked_candidates is None:
        preview_rows, preview_stats = _preview_ranking_from_steps(steps, tier_fn=_tier_from_score)
        if preview_rows:
            result["ranked_candidates_preview"] = preview_rows
            result["stats_preview"] = preview_stats
    return result

