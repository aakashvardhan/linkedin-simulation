# FAST API entry point

import asyncio
import logging

from fastapi import FastAPI

from app.api.routes import router
from app.api.websocket import ws_router
from app.kafka.consumer import start_consumer
from app.kafka.producer import stop_producer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(title="LinkedIn AI Agent Service")

app.include_router(router, prefix="/agent")
app.include_router(ws_router)


@app.on_event("startup")
async def startup() -> None:
    logger.info("Starting AI Agent Service")
    asyncio.create_task(start_consumer())


@app.on_event("shutdown")
async def shutdown() -> None:
    logger.info("Shutting down AI Agent Service")
    await stop_producer()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
