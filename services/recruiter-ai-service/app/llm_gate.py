"""Shared check for Groq / OpenRouter configuration."""

from app.config import settings


def is_llm_configured() -> bool:
    if (settings.openrouter_api_key or "").strip() and (settings.openrouter_model or "").strip():
        return True
    return bool((settings.groq_api_key or "").strip())
