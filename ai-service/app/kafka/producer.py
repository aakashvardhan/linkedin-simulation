# Publish to ai.requests

import asyncio
import json
import logging

from aiokafka import AIOKafkaProducer

from app.config import settings

logger = logging.getLogger(__name__)

_producer: AIOKafkaProducer | None = None
_producer_lock = asyncio.Lock()


async def get_producer() -> AIOKafkaProducer:
    global _producer
    if _producer is not None:
        return _producer
    async with _producer_lock:
        if _producer is not None:
            return _producer
        local: AIOKafkaProducer | None = None
        try:
            local = AIOKafkaProducer(
                bootstrap_servers=settings.kafka_bootstrap,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
            await local.start()
            _producer = local
            logger.info("Kafka producer started")
            return _producer
        except Exception:
            if local is not None:
                try:
                    await local.stop()
                except Exception:
                    logger.exception("Failed to stop Kafka producer after start error")
            _producer = None
            raise


async def publish_event(topic: str, event: dict) -> None:
    producer = await get_producer()
    await producer.send_and_wait(topic, event)
    logger.info(
        "Published event to topic=%s event_type=%s", topic, event.get("event_type")
    )


async def stop_producer() -> None:
    global _producer
    if _producer is not None:
        await _producer.stop()
        _producer = None
        logger.info("Kafka producer stopped")
