import logging
import time
from datetime import datetime

from kafka import KafkaConsumer
from pymongo.errors import DuplicateKeyError

from app.core.config import get_settings
from app.db.mongo import db, ensure_mongo_indexes

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger('consumer')
settings = get_settings()
TOPICS = ['job.viewed', 'job.saved', 'connection.requested', 'profile.viewed']


def build_consumer() -> KafkaConsumer:
    return KafkaConsumer(
        *TOPICS,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_consumer_group,
        client_id=f"{settings.kafka_client_id}-consumer",
        value_deserializer=lambda m: __import__('json').loads(m.decode('utf-8')),
        auto_offset_reset='earliest',
        enable_auto_commit=True,
    )


def main() -> None:
    ensure_mongo_indexes()
    events = db['events']

    while True:
        try:
            consumer = build_consumer()
            logger.info('Kafka consumer connected to %s', settings.kafka_bootstrap_servers)
            for message in consumer:
                envelope = message.value
                doc = {
                    'event_type': envelope.get('event_type'),
                    'trace_id': envelope.get('trace_id'),
                    'timestamp': envelope.get('timestamp'),
                    'actor_id': envelope.get('actor_id'),
                    'entity_type': (envelope.get('entity') or {}).get('entity_type'),
                    'entity_id': (envelope.get('entity') or {}).get('entity_id'),
                    'payload': envelope.get('payload') or {},
                    'idempotency_key': envelope.get('idempotency_key'),
                    'kafka_topic': message.topic,
                    'kafka_partition': message.partition,
                    'ingested_at': datetime.utcnow(),
                }
                try:
                    events.insert_one(doc)
                    logger.info('Stored event %s', doc['idempotency_key'])
                except DuplicateKeyError:
                    logger.info('Skipped duplicate event %s', doc['idempotency_key'])
        except Exception as exc:
            logger.warning('Consumer loop failed: %s', exc)
            time.sleep(5)


if __name__ == '__main__':
    main()
