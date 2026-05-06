const mongoose = require('mongoose');

// Same retry pattern as the Messaging Service.
// MongoDB may not be ready when Docker starts all containers simultaneously.
// Retrying 5 times with a 3-second gap handles that race condition gracefully.
async function connectDB() {
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

module.exports = connectDB;