require('dotenv').config();
const mongoose         = require('mongoose');
const app              = require('./src/app');
const connectDB        = require('./src/config/db');
const { createTopics } = require('./src/config/kafkaAdmin');
const { startConsumer, stopConsumer } = require('./src/consumers/analyticsConsumer');

// Default port matches Dockerfile EXPOSE and API spec (8006)
const PORT = process.env.PORT || 8006;

// Startup sequence — ORDER MATTERS:
// 1. Connect to MongoDB first (consumer needs it to write events)
// 2. Create all Kafka topics (other services need them to exist before publishing)
// 3. Start the Kafka consumer (begin listening for events)
// 4. Bind the HTTP port (accept REST API requests)
async function start() {
  try {
    await connectDB();
    await createTopics();

    // Start HTTP server first — API works even if consumer is still connecting
    const server = app.listen(PORT, () => {
      console.log(`[Analytics Service] Running on port ${PORT}`);
    });

    // Start consumer in background — don't block HTTP server
    startConsumer().catch(err => {
      console.error('[Analytics Service] Consumer failed:', err.message);
    });

    // Graceful shutdown — stop in reverse startup order:
    // Consumer first (stop receiving), then MongoDB, then exit.
    async function shutdown(signal) {
      console.log(`[Analytics Service] ${signal} — shutting down`);
      server.close(async () => {
        await stopConsumer();
        await mongoose.disconnect();
        console.log('[Analytics Service] Shutdown complete');
        process.exit(0);
      });
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (err) {
    console.error('[Analytics Service] Startup failed:', err.message);
    process.exit(1);
  }
}

start();