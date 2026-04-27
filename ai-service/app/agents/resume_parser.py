# Skill: extract structured fields from resume
import json
from typing import Any

from openai import AsyncOpenAI

from app.config import settings


def _llm_client() -> tuple[AsyncOpenAI, str]:
    # Prefer OpenRouter if configured; fall back to Groq defaults.
    if settings.openrouter_api_key and settings.openrouter_model:
        return (
            AsyncOpenAI(api_key=settings.openrouter_api_key, base_url=settings.openrouter_base_url),
            settings.openrouter_model,
        )
    return (
        AsyncOpenAI(api_key=settings.groq_api_key, base_url=settings.groq_base_url),
        settings.groq_model,
    )


def _extract_json_object(text: str) -> dict[str, Any]:
    """
    Best-effort extraction when models wrap JSON with extra text or code fences.
    """
    raw = (text or "").strip()

    # Strip markdown code fences
    if raw.startswith("```"):
        lines = raw.splitlines()
        if len(lines) >= 3:
            raw = "\n".join(lines[1:-1]).strip()

    # Fast path: already JSON
    try:
        obj = json.loads(raw)
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass

    # Find first {...} block
    start = raw.find("{")
    if start == -1:
        raise json.JSONDecodeError("No JSON object start", raw, 0)

    depth = 0
    end = None
    for i, ch in enumerate(raw[start:], start=start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    if end is None:
        raise json.JSONDecodeError("Unterminated JSON object", raw, start)

    candidate = raw[start:end]
    obj = json.loads(candidate)
    if not isinstance(obj, dict):
        raise json.JSONDecodeError("Expected JSON object", candidate, 0)
    return obj


async def parse_resume(resume_text: str) -> dict:
    client, model = _llm_client()
    sys_prompt = (
        "You are a resume parser. "
        "Extract information from the resume and return ONLY a JSON object with these exact keys: "
        "skills (list of strings), years_experience (integer), "
        "education (list of objects with keys: degree, institution, year), "
        "current_title (string). "
        "Return JSON only. No explanation. No markdown. No code fences."
    )

    # Attempt 1
    response = await client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": resume_text}],
    )
    raw = (response.choices[0].message.content or "").strip()
    try:
        return _extract_json_object(raw)
    except Exception:
        # Attempt 2: force “repair” by asking model to output valid JSON only
        repair_prompt = (
            "Fix the following so it becomes a VALID JSON object matching the required keys "
            "(skills, years_experience, education, current_title). "
            "Return JSON only.\n\n"
            f"{raw}"
        )
        response2 = await client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": repair_prompt}],
        )
        raw2 = (response2.choices[0].message.content or "").strip()
        return _extract_json_object(raw2)
