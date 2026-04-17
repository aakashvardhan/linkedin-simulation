import { searchJobs, getJobById } from './jsearch';
import { getRandomUsers } from './randomUser';
import { mockApplications } from '../data/mockApplications';
import { mockConnections, mockPendingRequests } from '../data/mockConnections';
import { mockThreads } from '../data/mockThreads';
import { mockDashboard } from '../data/mockDashboard';
import { mockRecruiterDashboard } from '../data/mockRecruiterDashboard';
import { mockApplicants } from '../data/mockApplicants';
import { mockAICandidates, mockOutreachMessages } from '../data/mockAI';

/**
 * Unified API layer — all frontend components call through this module.
 * When the backend is ready, swap each method's implementation to call
 * the real REST endpoints (see API contract in the project doc).
 *
 * Backend endpoints follow: POST /service/action pattern.
 * Example: api.members.create(data) -> POST /members/create
 */

export const api = {
  // ─── Profile Service ───────────────────────────────────────
  // POST /members/create, /members/get, /members/update, /members/delete, /members/search
  members: {
    create: async (data) => ({ id: crypto.randomUUID(), ...data }),
    get: async (memberId) => {
      const users = await getRandomUsers(1);
      return users[0];
    },
    update: async (memberId, data) => ({ success: true, ...data }),
    delete: async (memberId) => ({ success: true }),
    search: async (filters) => {
      const users = await getRandomUsers(10);
      return users;
    },
  },

  // ─── Job Service ───────────────────────────────────────────
  // POST /jobs/create, /jobs/get, /jobs/update, /jobs/search, /jobs/close, /jobs/byRecruiter
  jobs: {
    create: async (data) => ({ id: `job-${Date.now()}`, ...data }),
    get: async (jobId) => getJobById(jobId),
    update: async (jobId, data) => ({ success: true, ...data }),
    search: async (query, page) => searchJobs(query, page),
    close: async (jobId) => ({ success: true, status: 'closed' }),
    byRecruiter: async (recruiterId) => {
      // Returns from localStorage in frontend; backend will query DB
      return JSON.parse(localStorage.getItem('linkedin_recruiter_jobs') || '[]');
    },
  },

  // ─── Application Service ───────────────────────────────────
  // POST /applications/submit, /applications/get, /applications/byJob, /applications/byMember, /applications/updateStatus, /applications/addNote
  applications: {
    submit: async (data) => {
      // Check duplicate
      const existing = JSON.parse(localStorage.getItem('linkedin_applications') || '[]');
      if (existing.some((a) => a.jobId === data.jobId && a.memberId === data.memberId)) {
        throw new Error('You have already applied to this job');
      }
      return { id: `app-${Date.now()}`, status: 'applied', ...data };
    },
    get: async (applicationId) => mockApplications.find((a) => a.id === applicationId) || null,
    byJob: async (jobId) => mockApplicants,
    byMember: async (memberId) => {
      const stored = JSON.parse(localStorage.getItem('linkedin_applications') || '[]');
      return [...stored, ...mockApplications];
    },
    updateStatus: async (applicationId, status) => ({ success: true, applicationId, status }),
    addNote: async (applicationId, note) => ({ success: true, applicationId, note }),
  },

  // ─── Messaging Service ─────────────────────────────────────
  // POST /threads/open, /threads/get, /messages/list, /messages/send, /threads/byUser
  threads: {
    open: async (participantIds) => ({ id: `thread-${Date.now()}`, participantIds }),
    get: async (threadId) => mockThreads.find((t) => t.id === threadId) || null,
    byUser: async (userId) => mockThreads,
  },
  messages: {
    list: async (threadId) => {
      const thread = mockThreads.find((t) => t.id === threadId);
      return thread?.messages || [];
    },
    send: async (threadId, senderId, text) => {
      return { id: `msg-${Date.now()}`, threadId, sender: 'me', text, timestamp: new Date().toISOString() };
    },
  },

  // ─── Connection Service ────────────────────────────────────
  // POST /connections/request, /connections/accept, /connections/reject, /connections/list
  connections: {
    request: async (requesterId, receiverId) => ({ id: `req-${Date.now()}`, status: 'pending' }),
    accept: async (requestId) => ({ success: true, status: 'accepted' }),
    reject: async (requestId) => ({ success: true, status: 'rejected' }),
    list: async (userId) => ({ connections: mockConnections, pending: mockPendingRequests }),
    remove: async (connectionId) => ({ success: true }),
  },

  // ─── Analytics / Logging Service ───────────────────────────
  // POST /events/ingest, /analytics/jobs/top, /analytics/funnel, /analytics/geo, /analytics/member/dashboard
  analytics: {
    ingestEvent: async (event) => ({ success: true }),
    memberDashboard: async (memberId) => mockDashboard,
    recruiterDashboard: async (recruiterId) => mockRecruiterDashboard,
    topJobs: async (metric, window) => mockRecruiterDashboard.topJobsByApplicants,
    funnel: async (jobId, window) => ({ views: 320, saves: 45, applyStarts: 30, submits: 20 }),
    geo: async (jobId, window) => mockRecruiterDashboard.cityDistribution,
  },

  // ─── AI / Agent Service (FastAPI) ──────────────────────────
  // POST /ai/request, /ai/status, WebSocket /ws/ai-task/{taskId}
  ai: {
    requestTask: async (jobId, taskType = 'find_candidates') => {
      return { taskId: `ai-task-${Date.now()}`, jobId, status: 'queued' };
    },
    getTaskStatus: async (taskId) => {
      return { taskId, status: 'completed', progress: 100 };
    },
    getCandidates: async (taskId) => mockAICandidates,
    getOutreachMessages: async (taskId) => mockOutreachMessages,
    approveOutreach: async (outreachId) => ({ success: true, status: 'approved' }),
    rejectOutreach: async (outreachId) => ({ success: true, status: 'rejected' }),
    editOutreach: async (outreachId, body) => ({ success: true, body }),
    parseResume: async (file) => {
      // Mock: return extracted fields. Backend will use Resume Parser Skill.
      return {
        skills: ['React', 'Python', 'AWS'],
        experience_years: 5,
        education: [{ school: 'MIT', degree: 'BS Computer Science' }],
        raw_text: 'Extracted resume text...',
      };
    },
  },

  // ─── Utility ───────────────────────────────────────────────
  getRandomUsers,
};

export default api;
