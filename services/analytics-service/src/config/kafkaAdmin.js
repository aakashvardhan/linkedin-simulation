require('dotenv').config();
const { Kafka } = require('kafkajs');

const TOPICS = [
  'job.viewed',
  'job.saved',
  'application.submitted',
  'application.statusChanged',
  'message.sent',
  'connection.requested',
  'ai.requests',
  'ai.results',
  'profile.viewed',
];

function getKafka() {
  return new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'analytics-service',
    brokers:  [process.env.KAFKA_BROKER   || 'localhost:9092'],
    connectionTimeout: 10000,
    requestTimeout:    30000,
    retry: {
      initialRetryTime: 300,
      retries: 5,
    },
  });
}

async function createTopics() {
  const admin = getKafka().admin();
  try {
    await admin.connect();
    console.log('[Kafka Admin] Connected');
    const created = await admin.createTopics({
      waitForLeaders: true,
      topics: TOPICS.map((topic) => ({
        topic,
        numPartitions:     3,
        replicationFactor: 1,
      })),
    });
    if (created) {
      console.log('[Kafka Admin] All topics created:', TOPICS.join(', '));
    } else {
      console.log('[Kafka Admin] Topics already exist — skipping creation');
    }
  } catch (err) {
    console.error('[Kafka Admin] Failed to create topics:', err.message);
    throw err;
  } finally {
    await admin.disconnect();
  }
}

module.exports = { getKafka, createTopics, TOPICS };