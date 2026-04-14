# Publish to ai.requests

import json
import logging

from aiokafka import AIOKafkaProducer

from app.config import settings

logger = logging.getLogger(__name__)

_producer = None


async def get_producer() -> AIOKafkaProducer:
    global _producer
    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_bootstrap,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        )
        await _producer.start()
        logger.info("Kafka producer started")
    return _producer


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
