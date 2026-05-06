import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

from kafka import KafkaProducer
from kafka.errors import KafkaError

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class KafkaEventPublisher:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._producer: KafkaProducer | None = None

    def _get_producer(self) -> KafkaProducer | None:
        if not self.settings.enable_kafka:
            return None
        if self._producer is None:
            try:
                self._producer = KafkaProducer(
                    bootstrap_servers=self.settings.kafka_bootstrap_servers,
                    client_id=self.settings.kafka_client_id,
                    value_serializer=lambda value: json.dumps(value).encode('utf-8'),
                    retries=3,
                )
            except Exception as exc:
                logger.warning('Kafka producer unavailable: %s', exc)
                self._producer = None
        return self._producer

    def publish(
        self,
        topic: str,
        actor_id: str,
        entity_type: str,
        entity_id: str,
        payload: dict,
        trace_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> bool:
        producer = self._get_producer()
        if producer is None:
            logger.info('Kafka disabled or unavailable. Skipping publish for %s.', topic)
            return False

        envelope = {
            'event_type': topic,
            'trace_id': trace_id or str(uuid4()),
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'actor_id': actor_id,
            'entity': {'entity_type': entity_type, 'entity_id': entity_id},
            'payload': payload,
            'idempotency_key': idempotency_key or str(uuid4()),
        }

        try:
            producer.send(topic, value=envelope).get(timeout=10)
            return True
        except KafkaError as exc:
            logger.warning('Kafka publish failed for topic %s: %s', topic, exc)
            return False


publisher = KafkaEventPublisher()
