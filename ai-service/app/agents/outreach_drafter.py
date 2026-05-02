# Skill: generate outreach draft for human review

import logging

from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)

client = AsyncOpenAI(
    api_key=settings.groq_api_key.get_secret_value(),
    base_url=settings.groq_base_url,
)


async def generate_outreach(job: dict, candidate: dict, match: dict) -> dict:
    matched_skills = ", ".join(match.get("skills_overlap", []))
    job_title = job.get("title", "this role")
    company = job.get("company_name", "our company")
    candidate_title = candidate.get("current_title") or "current role"

    prompt = (
        f"Write a short, professional recruiter outreach message for LinkedIn. "
        f"The recruiter is reaching out to someone in the role/title "
        f"'{candidate_title}' for the position '{job_title}' at '{company}'. "
        f"The candidate matches on these skills: {matched_skills}. "
        f"Match score: {match.get('score', 0)}. "
        f"Keep it under 100 words. Be warm and specific. "
        f"Return ONLY the message text, no subject line, no explanation."
    )

    draft_text = ""
    try:
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
    except Exception as exc:
        logger.error(
            "client.chat.completions.create failed in generate_outreach: %s",
            exc,
            exc_info=True,
        )
        draft_text = ""
    else:
        choices = getattr(response, "choices", None) or []
        if not choices:
            logger.error(
                "generate_outreach: empty response.choices after client.chat.completions.create; response=%r",
                response,
            )
        else:
            msg = getattr(choices[0], "message", None)
            if msg is None:
                logger.error(
                    "generate_outreach: missing response.choices[0].message; response=%r",
                    response,
                )
            else:
                content = getattr(msg, "content", None)
                if content is None or not str(content).strip():
                    logger.error(
                        "generate_outreach: empty response.choices[0].message.content; response=%r",
                        response,
                    )
                    draft_text = ""
                else:
                    draft_text = str(content).strip()

    return {
        "draft": draft_text,
        "job_title": job_title,
        "company": company,
        "match_score": match.get("score"),
        "requires_human_review": True,
        "status": "pending_approval",
    }
