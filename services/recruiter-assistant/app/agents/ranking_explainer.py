from __future__ import annotations

from openai import AsyncOpenAI

from app.config import settings


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


async def explain_ranking(job: dict, candidate: dict, match: dict) -> dict:
    """
    Explains why a candidate ranked high/low using only the extracted resume fields + match results.
    """
    job_title = job.get("title", "this role")
    company = job.get("company_name", "our company")
    job_skills = job.get("skills_required", []) or []

    cand_title = candidate.get("current_title", "")
    cand_years = candidate.get("years_experience")
    cand_skills = candidate.get("skills", []) or []

    score = match.get("score")
    semantic = match.get("semantic_score")
    overlap = match.get("skills_overlap", []) or []
    overlap_ratio = match.get("overlap_ratio")

    # Ground truth sets (avoid LLM arithmetic mistakes/contradictions)
    job_set = {str(s).strip().lower() for s in job_skills if str(s).strip()}
    cand_set = {str(s).strip().lower() for s in cand_skills if str(s).strip()}
    matched = sorted(list(job_set & cand_set))
    missing = sorted(list(job_set - cand_set))
    extras = sorted(list(cand_set - job_set))

    prompt = (
        "Create a concise bullet-point explanation for why this candidate ranked high/low.\n"
        f"Job: '{job_title}' at '{company}'\n"
        f"Job required skills (original): {job_skills}\n"
        f"Candidate extracted skills (original): {cand_skills}\n"
        f"Ground truth computed sets (use these for reasoning):\n"
        f"- matched_required_skills: {matched}\n"
        f"- missing_required_skills: {missing}\n"
        f"- extra_candidate_skills: {extras}\n"
        f"Candidate current title: {cand_title}\n"
        f"Candidate years_experience: {cand_years}\n"
        f"Match metrics: score={score}, semantic_score={semantic}, overlap_ratio={overlap_ratio}\n\n"
        "RULES:\n"
        "- Use ONLY the information provided above.\n"
        "- Do NOT invent skills, companies, degrees, or experience.\n"
        "- Do NOT contradict the computed sets (matched/missing/extra).\n"
        "- Do NOT do math like '8 of 7'.\n"
        "- Output 4-7 bullet points.\n"
        "- Mention both strengths and gaps.\n"
        "Return ONLY the bullet points."
    )

    client, model = _llm_client()
    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "You write transparent, evidence-based ranking explanations for recruiters.",
            },
            {"role": "user", "content": prompt},
        ],
    )
    text = (resp.choices[0].message.content or "").strip()

    return {
        "explanation": text,
        "score": score,
        "overlap": overlap,
        "overlap_ratio": overlap_ratio,
    }

