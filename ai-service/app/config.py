# Settings (env vars, Kafka brokers, DB URIs)

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Kafka
    kafka_bootstrap: str = "localhost:9092"

    # MongoDB
    mongo_uri: str = "mongodb://localhost:27017"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # OpenRouter (OpenAI-compatible)
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "google/gemma-4-31b-it:free"

    class Config:
        env_file = ".env"


settings = Settings()
