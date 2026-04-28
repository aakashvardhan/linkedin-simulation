/**
 * verify_analytics.js
 * --------------------
 * Hits all 7 required analytics endpoints and confirms each returns
 * non-empty data. Run this after seed_analytics.js completes.
 *
 * Usage:
 *   node verify_analytics.js
 *
 * Environment variables:
 *   ANALYTICS_URL  — base URL of analytics-service (default: http://localhost:8006)
 *   JOB_ID         — a job_id to use for per-job queries (default: 1)
 *   MEMBER_ID      — a member_id to use for member dashboard (default: 1)
 *   RECRUITER_ID   — a recruiter_id for recruiter dashboard (default: 1)
 */

const http = require('http');

const BASE_URL    = process.env.ANALYTICS_URL || 'http://localhost:8006';
const JOB_ID      = process.env.JOB_ID        || '1';
const MEMBER_ID   = process.env.MEMBER_ID      || '1';
const RECRUITER_ID = process.env.RECRUITER_ID  || '1';

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url     = new URL(BASE_URL + path);

    const options = {
      hostname: url.hostname,
      port:     url.port || 80,
      path:     url.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── GET helper (health check) ───────────────────────────────────────────────

function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port:     url.port || 80,
      path:     url.pathname,
      method:   'GET',
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── Check helpers ────────────────────────────────────────────────────────────

function pass(label, detail = '') {
  console.log(`  ✅  ${label}${detail ? ' — ' + detail : ''}`);
}

function fail(label, detail = '') {
  console.log(`  ❌  ${label}${detail ? ' — ' + detail : ''}`);
}

function checkArray(arr, minLength = 1) {
  return Array.isArray(arr) && arr.length >= minLength;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Analytics Graph Verification ===');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Using  job_id=${JOB_ID}  member_id=${MEMBER_ID}  recruiter_id=${RECRUITER_ID}\n`);

  let passed = 0;
  let failed = 0;

  // ── Health check ────────────────────────────────────────────────────────────
  try {
    const r = await get('/health');
    if (r.status === 200 || r.body?.status === 'success') {
      pass('Health check', 'analytics-service is up');
      passed++;
    } else {
      fail('Health check', `status ${r.status}`);
      failed++;
      console.log('\nAnalytics service is not reachable. Check docker compose ps.');
      process.exit(1);
    }
  } catch (err) {
    fail('Health check', err.message);
    console.log('\nCannot reach analytics-service. Is it running?');
    process.exit(1);
  }

  console.log('\n── Recruiter Dashboard (5 graphs) ──────────────────────────────');

  // ── Graph 1: top_jobs_by_applications ──────────────────────────────────────
  {
    const r = await post('/analytics/recruiter/dashboard', {
      recruiter_id: RECRUITER_ID,
      window_days:  60,
    });
    const d = r.body?.data;

    if (r.status === 200 && checkArray(d?.top_jobs_by_applications)) {
      pass('Graph 1 — Top 10 jobs by applications',
        `${d.top_jobs_by_applications.length} jobs, top count: ${d.top_jobs_by_applications[0]?.application_count}`);
      passed++;
    } else {
      fail('Graph 1 — Top 10 jobs by applications',
        `status ${r.status}, data: ${JSON.stringify(d?.top_jobs_by_applications)}`);
      failed++;
    }

    // ── Graph 2: geo_summary ────────────────────────────────────────────────
    if (r.status === 200 && checkArray(d?.geo_summary?.distribution)) {
      pass('Graph 2 — City-wise applicant distribution',
        `${d.geo_summary.distribution.length} cities, total: ${d.geo_summary.total}`);
      passed++;
    } else {
      fail('Graph 2 — City-wise applicant distribution',
        `distribution: ${JSON.stringify(d?.geo_summary?.distribution)}`);
      failed++;
    }

    // ── Graph 3: low_traction_jobs ──────────────────────────────────────────
    if (r.status === 200 && checkArray(d?.low_traction_jobs)) {
      pass('Graph 3 — Top 5 low-traction jobs',
        `${d.low_traction_jobs.length} jobs, lowest count: ${d.low_traction_jobs[0]?.application_count}`);
      passed++;
    } else {
      fail('Graph 3 — Top 5 low-traction jobs',
        `data: ${JSON.stringify(d?.low_traction_jobs)}`);
      failed++;
    }

    // ── Graph 4: clicks_per_job ─────────────────────────────────────────────
    if (r.status === 200 && checkArray(d?.clicks_per_job)) {
      pass('Graph 4 — Clicks per job',
        `${d.clicks_per_job.length} jobs, top clicks: ${d.clicks_per_job[0]?.clicks}`);
      passed++;
    } else {
      fail('Graph 4 — Clicks per job',
        `data: ${JSON.stringify(d?.clicks_per_job)}`);
      failed++;
    }

    // ── Graph 5: saves_per_day ──────────────────────────────────────────────
    if (r.status === 200 && checkArray(d?.saves_per_day)) {
      const total = d.saves_per_day.reduce((s, r) => s + r.count, 0);
      pass('Graph 5 — Saves per day',
        `${d.saves_per_day.length} days with saves, total saves: ${total}`);
      passed++;
    } else {
      fail('Graph 5 — Saves per day',
        `data: ${JSON.stringify(d?.saves_per_day)}`);
      failed++;
    }
  }

  console.log('\n── Member Dashboard (2 graphs) ─────────────────────────────────');

  // ── Graph 6: profile_views_per_day ─────────────────────────────────────────
  {
    const r = await post('/analytics/member/dashboard', { member_id: MEMBER_ID });
    const d = r.body?.data;

    if (r.status === 200 && d?.profile_views?.total > 0) {
      pass('Graph 6 — Profile views per day (last 30 days)',
        `${d.profile_views.daily?.length || 0} days with views, total: ${d.profile_views.total}`);
      passed++;
    } else {
      fail('Graph 6 — Profile views per day',
        `total: ${d?.profile_views?.total} — M3 must emit profile.viewed events`);
      failed++;
    }

    // ── Graph 7: application_status_breakdown ───────────────────────────────
    if (r.status === 200 && d?.application_status?.total > 0) {
      const st = d.application_status;
      pass('Graph 7 — Application status breakdown',
        `total: ${st.total} — submitted:${st.submitted} reviewing:${st.reviewing} interview:${st.interview} offer:${st.offer} rejected:${st.rejected}`);
      passed++;
    } else {
      fail('Graph 7 — Application status breakdown',
        `total: ${d?.application_status?.total}`);
      failed++;
    }
  }

  // ── Additional endpoint checks ──────────────────────────────────────────────
  console.log('\n── Additional Endpoint Checks ───────────────────────────────────');

  // Funnel
  {
    const r = await post('/analytics/funnel', { job_id: JOB_ID, window_days: 60 });
    const f = r.body?.data?.funnel;
    if (r.status === 200 && f?.views > 0) {
      pass('/analytics/funnel', `views:${f.views} saves:${f.saves} submits:${f.submits}`);
      passed++;
    } else {
      fail('/analytics/funnel', `funnel: ${JSON.stringify(f)}`);
      failed++;
    }
  }

  // Geo per job
  {
    const r = await post('/analytics/geo', { job_id: JOB_ID, window_days: 60 });
    const d = r.body?.data;
    if (r.status === 200 && d?.total > 0) {
      pass('/analytics/geo', `total applicants: ${d.total}, cities: ${d.distribution?.length}`);
      passed++;
    } else {
      fail('/analytics/geo', `total: ${d?.total}`);
      failed++;
    }
  }

  // Top jobs global
  {
    const r = await post('/analytics/jobs/top', { metric: 'applications', window_days: 60, limit: 10 });
    const d = r.body?.data;
    if (r.status === 200 && checkArray(d?.jobs)) {
      pass('/analytics/jobs/top', `${d.jobs.length} jobs returned`);
      passed++;
    } else {
      fail('/analytics/jobs/top', `results: ${JSON.stringify(d?.jobs)}`);
      failed++;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('All graphs verified ✅ — ready for demo\n');
  } else {
    console.log('\nFailed graphs checklist:');
    if (failed > 0) {
      console.log('  • Graph 6 fails → M3 has not emitted profile.viewed events yet (known dependency)');
      console.log('  • Graphs 1-5 fail → Re-run seed_analytics.js and check window_days matches');
      console.log('  • Graph 7 fails → Check application.statusChanged events in MongoDB:');
      console.log('    docker exec mongo mongosh linkedin_simulation --eval');
      console.log('    "db.events.countDocuments({event_type:\'application.statusChanged\'})"');
    }
    console.log('');
  }
}

main().catch(err => {
  console.error('Verification failed:', err.message);
  process.exit(1);
});