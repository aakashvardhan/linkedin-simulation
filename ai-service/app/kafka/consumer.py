# Consume from ai.results + domain topics

import json
import logging
import uuid

from aiokafka import AIOKafkaConsumer

from app.agents.supervisor import run_hiring_workflow
from app.api.websocket import push_update
from app.config import settings
from app.kafka.producer import publish_event
from app.api.routes import _task_results

logger = logging.getLogger(__name__)


async def start_consumer() -> None:
    consumer = AIOKafkaConsumer(
        "ai.requests",
        bootstrap_servers=settings.kafka_bootstrap,
        group_id="ai-agent-group",
        auto_offset_reset="earliest",
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )

    await consumer.start()
    logger.info("Kafka consumer started — listening on ai.requests")

    try:
        async for msg in consumer:
            event = msg.value
            event_type = event.get("event_type", "")
            trace_id = event.get("trace_id", str(uuid.uuid4()))

            if event_type != "ai.requested":
                logger.debug("Skipping event_type=%s", event_type)
                continue

            logger.info("Received event_type=%s trace_id=%s", event_type, trace_id)

            result = await run_hiring_workflow(event.get("payload", {}), trace_id)
            _task_results[trace_id] = result
            await publish_event(
                "ai.results",
                {
                    "event_type": "ai.completed",
                    "trace_id": trace_id,
                    "actor_id": event.get("actor_id", ""),
                    "entity": event.get("entity", {}),
                    "payload": result,
                    "idempotency_key": trace_id,
                },
            )
            await push_update(trace_id, result)

    except Exception as e:
        logger.error("Consumer error: %s", str(e))
    finally:
        await consumer.stop()
        logger.info("Kafka consumer stopped")
