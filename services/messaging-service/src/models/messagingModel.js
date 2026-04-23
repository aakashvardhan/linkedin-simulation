const mongoose = require('mongoose');
const { v4: uuid } = require('uuid');

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────
// Collection names match schema doc exactly: 'threads' and 'messages'.
// Third arg to mongoose.model() forces the collection name regardless of
// Mongoose's default pluralisation rules.

const threadSchema = new mongoose.Schema({
  thread_id:       { type: String, default: () => uuid() },
  participants:    [String],
  subject:         { type: String, default: null },
  last_message_at: { type: Date,   default: null },
  message_count:   { type: Number, default: 0 },
  created_at:      { type: Date,   default: Date.now },
  updated_at:      { type: Date,   default: Date.now },
});

// Indexes match schema doc:
// idx_thread_participants — multikey for /threads/byUser (find by participant)
// idx_thread_updated     — descending for inbox sort by most recent activity
threadSchema.index({ participants: 1 });       // idx_thread_participants
threadSchema.index({ last_message_at: -1 });   // idx_thread_updated

const messageSchema = new mongoose.Schema({
  message_id:      { type: String,  default: () => uuid() },
  thread_id:       { type: String,  required: true },
  sender_id:       { type: String,  required: true },
  message_text:    { type: String,  required: true },
  read:            { type: Boolean, default: false },
  read_at:         { type: Date,    default: null },
  idempotency_key: { type: String,  unique: true },  // ux_msg_idempotency
  sent_at:         { type: Date,    default: Date.now },
});

// Compound indexes match schema doc:
// idx_msg_thread_time — paginated list messages in a thread chronologically
// idx_msg_unread      — unread count aggregation per thread
messageSchema.index({ thread_id: 1, sent_at: 1 });            // idx_msg_thread_time
messageSchema.index({ thread_id: 1, sender_id: 1, read: 1 }); // idx_msg_unread

// Force exact collection names from schema doc
const Thread  = mongoose.model('Thread',  threadSchema,  'threads');
const Message = mongoose.model('Message', messageSchema, 'messages');

// ─── openThread ───────────────────────────────────────────────────────────────
// Idempotent — calling twice with the same participants returns the existing
// thread (isNew: false) rather than creating a duplicate or returning an error.
// Controller uses isNew to decide 201 vs 200 response code.

async function openThread(participants, subject = null) {
  if (!participants || participants.length < 2) {
    throw makeError('A thread requires at least 2 participants', 400);
  }

  // Sort participants so [1001, 2001] and [2001, 1001] map to the same thread
  const sorted = [...participants].map(String).sort();

  const existing = await Thread.findOne({
    participants: { $all: sorted, $size: sorted.length },
  });

  if (existing) {
    return { ...existing.toObject(), isNew: false };
  }

  const thread = new Thread({ participants: sorted, subject });
  const saved  = await thread.save();
  return { ...saved.toObject(), isNew: true };
}

// ─── getThread ────────────────────────────────────────────────────────────────

async function getThread(thread_id) {
  return Thread.findOne({ thread_id });
}

// ─── getThreadsByUser ─────────────────────────────────────────────────────────
// Uses a single $group aggregation for unread counts instead of N+1 queries.
// FIX: Secondary sort by updated_at so threads with last_message_at: null
//      (new empty threads) don't incorrectly float above active threads.
// FIX: Fetches last message text per thread via a single aggregation so the
//      inbox preview matches the API doc response shape.

async function getThreadsByUser(user_id, { page = 1, page_size = 20 } = {}) {
  const offset = (page - 1) * page_size;

  const total = await Thread.countDocuments({ participants: String(user_id) });

  // FIX: added updated_at as secondary sort key — handles null last_message_at
  const threads = await Thread
    .find({ participants: String(user_id) })
    .sort({ last_message_at: -1, updated_at: -1 })
    .skip(offset)
    .limit(page_size);

  if (threads.length === 0) {
    return { threads: [], total_count: total, page, page_size, total_pages: 0 };
  }

  const threadIds = threads.map(t => t.thread_id);

  // Single aggregation for all unread counts across fetched threads
  const unreadCounts = await Message.aggregate([
    {
      $match: {
        thread_id: { $in: threadIds },
        sender_id: { $ne: String(user_id) },
        read:      false,
      },
    },
    { $group: { _id: '$thread_id', count: { $sum: 1 } } },
  ]);

  const unreadMap = Object.fromEntries(
    unreadCounts.map(r => [r._id, r.count])
  );

  // FIX: Single aggregation for last message text per thread — provides the
  // inbox preview text required by the API doc response shape.
  const lastMessages = await Message.aggregate([
    { $match: { thread_id: { $in: threadIds } } },
    { $sort:  { sent_at: -1 } },
    {
      $group: {
        _id:          '$thread_id',
        message_text: { $first: '$message_text' },
        sent_at:      { $first: '$sent_at' },
      },
    },
  ]);

  const lastMessageMap = Object.fromEntries(
    lastMessages.map(r => [r._id, { text: r.message_text, sent_at: r.sent_at }])
  );

  // Enrich each thread with unread_count and last_message preview
  const enriched = threads.map(t => ({
    ...t.toObject(),
    unread_count:  unreadMap[t.thread_id]      || 0,
    last_message:  lastMessageMap[t.thread_id]?.text    || null,
    last_message_sent_at: lastMessageMap[t.thread_id]?.sent_at || null,
  }));

  return {
    threads:     enriched,
    total_count: total,
    page,
    page_size,
    total_pages: Math.ceil(total / page_size),
  };
}

// ─── sendMessage ──────────────────────────────────────────────────────────────
// idempotency_key is generated server-side using a deterministic hash so that
// retries within the same minute with identical content are safely deduplicated
// at the DB level (unique index on idempotency_key).

async function sendMessage(thread_id, sender_id, message_text) {
  // Truncate base64 of message to keep key length reasonable
  const minuteStamp     = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
  const idempotency_key = `msg-${thread_id}-${sender_id}-${Buffer.from(message_text).toString('base64').slice(0, 16)}-${minuteStamp}`;

  // Check for existing message with same key — return it directly (idempotent)
  const existing = await Message.findOne({ idempotency_key });
  if (existing) return existing;

  const message = new Message({ thread_id, sender_id, message_text, idempotency_key });
  const saved   = await message.save();

  // Update thread metadata in same operation
  await Thread.findOneAndUpdate(
    { thread_id },
    {
      last_message_at: saved.sent_at,
      updated_at:      saved.sent_at,
      $inc: { message_count: 1 },
    }
  );

  return saved;
}

// ─── listMessages ─────────────────────────────────────────────────────────────

async function listMessages(thread_id, { page = 1, page_size = 50 } = {}) {
  const offset = (page - 1) * page_size;

  const total    = await Message.countDocuments({ thread_id });
  const messages = await Message
    .find({ thread_id })
    .sort({ sent_at: 1 })
    .skip(offset)
    .limit(page_size);

  return {
    messages,
    total_count: total,
    page,
    page_size,
    total_pages: Math.ceil(total / page_size),
  };
}

// ─── markRead ─────────────────────────────────────────────────────────────────
// Marks all unread messages in a thread as read for the calling user.
// Only marks messages from OTHER participants — never the user's own messages.
// Called when a user opens a thread inbox view (clears the unread badge).

async function markRead(thread_id, user_id) {
  const result = await Message.updateMany(
    {
      thread_id,
      sender_id: { $ne: String(user_id) },
      read:      false,
    },
    {
      $set: {
        read:    true,
        read_at: new Date(),
      },
    }
  );
  return result.modifiedCount;
}

// ─── getReceiverFromThread ────────────────────────────────────────────────────
// Returns the other participant in a 2-person thread.
// Used by the controller to include receiver_id in the Kafka payload
// so M6's analytics consumer can route notification events correctly.

function getReceiverFromThread(thread, sender_id) {
  return thread.participants.find(p => String(p) !== String(sender_id)) || null;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  openThread,
  getThread,
  getThreadsByUser,
  sendMessage,
  listMessages,
  markRead,
  getReceiverFromThread,
};