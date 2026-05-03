"""FastAPI entry point for the AI Agent Service.

Two routers live side-by-side:
- `/agent/*` (partner's recruiter-facing endpoints, `app.api.routes`)
- `/ai/*`    (candidate-facing endpoints from `app.api.candidate_routes`, which
  defines `APIRouter(prefix="/ai")`, so no extra `prefix=` is passed to
  `include_router`; includes async Career Coach: `POST /ai/career-coach/kickoff`
  + HITL `POST /ai/career-coach/approve`)

Both share the Kafka producer/consumer, Mongo task store, Redis client, and
WebSocket hub.
"""

import asyncio
import logging

from fastapi import FastAPI

from app.api.candidate_routes import router as candidate_router
from app.api.routes import router
from app.api.websocket import ws_router
from app.config import settings
from app.db.mongo import close_client
from app.db.redis_client import close_redis, get_redis
from app.kafka.consumer import start_consumer
from app.kafka.producer import stop_producer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger = logging.getLogger(__name__)


async def _run_kafka_consumer() -> None:
    try:
        await start_consumer()
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("Kafka consumer failed")


app = FastAPI(title="LinkedIn AI Agent Service")

app.include_router(router, prefix="/agent")
app.include_router(candidate_router)
app.include_router(ws_router)


@app.on_event("startup")
async def startup() -> None:
    logger.info("Starting AI Agent Service")
    logger.info(
        "LLM provider: base_url=%s model=%s api_key_configured=%s",
        settings.groq_base_url,
        settings.groq_model,
        bool(settings.groq_api_key.get_secret_value()),
    )
    try:
        await get_redis().ping()
        logger.info("Redis ping succeeded")
    except Exception:
        logger.exception(
            "Redis unreachable — set REDIS_URL for your runtime: "
            "redis://localhost:6379 (uvicorn on the host, Redis published on 6379) or "
            "redis://redis:6379 (ai-service container next to the redis service in Compose)"
        )
    asyncio.create_task(_run_kafka_consumer())


@app.on_event("shutdown")
async def shutdown() -> None:
    logger.info("Shutting down AI Agent Service")
    for name, fn in (
        ("stop_producer", stop_producer),
        ("close_redis", close_redis),
        ("close_client", close_client),
    ):
        try:
            await fn()
        except Exception:
            logger.exception("Shutdown step %s failed", name)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
