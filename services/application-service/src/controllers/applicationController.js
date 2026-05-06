const { v4: uuid } = require('uuid');
const db                 = require('../config/db');
const applicationModel = require('../models/applicationModel');
const { publishEvent } = require('../config/kafka');
const { success, error } = require('../utils/response');
const { cacheGet, cacheSet, cacheDelPattern } = require('../config/redis');

// Cache TTL for byJob results — 60 seconds is a reasonable freshness window
// for a recruiter polling their applicant list.
const BYJOB_TTL = 60;

// ─── Submit ───────────────────────────────────────────────────────────────────
// On success: invalidates all byJob cache entries for this job_id so the
// recruiter immediately sees the new applicant on their next request.

exports.submit = async (req, res, next) => {
  try {
    const { job_id, member_id, resume_url, cover_letter, trace_id: clientTraceId } = req.body;

    if (!job_id || !member_id) {
      return error(res, 400, 400, 'Missing required fields: job_id, member_id');
    }

    const trace_id = clientTraceId || uuid();

    const result = await applicationModel.submitApplication(
      job_id, member_id, resume_url, cover_letter
    );

    const { application_id, location_city, location_state, recruiter_id } = result;

    // Invalidate byJob cache for this job — new applicant just submitted
    await cacheDelPattern(`byJob:${job_id}:*`);

     //Publish to Kafka — includes geo fields for M6 geo analytics
     await publishEvent('application.submitted', {
      event_type: 'application.submitted',
      trace_id,
      timestamp:  new Date().toISOString(),
      actor_id:   String(member_id),
      entity:     { entity_type: 'application', entity_id: String(application_id) },
      payload: {
        application_id,
        job_id,
        member_id,
        recruiter_id:         recruiter_id != null ? String(recruiter_id) : null,
        resume_url:           resume_url || null,
        status:               'submitted',
        application_datetime: new Date().toISOString(),
        location_city,
        location_state,
      },
      idempotency_key: `app-submit-${job_id}-${member_id}`,});

    return success(res, {
      application_id,
      job_id,
      member_id,
      status:               'submitted',
      application_datetime: new Date().toISOString(),
    }, 201);

  } catch (err) {
    next(err);
  }
};

// ─── Get ──────────────────────────────────────────────────────────────────────

exports.get = async (req, res, next) => {
  try {
    const { application_id } = req.body;

    if (!application_id) {
      return error(res, 400, 400, 'Missing required field: application_id');
    }

    const application = await applicationModel.getApplication(application_id);

    if (!application) {
      return error(res, 404, 404, 'Application not found');
    }

    return success(res, application);
  } catch (err) {
    next(err);
  }
};

// ─── By Job ───────────────────────────────────────────────────────────────────
// FIX: Requires recruiter_id — enforces ownership check (403) in the model.
// FIX: Redis cache-aside — cache key includes all query params so different
//      pages/filters each get their own cache entry.
// Cache key format: byJob:{job_id}:recruiter:{recruiter_id}:page:{page}:size:{page_size}:status:{status}:sort:{sort_by}:{sort_order}

exports.byJob = async (req, res, next) => {
  try {
    const {
      job_id,
      recruiter_id,
      status,
      sort_by    = 'application_datetime',
      sort_order = 'desc',
      page       = 1,
      page_size  = 20,
    } = req.body;

    if (!job_id || !recruiter_id) {
      return error(res, 400, 400, 'Missing required fields: job_id, recruiter_id');
    }

    // Build deterministic cache key from all query params
    const cacheKey = `byJob:${job_id}:recruiter:${recruiter_id}:page:${page}:size:${page_size}:status:${status || 'all'}:sort:${sort_by}:${sort_order}`;

    // Cache-aside: check Redis first
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return success(res, cached);
    }

    // Cache miss — query DB
    const result = await applicationModel.getApplicationsByJob(
      job_id,
      recruiter_id,
      { page: Number(page), page_size: Number(page_size), status, sort_by, sort_order }
    );

    // Store in Redis for next request
    await cacheSet(cacheKey, result, BYJOB_TTL);

    return success(res, result);
  } catch (err) {
    next(err);
  }
};

// ─── By Member ────────────────────────────────────────────────────────────────

exports.byMember = async (req, res, next) => {
  try {
    const { member_id, status, page = 1, page_size = 20 } = req.body;

    if (!member_id) {
      return error(res, 400, 400, 'Missing required field: member_id');
    }

    const result = await applicationModel.getApplicationsByMember(member_id, {
      page:      Number(page),
      page_size: Number(page_size),
      status,
    });

    return success(res, result);
  } catch (err) {
    next(err);
  }
};

// ─── Update Status ────────────────────────────────────────────────────────────
// On success: invalidates byJob cache for the affected job_id so the recruiter
// sees the updated status immediately on their next request.

exports.updateStatus = async (req, res, next) => {
  try {
    const { application_id, recruiter_id, status, trace_id: clientTraceId } = req.body;

    if (!application_id || !recruiter_id || !status) {
      return error(res, 400, 400, 'Missing required fields: application_id, recruiter_id, status');
    }

    const trace_id = clientTraceId || uuid();

    const result = await applicationModel.updateStatus(application_id, recruiter_id, status);

    // Invalidate byJob cache for this job — status just changed
    await cacheDelPattern(`byJob:${result.job_id}:*`);

    // Publish status change event — includes member_id and job_id for M6
    await publishEvent('application.statusChanged', {
      event_type: 'application.statusChanged',
      trace_id,
      timestamp:  new Date().toISOString(),
      actor_id:   String(recruiter_id),
      entity:     { entity_type: 'application', entity_id: String(application_id) },
      payload: {
        application_id,
        member_id:       result.member_id,
        job_id:          result.job_id,
        previous_status: result.previous_status,
        new_status:      result.new_status,
      },
      idempotency_key: `app-status-${application_id}-${result.previous_status}-${result.new_status}`,
    });

    return success(res, {
      application_id,
      previous_status: result.previous_status,
      new_status:      result.new_status,
      updated_at:      new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
};

// ─── Add Note ─────────────────────────────────────────────────────────────────

exports.addNote = async (req, res, next) => {
  try {
    const { application_id, recruiter_id, note } = req.body;

    if (!application_id || !recruiter_id || !note) {
      return error(res, 400, 400, 'Missing required fields: application_id, recruiter_id, note');
    }

    await applicationModel.addNote(application_id, recruiter_id, note);

    return success(res, {
      application_id,
      recruiter_notes: note,
      updated_at:      new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
};

// ─── Benchmark helper (JMeter) — disable in production with ENABLE_BENCHMARK_HELPERS=0 ─
exports.benchmarkPair = async (req, res, next) => {
  if (process.env.ENABLE_BENCHMARK_HELPERS === '0') {
    return error(res, 404, 404, 'Not found');
  }
  try {
    const [rows] = await db.execute(
      `SELECT job_id, recruiter_id
       FROM job_postings
       WHERE status = ?
       ORDER BY job_id ASC
       LIMIT 1`,
      ['open']
    );

    if (!rows.length) {
      return error(
        res,
        503,
        503,
        'No open jobs in database. Load seed data (docker MySQL init zzz_benchmark_seed.sql or scripts/seed/seed_test_data.sql).'
      );
    }

    return success(res, {
      job_id:       rows[0].job_id,
      recruiter_id: rows[0].recruiter_id,
    });
  } catch (err) {
    next(err);
  }
};