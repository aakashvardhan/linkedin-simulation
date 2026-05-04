require('dotenv').config();
const mongoose     = require('mongoose');
const app          = require('./src/app');
const connectMongo = require('./src/config/mongoDb');
const { connectProducer, disconnectProducer } = require('./src/config/kafka');
const { startConsumer, stopConsumer }         = require('./src/consumers/applicationConsumer');

// Default port matches Dockerfile EXPOSE and API spec (8004)
const PORT = process.env.PORT || 8004;

// Startup sequence:
// 1. Connect MongoDB (consumer needs it to write notifications)
// 2. Start HTTP server (accept REST requests immediately)
// 3. Connect Kafka producer (for publishing application events)
// 4. Start Kafka consumer (listen for statusChanged events)
async function start() {
  try {
    // Step 1 — MongoDB for notifications collection
    await connectMongo();

    // Step 2 — HTTP server
    const server = app.listen(PORT, () => {
      console.log(`[Application Service] Running on port ${PORT}`);
    });

    // Step 3 — Kafka producer (non-blocking — failure logged, service continues)
    connectProducer()
      .then(() => console.log('[Kafka] Producer connected'))
      .catch((err) => console.error('[Kafka] Producer connection failed:', err.message));

    // Step 4 — Kafka consumer for application.statusChanged → notifications
    startConsumer()
      .then(() => console.log('[Kafka] Consumer started'))
      .catch((err) => console.error('[Kafka] Consumer start failed:', err.message));

    // Graceful shutdown — reverse startup order:
    // stop HTTP → stop consumer → stop producer → disconnect MongoDB
    async function shutdown(signal) {
      console.log(`[Application Service] ${signal} received — shutting down gracefully`);
      server.close(async () => {
        try {
          await stopConsumer();
        } catch (err) {
          console.error('[Kafka] Consumer disconnect error:', err.message);
        }
        try {
          await disconnectProducer();
          console.log('[Kafka] Producer disconnected');
        } catch (err) {
          console.error('[Kafka] Producer disconnect error:', err.message);
        }
        try {
          await mongoose.disconnect();
          console.log('[MongoDB] Disconnected');
        } catch (err) {
          console.error('[MongoDB] Disconnect error:', err.message);
        }
        process.exit(0);
      });
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (err) {
    console.error('[Application Service] Startup failed:', err.message);
    process.exit(1);
  }
}

start();