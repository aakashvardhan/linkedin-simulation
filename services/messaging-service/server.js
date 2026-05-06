require('dotenv').config();
const mongoose = require('mongoose');
const app      = require('./src/app');
const connectDB = require('./src/config/db');
const { connectProducer, disconnectProducer } = require('./src/config/kafka');

// Default port matches Dockerfile EXPOSE and API spec (8005)
const PORT = process.env.PORT || 8005;

// Start sequence: MongoDB first, then bind HTTP port, then Kafka producer.
// If MongoDB fails, connectDB() calls process.exit(1) — service will not start.
connectDB().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`[Messaging Service] Running on port ${PORT}`);
  });

  connectProducer()
    .then(() => console.log('[Kafka] Producer connected'))
    .catch((err) => console.error('[Kafka] Producer connection failed:', err.message));

  // Graceful shutdown — handles both SIGTERM (Docker stop) and SIGINT (Ctrl+C).
  // Shutdown order: stop accepting requests → disconnect Kafka → disconnect MongoDB.
  async function shutdown(signal) {
    console.log(`[Messaging Service] ${signal} received — shutting down gracefully`);
    server.close(async () => {
      try {
        await disconnectProducer();
        console.log('[Kafka] Producer disconnected');
      } catch (err) {
        console.error('[Kafka] Disconnect error:', err.message);
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
});