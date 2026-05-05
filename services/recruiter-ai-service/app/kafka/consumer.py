import json
import logging
import uuid

from aiokafka import AIOKafkaConsumer

from app.agents.supervisor import run_hiring_workflow
from app.api.websocket import push_update
from app.config import settings
from app.kafka.producer import publish_event
from app.db.mongo import (
    add_approval,
    add_step,
    count_distinct_candidate_approvals,
    get_db,
    get_latest_result,
    get_ranked_candidate_count,
    upsert_trace,
    ensure_indexes,
)
from app.db.redis_client import claim_idempotency, get_status, set_status
from app.metrics import record_approval_action

logger = logging.getLogger(__name__)


async def _latest_approval_actions_by_candidate(trace_id: str) -> dict[str, str]:
    """
    Returns map candidate_id -> last action for that candidate on this trace.
    """
    db = await get_db()
    pipeline = [
        {"$match": {"trace_id": trace_id, "candidate_id": {"$exists": True, "$ne": ""}}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$candidate_id", "last_action": {"$first": "$action"}}},
    ]
    out: dict[str, str] = {}
    async for row in db.approvals.aggregate(pipeline):
        cid = row.get("_id")
        act = row.get("last_action")
        if cid and act:
            out[str(cid)] = str(act)
    return out


async def start_consumer() -> None:
    consumer = AIOKafkaConsumer(
        "ai.requests",
        "ai.results",
        bootstrap_servers=settings.kafka_bootstrap,
        group_id="ai-agent-group",
        auto_offset_reset="earliest",
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )

    await consumer.start()
    await ensure_indexes()
    logger.info("Kafka consumer started — listening on ai.requests + ai.results")

    try:
        async for msg in consumer:
            event = msg.value
            event_type = event.get("event_type", "")
            trace_id = event.get("trace_id", str(uuid.uuid4()))
            idem_key = event.get("idempotency_key") or trace_id

            # Idempotency guard for consumers (at-least-once safe)
            if not await claim_idempotency(msg.topic, str(idem_key)):
                logger.info(
                    "Skipping duplicate message topic=%s event_type=%s idempotency_key=%s",
                    msg.topic,
                    event_type,
                    idem_key,
                )
                continue

            if msg.topic == "ai.requests" and event_type == "ai.requested":
                logger.info("Received event_type=%s trace_id=%s", event_type, trace_id)

                payload = event.get("payload", {}) or {}
                actor_id = payload.get("actor_id") or event.get("actor_id", "")
                job = payload.get("job") or {}

                await upsert_trace(
                    trace_id=trace_id,
                    actor_id=actor_id,
                    status="queued",
                    job=job,
                )
                await set_status(trace_id, "queued")

                result = await run_hiring_workflow(payload, trace_id)

                await publish_event(
                    "ai.results",
                    {
                        "event_type": "ai.completed",
                        "trace_id": trace_id,
                        "actor_id": actor_id,
                        "entity": {"entity_type": "ai_task", "entity_id": trace_id},
                        "payload": result,
                        "idempotency_key": f"{trace_id}:ai.completed",
                    },
                )
                await push_update(trace_id, result)
                continue

            if msg.topic == "ai.results" and event_type == "ai.approval.recorded":
                payload = event.get("payload", {}) or {}
                action = payload.get("action", "")
                edited_draft = payload.get("edited_draft")
                candidate_id = (payload.get("candidate_id") or "").strip()
                actor_id = event.get("actor_id", "recruiter")

                await add_approval(
                    trace_id=trace_id,
                    actor_id=actor_id,
                    action=action,
                    edited_draft=edited_draft,
                    candidate_id=candidate_id or None,
                )
                if action in ("approve", "edit", "reject"):
                    await record_approval_action(trace_id, action, candidate_id=candidate_id or None)

                expected = await get_ranked_candidate_count(trace_id)
                approved_distinct = await count_distinct_candidate_approvals(trace_id)

                # Per-candidate approvals: keep trace "in review" until all candidates are handled.
                if expected > 0 and approved_distinct < expected:
                    await upsert_trace(trace_id=trace_id, actor_id=actor_id, status="awaiting_approval")
                    await set_status(
                        trace_id,
                        "awaiting_approval",
                        extra={
                            "requires_human_review": True,
                            "approvals_received": approved_distinct,
                            "approvals_expected": expected,
                            "last_candidate_id": candidate_id or None,
                            "last_action": action,
                        },
                    )
                    await add_step(
                        trace_id=trace_id,
                        step="candidate_approval",
                        status="recorded",
                        data={
                            "candidate_id": candidate_id or None,
                            "action": action,
                            "edited_draft": edited_draft,
                            "progress": {"received": approved_distinct, "expected": expected},
                        },
                    )
                elif expected > 0 and approved_distinct >= expected:
                    last_by_cand = await _latest_approval_actions_by_candidate(trace_id)
                    actions = list(last_by_cand.values())
                    if any(a == "reject" for a in actions):
                        final_status = "rejected"
                    elif any(a == "edit" for a in actions):
                        final_status = "edited"
                    else:
                        final_status = "approved"

                    await upsert_trace(trace_id=trace_id, actor_id=actor_id, status=final_status)
                    await set_status(
                        trace_id,
                        final_status,
                        extra={
                            "requires_human_review": False,
                            "approvals_received": approved_distinct,
                            "approvals_expected": expected,
                            "last_candidate_id": candidate_id or None,
                            "last_action": action,
                        },
                    )
                    await add_step(
                        trace_id=trace_id,
                        step="batch_approval_completed",
                        status=final_status,
                        data={
                            "candidate_actions": last_by_cand,
                            "progress": {"received": approved_distinct, "expected": expected},
                        },
                    )
                elif action == "approve":
                    await upsert_trace(trace_id=trace_id, actor_id=actor_id, status="approved")
                    await set_status(trace_id, "approved")
                    await add_step(
                        trace_id=trace_id,
                        step="approval",
                        status="approved",
                        data={"action": action, "candidate_id": candidate_id or None},
                    )
                elif action == "edit":
                    await upsert_trace(trace_id=trace_id, actor_id=actor_id, status="edited")
                    await set_status(trace_id, "edited")
                    await add_step(
                        trace_id=trace_id,
                        step="approval",
                        status="edited",
                        data={"action": action, "edited_draft": edited_draft, "candidate_id": candidate_id or None},
                    )
                elif action == "reject":
                    await upsert_trace(trace_id=trace_id, actor_id=actor_id, status="rejected")
                    await set_status(trace_id, "rejected")
                    await add_step(
                        trace_id=trace_id,
                        step="approval",
                        status="rejected",
                        data={"action": action, "candidate_id": candidate_id or None},
                    )
                else:
                    await add_step(
                        trace_id=trace_id,
                        step="approval",
                        status="failed",
                        error="Unknown approval action",
                    )

                # Push the latest persisted view to any connected UI.
                latest = await get_latest_result(trace_id)
                cached = await get_status(trace_id)
                await push_update(
                    trace_id,
                    {
                        "trace_id": trace_id,
                        "status": (cached or {}).get("status"),
                        "trace": (latest or {}).get("trace"),
                        "steps": (latest or {}).get("steps", []),
                    },
                )
                continue

            logger.debug(
                "Skipping message topic=%s event_type=%s trace_id=%s",
                msg.topic,
                event_type,
                trace_id,
            )

    except Exception as e:
        logger.error("Consumer error: %s", str(e))
    finally:
        await consumer.stop()
        logger.info("Kafka consumer stopped")
