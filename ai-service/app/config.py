from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve `.env` next to the ai-service package root so settings load correctly
# even when uvicorn/pytest cwd is the repo root or elsewhere.
_SERVICE_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Application configuration, loaded from environment variables or .env.

    All defaults are safe for local development. Production overrides come
    from the environment (e.g. container env, docker-compose, Kubernetes).
    """

    # Infrastructure
    kafka_bootstrap: str = "localhost:9093"
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db_name: str = "ai_service"
    redis_url: str = "redis://localhost:6379"

    # LLM provider (Groq via OpenAI-compatible API)
    groq_api_key: SecretStr = SecretStr("")
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "llama-3.1-8b-instant"

    # Downstream services — base URLs only; clients own their paths.
    profile_service_url: str = "http://localhost:8001"
    job_service_url: str = "http://localhost:8002"
    messaging_service_url: str = "http://localhost:8005"

    # Timeout for outbound HTTP calls to other services (seconds).
    http_client_timeout: float = 5.0

    model_config = SettingsConfigDict(
        env_file=_SERVICE_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
