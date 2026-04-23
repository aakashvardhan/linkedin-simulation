const { Kafka } = require('kafkajs');
const Notification = require('../models/notificationModel');

// Separate Kafka client for the consumer — independent of the producer client
// in kafka.js so they don't share connection state.
const kafka = new Kafka({
  clientId: `${process.env.KAFKA_CLIENT_ID || 'application-service'}-consumer`,
  brokers:  [process.env.KAFKA_BROKER || 'localhost:9092'],
});

const consumer = kafka.consumer({
  groupId: process.env.KAFKA_GROUP_ID || 'application-consumer-group',
});

// ─── startConsumer ────────────────────────────────────────────────────────────
// Subscribes to application.statusChanged.
// For each event: writes a Notification document to MongoDB so the member
// can poll /notifications/get and see their application status update.
//
// Idempotency: the unique index on idempotency_key at the DB level catches
// duplicates even if the pre-check races. Error code 11000 = duplicate key
// in MongoDB — silently skip, not an error.
//
// Re-throw on all other DB errors so Kafka retries the message.

async function startConsumer() {
  await consumer.connect();
  console.log('[App Consumer] Kafka consumer connected');

  // fromBeginning: false — only process new events from now on.
  // Set to true if you want to replay all historical status changes on restart.
  await consumer.subscribe({
    topic:         'application.statusChanged',
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      let envelope;

      // Step 1 — Parse Kafka message bytes
      try {
        envelope = JSON.parse(message.value.toString());
      } catch (parseErr) {
        console.error('[App Consumer] Failed to parse message:', parseErr.message);
        return; // Unrecoverable — skip malformed message
      }

      // Step 2 — Validate required fields from the standard envelope
      const { event_type, idempotency_key, payload } = envelope;

      if (!event_type || !idempotency_key || !payload) {
        console.warn('[App Consumer] Skipping malformed envelope — missing required fields');
        return;
      }

      if (event_type !== 'application.statusChanged') {
        // Defensive — should never happen since we only subscribed to this topic
        return;
      }

      const { application_id, member_id, job_id, previous_status, new_status } = payload;

      if (!application_id || !member_id || !new_status) {
        console.warn('[App Consumer] Skipping — missing payload fields:', payload);
        return;
      }

      try {
        // Step 3 — Pre-check idempotency before writing
        const exists = await Notification.findOne({ idempotency_key });
        if (exists) {
          console.log(`[App Consumer] Duplicate — skipping: ${idempotency_key}`);
          return;
        }

        // Step 4 — Write notification to MongoDB
        await Notification.create({
          member_id:       String(member_id),
          application_id:  String(application_id),
          job_id:          String(job_id || ''),
          previous_status: previous_status || '',
          new_status,
          idempotency_key,
        });

        console.log(
          `[App Consumer] Notification created — member: ${member_id} | ` +
          `application: ${application_id} | ${previous_status} → ${new_status}`
        );

      } catch (dbErr) {
        // 11000 = MongoDB duplicate key — already stored, safe to ignore
        if (dbErr.code === 11000) {
          console.log(`[App Consumer] DB-level duplicate — skipping: ${idempotency_key}`);
          return;
        }
        // All other DB errors — re-throw so Kafka retries the message
        console.error('[App Consumer] DB write failed — will retry:', dbErr.message);
        throw dbErr;
      }
    },
  });
}

// ─── stopConsumer ─────────────────────────────────────────────────────────────

async function stopConsumer() {
  try {
    await consumer.disconnect();
    console.log('[App Consumer] Kafka consumer disconnected');
  } catch (err) {
    console.error('[App Consumer] Error during disconnect:', err.message);
  }
}

module.exports = { startConsumer, stopConsumer };