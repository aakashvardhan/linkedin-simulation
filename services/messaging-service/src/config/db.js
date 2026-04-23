const mongoose = require('mongoose');

// FIXED: Wrapped in try/catch with process.exit(1) on failure.
// Without this, a MongoDB startup failure silently prevents the service
// from ever binding to its port — Docker sees no crash and never restarts it.
async function connectDB() {
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 3000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('[MongoDB] Connected successfully');
      return;
    } catch (err) {
      console.error(`[MongoDB] Connection attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
      if (attempt === MAX_RETRIES) {
        console.error('[MongoDB] All retries exhausted. Exiting.');
        process.exit(1);
      }
      // Wait before retrying — gives Docker time to start MongoDB
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

module.exports = connectDB;