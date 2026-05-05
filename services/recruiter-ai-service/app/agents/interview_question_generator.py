from __future__ import annotations

import json

from openai import AsyncOpenAI

from app.config import settings
from app.llm_gate import is_llm_configured


def _llm_client() -> tuple[AsyncOpenAI, str]:
    if settings.openrouter_api_key and settings.openrouter_model:
        return (
            AsyncOpenAI(api_key=settings.openrouter_api_key, base_url=settings.openrouter_base_url),
            settings.openrouter_model,
        )
    return (
        AsyncOpenAI(api_key=settings.groq_api_key, base_url=settings.groq_base_url),
        settings.groq_model,
    )


async def generate_interview_questions(job: dict, candidate: dict, match: dict) -> dict:
    """
    Generates technical + behavioral questions based on skill gaps.
    Returns structured JSON for easy UI rendering.
    """
    job_title = job.get("title", "this role")
    company = job.get("company_name", "our company")
    job_skills = job.get("skills_required", []) or []

    cand_title = candidate.get("current_title", "")
    cand_years = candidate.get("years_experience")
    cand_skills = candidate.get("skills", []) or []

    overlap = match.get("skills_overlap", []) or []
    score = match.get("score")

    # Ground truth skill gaps (avoid LLM mistakes like listing SQL when candidate has SQL)
    job_set = {str(s).strip().lower() for s in job_skills if str(s).strip()}
    cand_set = {str(s).strip().lower() for s in cand_skills if str(s).strip()}
    gaps = sorted(list(job_set - cand_set))

    if not is_llm_configured():
        tech = [
            f"How would you approach learning and applying: {g}?" for g in (gaps[:3] or ["the core stack for this role"])
        ]
        tech += [
            "Walk me through a recent project where you owned the outcome end-to-end.",
            "How do you prioritize when requirements change mid-sprint?",
        ]
        behavioral = [
            "Tell me about a time you disagreed with a teammate. What was the outcome?",
            "Describe a high-pressure deadline and how you managed it.",
            "Give an example of mentoring or helping a junior colleague.",
            "Tell me about a mistake you made and what you changed afterward.",
        ]
        return {
            "skill_gaps": gaps,
            "technical_questions": tech[:5],
            "behavioral_questions": behavioral[:4],
        }

    prompt = (
        "You are an interview question generator for recruiters.\n"
        f"Job: '{job_title}' at '{company}'\n"
        f"Job required skills: {job_skills}\n"
        f"Candidate current title: {cand_title}\n"
        f"Candidate years_experience: {cand_years}\n"
        f"Candidate extracted skills: {cand_skills}\n"
        f"Matched skills (intersection): {overlap}\n"
        f"Computed skill gaps (job skills NOT in candidate skills): {gaps}\n"
        f"Match score: {score}\n\n"
        "Task:\n"
        "1) Use the provided computed skill gaps as the ONLY source of skill gaps.\n"
        "2) Generate interview questions:\n"
        "- technical_questions: 5 items (some should probe the gaps)\n"
        "- behavioral_questions: 4 items (communication, collaboration, problem solving)\n\n"
        "Return ONLY valid JSON with keys:\n"
        "{\n"
        '  "skill_gaps": ["..."],\n'
        '  "technical_questions": ["..."],\n'
        '  "behavioral_questions": ["..."]\n'
        "}\n"
        "No markdown, no explanation."
    )

    client, model = _llm_client()
    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "Return strict JSON only."},
            {"role": "user", "content": prompt},
        ],
    )
    raw = (resp.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        if len(lines) >= 3:
            raw = "\n".join(lines[1:-1]).strip()
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            # Enforce grounded skill gaps regardless of model output
            data["skill_gaps"] = gaps
            data.setdefault("technical_questions", [])
            data.setdefault("behavioral_questions", [])
            return data
    except Exception:
        # Fallback: return as text if model doesn't follow JSON strictly
        return {"skill_gaps": gaps, "technical_questions": [raw], "behavioral_questions": []}
    return {"skill_gaps": gaps, "technical_questions": [], "behavioral_questions": []}

