# Kafka envelope model

import datetime
import uuid

from pydantic import BaseModel


class KafkaEnvelope(BaseModel):
    event_type: str  # e.g. "ai.requested", "ai.completed"
    trace_id: str = ""  # shared across the full multi-step workflow
    timestamp: str = ""
    actor_id: str
    entity: dict
    payload: dict
    idempotency_key: str = ""

    def model_post_init(self, _):
        if not self.trace_id:
            self.trace_id = str(uuid.uuid4())
        if not self.timestamp:
            self.timestamp = datetime.datetime.utcnow().isoformat()
        if not self.idempotency_key:
            self.idempotency_key = str(uuid.uuid4())
