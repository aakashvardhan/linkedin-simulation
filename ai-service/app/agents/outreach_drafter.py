# Skill: generate outreach draft for human review

from openai import AsyncOpenAI

from app.config import settings

client = AsyncOpenAI(
    api_key=settings.groq_api_key,
    base_url=settings.groq_base_url,
)


async def generate_outreach(job: dict, candidate: dict, match: dict) -> dict:
    matched_skills = ", ".join(match.get("skills_overlap", []))
    job_title = job.get("title", "this role")
    company = job.get("company_name", "our company")
    candidate_name = candidate.get("current_title", "the candidate")

    prompt = (
        f"Write a short, professional recruiter outreach message for LinkedIn. "
        f"The recruiter is reaching out to a candidate whose current title is "
        f"'{candidate_name}' for the role of '{job_title}' at '{company}'. "
        f"The candidate matches on these skills: {matched_skills}. "
        f"Match score: {match.get('score', 0)}. "
        f"Keep it under 100 words. Be warm and specific. "
        f"Return ONLY the message text, no subject line, no explanation."
    )

    response = await client.chat.completions.create(
        model=settings.groq_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a professional recruiter writing outreach messages. "
                    "Write concise, personalized, and friendly LinkedIn messages. "
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
        "match_score": match.get("score"),
        "requires_human_review": True,
        "status": "pending_approval",
    }
