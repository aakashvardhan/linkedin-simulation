"""Career Coach skill.

Given a member's parsed profile and a target job, computes a lightweight
gap analysis (missing skills, score delta) and asks the LLM for concrete,
actionable suggestions: headline, skill recommendations, resume tips.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from openai import AsyncOpenAI

from app.agents.job_matcher import compute_match_score
from app.config import settings

logger = logging.getLogger(__name__)

_client = AsyncOpenAI(
    api_key=settings.groq_api_key,
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
        f"Candidate profile: {json.dumps(member)}\n"
        f"Target job: {json.dumps(job)}\n"
        f"Gap analysis: {json.dumps(gap)}\n"
    )

    response = await _client.chat.completions.create(
        model=settings.groq_model,
        messages=[
            {"role": "system", "content": "You write concise, actionable career advice as JSON."},
            {"role": "user", "content": prompt},
        ],
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1]).strip()
    return json.loads(raw)


async def coach(job: dict[str, Any], member: dict[str, Any]) -> dict[str, Any]:
    """Return gap analysis + LLM-generated career suggestions."""

    gap = _compute_gap(job, member)
    try:
        suggestions = await _generate_suggestions(job, member, gap)
    except json.JSONDecodeError as e:
        logger.warning("Career coach JSON parse failed: %s", e)
        suggestions = {
            "headline": "",
            "skill_recommendations": [],
            "resume_tips": [],
            "error": "LLM returned invalid JSON",
        }
    return {"gap": gap, "suggestions": suggestions}
