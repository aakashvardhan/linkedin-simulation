const mongoose = require('mongoose');

// Notifications collection — written by the applicationConsumer when it reads
// application.statusChanged events from Kafka.
// Member polls GET /notifications/get to see their pending status updates.
const notificationSchema = new mongoose.Schema({
  member_id:       { type: String, required: true },  // who to notify
  application_id:  { type: String, required: true },  // which application changed
  job_id:          { type: String, required: true },  // which job it's for
  previous_status: { type: String, required: true },  // what it was before
  new_status:      { type: String, required: true },  // what it changed to
  read:            { type: Boolean, default: false }, // has the member seen it?
  read_at:         { type: Date,   default: null  },
  idempotency_key: { type: String, required: true },  // prevents duplicate notifications
  created_at:      { type: Date,   default: Date.now },
});

// UNIQUE on idempotency_key — prevents duplicate notifications if Kafka
// re-delivers the same statusChanged event (at-least-once delivery).
notificationSchema.index({ idempotency_key: 1 }, { unique: true });

// Index for member polling — "give me all unread notifications for member X"
notificationSchema.index({ member_id: 1, read: 1, created_at: -1 });

// Force exact collection name
const Notification = mongoose.model(
  'Notification',
  notificationSchema,
  'notifications'
);

module.exports = Notification;