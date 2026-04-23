const { Kafka } = require('kafkajs');

// FIXED: Broker from environment variable — not hardcoded.
// localhost:9092 for local dev, kafka:9092 inside Docker Compose.
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'messaging-service',
  brokers:  [process.env.KAFKA_BROKER   || 'localhost:9092'],
});

const producer = kafka.producer();

async function connectProducer() {
  await producer.connect();
}

async function disconnectProducer() {
  await producer.disconnect();
}

// FIXED: publishEvent has its own try/catch.
// Kafka failure is logged but NEVER throws to the caller.
// Message is already saved in MongoDB — Kafka is analytics side-effect only.
async function publishEvent(topic, message) {
  try {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }],
    });
  } catch (err) {
    console.error(`[Kafka] Failed to publish to topic "${topic}":`, err.message);
    // Do NOT rethrow
  }
}

module.exports = { connectProducer, disconnectProducer, publishEvent };