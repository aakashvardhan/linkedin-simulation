# Skill: extract structured fields from resume
import json
import logging

from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)

client = AsyncOpenAI(
    api_key=settings.groq_api_key.get_secret_value(),
    base_url=settings.groq_base_url,
)


def _strip_code_fences(raw: str) -> str:
    if not raw.startswith("```"):
        return raw
    lines = raw.split("\n")
    if len(lines) >= 3 and lines[-1].strip() == "```":
        return "\n".join(lines[1:-1]).strip()
    return "\n".join(lines[1:]).strip()


async def parse_resume(resume_text: str) -> dict:
    try:
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
    except Exception as exc:
        logger.error("client.chat.completions.create failed in parse_resume: %s", exc, exc_info=True)
        raise RuntimeError(f"Resume parser LLM request failed: {exc}") from exc

    choices = getattr(response, "choices", None) or []
    if not choices:
        logger.error("parse_resume: empty response.choices; response=%r", response)
        raise ValueError("LLM returned no choices")
    msg = getattr(choices[0], "message", None)
    content = getattr(msg, "content", None) if msg is not None else None
    if content is None:
        logger.error(
            "parse_resume: missing response.choices[0].message.content; response=%r",
            response,
        )
        raw = ""
    else:
        raw = str(content).strip()

    raw = _strip_code_fences(raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        snippet = raw[:500] + ("..." if len(raw) > 500 else "")
        raise ValueError(f"Resume parser returned invalid JSON: {exc}; snippet={snippet!r}") from exc
