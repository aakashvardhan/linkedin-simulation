const Notification = require('../models/notificationModel');
const { success, error } = require('../utils/response');

// ─── POST /notifications/get ──────────────────────────────────────────────────
// Member polls this endpoint to see their application status update notifications.
// Returns all unread notifications by default.
// This is the UI-facing side of the async flow:
//   applicationStatusChanged → Kafka → consumer → MongoDB → this endpoint → UI

exports.getNotifications = async (req, res, next) => {
  try {
    const { member_id, include_read = false, page = 1, page_size = 20 } = req.body;

    if (!member_id) {
      return error(res, 400, 400, 'Missing required field: member_id');
    }

    const offset = (Number(page) - 1) * Number(page_size);

    // Build query — by default only return unread notifications
    const query = { member_id: String(member_id) };
    if (!include_read) {
      query.read = false;
    }

    const total         = await Notification.countDocuments(query);
    const notifications = await Notification
      .find(query)
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(Number(page_size));

    return success(res, {
      member_id,
      notifications,
      total_count: total,
      page:        Number(page),
      page_size:   Number(page_size),
      total_pages: Math.ceil(total / Number(page_size)),
    });

  } catch (err) {
    next(err);
  }
};

// ─── POST /notifications/markRead ─────────────────────────────────────────────
// Mark one or all notifications as read for a member.
// Called when member opens their notifications panel in the UI.

exports.markRead = async (req, res, next) => {
  try {
    const { member_id, notification_id } = req.body;

    if (!member_id) {
      return error(res, 400, 400, 'Missing required field: member_id');
    }

    // If notification_id provided — mark just that one.
    // If not provided — mark ALL unread notifications for this member.
    const query = notification_id
      ? { _id: notification_id, member_id: String(member_id) }
      : { member_id: String(member_id), read: false };

    const result = await Notification.updateMany(query, {
      $set: { read: true, read_at: new Date() },
    });

    return success(res, {
      member_id,
      notifications_marked_read: result.modifiedCount,
      marked_at: new Date().toISOString(),
    });

  } catch (err) {
    next(err);
  }
};