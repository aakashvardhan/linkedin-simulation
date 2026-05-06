const { v4: uuid } = require('uuid');
const model = require('../models/messagingModel');
const { publishEvent } = require('../config/kafka');
const { success, error } = require('../utils/response');
const { cacheGet, cacheSet, cacheDelPattern } = require('../config/redis');

// Cache TTL for threadsByUser — 30 seconds.
// Inbox is polled frequently so a short TTL keeps it fresh without hammering MongoDB.
const THREADS_TTL = 30;

// ─── Open Thread ──────────────────────────────────────────────────────────────
// Idempotent — calling with the same participants twice returns the existing
// thread with 200, not an error. Only a genuinely new thread returns 201.
// On new thread: invalidates threadsByUser cache for ALL participants so
// the new thread appears immediately in everyone's inbox.

exports.openThread = async (req, res, next) => {
  try {
    const { participants, subject } = req.body;

    if (!participants) {
      return error(res, 400, 400, 'Missing required field: participants');
    }
    if (!Array.isArray(participants) || participants.length < 2) {
      return error(res, 400, 400, 'A thread requires at least 2 participants');
    }

    const thread = await model.openThread(participants, subject || null);

    // Only invalidate cache if this is a genuinely new thread.
    // If the thread already existed, the inbox hasn't changed.
    if (thread.isNew) {
      for (const participantId of thread.participants) {
        await cacheDelPattern(`threadsByUser:${participantId}:*`);
      }
    }

    const statusCode = thread.isNew ? 201 : 200;

    return success(res, {
      thread_id:    thread.thread_id,
      participants: thread.participants,
      subject:      thread.subject,
      created_at:   thread.created_at,
    }, statusCode);

  } catch (err) {
    next(err);
  }
};

// ─── Get Thread ───────────────────────────────────────────────────────────────

exports.getThread = async (req, res, next) => {
  try {
    const { thread_id } = req.body;

    if (!thread_id) {
      return error(res, 400, 400, 'Missing required field: thread_id');
    }

    const thread = await model.getThread(thread_id);
    if (!thread) {
      return error(res, 404, 404, 'Thread not found');
    }

    return success(res, {
      thread_id:       thread.thread_id,
      participants:    thread.participants,
      subject:         thread.subject,
      last_message_at: thread.last_message_at,
      message_count:   thread.message_count,
      created_at:      thread.created_at,
    });

  } catch (err) {
    next(err);
  }
};

// ─── Threads By User ──────────────────────────────────────────────────────────
// Cache-aside pattern — check Redis first, fall through to MongoDB on miss.
// Cache key includes user_id + page + page_size so each page is cached separately.
// Cache is invalidated by sendMessage (new message changes last_message + unread)
// and markRead (unread count drops to 0 for a thread).
//
// Cache key format: threadsByUser:{user_id}:page:{page}:size:{page_size}

exports.threadsByUser = async (req, res, next) => {
  try {
    const { user_id, page = 1, page_size = 20 } = req.body;

    if (!user_id) {
      return error(res, 400, 400, 'Missing required field: user_id');
    }

    const cacheKey = `threadsByUser:${user_id}:page:${page}:size:${page_size}`;

    // 1. Check Redis cache first
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return success(res, cached);
    }

    // 2. Cache miss — query MongoDB
    const result = await model.getThreadsByUser(user_id, {
      page:      Number(page),
      page_size: Number(page_size),
    });

    // 3. Shape response to match API doc format
    const shaped = result.threads.map(t => {
      const otherParticipantId = t.participants.find(
        p => String(p) !== String(user_id)
      ) || null;

      return {
        thread_id: t.thread_id,
        subject:   t.subject,
        other_participant: {
          id:                otherParticipantId,
          // name + profile_photo_url populated by Profile Service (M3) call
          // once M3 is available — included as null until then
          name:              null,
          profile_photo_url: null,
        },
        last_message:    t.last_message    || null,
        last_message_at: t.last_message_at || null,
        unread_count:    t.unread_count,
      };
    });

    const response = {
      threads:     shaped,
      total_count: result.total_count,
      page:        result.page,
      page_size:   result.page_size,
      total_pages: result.total_pages,
    };

    // 4. Store in Redis for next request
    await cacheSet(cacheKey, response, THREADS_TTL);

    return success(res, response);

  } catch (err) {
    next(err);
  }
};

// ─── Send Message ─────────────────────────────────────────────────────────────
// Required failure mode: message send failure + retry (max 3 attempts).
// On success: invalidates threadsByUser cache for BOTH sender and receiver
// so both users' inboxes show the new message + updated unread count immediately.

const MAX_RETRIES      = 3;
const RETRY_BASE_DELAY = 200; // ms — multiplied by attempt number for backoff

exports.sendMessage = async (req, res, next) => {
  try {
    const { thread_id, sender_id, message_text, trace_id: clientTraceId } = req.body;

    // 1. Validate required fields
    if (!thread_id || !sender_id || !message_text) {
      return error(res, 400, 400, 'Missing required fields: thread_id, sender_id, message_text');
    }

    // 2. Verify thread exists
    const thread = await model.getThread(thread_id);
    if (!thread) {
      return error(res, 404, 404, 'Thread not found');
    }

    // 3. Verify sender is a participant (403 guard)
    const isParticipant = thread.participants.map(String).includes(String(sender_id));
    if (!isParticipant) {
      return error(res, 403, 403, 'Sender is not a participant of this thread');
    }

    // 4. Derive receiver_id for cache invalidation and Kafka payload
    const receiver_id = model.getReceiverFromThread(thread, sender_id);
    const trace_id    = clientTraceId || uuid();

    // 5. Send with retry loop
    let savedMessage = null;
    let lastError    = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        savedMessage = await model.sendMessage(thread_id, sender_id, message_text);
        break;
      } catch (err) {
        lastError = err;
        console.error(
          `[Messaging] sendMessage attempt ${attempt}/${MAX_RETRIES} failed:`,
          err.message
        );
        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, RETRY_BASE_DELAY * attempt)
          );
        }
      }
    }

    // 6. All retries exhausted
    if (!savedMessage) {
      return res.status(500).json({
        status: 'error',
        data:   null,
        error: {
          code:        500,
          message:     'Message delivery failed. Retrying...',
          retry_count: MAX_RETRIES,
          max_retries: MAX_RETRIES,
        },
      });
    }

    // 7. Invalidate threadsByUser cache for BOTH participants.
    // Both users' inboxes changed — new last_message preview + unread count updated.
    await cacheDelPattern(`threadsByUser:${sender_id}:*`);
    if (receiver_id) {
      await cacheDelPattern(`threadsByUser:${receiver_id}:*`);
    }

    // 8. Publish Kafka event — isolated, never throws to caller
    await publishEvent('message.sent', {
      event_type: 'message.sent',
      trace_id,
      timestamp:  new Date().toISOString(),
      actor_id:   String(sender_id),
      entity: {
        entity_type: 'message',
        entity_id:   savedMessage.message_id,
      },
      payload: {
        message_id:   savedMessage.message_id,
        thread_id,
        sender_id:    String(sender_id),
        receiver_id:  receiver_id ? String(receiver_id) : null,
        message_text,
      },
      idempotency_key: savedMessage.idempotency_key,
    });

    return success(res, {
      message_id:   savedMessage.message_id,
      thread_id:    savedMessage.thread_id,
      sender_id:    savedMessage.sender_id,
      message_text: savedMessage.message_text,
      sent_at:      savedMessage.sent_at,
    }, 201);

  } catch (err) {
    next(err);
  }
};

// ─── List Messages ────────────────────────────────────────────────────────────

exports.listMessages = async (req, res, next) => {
  try {
    const { thread_id, page = 1, page_size = 50 } = req.body;

    if (!thread_id) {
      return error(res, 400, 400, 'Missing required field: thread_id');
    }

    const thread = await model.getThread(thread_id);
    if (!thread) {
      return error(res, 404, 404, 'Thread not found');
    }

    const result = await model.listMessages(thread_id, {
      page:      Number(page),
      page_size: Number(page_size),
    });

    return success(res, result);

  } catch (err) {
    next(err);
  }
};

// ─── Mark Read ────────────────────────────────────────────────────────────────
// On success: invalidates threadsByUser cache for the calling user only.
// Their unread count just dropped — they need fresh data on next inbox load.
// The sender's cache is NOT invalidated — their view of the thread hasn't changed.

exports.markRead = async (req, res, next) => {
  try {
    const { thread_id, user_id } = req.body;

    if (!thread_id || !user_id) {
      return error(res, 400, 400, 'Missing required fields: thread_id, user_id');
    }

    const thread = await model.getThread(thread_id);
    if (!thread) {
      return error(res, 404, 404, 'Thread not found');
    }

    const isParticipant = thread.participants.map(String).includes(String(user_id));
    if (!isParticipant) {
      return error(res, 403, 403, 'User is not a participant of this thread');
    }

    const updated_count = await model.markRead(thread_id, user_id);

    // Invalidate only the reading user's inbox cache — their unread count changed
    await cacheDelPattern(`threadsByUser:${user_id}:*`);

    return success(res, {
      thread_id,
      user_id,
      messages_marked_read: updated_count,
      marked_at:            new Date().toISOString(),
    });

  } catch (err) {
    next(err);
  }
};