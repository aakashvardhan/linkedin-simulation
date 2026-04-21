# Skill: extract structured fields from resume
from openai import AsyncOpenAI
import json
from app.config import settings

client = AsyncOpenAI(
    api_key=settings.groq_api_key,
    base_url=settings.groq_base_url,
)


async def parse_resume(resume_text: str) -> dict:
    response = await client.chat.completions.create(
        model=settings.groq_model,
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

    # Strip markdown code fences if model wraps response
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1]).strip()

    return json.loads(raw)
