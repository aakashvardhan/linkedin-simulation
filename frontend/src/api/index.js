import { createApiClient } from './client';

// Minimal API wrapper that matches your project spec endpoints.
// Backend can be built later; frontend will fall back to mock data if calls fail.

export function makeApi({ getAuthToken } = {}) {
  const api = createApiClient({ getAuthToken });

  return {
    auth: {
      // Optional backend endpoint; frontend can also use local-only demo auth.
      login: (payload) => api.post('/auth/login', payload),
      me: () => api.get('/auth/me'),
    },
    members: {
      create: (payload) => api.post('/members/create', payload),
      get: (payload) => api.post('/members/get', payload),
      update: (payload) => api.post('/members/update', payload),
      delete: (payload) => api.post('/members/delete', payload),
      search: (payload) => api.post('/members/search', payload),
    },
    jobs: {
      create: (payload) => api.post('/jobs/create', payload),
      get: (payload) => api.post('/jobs/get', payload),
      update: (payload) => api.post('/jobs/update', payload),
      search: (payload) => api.post('/jobs/search', payload),
      close: (payload) => api.post('/jobs/close', payload),
      byRecruiter: (payload) => api.post('/jobs/byRecruiter', payload),
    },
    applications: {
      submit: (payload) => api.post('/applications/submit', payload),
      get: (payload) => api.post('/applications/get', payload),
      byJob: (payload) => api.post('/applications/byJob', payload),
      byMember: (payload) => api.post('/applications/byMember', payload),
      updateStatus: (payload) => api.post('/applications/updateStatus', payload),
      addNote: (payload) => api.post('/applications/addNote', payload),
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
      list: (payload) => api.post('/connections/list', payload),
      mutual: (payload) => api.post('/connections/mutual', payload),
    },
    analytics: {
      ingest: (payload) => api.post('/events/ingest', payload),
      jobsTop: (payload) => api.post('/analytics/jobs/top', payload),
      funnel: (payload) => api.post('/analytics/funnel', payload),
      geo: (payload) => api.post('/analytics/geo', payload),
      memberDashboard: (payload) => api.post('/analytics/member/dashboard', payload),
    },
    ai: {
      // FastAPI agent service should expose these.
      request: (payload) => api.post('/ai/request', payload),
      status: (payload) => api.post('/ai/status', payload),
      candidateMatch: (payload) => api.post('/ai/candidate-match', payload),
      careerCoach: (payload) => api.post('/ai/career-coach', payload),
    },
  };
}

