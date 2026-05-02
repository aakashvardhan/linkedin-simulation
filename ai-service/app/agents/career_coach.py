"""Career Coach skill.

Given a member's parsed profile and a target job, computes a lightweight
gap analysis (missing skills, score delta) and asks the LLM for concrete,
actionable suggestions: headline, skill recommendations, resume tips.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from openai import AsyncOpenAI

from app.agents.job_matcher import compute_match_score
from app.config import settings

logger = logging.getLogger(__name__)

_client = AsyncOpenAI(
    api_key=settings.groq_api_key.get_secret_value(),
    base_url=settings.groq_base_url,
)


def _compute_gap(job: dict[str, Any], member: dict[str, Any]) -> dict[str, Any]:
    job_skills = {s.lower() for s in job.get("skills_required", [])}
    member_skills = {s.lower() for s in member.get("skills", [])}
    missing = sorted(job_skills - member_skills)
    overlap = sorted(job_skills & member_skills)
    match = compute_match_score(job, member)
    return {
        "match_score": match["score"],
        "skills_overlap": overlap,
        "skills_missing": missing,
    }


_INSTRUCT_HINT = re.compile(
    r"ignore\s+(previous|prior|above)\s+instructions?",
    re.IGNORECASE,
)


def _sanitize_for_prompt_blob(label: str, obj: Any) -> str:
    """Serialize structured data with ASCII-safe JSON and mild instruction stripping."""

    def _scrub(o: Any) -> Any:
        if isinstance(o, dict):
            return {str(k): _scrub(v) for k, v in o.items()}
        if isinstance(o, list):
            return [_scrub(v) for v in o]
        if isinstance(o, str):
            cleaned = "".join(ch for ch in o if ch >= " " or ch in "\n\t\r")
            if _INSTRUCT_HINT.search(cleaned):
                cleaned = _INSTRUCT_HINT.sub("[redacted]", cleaned)
            return cleaned
        return o

    payload = json.dumps(_scrub(obj), ensure_ascii=True)
    return f"{label}_DATA_START\n{payload}\n{label}_DATA_END"


async def _generate_suggestions(
    job: dict[str, Any],
    member: dict[str, Any],
    gap: dict[str, Any],
) -> dict[str, Any]:
    prompt = (
        "You are a supportive career coach. Given a candidate and a target job, "
        "produce concrete, non-generic advice. Respond with ONLY a JSON object "
        "having exactly these keys: "
        "headline (string, under 120 chars), "
        "skill_recommendations (list of up to 5 strings), "
        "resume_tips (list of up to 5 strings). "
        "No markdown, no code fences, no commentary.\n\n"
        f"{_sanitize_for_prompt_blob('CANDIDATE_PROFILE', member)}\n"
        f"{_sanitize_for_prompt_blob('TARGET_JOB', job)}\n"
        f"{_sanitize_for_prompt_blob('GAP_ANALYSIS', gap)}\n"
    )

    response = await _client.chat.completions.create(
        model=settings.groq_model,
        messages=[
            {"role": "system", "content": "You write concise, actionable career advice as JSON."},
            {"role": "user", "content": prompt},
        ],
    )
    choices = getattr(response, "choices", None) or []
    if not choices:
        raise ValueError("LLM returned no choices")
    msg = getattr(choices[0], "message", None)
    content = getattr(msg, "content", None) if msg is not None else None
    if content is None:
        raise ValueError("LLM returned empty message content")
    raw = str(content).strip()
    if not raw:
        raise ValueError("LLM returned empty content")
    if raw.startswith("```"):
        lines = raw.split("\n")
        if len(lines) >= 3 and lines[-1].strip() == "```":
            raw = "\n".join(lines[1:-1]).strip()
        else:
            raw = "\n".join(lines[1:]).strip()
    if not raw:
        raise ValueError("No JSON content after stripping code fences")
    return json.loads(raw)


async def coach(job: dict[str, Any], member: dict[str, Any]) -> dict[str, Any]:
    """Return gap analysis + LLM-generated career suggestions."""

    gap = _compute_gap(job, member)
    fallback = {
        "headline": "",
        "skill_recommendations": [],
        "resume_tips": [],
        "error": "LLM returned invalid JSON",
    }
    try:
        suggestions = await _generate_suggestions(job, member, gap)
    except json.JSONDecodeError as e:
        logger.warning("Career coach JSON parse failed: %s", e)
        suggestions = {**fallback, "error": "LLM returned invalid JSON"}
    except Exception:
        logger.exception("Career coach suggestion generation failed")
        suggestions = {
            **fallback,
            "error": "Career coach failed to produce suggestions",
        }
    return {"gap": gap, "suggestions": suggestions}
