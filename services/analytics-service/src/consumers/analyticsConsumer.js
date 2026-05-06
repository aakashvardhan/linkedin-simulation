const { getKafka, TOPICS } = require('../config/kafkaAdmin');
const EventLog = require('../models/eventModel');

// ── Consumer setup ────────────────────────────────────────────────────────────
// autoCommit is disabled at the consumer group level.
// We commit offsets manually AFTER a successful DB write.
//
// Why this matters for fault tolerance:
//   autoCommit: true  → offset committed on message receipt, BEFORE DB write.
//                        If consumer crashes between receipt and DB write,
//                        the message is lost — Kafka thinks it was processed.
//   autoCommit: false → offset committed only AFTER DB write succeeds.
//                        If consumer crashes before commit, Kafka redelivers
//                        the message on restart — idempotency_key prevents
//                        double-writes if the DB write already succeeded.
//
// This gives us true at-least-once delivery with idempotent processing.

const consumer = getKafka().consumer({
  groupId:              process.env.KAFKA_GROUP_ID || 'analytics-consumer-group',
  sessionTimeout:       30000,
  heartbeatInterval:    3000,
  maxBytesPerPartition: 1048576,
});

// ── Offset commit helper ──────────────────────────────────────────────────────
async function commitOffset(topic, partition, offset) {
  await consumer.commitOffsets([{
    topic,
    partition,
    offset: (BigInt(offset) + 1n).toString(),
  }]);
}

// ── Start consumer ────────────────────────────────────────────────────────────

async function startConsumer() {
  await consumer.connect();
  console.log('[Kafka Consumer] Connected');

  await consumer.subscribe({ topics: TOPICS, fromBeginning: false });

  await consumer.run({
    autoCommit: false,

    eachMessage: async ({ topic, partition, message }) => {
      let envelope;

      // Step 1 — Parse. Skip + commit unrecoverable malformed messages.
      try {
        envelope = JSON.parse(message.value.toString());
      } catch (parseErr) {
        console.error(
          `[Consumer] Failed to parse message on topic "${topic}" offset ${message.offset}:`,
          parseErr.message
        );
        await commitOffset(topic, partition, message.offset);
        return;
      }

      // Step 2 — Validate envelope fields. Skip + commit invalid messages.
      if (!envelope.event_type || !envelope.idempotency_key) {
        console.warn(
          `[Consumer] Skipping malformed envelope on "${topic}" offset ${message.offset}`
        );
        await commitOffset(topic, partition, message.offset);
        return;
      }

      try {
        // Step 3 — Idempotency check before writing.
        const exists = await EventLog.findOne({
          idempotency_key: envelope.idempotency_key,
        });

        if (exists) {
          console.log(
            `[Consumer] Duplicate — skipping and committing: ${envelope.idempotency_key}`
          );
          await commitOffset(topic, partition, message.offset);
          return;
        }

        // Step 4 — Write to MongoDB events collection.
        await EventLog.create({
          event_type:      envelope.event_type,
          trace_id:        envelope.trace_id            || null,
          timestamp:       envelope.timestamp
                             ? new Date(envelope.timestamp)
                             : new Date(),
          actor_id:        envelope.actor_id            || null,
          entity_type:     envelope.entity?.entity_type || null,
          entity_id:       envelope.entity?.entity_id   || null,
          payload:         envelope.payload              || {},
          idempotency_key: envelope.idempotency_key,
          kafka_topic:     topic,
          kafka_partition: partition,
        });

        // Step 5 — Commit ONLY after successful DB write.
        await commitOffset(topic, partition, message.offset);

        console.log(
          `[Consumer] Stored + committed: ${envelope.event_type} | ${envelope.idempotency_key}`
        );

      } catch (dbErr) {
        if (dbErr.code === 11000) {
          // DB-level duplicate — already stored, safe to commit.
          console.log(
            `[Consumer] DB-level duplicate (11000) — committing: ${envelope.idempotency_key}`
          );
          await commitOffset(topic, partition, message.offset);
          return;
        }
        // Non-duplicate error — do NOT commit, Kafka will redeliver on restart.
        console.error('[Consumer] DB write failed — NOT committing, Kafka will retry:', dbErr.message);
        throw dbErr;
      }
    },
  });
}

// ── Stop consumer ─────────────────────────────────────────────────────────────

async function stopConsumer() {
  await consumer.disconnect();
  console.log('[Kafka Consumer] Disconnected');
}

module.exports = { startConsumer, stopConsumer };