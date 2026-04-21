from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    kafka_bootstrap: str = "localhost:9092"
    mongo_uri: str = "mongodb://localhost:27017"
    redis_url: str = "redis://localhost:6379"

    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "llama-3.1-8b-instant"

    class Config:
        env_file = ".env"


settings = Settings()
