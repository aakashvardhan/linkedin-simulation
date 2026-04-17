/**
 * realApi.js  — drop-in replacement for mockApi.js
 *
 * Every method maps 1-to-1 with the API contract in the project doc.
 * Import this instead of mockApi wherever you want real backend data.
 *
 * Usage (swap in any component):
 *   import api from '../api/realApi';
 *   const result = await api.members.login({ email, password });
 */

import apiClient from './apiClient';

// ─── helper: unwrap the standard { status, data } envelope ──────────────────
const unwrap = (res) => res.data.data;

const api = {
  // ─── Profile Service  (port 8000, same host as everything else) ───────────
  members: {
    create: (data) => apiClient.post('/members/create', data).then(unwrap),
    get: (member_id) => apiClient.post('/members/get', { member_id }).then(unwrap),
    update: (member_id, data) =>
      apiClient.post('/members/update', { member_id, ...data }).then(unwrap),
    delete: (member_id) => apiClient.post('/members/delete', { member_id }).then(unwrap),
    search: (filters) => apiClient.post('/members/search', filters).then(unwrap),
    login: ({ email, password }) =>
      apiClient.post('/members/login', { email, password }).then(unwrap),
  },

  recruiters: {
    create: (data) => apiClient.post('/recruiters/create', data).then(unwrap),
    get: (recruiter_id) => apiClient.post('/recruiters/get', { recruiter_id }).then(unwrap),
    login: ({ email, password }) =>
      apiClient.post('/recruiters/login', { email, password }).then(unwrap),
  },

  // ─── Job Service ──────────────────────────────────────────────────────────
  jobs: {
    create: (data) => apiClient.post('/jobs/create', data).then(unwrap),
    get: (job_id) => apiClient.post('/jobs/get', { job_id }).then(unwrap),
    update: (job_id, recruiter_id, data) =>
      apiClient.post('/jobs/update', { job_id, recruiter_id, ...data }).then(unwrap),
    search: (filters) =>
      apiClient
        .post('/jobs/search', {
          page: 1,
          page_size: 20,
          sort_by: 'posted_datetime',
          sort_order: 'desc',
          status: 'open',
          ...filters,
        })
        .then(unwrap),
    close: (job_id, recruiter_id) =>
      apiClient.post('/jobs/close', { job_id, recruiter_id }).then(unwrap),
    byRecruiter: (recruiter_id, status = null) =>
      apiClient
        .post('/jobs/byRecruiter', { recruiter_id, status, page: 1, page_size: 50 })
        .then(unwrap),
    save: (job_id, member_id) =>
      apiClient.post('/jobs/save', { job_id, member_id }).then(unwrap),
    savedByMember: (member_id) =>
      apiClient
        .post('/jobs/savedByMember', { member_id, page: 1, page_size: 50 })
        .then(unwrap),
  },

  // ─── Connection Service ───────────────────────────────────────────────────
  connections: {
    request: (requester_id, receiver_id) =>
      apiClient.post('/connections/request', { requester_id, receiver_id }).then(unwrap),
    accept: (request_id, receiver_id) =>
      apiClient.post('/connections/accept', { request_id, receiver_id }).then(unwrap),
    reject: (request_id, receiver_id) =>
      apiClient.post('/connections/reject', { request_id, receiver_id }).then(unwrap),
    list: (user_id, page = 1) =>
      apiClient.post('/connections/list', { user_id, page, page_size: 20 }).then(unwrap),
    pending: (user_id, page = 1) =>
      apiClient.post('/connections/pending', { user_id, page, page_size: 20 }).then(unwrap),
    mutual: (user_id, other_id) =>
      apiClient.post('/connections/mutual', { user_id, other_id }).then(unwrap),
  },

  // ─── Application Service (M5 — not in this branch, keep mock) ────────────
  applications: {
    submit: (data) => apiClient.post('/applications/submit', data).then(unwrap),
    get: (application_id) =>
      apiClient.post('/applications/get', { application_id }).then(unwrap),
    byJob: (job_id, page = 1) =>
      apiClient
        .post('/applications/byJob', {
          job_id,
          status: null,
          sort_by: 'application_datetime',
          sort_order: 'desc',
          page,
          page_size: 20,
        })
        .then(unwrap),
    byMember: (member_id, page = 1) =>
      apiClient
        .post('/applications/byMember', { member_id, status: null, page, page_size: 20 })
        .then(unwrap),
    updateStatus: (application_id, recruiter_id, status) =>
      apiClient
        .post('/applications/updateStatus', { application_id, recruiter_id, status })
        .then(unwrap),
    addNote: (application_id, recruiter_id, note) =>
      apiClient
        .post('/applications/addNote', { application_id, recruiter_id, note })
        .then(unwrap),
  },

  // ─── Messaging Service (M5 — not in this branch, keep mock) ─────────────
  threads: {
    open: (participant_ids, subject = '') =>
      apiClient.post('/threads/open', { participant_ids, subject }).then(unwrap),
    get: (thread_id) => apiClient.post('/threads/get', { thread_id }).then(unwrap),
    byUser: (user_id, page = 1) =>
      apiClient.post('/threads/byUser', { user_id, page, page_size: 20 }).then(unwrap),
  },
  messages: {
    list: (thread_id, page = 1) =>
      apiClient.post('/messages/list', { thread_id, page, page_size: 50 }).then(unwrap),
    send: (thread_id, sender_id, message_text) =>
      apiClient.post('/messages/send', { thread_id, sender_id, message_text }).then(unwrap),
  },

  // ─── Analytics Service (M6 — separate service, keep mock for now) ─────────
  analytics: {
    ingestEvent: (event) => apiClient.post('/events/ingest', event).then(unwrap),
    memberDashboard: (member_id) =>
      apiClient.post('/analytics/member/dashboard', { member_id }).then(unwrap),
    recruiterDashboard: (recruiter_id, year, month) =>
      apiClient
        .post('/analytics/recruiter/dashboard', {
          recruiter_id,
          period: 'month',
          year,
          month,
        })
        .then(unwrap),
    topJobs: (metric = 'applications', year, month, limit = 10) =>
      apiClient
        .post('/analytics/jobs/top', {
          metric,
          period: 'month',
          year,
          month,
          limit,
          sort_order: 'desc',
        })
        .then(unwrap),
    funnel: (job_id, year, month) =>
      apiClient
        .post('/analytics/funnel', { job_id, period: 'month', year, month })
        .then(unwrap),
    geo: (job_id, year, month) =>
      apiClient
        .post('/analytics/geo', { job_id, period: 'month', year, month })
        .then(unwrap),
  },

  // ─── AI Service (M7 — separate FastAPI service) ───────────────────────────
  ai: {
    parseResume: (member_id, resume_url, resume_text) =>
      apiClient
        .post('/ai/parse-resume', { member_id, resume_url, resume_text })
        .then(unwrap),
    matchCandidates: (job_id, top_k = 10, filters = {}) =>
      apiClient.post('/ai/match-candidates', { job_id, top_k, filters }).then(unwrap),
    startHiringAssistant: (job_id, recruiter_id, top_k = 5) =>
      apiClient
        .post('/ai/hiring-assistant', { job_id, recruiter_id, top_k, generate_outreach: true })
        .then(unwrap),
    getTaskStatus: (task_id) =>
      apiClient.get(`/ai/task/${task_id}`).then(unwrap),
    draftOutreach: (job_id, member_id, recruiter_id, tone = 'professional') =>
      apiClient
        .post('/ai/outreach-draft', { job_id, member_id, recruiter_id, tone })
        .then(unwrap),
    approveOutreach: (task_id, recruiter_id, candidate_id, action, final_message) =>
      apiClient
        .post('/ai/approve-outreach', {
          task_id,
          recruiter_id,
          candidate_id,
          action,
          final_message,
        })
        .then(unwrap),
  },
};

export default api;
