const mongoose = require('mongoose');

// Application Service uses BOTH MySQL (transactional data) and MongoDB
// (notifications written by the Kafka consumer).
// Same retry pattern as Messaging and Analytics services.
async function connectMongo() {
  const MAX_RETRIES    = 5;
  const RETRY_DELAY_MS = 3000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('[MongoDB] Connected successfully');
      return;
    } catch (err) {
      console.error(
        `[MongoDB] Attempt ${attempt}/${MAX_RETRIES} failed:`,
        err.message
      );
      if (attempt === MAX_RETRIES) {
        console.error('[MongoDB] All retries exhausted. Exiting.');
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

module.exports = connectMongo;