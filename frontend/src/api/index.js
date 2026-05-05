import { createApiClient } from './client';

/** Unwraps M3/M4 core backend `{"status":"success","data":{...}}` responses. */
export function unwrapSuccessEnvelope(raw) {
  if (raw && raw.status === 'success' && raw.data !== undefined) return raw.data;
  return raw;
}

// REST wrapper: supports core-backend (`feature/core-backend`) login paths + optional gateway aliases.
// With VITE_DEMO_SEED=false, lists start empty and many API failures surface as empty data instead of synthetic charts.

function resolveRecruiterAssistantBaseUrl() {
  const dedicated = import.meta.env.VITE_RECRUITER_ASSISTANT_BASE_URL?.trim();
  if (dedicated) {
    const u = dedicated.replace(/\/$/, '');
    return u.endsWith('/agent') ? u : `${u}/agent`;
  }
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  return `${base}/agent`;
}

export function makeApi({ getAuthToken } = {}) {
  const api = createApiClient({ getAuthToken });
  const recruiterAssistantClient = createApiClient({
    baseUrl: resolveRecruiterAssistantBaseUrl(),
    getAuthToken,
  });

  return {
    auth: {
      login: async (payload) => {
        const { role, email, password } = payload;
        const path = role === 'RECRUITER' ? '/recruiters/login' : '/members/login';
        const raw = await api.post(path, { email, password });
        return unwrapSuccessEnvelope(raw);
      },
      me: async () => {
        const raw = await api.get('/auth/me');
        return unwrapSuccessEnvelope(raw);
      },
    },
    members: {
      create: async (payload) => unwrapSuccessEnvelope(await api.post('/members/create', payload)),
      get: async (payload) => unwrapSuccessEnvelope(await api.post('/members/get', payload)),
      update: async (payload) => unwrapSuccessEnvelope(await api.post('/members/update', payload)),
      delete: async (payload) => unwrapSuccessEnvelope(await api.post('/members/delete', payload)),
      search: async (payload) => unwrapSuccessEnvelope(await api.post('/members/search', payload)),
    },
    recruiters: {
      create: async (payload) => unwrapSuccessEnvelope(await api.post('/recruiters/create', payload)),
      get: async (payload) => unwrapSuccessEnvelope(await api.post('/recruiters/get', payload)),
      search: async (payload) => unwrapSuccessEnvelope(await api.post('/recruiters/search', payload)),
    },
    jobs: {
      create: async (payload) => unwrapSuccessEnvelope(await api.post('/jobs/create', payload)),
      get: async (payload) => unwrapSuccessEnvelope(await api.post('/jobs/get', payload)),
      update: async (payload) => unwrapSuccessEnvelope(await api.post('/jobs/update', payload)),
      search: async (payload) => unwrapSuccessEnvelope(await api.post('/jobs/search', payload)),
      close: async (payload) => unwrapSuccessEnvelope(await api.post('/jobs/close', payload)),
      byRecruiter: async (payload) => unwrapSuccessEnvelope(await api.post('/jobs/byRecruiter', payload)),
    },
    applications: {
      submit: async (payload) => unwrapSuccessEnvelope(await api.post('/applications/submit', payload)),
      get: async (payload) => unwrapSuccessEnvelope(await api.post('/applications/get', payload)),
      byJob: async (payload) => unwrapSuccessEnvelope(await api.post('/applications/byJob', payload)),
      byMember: async (payload) => unwrapSuccessEnvelope(await api.post('/applications/byMember', payload)),
      updateStatus: async (payload) => unwrapSuccessEnvelope(await api.post('/applications/updateStatus', payload)),
      addNote: async (payload) => unwrapSuccessEnvelope(await api.post('/applications/addNote', payload)),
    },
    messaging: {
      openThread: (payload) => api.post('/threads/open', payload),
      getThread: (payload) => api.post('/threads/get', payload),
      listMessages: (payload) => api.post('/messages/list', payload),
      sendMessage: (payload) => api.post('/messages/send', payload),
      threadsByUser: (payload) => api.post('/threads/byUser', payload),
    },
    connections: {
      request: (payload) => api.post('/connections/request', payload),
      accept: (payload) => api.post('/connections/accept', payload),
      reject: (payload) => api.post('/connections/reject', payload),
      withdraw: (payload) => api.post('/connections/withdraw', payload),
      list: (payload) => api.post('/connections/list', payload),
      pending: (payload) => api.post('/connections/pending', payload),
      sent: (payload) => api.post('/connections/sent', payload),
      mutual: (payload) => api.post('/connections/mutual', payload),
    },
    analytics: {
      ingest: async (payload) => unwrapSuccessEnvelope(await api.post('/events/ingest', payload)),
      jobsTop: async (payload) => unwrapSuccessEnvelope(await api.post('/analytics/jobs/top', payload)),
      funnel: async (payload) => unwrapSuccessEnvelope(await api.post('/analytics/funnel', payload)),
      geo: async (payload) => unwrapSuccessEnvelope(await api.post('/analytics/geo', payload)),
      memberDashboard: async (payload) =>
        unwrapSuccessEnvelope(await api.post('/analytics/member/dashboard', payload)),
      recruiterDashboard: async (payload) =>
        unwrapSuccessEnvelope(await api.post('/analytics/recruiter/dashboard', payload)),
    },
    ai: {
      // FastAPI agent service should expose these.
      request: (payload) => api.post('/ai/request', payload),
      status: (payload) => api.post('/ai/status', payload),
      candidateMatch: (payload) => api.post('/ai/candidate-match', payload),
      careerCoach: (payload) => api.post('/ai/career-coach', payload),
    },
    /** Recruiter Assistant (`services/recruiter-assistant`) — proxied at `/api/agent` when using the API gateway. */
    recruiterAssistant: {
      request: (payload) =>
        recruiterAssistantClient.post('/request', payload, { timeoutMs: 60000 }),
      result: (traceId) =>
        recruiterAssistantClient.get(`/result/${encodeURIComponent(traceId)}`, { timeoutMs: 120000 }),
      status: (traceId) =>
        recruiterAssistantClient.get(`/status/${encodeURIComponent(traceId)}`, { timeoutMs: 30000 }),
    },
  };
}

