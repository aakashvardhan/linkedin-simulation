# Skill: extract structured fields from resume
from openai import AsyncOpenAI

from app.config import settings

client = AsyncOpenAI(
    api_key=settings.openrouter_api_key,
    base_url=settings.openrouter_base_url,
)


async def parse_resume(resume_text: str) -> dict:
    response = await client.chat.completions.create(
        model=settings.openrouter_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a resume parser. "
                    "Extract information from the resume "
                    "and return ONLY a JSON object with these exact keys: "
                    "skills (list of strings), "
                    "years_experience (integer), "
                    "education (list of dicts with keys: "
                    "degree, institution, year), "
                    "current_title (string). "
                    "Return JSON only. "
                    "No explanation, no markdown, no code fences."
                ),
            },
            {
                "role": "user",
                "content": resume_text,
            },
        ],
    )

    raw = response.choices[0].message.content.strip()

    import json  # noqa: PLC0415

    return json.loads(raw)
