const EventLog           = require('../models/eventModel');
const analytics          = require('../models/analyticsModel');
const { success, error } = require('../utils/response');

// ─── POST /events/ingest ──────────────────────────────────────────────────────
// Manual HTTP fallback for event ingestion — same idempotency check as consumer.
// Returns 202 Accepted — receipt acknowledged, data is stored.
// Returns 409 if the event was already processed (idempotency_key exists).

exports.ingest = async (req, res, next) => {
  try {
    const {
      event_type, trace_id, timestamp, actor_id,
      entity, payload, idempotency_key,
    } = req.body;

    if (!event_type || !idempotency_key) {
      return error(res, 400, 400, 'Missing required fields: event_type, idempotency_key');
    }

    const exists = await EventLog.findOne({ idempotency_key });
    if (exists) {
      return success(res, { event_id: exists._id, acknowledged: true }, 202);
    }

    const doc = await EventLog.create({
      event_type,
      trace_id:        trace_id  || null,
      timestamp:       timestamp ? new Date(timestamp) : new Date(),
      actor_id:        actor_id  || null,
      entity_type:     entity?.entity_type || null,
      entity_id:       entity?.entity_id   || null,
      payload:         payload   || {},
      idempotency_key,
      kafka_topic:     'direct-ingest',
      kafka_partition: null,
    });

    return success(res, { event_id: doc._id, acknowledged: true }, 202);
  } catch (err) {
    next(err);
  }
};

// ─── POST /analytics/jobs/top ─────────────────────────────────────────────────
// metric:      "applications" | "views" | "saves"
// sort:        "desc" for top 10 (default) | "asc" for bottom 5 low-traction
// window_days: how many days back to look (default 30)
// limit:       how many results to return (default 10)
// Drives both "Top 10 jobs by applications" AND "Top 5 low-traction jobs" charts.

exports.topJobs = async (req, res, next) => {
  try {
    const {
      metric      = 'applications',
      window_days,
      period,
      year,
      month,
      limit       = 10,
      sort        = 'desc',
      sort_order,
    } = req.body;

    // Accept both window_days (your format) and period/year/month (API doc format)
    let days = Number(window_days || 30);
    if (year && month) {
      const start = new Date(year, month - 1, 1);
      const end   = new Date(year, month, 1);
      days = Math.ceil((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
    }
    const effectiveSort = sort_order || sort || 'desc';

    if (days < 1 || days > 365) {
      return error(res, 400, 400, 'window_days must be between 1 and 365');
    }
    if (!['asc', 'desc'].includes(effectiveSort)) {
      return error(res, 400, 400, 'Invalid sort. Use: asc, desc');
    }

    const results = await analytics.topJobs({
      metric,
      window_days: days,
      limit:       Number(limit),
      sort:        effectiveSort,
    });

    const period_label = (year && month)
      ? `${year}-${String(month).padStart(2, '0')}`
      : `last_${days}_days`;

    return success(res, { metric, period: period_label, sort: effectiveSort, jobs: results });
  } catch (err) {
    next(err);
  }
};

// ─── POST /analytics/funnel ───────────────────────────────────────────────────
// Returns view → save → submit funnel for a specific job.

exports.funnel = async (req, res, next) => {
  try {
    const { job_id, window_days = 30 } = req.body;

    if (!job_id) {
      return error(res, 400, 400, 'Missing required field: job_id');
    }
    if (Number(window_days) < 1 || Number(window_days) > 365) {
      return error(res, 400, 400, 'window_days must be between 1 and 365');
    }

    const result = await analytics.applicationFunnel({
      job_id,
      window_days: Number(window_days),
    });

    return success(res, result);
  } catch (err) {
    next(err);
  }
};

// ─── POST /analytics/geo ──────────────────────────────────────────────────────
// Returns city/state applicant distribution for a specific job.
// Requires M5 to embed location_city/location_state in the Kafka payload.

exports.geo = async (req, res, next) => {
  try {
    const { job_id, window_days = 30 } = req.body;

    if (!job_id) {
      return error(res, 400, 400, 'Missing required field: job_id');
    }

    const result = await analytics.geoDistribution({
      job_id,
      window_days: Number(window_days),
    });

    return success(res, result);
  } catch (err) {
    next(err);
  }
};

// ─── POST /analytics/member/dashboard ────────────────────────────────────────
// Returns profile views (last 30 days) + application status breakdown.
//
// FIX: Status aggregation correctly handles both event types:
//   - application.submitted:     actor_id = member_id, payload.status = 'submitted'
//   - application.statusChanged: actor_id = recruiter_id, payload.member_id = member_id
//
// FIX: Added fallback bucket 'other' for any unrecognised status values so
//      the count is never silently dropped.

exports.memberDashboard = async (req, res, next) => {
  try {
    const { member_id } = req.body;

    if (!member_id) {
      return error(res, 400, 400, 'Missing required field: member_id');
    }

    const [profileViews, statusDocs] = await Promise.all([
      analytics.memberProfileViews({ member_id, window_days: 30 }),

      // Correct $or covers both event types:
      // - application.submitted events:    actor_id = member_id
      // - application.statusChanged events: payload.member_id = member_id
      EventLog.aggregate([
        {
          $match: {
            event_type: { $in: ['application.submitted', 'application.statusChanged'] },
            $or: [
              { actor_id:            String(member_id) },
              { 'payload.member_id': String(member_id) },
            ],
          },
        },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            // Use job_id+member_id composite key as fallback when application_id is null
            // This prevents all null-id apps collapsing into one group
            _id: {
              $cond: {
                if:   { $ifNull: ['$payload.application_id', false] },
                then: { $toString: '$payload.application_id' },
                else: { $concat: ['job-', { $toString: '$payload.job_id' }, '-mem-', { $toString: '$payload.member_id' }] },
              },
            },
            latest_event:     { $first: '$event_type' },
            new_status:       { $first: '$payload.new_status' },
            submitted_status: { $first: '$payload.status' },
          },
        },
      ]),
    ]);

    // Build status breakdown — handle both payload shapes with fallback
    const KNOWN_STATUSES = ['submitted', 'reviewing', 'interview', 'offer', 'rejected'];
    const statusCounts = {
      submitted: 0,
      reviewing: 0,
      interview: 0,
      offer:     0,
      rejected:  0,
      other:     0,  // FIX: catches any unrecognised status values
    };

    statusDocs.forEach((doc) => {
      // new_status comes from statusChanged events; submitted_status from submit events
      const st = doc.new_status || doc.submitted_status || 'submitted';
      if (KNOWN_STATUSES.includes(st)) {
        statusCounts[st]++;
      } else {
        statusCounts.other++;
      }
    });

    return success(res, {
      member_id,
      profile_views:      profileViews,
      application_status: {
        ...statusCounts,
        total: statusDocs.length,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /analytics/recruiter/dashboard ──────────────────────────────────────
// Returns ALL five required recruiter dashboard graphs in one response (§8.1):
//
//   Graph 1 → top_jobs_by_applications  : Top 10 jobs ranked by application count
//   Graph 2 → geo_summary               : City/state distribution of applicants
//                                          across all recruiter's jobs (portfolio view)
//                                          For per-job geo breakdown, call /analytics/geo
//   Graph 3 → low_traction_jobs         : Bottom 5 jobs by application count
//   Graph 4 → clicks_per_job            : View (click) count per job posting
//   Graph 5 → saves_per_day             : Saves trend over the selected window
//
// All 5 queries run in parallel via Promise.all — single MongoDB round-trip.
//
// Scoping: when recruiter_id is provided every query filters to that recruiter's
// jobs only (via payload.recruiter_id embedded by the producing services).
// Requires M2 (Job Service) to embed recruiter_id in job.viewed / job.saved payloads.
// Requires M4 (Application Service) to embed recruiter_id in application.submitted payload.

exports.recruiterDashboard = async (req, res, next) => {
  try {
    const {
      recruiter_id,
      window_days,
      year,
      month,
    } = req.body;

    let days = Number(window_days || 30);
    if (year && month) {
      const start = new Date(year, month - 1, 1);
      days = Math.ceil((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
    }

    if (days < 1 || days > 365) {
      return error(res, 400, 400, 'window_days must be between 1 and 365');
    }

    const period_label = (year && month)
      ? `${year}-${String(month).padStart(2, '0')}`
      : `last_${days}_days`;

    const scope = { window_days: days, recruiter_id: recruiter_id || null };

    // All 5 queries fire in parallel — no sequential blocking.
    const [
      savesData,
      clicksData,
      topJobsData,
      lowTractionData,
      geoData,
    ] = await Promise.all([
      // Graph 5 — saves per day line chart
      analytics.savesPerDay(scope),

      // Graph 4 — clicks (views) per job bar chart
      analytics.clicksPerJob(scope),

      // Graph 1 — top 10 jobs by applications (desc)
      analytics.recruiterTopJobs({ ...scope, limit: 10, sort: 'desc' }),

      // Graph 3 — bottom 5 jobs by applications (asc = fewest first)
      analytics.recruiterTopJobs({ ...scope, limit: 5, sort: 'asc' }),

      // Graph 2 — city/state applicant distribution across all recruiter's jobs
      analytics.recruiterGeoSummary(scope),
    ]);

    return success(res, {
      recruiter_id:             recruiter_id || null,
      period:                   period_label,
      window_days:              days,
      top_jobs_by_applications: topJobsData,
      geo_summary:              geoData,
      low_traction_jobs:        lowTractionData,
      clicks_per_job:           clicksData.clicks_per_job,
      saves_per_day:            savesData.saves_per_day,
    });
  } catch (err) {
    next(err);
  }
};