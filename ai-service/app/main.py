"""FastAPI entry point for the AI Agent Service.

Two routers live side-by-side:
- `/agent/*` (partner's recruiter-facing endpoints, `app.api.routes`)
- `/ai/*`    (candidate-facing endpoints, `app.api.candidate_routes`, including
  async Career Coach: `POST /ai/career-coach/kickoff` + HITL `POST /ai/career-coach/approve`)

Both share the Kafka producer/consumer, Mongo task store, Redis client, and
WebSocket hub.
"""

import asyncio
import logging

from fastapi import FastAPI

from app.api.candidate_routes import router as candidate_router
from app.api.routes import router
from app.api.websocket import ws_router
from app.db.mongo import close_client
from app.db.redis_client import close_redis
from app.kafka.consumer import start_consumer
from app.kafka.producer import stop_producer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(title="LinkedIn AI Agent Service")

app.include_router(router, prefix="/agent")
app.include_router(candidate_router)
app.include_router(ws_router)


@app.on_event("startup")
async def startup() -> None:
    logger.info("Starting AI Agent Service")
    asyncio.create_task(start_consumer())


@app.on_event("shutdown")
async def shutdown() -> None:
    logger.info("Shutting down AI Agent Service")
    await stop_producer()
    await close_redis()
    await close_client()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
