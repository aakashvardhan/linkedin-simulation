from __future__ import annotations

import datetime
from typing import Any

from app.db.mongo import get_db


async def record_match_quality(trace_id: str, match: dict[str, Any]) -> None:
    """
    Persist match metrics to support the required evaluation deliverable.
    We store both the embedding score and overlap ratio so you can report
    a simple rubric (top-k overlap / relevance by manual review).
    """
    db = await get_db()
    await db.metrics.insert_one(
        {
            "metric_type": "match_quality",
            "trace_id": trace_id,
            "created_at": datetime.datetime.utcnow()
            .replace(tzinfo=datetime.timezone.utc)
            .isoformat(),
            "score_bucket": (
                "high"
                if (match.get("score") or 0) >= 0.6
                else "medium"
                if (match.get("score") or 0) >= 0.25
                else "low"
            ),
            "score": match.get("score"),
            "semantic_score": match.get("semantic_score"),
            "overlap_ratio": match.get("overlap_ratio"),
            "skills_overlap_count": len(match.get("skills_overlap", []) or []),
        }
    )


async def record_approval_action(trace_id: str, action: str, *, candidate_id: str | None = None) -> None:
    db = await get_db()
    doc: dict[str, Any] = {
        "metric_type": "approval_action",
        "trace_id": trace_id,
        "created_at": datetime.datetime.utcnow()
        .replace(tzinfo=datetime.timezone.utc)
        .isoformat(),
        "action": action,
    }
    if candidate_id:
        doc["candidate_id"] = candidate_id
    await db.metrics.insert_one(doc)


async def approval_rate_summary() -> dict[str, Any]:
    """
    Returns counts and approval rate for outreach actions.
    """
    db = await get_db()
    pipeline = [
        {"$match": {"metric_type": "approval_action"}},
        {"$group": {"_id": "$action", "count": {"$sum": 1}}},
    ]
    rows = [r async for r in db.metrics.aggregate(pipeline)]
    counts = {r["_id"]: r["count"] for r in rows}
    total = sum(counts.values()) or 0
    approved = counts.get("approve", 0)

    per_candidate_pipeline = [
        {"$match": {"metric_type": "approval_action", "candidate_id": {"$exists": True, "$ne": ""}}},
        {"$group": {"_id": {"candidate_id": "$candidate_id", "action": "$action"}, "count": {"$sum": 1}}},
    ]
    per_rows = [r async for r in db.metrics.aggregate(per_candidate_pipeline)]
    per_candidate: dict[str, dict[str, int]] = {}
    for r in per_rows:
        cid = (r.get("_id") or {}).get("candidate_id")
        act = (r.get("_id") or {}).get("action")
        if not cid or not act:
            continue
        per_candidate.setdefault(str(cid), {})[str(act)] = int(r.get("count", 0) or 0)

    return {
        "counts": counts,
        "total": total,
        "approval_rate": (approved / total) if total else None,
        "per_candidate": per_candidate,
    }


async def match_quality_summary(window_days: int = 7, sample_limit: int = 20) -> dict[str, Any]:
    """
    Aggregates match quality metrics for a recent time window.
    Returns:
    - averages
    - bucket counts (high/medium/low by score)
    - sample of recent traces (for manual review / demo)
    """
    db = await get_db()
    since = (
        datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc)
        - datetime.timedelta(days=window_days)
    )

    match_filter: dict[str, Any] = {"metric_type": "match_quality", "created_at": {"$gte": since.isoformat()}}

    # Ensure older docs without created_at still count (fallback).
    # We'll treat missing created_at as included.
    match_filter_or = {
        "$or": [
            {"metric_type": "match_quality", "created_at": {"$gte": since.isoformat()}},
            {"metric_type": "match_quality", "created_at": {"$exists": False}},
        ]
    }

    agg = [
        {"$match": match_filter_or},
        {
            "$group": {
                "_id": None,
                "count": {"$sum": 1},
                "avg_score": {"$avg": "$score"},
                "avg_semantic": {"$avg": "$semantic_score"},
                "avg_overlap_ratio": {"$avg": "$overlap_ratio"},
                "avg_overlap_count": {"$avg": "$skills_overlap_count"},
            }
        },
    ]
    rows = [r async for r in db.metrics.aggregate(agg)]
    summary = rows[0] if rows else {"count": 0}

    # Bucket counts by score
    buckets = [
        {"name": "high", "min": 0.6, "max": 1.01},
        {"name": "medium", "min": 0.25, "max": 0.6},
        {"name": "low", "min": -1.0, "max": 0.25},
    ]
    bucket_counts: dict[str, int] = {}
    for b in buckets:
        c = await db.metrics.count_documents(
            {
                **match_filter_or,
                "score": {"$gte": b["min"], "$lt": b["max"]},
            }
        )
        bucket_counts[b["name"]] = int(c)

    # Sample recent traces for manual review
    cursor = (
        db.metrics.find(match_filter_or, {"_id": 0})
        .sort("created_at", -1)
        .limit(sample_limit)
    )
    samples = [doc async for doc in cursor]

    return {
        "window_days": window_days,
        "count": int(summary.get("count", 0) or 0),
        "averages": {
            "score": summary.get("avg_score"),
            "semantic_score": summary.get("avg_semantic"),
            "overlap_ratio": summary.get("avg_overlap_ratio"),
            "skills_overlap_count": summary.get("avg_overlap_count"),
        },
        "buckets": bucket_counts,
        "samples": samples,
    }

