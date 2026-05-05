# Skill: extract structured fields from resume
import json
import re
from typing import Any

from openai import AsyncOpenAI
from openai import AuthenticationError as OpenAIAuthenticationError

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


def _heuristic_parse_resume(resume_text: str) -> dict[str, Any]:
    """
    Fallback parser when LLM is unavailable (missing/invalid API key, outages).
    Produces the same shape as the LLM-backed parser so downstream scoring works.
    """
    text = (resume_text or "").strip()
    lower = text.lower()

    # Lightweight skills dictionary (extend as needed)
    known_skills = [
        "python",
        "java",
        "javascript",
        "typescript",
        "react",
        "node",
        "fastapi",
        "django",
        "flask",
        "sql",
        "mysql",
        "postgres",
        "mongodb",
        "redis",
        "kafka",
        "spark",
        "aws",
        "docker",
        "kubernetes",
        "git",
        "linux",
        "ci/cd",
        "terraform",
        "airflow",
        "ml",
        "machine learning",
    ]

    found: list[str] = []
    for sk in known_skills:
        token = sk.lower()
        if token in lower:
            # Normalize labels
            if token == "machine learning":
                label = "Machine Learning"
            elif token == "ci/cd":
                label = "CI/CD"
            else:
                label = sk.upper() if sk in ("sql", "aws") else sk.title()
            if label not in found:
                found.append(label)

    # Years of experience (best-effort)
    years = 0
    m = re.search(r"(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience", lower)
    if m:
        try:
            years = int(m.group(1))
        except Exception:
            years = 0

    # Current title (best-effort from common headings or first line)
    current_title = ""
    m2 = re.search(r"(?:title|current title|role)\s*:\s*(.+)", text, flags=re.IGNORECASE)
    if m2:
        current_title = m2.group(1).strip()[:120]
    else:
        first_line = text.splitlines()[0].strip() if text else ""
        # Avoid using an email/name-only line as title
        current_title = "" if ("@" in first_line or len(first_line.split()) > 6) else first_line[:120]

    return {
        "skills": found,
        "years_experience": years,
        "education": [],
        "current_title": current_title,
        "source": "heuristic",
    }


async def parse_resume(resume_text: str) -> dict:
    # If no API key is configured at all, skip straight to heuristic parsing.
    if not ((settings.openrouter_api_key and settings.openrouter_model) or settings.groq_api_key):
        return _heuristic_parse_resume(resume_text)

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
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": resume_text}],
        )
        raw = (response.choices[0].message.content or "").strip()
    except OpenAIAuthenticationError:
        return _heuristic_parse_resume(resume_text)
    except Exception:
        # Network/transient errors → still allow scoring to proceed
        return _heuristic_parse_resume(resume_text)
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
        try:
            response2 = await client.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": repair_prompt}],
            )
            raw2 = (response2.choices[0].message.content or "").strip()
            return _extract_json_object(raw2)
        except OpenAIAuthenticationError:
            return _heuristic_parse_resume(resume_text)
        except Exception:
            return _heuristic_parse_resume(resume_text)
