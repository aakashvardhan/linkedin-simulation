# FAST API entry point

import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api.websocket import ws_router
from app.db.mongo import ensure_indexes
from app.kafka.consumer import start_consumer
from app.kafka.producer import stop_producer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(title="LinkedIn AI Agent Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/agent")
app.include_router(ws_router)

async def _run_consumer_forever() -> None:
    """
    Kafka may not be reachable immediately at container startup.
    Keep retrying so tasks don't get stuck in "queued" due to a transient startup race.
    """
    backoff_s = 1
    while True:
        try:
            await start_consumer()
        except Exception as e:
            logger.error("Kafka consumer crashed; retrying in %ss error=%s", backoff_s, str(e))
            await asyncio.sleep(backoff_s)
            backoff_s = min(backoff_s * 2, 30)
        else:
            # If start_consumer ever returns cleanly, restart it after a short pause.
            backoff_s = 1
            await asyncio.sleep(1)

@app.on_event("startup")
async def startup() -> None:
    logger.info("Starting AI Agent Service")
    try:
        await ensure_indexes()
        logger.info("MongoDB ready (database linkedin_ai, indexes on traces/steps/events/approvals)")
    except Exception as e:
        logger.warning(
            "Mongo ensure_indexes failed at startup (consumer will retry): %s",
            e,
        )
    asyncio.create_task(_run_consumer_forever())


@app.on_event("shutdown")
async def shutdown() -> None:
    logger.info("Shutting down AI Agent Service")
    await stop_producer()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
