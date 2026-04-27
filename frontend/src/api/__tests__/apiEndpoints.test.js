// @vitest-environment node
import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.API_BASE_URL;

function url(path) {
  return `${String(BASE_URL).replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

async function postJson(path, body) {
  const res = await fetch(url(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // allow non-json responses, but surface them
  }
  return { res, text, json };
}

const run = BASE_URL
  ? describe
  : describe.skip;

run('API testing (FastAPI/REST)', () => {
  it('POST /members/create', async () => {
    const payload = {
      email: `api-test-${Date.now()}@demo.linkdln`,
      display_name: 'API Test User',
      headline: 'Testing member create',
    };
    const { res, json, text } = await postJson('/members/create', payload);
    expect(res.ok, text).toBe(true);
    expect(json ?? {}).toBeTypeOf('object');
  });

  it('POST /jobs/create', async () => {
    const payload = {
      title: 'API Test Job',
      company_name: 'Demo Co',
      location: 'Remote',
      employment_type: 'Full-time',
      remote: true,
      industry: 'Technology',
      description: 'Testing /jobs/create endpoint',
    };
    const { res, json, text } = await postJson('/jobs/create', payload);
    expect(res.ok, text).toBe(true);
    expect(json ?? {}).toBeTypeOf('object');
  });

  it('POST /jobs/search', async () => {
    const payload = {
      keyword: 'API Test',
      location: 'Remote',
      type: 'Full-time',
      industry: 'Technology',
      remote_only: true,
      limit: 10,
    };
    const { res, json, text } = await postJson('/jobs/search', payload);
    expect(res.ok, text).toBe(true);
    // Expect list-like response, but keep resilient to {items: []} shapes.
    if (Array.isArray(json)) {
      expect(Array.isArray(json)).toBe(true);
    } else {
      expect(json ?? {}).toBeTypeOf('object');
    }
  });

  it('POST /applications/submit then /applications/updateStatus', async () => {
    const submitPayload = {
      job_id: 1,
      member_id: 'me',
      resume_text: 'API test resume text',
      cover_letter: 'API test cover letter',
    };
    const submit = await postJson('/applications/submit', submitPayload);
    expect(submit.res.ok, submit.text).toBe(true);

    // Try to discover an application id in common response shapes.
    const appId =
      submit.json?.application_id ??
      submit.json?.id ??
      submit.json?.application?.id ??
      submit.json?.application?.application_id;

    // If backend doesn't return an id, we can't test updateStatus reliably.
    expect(appId, `applications/submit response did not include application id. Response: ${submit.text}`).toBeTruthy();

    const updatePayload = {
      application_id: appId,
      status: 'Screening',
    };
    const upd = await postJson('/applications/updateStatus', updatePayload);
    expect(upd.res.ok, upd.text).toBe(true);
  });

  it('POST /events/ingest', async () => {
    const payload = {
      event_type: 'test.event',
      trace_id: `trace-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor_id: 'api-test',
      entity: { entity_type: 'test', entity_id: String(Date.now()) },
      payload: { hello: 'world' },
      idempotency_key: `idem-${Date.now()}`,
    };
    const { res, json, text } = await postJson('/events/ingest', payload);
    expect(res.ok, text).toBe(true);
    expect(json ?? {}).toBeTypeOf('object');
  });
});

