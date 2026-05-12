from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    kafka_bootstrap: str = "localhost:9092"
    mongo_uri: str = "mongodb://localhost:27017"
    redis_url: str = "redis://localhost:6379"

    # LLM provider settings
    # Supports either Groq (current defaults) or OpenRouter-style naming (per class doc/README).
    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "llama-3.1-8b-instant"

    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = ""

    # Skill microservice URLs (docker-compose service names by default)
    resume_parser_url: str = "http://resume-parser:8000"
    matcher_url: str = "http://matcher:8000"
    ranking_explainer_url: str = "http://ranking-explainer:8000"
    interview_questions_url: str = "http://interview-questions:8000"
    outreach_drafter_url: str = "http://outreach-drafter:8000"

    class Config:
        env_file = ".env"


settings = Settings()
