/**
 * seed_analytics.js
 * -----------------
 * Seeds MySQL applications table + MongoDB events collection
 * for M5/M6 analytics verification.
 *
 * Strategy:
 *   1. Read real member_ids, job_ids, recruiter_ids from MySQL
 *   2. Insert missing applications into MySQL up to TARGET_APPS
 *   3. Generate MongoDB events for all 7 required analytics graphs:
 *        Graph 1 — top_jobs_by_applications   → application.submitted events
 *        Graph 2 — geo_summary                → application.submitted with location
 *        Graph 3 — low_traction_jobs          → application.submitted (sparse jobs)
 *        Graph 4 — clicks_per_job             → job.viewed events
 *        Graph 5 — saves_per_day              → job.saved events
 *        Graph 6 — profile_views_per_day      → profile.viewed events
 *        Graph 7 — application_status_breakdown → application.statusChanged events
 *
 * Usage:
 *   node seed_analytics.js
 *
 * Environment variables (same as your services):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME  (MySQL)
 *   MONGO_URI                                         (MongoDB)
 */

require('dotenv').config();
const mysql   = require('mysql2/promise');
const mongoose = require('mongoose');
const { v4: uuid } = require('uuid');

// ─── Config ───────────────────────────────────────────────────────────────────

const TARGET_APPS         = 10000;  // Total applications to reach in MySQL
const EVENTS_PER_APP      = 3;      // avg events generated per application
const VIEWS_PER_JOB       = 150;    // job.viewed events per job
const SAVES_PER_JOB       = 40;     // job.saved events per job
const PROFILE_VIEWS       = 2000;   // profile.viewed events total
const WINDOW_DAYS         = 60;     // spread events over last 60 days

// US cities for realistic geo distribution
const CITIES = [
  { city: 'San Francisco', state: 'CA' },
  { city: 'New York',      state: 'NY' },
  { city: 'Seattle',       state: 'WA' },
  { city: 'Austin',        state: 'TX' },
  { city: 'Chicago',       state: 'IL' },
  { city: 'Boston',        state: 'MA' },
  { city: 'Denver',        state: 'CO' },
  { city: 'Atlanta',       state: 'GA' },
  { city: 'Los Angeles',   state: 'CA' },
  { city: 'Miami',         state: 'FL' },
];

const STATUSES = ['submitted', 'reviewing', 'interview', 'offer', 'rejected'];

// Status transition weights — most stay submitted, some progress
const STATUS_WEIGHTS = [0.35, 0.25, 0.20, 0.05, 0.15];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Random timestamp within the last N days
function randomTimestamp(daysBack = WINDOW_DAYS) {
  const now  = Date.now();
  const from = now - daysBack * 24 * 60 * 60 * 1000;
  return new Date(from + Math.random() * (now - from));
}

// Weighted random status selection
function randomStatus() {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < STATUSES.length; i++) {
    cumulative += STATUS_WEIGHTS[i];
    if (r < cumulative) return STATUSES[i];
  }
  return 'submitted';
}

// Build idempotency key — deterministic so re-runs don't duplicate
function ikey(...parts) {
  return parts.join('-');
}

// ─── MongoDB Event Schema (minimal — matches eventModel.js) ──────────────────

const eventSchema = new mongoose.Schema({
  event_type:      { type: String, required: true },
  trace_id:        { type: String, default: null },
  timestamp:       { type: Date,   required: true },
  actor_id:        { type: String, default: null },
  entity_type:     { type: String, default: null },
  entity_id:       { type: String, default: null },
  payload:         { type: mongoose.Schema.Types.Mixed, default: {} },
  idempotency_key: { type: String, required: true },
  kafka_topic:     { type: String, default: 'seed' },
  kafka_partition: { type: Number, default: null },
  ingested_at:     { type: Date,   default: Date.now },
});
eventSchema.index({ idempotency_key: 1 }, { unique: true });

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Analytics Seed Script ===\n');

  // ── 1. Connect to MySQL ────────────────────────────────────────────────────
  console.log('[1/6] Connecting to MySQL...');
  const db = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3307'),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || 'linkedin_pass',
    database: process.env.DB_NAME     || 'linkedin_simulation',
  });
  console.log('      MySQL connected\n');

  // ── 2. Read real IDs from MySQL ────────────────────────────────────────────
  console.log('[2/6] Reading existing data from MySQL...');

  const [members]    = await db.query('SELECT member_id FROM members LIMIT 5000');
  const [jobs]       = await db.query(
    'SELECT job_id, recruiter_id FROM job_postings WHERE status = "open" LIMIT 500'
  );
  const [allJobs]    = await db.query(
    'SELECT job_id, recruiter_id FROM job_postings LIMIT 500'
  );
  const [existingApps] = await db.query(
    'SELECT job_id, member_id FROM applications'
  );

  if (members.length === 0) {
    console.error('      ERROR: No members found in MySQL. M3/M4 must seed members first.');
    process.exit(1);
  }
  if (allJobs.length === 0) {
    console.error('      ERROR: No job_postings found in MySQL. M2 must seed jobs first.');
    process.exit(1);
  }

  console.log(`      Found ${members.length} members`);
  console.log(`      Found ${allJobs.length} job postings (${jobs.length} open)`);
  console.log(`      Found ${existingApps.length} existing applications\n`);

  // Build a Set of existing (job_id, member_id) pairs to avoid 409 duplicates
  const existingSet = new Set(existingApps.map(r => `${r.job_id}-${r.member_id}`));

  const memberIds    = members.map(r => r.member_id);
  const openJobIds   = jobs.length > 0 ? jobs : allJobs;  // fallback to all jobs
  const allJobIds    = allJobs;

  // ── 3. Seed MySQL applications ────────────────────────────────────────────
  const appsNeeded = Math.max(0, TARGET_APPS - existingApps.length);
  console.log(`[3/6] Seeding MySQL applications (need ${appsNeeded} more to reach ${TARGET_APPS})...`);

  let appsInserted = 0;
  const insertedApps = [];  // track for event generation

  if (appsNeeded > 0) {
    const batchSize = 500;
    let attempts    = 0;
    const maxAttempts = appsNeeded * 3;

    while (appsInserted < appsNeeded && attempts < maxAttempts) {
      attempts++;
      const job    = randomItem(openJobIds);
      const member = randomItem(memberIds);
      const key    = `${job.job_id}-${member}`;

      if (existingSet.has(key)) continue;
      existingSet.add(key);

      const geo    = randomItem(CITIES);
      const status = randomStatus();
      const appTs  = randomTimestamp();

      try {
        const [result] = await db.query(
          `INSERT INTO applications
             (job_id, member_id, resume_url, status, application_datetime, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            job.job_id,
            member,
            `https://example.com/resumes/member_${member}.pdf`,
            status,
            appTs,
            appTs,
          ]
        );

        insertedApps.push({
          application_id: result.insertId,
          job_id:         job.job_id,
          member_id:      member,
          recruiter_id:   job.recruiter_id,
          status,
          timestamp:      appTs,
          city:           geo.city,
          state:          geo.state,
        });

        appsInserted++;

        if (appsInserted % 1000 === 0) {
          console.log(`      Inserted ${appsInserted}/${appsNeeded} applications...`);
        }
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') continue;  // race — skip
        throw err;
      }
    }
    console.log(`      Done — inserted ${appsInserted} applications\n`);
  } else {
    console.log('      Already at target — no MySQL inserts needed\n');
  }

  // ── 4. Connect to MongoDB ──────────────────────────────────────────────────
  console.log('[4/6] Connecting to MongoDB...');
  await mongoose.connect(
    process.env.MONGO_URI || 'mongodb://localhost:27017/linkedin_simulation'
  );
  console.log('      MongoDB connected\n');

  const EventLog = mongoose.model('EventLog', eventSchema, 'events');

  // ── 5. Build all event documents ───────────────────────────────────────────
  console.log('[5/6] Generating MongoDB events...');

  const allApps = [
    // Re-read existing apps from MySQL for event generation
    ...existingApps.map(r => ({
      application_id: null,   // not needed for events
      job_id:         r.job_id,
      member_id:      r.member_id,
      recruiter_id:   (allJobIds.find(j => j.job_id === r.job_id) || {}).recruiter_id || 1,
      status:         randomStatus(),
      timestamp:      randomTimestamp(),
      city:           randomItem(CITIES).city,
      state:          randomItem(CITIES).state,
    })),
    ...insertedApps,
  ];

  const eventDocs = [];

  // ── Graph 1 + 2 + 3: application.submitted events ─────────────────────────
  // One event per application — includes geo for Graph 2, recruiter_id for scoping
  console.log(`      Building application.submitted events (${allApps.length})...`);
  for (const app of allApps) {
    eventDocs.push({
      event_type:  'application.submitted',
      trace_id:    uuid(),
      timestamp:   app.timestamp,
      actor_id:    String(app.member_id),
      entity_type: 'application',
      entity_id:   String(app.application_id || `legacy-${app.job_id}-${app.member_id}`),
      payload: {
        application_id: app.application_id,
        job_id:         String(app.job_id),
        member_id:      String(app.member_id),
        recruiter_id:   String(app.recruiter_id),
        status:         'submitted',
        location_city:  app.city,
        location_state: app.state,
      },
      idempotency_key: ikey('app-submitted', app.job_id, app.member_id),
    });
  }

  // ── Graph 7: application.statusChanged events ──────────────────────────────
  // Generate status changes for ~60% of applications
  console.log('      Building application.statusChanged events...');
  const appsWithChanges = allApps.filter(() => Math.random() < 0.6);
  for (const app of appsWithChanges) {
    const newStatus = randomStatus();
    if (newStatus === 'submitted') continue; // no change from initial

    const changeTs = new Date(app.timestamp.getTime() + randomInt(1, 5) * 24 * 60 * 60 * 1000);
    eventDocs.push({
      event_type:  'application.statusChanged',
      trace_id:    uuid(),
      timestamp:   changeTs,
      actor_id:    String(app.recruiter_id),
      entity_type: 'application',
      entity_id:   String(app.application_id || `legacy-${app.job_id}-${app.member_id}`),
      payload: {
        application_id:  app.application_id,
        member_id:       String(app.member_id),
        job_id:          String(app.job_id),
        recruiter_id:    String(app.recruiter_id),
        previous_status: 'submitted',
        new_status:      newStatus,
      },
      idempotency_key: ikey('app-status', app.job_id, app.member_id, newStatus),
    });
  }

  // ── Graph 4: job.viewed events ────────────────────────────────────────────
  // VIEWS_PER_JOB views per job, spread across random members and dates
  console.log(`      Building job.viewed events (${allJobIds.length} jobs × ~${VIEWS_PER_JOB} views)...`);
  for (const job of allJobIds) {
    const viewCount = randomInt(Math.floor(VIEWS_PER_JOB * 0.5), VIEWS_PER_JOB * 2);
    for (let v = 0; v < viewCount; v++) {
      const viewer = randomItem(memberIds);
      const viewTs = randomTimestamp();
      // Bucket to minute to make idempotency_key deterministic but not per-second
      const minute = Math.floor(viewTs.getTime() / 60000);
      eventDocs.push({
        event_type:  'job.viewed',
        trace_id:    null,
        timestamp:   viewTs,
        actor_id:    String(viewer),
        entity_type: 'job',
        entity_id:   String(job.job_id),
        payload: {
          job_id:       String(job.job_id),
          recruiter_id: String(job.recruiter_id),
          referrer:     randomItem(['search', 'direct', 'recommendation', 'connection']),
        },
        idempotency_key: ikey('job-viewed', job.job_id, viewer, minute),
      });
    }
  }

  // ── Graph 5: job.saved events ─────────────────────────────────────────────
  // SAVES_PER_JOB saves per job spread over WINDOW_DAYS
  console.log(`      Building job.saved events (${allJobIds.length} jobs × ~${SAVES_PER_JOB} saves)...`);
  for (const job of allJobIds) {
    const saveCount = randomInt(Math.floor(SAVES_PER_JOB * 0.3), SAVES_PER_JOB * 2);
    for (let s = 0; s < saveCount; s++) {
      const saver  = randomItem(memberIds);
      const saveTs = randomTimestamp();
      const minute = Math.floor(saveTs.getTime() / 60000);
      eventDocs.push({
        event_type:  'job.saved',
        trace_id:    null,
        timestamp:   saveTs,
        actor_id:    String(saver),
        entity_type: 'job',
        entity_id:   String(job.job_id),
        payload: {
          job_id:       String(job.job_id),
          recruiter_id: String(job.recruiter_id),
        },
        idempotency_key: ikey('job-saved', job.job_id, saver, minute),
      });
    }
  }

  // ── Graph 6: profile.viewed events ────────────────────────────────────────
  // Spread PROFILE_VIEWS across members, daily buckets for the line chart
  console.log(`      Building profile.viewed events (${PROFILE_VIEWS} total)...`);
  for (let p = 0; p < PROFILE_VIEWS; p++) {
    const profileOwner = randomItem(memberIds);
    const viewer       = randomItem(memberIds);
    const viewTs       = randomTimestamp(30);  // last 30 days for the dashboard
    const dayBucket    = Math.floor(viewTs.getTime() / (24 * 60 * 60 * 1000));
    eventDocs.push({
      event_type:  'profile.viewed',
      trace_id:    null,
      timestamp:   viewTs,
      actor_id:    String(viewer),
      entity_type: 'member',
      entity_id:   String(profileOwner),
      payload: {
        viewer_role: randomItem(['member', 'recruiter']),
      },
      idempotency_key: ikey('profile-viewed', profileOwner, viewer, dayBucket),
    });
  }

  console.log(`      Total events generated: ${eventDocs.length}\n`);

  // ── 6. Bulk insert events into MongoDB ────────────────────────────────────
  console.log('[6/6] Inserting events into MongoDB (ordered:false = skip duplicates)...');

  const batchSize  = 1000;
  let totalInserted = 0;
  let totalSkipped  = 0;

  for (let i = 0; i < eventDocs.length; i += batchSize) {
    const batch = eventDocs.slice(i, i + batchSize);
    try {
      const result = await EventLog.insertMany(batch, {
        ordered: false,   // continue on duplicate key errors
      });
      totalInserted += result.length;
    } catch (err) {
      // Mongoose 8.x BulkWriteError — use insertedCount for reliable count
      const inserted = err.insertedCount
        ?? err.result?.nInserted
        ?? err.result?.result?.nInserted
        ?? 0;
      totalInserted += inserted;

      const dupes = (err.writeErrors || []).filter(e => e.code === 11000).length;
      totalSkipped += dupes;

      // Rethrow if not a bulk write error — unexpected failure
      if (!err.writeErrors) throw err;
    }

    if ((i / batchSize + 1) % 5 === 0 || i + batchSize >= eventDocs.length) {
      console.log(`      Batch ${Math.ceil((i + batchSize) / batchSize)} — inserted so far: ${totalInserted}`);
    }
  }

  console.log(`\n      Events inserted: ${totalInserted}`);
  console.log(`      Events skipped (duplicates): ${totalSkipped}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  const [appCount]   = await db.query('SELECT COUNT(*) as cnt FROM applications');
  const eventCount   = await EventLog.countDocuments();

  console.log('\n=== Seed Complete ===');
  console.log(`MySQL applications:  ${appCount[0].cnt}`);
  console.log(`MongoDB events:      ${eventCount}`);
  console.log('\nEvent breakdown:');
  for (const type of [
    'application.submitted',
    'application.statusChanged',
    'job.viewed',
    'job.saved',
    'profile.viewed',
  ]) {
    const count = await EventLog.countDocuments({ event_type: type });
    console.log(`  ${type.padEnd(30)} ${count}`);
  }

  console.log('\nAll 7 dashboard graphs should now have data.');
  console.log('Run verification queries with: node verify_analytics.js\n');

  await db.end();
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
