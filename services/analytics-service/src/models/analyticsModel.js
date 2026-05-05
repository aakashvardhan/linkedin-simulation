const EventLog = require('./eventModel');

// ─── Helper ───────────────────────────────────────────────────────────────────

function windowStart(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ─── topJobs ──────────────────────────────────────────────────────────────────
// Powers: "Top 10 jobs by applications/views/saves" bar chart.
// Also powers "Top 5 low-traction jobs" when called with sort:'asc', limit:5.
//
// FIX: For application.submitted events, entity_id = application_id (set by M5).
//      The job_id lives in payload.job_id — so we group by that field instead.
//      For job.viewed and job.saved events, entity_id IS the job_id (set by M2),
//      so those continue to group by entity_id.

const METRIC_MAP = {
  applications: 'application.submitted',
  views:        'job.viewed',
  saves:        'job.saved',
};

async function topJobs({ metric = 'applications', window_days = 30, limit = 10, sort = 'desc' }) {
  const event_type = METRIC_MAP[metric];
  if (!event_type) {
    throw new Error(`Invalid metric: ${metric}. Use applications, views, or saves`);
  }

  // FIX: application.submitted events store job_id in payload, not entity_id.
  // job.viewed and job.saved store it directly in entity_id.
  const groupField = metric === 'applications' ? '$payload.job_id' : '$entity_id';

  const results = await EventLog.aggregate([
    {
      $match: {
        event_type,
        timestamp: { $gte: windowStart(window_days) },
      },
    },
    { $group: { _id: groupField, count: { $sum: 1 } } },
    { $sort:  { count: sort === 'asc' ? 1 : -1 } },
    { $limit: Number(limit) },
    { $project: { _id: 0, job_id: '$_id', count: 1 } },
  ]);

  return results;
}

// ─── applicationFunnel ────────────────────────────────────────────────────────
// Powers: view → save → submit funnel chart for a specific job.
// Runs all 3 counts in parallel with Promise.all() — single round-trip.
//
// FIX: Submit count was matching entity_id = job_id, but M5 sets
//      entity_id = application_id on application.submitted events.
//      The job_id is in payload.job_id — filter on that instead.
//
// views and saves are correct — M2 sets entity_id = job_id on those events.

async function applicationFunnel({ job_id, window_days = 30 }) {
  const since = windowStart(window_days);

  const [views, saves, submits] = await Promise.all([
    // job.viewed — entity_id IS job_id (published by Job Service / M2)
    EventLog.countDocuments({
      event_type:  'job.viewed',
      entity_type: 'job',
      entity_id:   String(job_id),
      timestamp:   { $gte: since },
    }),

    // job.saved — entity_id IS job_id (published by Job Service / M2)
    EventLog.countDocuments({
      event_type:  'job.saved',
      entity_type: 'job',
      entity_id:   String(job_id),
      timestamp:   { $gte: since },
    }),

    // FIX: application.submitted — entity_id = application_id, job_id is in payload
    EventLog.countDocuments({
      event_type:       'application.submitted',
      'payload.job_id': String(job_id),
      timestamp:        { $gte: since },
    }),
  ]);

  // apply_starts = saves as proxy (no separate tracking event exists)
  const apply_starts = saves;

  return {
      job_id,
      period_days: window_days,
      funnel: { views, saves, apply_starts, submits },
      conversion_rates: {
        view_to_save:          views         > 0 ? +(saves        / views).toFixed(3)        : 0,
        save_to_apply_start:   saves         > 0 ? +(apply_starts / saves).toFixed(3)        : 0,
        apply_start_to_submit: apply_starts  > 0 ? +(submits      / apply_starts).toFixed(3) : 0,
        view_to_submit:        views         > 0 ? +(submits      / views).toFixed(3)        : 0,
      },
    };
}

// ─── geoDistribution ──────────────────────────────────────────────────────────
// Powers: city/state applicant distribution chart for a selected job.
//
// FIX: Was matching entity_id = job_id, but application.submitted events have
//      entity_id = application_id. The job_id lives in payload.job_id.
//      Without this fix every geo query returned 0 results.
//
// Reads payload.location_city and payload.location_state which M5's controller
// embeds in the Kafka envelope (applicationController.js submit handler).

async function geoDistribution({ job_id, window_days = 30 }) {
  const results = await EventLog.aggregate([
    {
      $match: {
        event_type:       'application.submitted',
        'payload.job_id': String(job_id),          // FIX: was entity_id
        timestamp:        { $gte: windowStart(window_days) },
      },
    },
    {
      $group: {
        _id: {
          city:  { $ifNull: ['$payload.location_city',  'Unknown'] },
          state: { $ifNull: ['$payload.location_state', 'Unknown'] },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    {
      $project: {
        _id:   0,
        city:  '$_id.city',
        state: '$_id.state',
        count: 1,
      },
    },
  ]);

  const total = results.reduce((sum, r) => sum + r.count, 0);
  return { job_id, window_days, distribution: results, total };
}

// ─── memberProfileViews ───────────────────────────────────────────────────────
// Powers: "Profile views per day (last 30 days)" line chart on member dashboard.
// Requires M3 (Profile Service) to publish 'profile.viewed' events to Kafka
// whenever GET /members/get is called. Coordinate with M3 to emit the event.

async function memberProfileViews({ member_id, window_days = 30 }) {
  // entity_id may be stored as string or number depending on the event producer
  const idStr = String(member_id);
  const idNum = parseInt(member_id, 10);
  const results = await EventLog.aggregate([
    {
      $match: {
        event_type:  'profile.viewed',
        entity_type: 'member',
        entity_id:   { $in: [idStr, idNum] },
        timestamp:   { $gte: windowStart(window_days) },
      },
    },
    {
      $group: {
        _id:   { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
        views: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: '$_id', views: 1 } },
  ]);

  const total = results.reduce((sum, r) => sum + r.views, 0);
  return { member_id, period_days: window_days, daily: results, total };
}

// ─── savesPerDay ──────────────────────────────────────────────────────────────
// Powers: "Number of saved jobs per day/week" recruiter dashboard line chart.
// Optional recruiter_id filter — when provided, scopes to jobs owned by that
// recruiter (requires payload.recruiter_id embedded by Job Service / M2).

async function savesPerDay({ window_days = 30, recruiter_id = null }) {
  const matchStage = {
    event_type: 'job.saved',
    timestamp:  { $gte: windowStart(window_days) },
  };

  // Scope to recruiter's jobs if recruiter_id provided
  // Requires M2 to embed recruiter_id in job.saved payload
  if (recruiter_id) {
    matchStage['payload.recruiter_id'] = String(recruiter_id);
  }

  const results = await EventLog.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id:   { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: '$_id', count: 1 } },
  ]);

  return { period_days: window_days, saves_per_day: results };
}

// ─── clicksPerJob ─────────────────────────────────────────────────────────────
// Powers: "Clicks per job posting" recruiter dashboard bar chart.
// Optional recruiter_id filter — scopes to jobs owned by that recruiter.

async function clicksPerJob({ window_days = 30, limit = 20, recruiter_id = null }) {
  const matchStage = {
    event_type: 'job.viewed',
    timestamp:  { $gte: windowStart(window_days) },
  };

  if (recruiter_id) {
    matchStage['payload.recruiter_id'] = String(recruiter_id);
  }

  const results = await EventLog.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id:       '$entity_id',
        clicks:    { $sum: 1 },
        // Grab job title from payload if Job Service embedded it
        job_title: { $first: '$payload.job_title' },
      },
    },
    { $sort:  { clicks: -1 } },
    { $limit: Number(limit) },
    {
      $project: {
        _id:    0,
        job_id: '$_id',
        // Use embedded title if present, fallback to job_id label
        title:  { $ifNull: ['$job_title', { $concat: ['Job #', '$_id'] }] },
        clicks: 1,
      },
    },
  ]);

  return { period_days: window_days, clicks_per_job: results };
}

// ─── recruiterTopJobs ─────────────────────────────────────────────────────────
// Powers: "Top 10 jobs by applications per month" AND "Top 5 low-traction jobs"
// charts on the recruiter dashboard — both driven by this single function with
// different sort/limit arguments.
//
// Filters application.submitted events by payload.recruiter_id so each recruiter
// only sees their own jobs. Requires M4 (Application Service) to embed
// recruiter_id in the application.submitted Kafka payload.
//
// sort: 'desc' → top 10 by most applications (bar/pie chart)
// sort: 'asc'  → bottom 5 by fewest applications (low-traction chart)

async function recruiterTopJobs({
  recruiter_id  = null,
  window_days   = 30,
  limit         = 10,
  sort          = 'desc',
}) {
  const matchStage = {
    event_type: 'application.submitted',
    timestamp:  { $gte: windowStart(window_days) },
  };

  // Scope to this recruiter's jobs when recruiter_id is provided.
  // Falls back to global if omitted (useful for admin views).
  if (recruiter_id) {
    matchStage['payload.recruiter_id'] = String(recruiter_id);
  }

  const results = await EventLog.aggregate([
    { $match: matchStage },
    // Group by job_id — application.submitted stores job_id in payload (not entity_id)
    { $group: { _id: '$payload.job_id', application_count: { $sum: 1 } } },
    { $sort:  { application_count: sort === 'asc' ? 1 : -1 } },
    { $limit: Number(limit) },
    { $project: { _id: 0, job_id: '$_id', application_count: 1 } },
  ]);

  return results;
}

// ─── recruiterGeoSummary ──────────────────────────────────────────────────────
// Powers: "City-wise applications per month" chart on the recruiter dashboard.
//
// Unlike /analytics/geo (which is per-job), this aggregates across ALL of a
// recruiter's jobs — giving a portfolio-level geographic view. The UI can
// call /analytics/geo with a specific job_id for per-job breakdown.
//
// Requires M4 to embed recruiter_id, location_city, and location_state in the
// application.submitted Kafka payload.

async function recruiterGeoSummary({ recruiter_id = null, window_days = 30 }) {
  const matchStage = {
    event_type: 'application.submitted',
    timestamp:  { $gte: windowStart(window_days) },
  };

  if (recruiter_id) {
    matchStage['payload.recruiter_id'] = String(recruiter_id);
  }

  const results = await EventLog.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          city:  { $ifNull: ['$payload.location_city',  'Unknown'] },
          state: { $ifNull: ['$payload.location_state', 'Unknown'] },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    {
      $project: {
        _id:   0,
        city:  '$_id.city',
        state: '$_id.state',
        count: 1,
      },
    },
  ]);

  const total = results.reduce((sum, r) => sum + r.count, 0);
  return { window_days, distribution: results, total };
}

module.exports = {
  topJobs,
  applicationFunnel,
  geoDistribution,
  memberProfileViews,
  savesPerDay,
  clicksPerJob,
  recruiterTopJobs,
  recruiterGeoSummary,
};