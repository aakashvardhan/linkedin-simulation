# Skill: generate outreach draft for human review

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


async def generate_outreach(job: dict, candidate: dict, match: dict) -> dict:
    overlap_list = match.get("skills_overlap", []) or []
    matched_skills = ", ".join(overlap_list)
    job_title = job.get("title", "this role")
    company = job.get("company_name", "our company")
    candidate_name = candidate.get("current_title", "the candidate")
    candidate_skills = candidate.get("skills", []) or []
    job_skills = job.get("skills_required", []) or []
    score = float(match.get("score", 0) or 0)

    # If overlap is empty or score is very low, avoid "false positive" outreach.
    low_match = (len(overlap_list) == 0) or (score < 0.25)

    hiring_company = company
    if low_match:
        prompt = (
            "Write a short, professional LinkedIn message for a recruiter.\n"
            f"Role: '{job_title}' at '{hiring_company}'. Candidate current title: '{candidate_name}'.\n"
            f"Candidate extracted skills: {candidate_skills}\n"
            f"Job required skills: {job_skills}\n"
            f"Match score: {score}\n\n"
            "IMPORTANT RULES:\n"
            "- Do NOT claim the candidate has any skill not listed under 'Candidate extracted skills'.\n"
            "- If the match is weak, be transparent and ask a neutral clarification question about relevant experience/interest.\n"
            "- Do NOT suggest specific skills (e.g., Python/Kafka). Keep it general.\n"
            "- Do NOT assume the candidate's employer/company. We do NOT know where they work.\n"
            "- Keep it under 90 words.\n"
            "Return ONLY the message text."
        )
    else:
        prompt = (
            "Write a short, professional recruiter outreach message for LinkedIn.\n"
            f"Candidate current title: '{candidate_name}'. Role: '{job_title}' at '{hiring_company}'.\n"
            f"Candidate extracted skills: {candidate_skills}\n"
            f"Matched skills (intersection): {overlap_list}\n"
            f"Match score: {score}\n\n"
            "IMPORTANT RULES:\n"
            "- Only mention skills that appear in 'Candidate extracted skills' (no hallucinations).\n"
            "- Do NOT state or imply the candidate works at the hiring company. We do NOT know their employer.\n"
            "- Avoid phrases like 'your work at <company>' unless the employer is explicitly provided (it is not).\n"
            "- Keep it under 100 words. Be warm and specific.\n"
            "Return ONLY the message text."
        )

    client, model = _llm_client()
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a professional recruiter writing outreach messages. "
                    "Write concise, personalized, and friendly LinkedIn messages. "
                    "Never assume the candidate's employer/company unless explicitly provided. "
                    "Return only the message text with no extra commentary."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
    )

    draft_text = response.choices[0].message.content.strip()

    return {
        "draft": draft_text,
        "job_title": job_title,
        "company": company,
        "match_score": score,
        "match_tier": "low" if low_match else "good",
        "requires_human_review": True,
        "status": "pending_approval",
    }
