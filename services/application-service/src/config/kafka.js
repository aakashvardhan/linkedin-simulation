const { Kafka } = require('kafkajs');

// FIXED: Broker is read from environment variable, not hardcoded.
// Use KAFKA_BROKER=localhost:9092 for local dev.
// Use KAFKA_BROKER=kafka:9092 when running inside Docker Compose.
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'application-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

const producer = kafka.producer();

async function connectProducer() {
  await producer.connect();
}

async function disconnectProducer() {
  await producer.disconnect();
}

// FIXED: publishEvent wraps Kafka send in its own try/catch.
// Kafka failure is logged but NEVER crashes the HTTP response.
// The DB write already succeeded — Kafka is a side-effect only.
async function publishEvent(topic, message) {
  try {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }],
    });
  } catch (err) {
    console.error(`[Kafka] Failed to publish to topic "${topic}":`, err.message);
    // Do NOT rethrow — caller should not know Kafka failed
  }
}

module.exports = { connectProducer, disconnectProducer, publishEvent };