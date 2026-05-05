import json
import logging
import datetime
import uuid
from typing import Any

from aiokafka import AIOKafkaProducer

from app.config import settings
from app.db.mongo import add_event

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
    """
    Publish an event using the required envelope.
    Ensures timestamp + idempotency_key exist and also persists the event in Mongo.
    """
    enriched: dict[str, Any] = dict(event)
    enriched.setdefault(
        "timestamp",
        datetime.datetime.utcnow()
        .replace(tzinfo=datetime.timezone.utc)
        .isoformat(),
    )
    enriched.setdefault("trace_id", str(uuid.uuid4()))
    enriched.setdefault("idempotency_key", str(uuid.uuid4()))

    # Best-effort persistence for analytics/debugging (don't block publishing).
    try:
        await add_event(enriched)
    except Exception as e:
        logger.warning("Failed to persist event to Mongo: %s", str(e))

    producer = await get_producer()
    await producer.send_and_wait(topic, enriched)
    logger.info(
        "Published event to topic=%s event_type=%s", topic, enriched.get("event_type")
    )


async def stop_producer() -> None:
    global _producer
    if _producer is not None:
        await _producer.stop()
        _producer = None
        logger.info("Kafka producer stopped")
