/* eslint-disable react-refresh/only-export-components -- context module exports hooks, constants, and provider */
import React, { createContext, useEffect, useMemo, useState, useContext, useCallback } from 'react';
import { makeApi } from '../api';
import jobsSeed from '../data/kaggle/jobsSeed.json';
import postsSeed from '../data/kaggle/postsSeed.json';
import connectionsSeed from '../data/kaggle/connectionsSeed.json';
import {
  fetchOpenSourceSeed,
  fetchExtraSeedFromUrl,
  normalizeMergedJob,
  normalizeMergedPost,
  normalizeMergedConnection,
} from '../data/openSeedLoader';
import { generateApplicantsForJob } from '../data/mockApplicants';

const MockDataContext = createContext();

export const useMockData = () => useContext(MockDataContext);

function envFlag(name, defaultValue = false) {
  const v = import.meta.env?.[name];
  if (v === undefined || v === null || v === '') return defaultValue;
  return String(v).toLowerCase() === 'true' || v === '1';
}

/** When true, opt into extra backend hydration calls after login (best-effort). */
const BACKEND_INTEGRATION = envFlag('VITE_BACKEND_INTEGRATION', false);
/** When true, login must succeed against backend auth (no silent demo login). */
const REQUIRE_BACKEND_AUTH = envFlag('VITE_REQUIRE_BACKEND_AUTH', false);
/** When false, disables DummyJSON + extra seed merges for cleaner integration runs. */
const DEMO_SEED_ENABLED = import.meta.env.VITE_DEMO_SEED !== 'false';
/** When true, hydration replaces seeded jobs instead of merging. */
const REPLACE_SEED_JOBS = envFlag('VITE_REPLACE_SEED_JOBS', false);

function resolveMemberKey(profile) {
  if (!profile) return 'me';
  const id =
    profile.member_id ??
    profile.memberId ??
    profile.user_id ??
    profile.userId ??
    profile.id ??
    profile.uuid;
  if (id !== undefined && id !== null && String(id).trim() !== '') return id;
  if (profile.email) return profile.email;
  return 'me';
}

function extractJobsArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.jobs)) return payload.jobs;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function mapBackendJobRow(raw, idx) {
  const id = raw?.id ?? raw?.job_id ?? raw?.jobId ?? `job-${idx}`;
  const title = raw?.title ?? raw?.job_title ?? 'Untitled role';
  const company = raw?.company ?? raw?.company_name ?? raw?.employer ?? 'Company';
  const location = raw?.location ?? raw?.city ?? '';
  const type = raw?.type ?? raw?.employment_type ?? raw?.employmentType ?? 'Full-time';
  const remote =
    typeof raw?.remote === 'boolean'
      ? raw.remote
      : String(raw?.work_mode || raw?.remote_policy || '').toLowerCase().includes('remote');
  const industry = raw?.industry ?? raw?.sector ?? '';
  const description =
    raw?.description ?? raw?.summary ?? raw?.details ?? raw?.job_description ?? '';
  const applicants = Number(raw?.applicants ?? raw?.applicant_count ?? raw?.applications_count ?? 0) || 0;
  const hasApplied = !!(raw?.hasApplied ?? raw?.has_applied ?? raw?.applied);

  return {
    id,
    title,
    company,
    location,
    type,
    remote,
    industry,
    description,
    applicants,
    hasApplied,
  };
}

/** Demo accounts for local UI (password can be anything in demo fallback). */
export const DEMO_MEMBER_EMAIL = 'pratiksha@demo.linkdln';
export const DEMO_RECRUITER_EMAIL = 'sneha@demo.linkdln';
export const DEMO_MEMBER_NAME = 'Pratiksha Kaushik';
export const DEMO_RECRUITER_NAME = 'Sneha';

export const memberProfilePhotoKey = (email) => `linkdln:memberProfilePhoto:${email || 'me'}`;
export const recruiterProfilePhotoKey = (email) => `linkdln:recruiterProfilePhoto:${email || 'me'}`;

export const PROFILE_PHOTO_UPDATED = 'linkdln-profile-photo-updated';

export function notifyProfilePhotoUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PROFILE_PHOTO_UPDATED));
}

export const savedJobsStorageKey = (email) => `linkdln:savedJobIds:${email || 'me'}`;
export const incomingInvitesStorageKey = (email) => `linkdln:incomingInvites:${email || 'me'}`;
export const conversationsStorageKey = (email) => `linkdln:conversations:${email || 'me'}`;

const defaultIncomingInvites = () => [
  { id: 'inv-seed-1', name: 'Alice Smith', headline: 'Data Scientist at OpenAI', mutual: 12 },
];

const defaultConversationStore = () => ({
  threads: [
    {
      id: 't1',
      peerName: 'Elena Vogel',
      peerId: 'elena',
      messages: [
        {
          id: 'm1',
          text: 'Hi there! Can we schedule a quick call tomorrow to discuss the new features?',
          isMine: false,
          time: '2:14 PM',
        },
        {
          id: 'm2',
          text: 'Hey! Yes, tomorrow at 10 AM PT works perfectly for me.',
          isMine: true,
          time: '2:30 PM',
        },
      ],
    },
    {
      id: 't2',
      peerName: 'James Park',
      peerId: 'james',
      messages: [
        {
          id: 'm3',
          text: 'Thanks for connecting — let me know if you want an intro to our hiring manager.',
          isMine: false,
          time: 'Mon',
        },
      ],
    },
  ],
});

/** "jane.doe@x.com" → "Jane Doe" for default display when no name was given */
function displayNameFromEmail(email) {
  const local = (email || '').split('@')[0] || '';
  if (!local) return 'Member';
  return local
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export const MockDataProvider = ({ children }) => {
  const [userRole, setUserRole] = useState(() => localStorage.getItem('userRole'));
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('authToken'));
  const [userProfile, setUserProfile] = useState(() => {
    try {
      const raw = localStorage.getItem('userProfile');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const api = useMemo(() => makeApi({ getAuthToken: () => authToken }), [authToken]);

  const memberKey = useMemo(() => resolveMemberKey(userProfile), [userProfile]);

  useEffect(() => {
    if (userRole) localStorage.setItem('userRole', userRole);
    else localStorage.removeItem('userRole');
  }, [userRole]);

  useEffect(() => {
    if (authToken) localStorage.setItem('authToken', authToken);
    else localStorage.removeItem('authToken');
  }, [authToken]);

  useEffect(() => {
    if (userProfile) localStorage.setItem('userProfile', JSON.stringify(userProfile));
    else localStorage.removeItem('userProfile');
  }, [userProfile]);

  /** Older sessions may have userRole without userProfile */
  useEffect(() => {
    if (!userRole || userProfile) return;
    setUserProfile({
      displayName: userRole === 'RECRUITER' ? DEMO_RECRUITER_NAME : DEMO_MEMBER_NAME,
      email: userRole === 'RECRUITER' ? DEMO_RECRUITER_EMAIL : DEMO_MEMBER_EMAIL,
      role: userRole,
      headline:
        userRole === 'RECRUITER'
          ? 'Recruiting & talent · linkedlnDS'
          : 'Professional · Edit your profile to add a headline',
    });
  }, [userRole, userProfile]);

  /** Legacy userProfile JSON in localStorage without headline */
  useEffect(() => {
    if (!userProfile || userProfile.headline) return;
    setUserProfile((p) =>
      p
        ? {
            ...p,
            headline:
              p.role === 'RECRUITER'
                ? 'Recruiting & talent · linkedlnDS'
                : 'Professional · Edit your profile to add a headline',
          }
        : p,
    );
  }, [userProfile]);

  /** Feed + jobs + network: synthetic seeds aligned with Kaggle job/resume-style datasets (see datasets/kaggle-seed/SOURCES.md). */
  const [posts, setPosts] = useState(() => [...postsSeed]);

  const [jobs, setJobs] = useState(() => [...jobsSeed]);

  const [connections, setConnections] = useState(() => [...connectionsSeed]);

  /** Recruiter view: synthetic + live applications per job id (string key). */
  const [applicantsByJobId, setApplicantsByJobId] = useState({});

  const [savedJobIds, setSavedJobIds] = useState(() => new Set());
  const [incomingInvites, setIncomingInvites] = useState(defaultIncomingInvites);
  const [conversationStore, setConversationStore] = useState(defaultConversationStore);

  useEffect(() => {
    const email = userProfile?.email;
    if (!email) return;
    try {
      const raw = localStorage.getItem(savedJobsStorageKey(email));
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setSavedJobIds(new Set(arr));
      } else {
        setSavedJobIds(new Set());
      }
    } catch {
      setSavedJobIds(new Set());
    }
  }, [userProfile?.email]);

  useEffect(() => {
    const email = userProfile?.email;
    if (!email) return;
    try {
      const raw = localStorage.getItem(incomingInvitesStorageKey(email));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setIncomingInvites(parsed.length ? parsed : defaultIncomingInvites());
        else setIncomingInvites(defaultIncomingInvites());
      } else {
        setIncomingInvites(defaultIncomingInvites());
      }
    } catch {
      setIncomingInvites(defaultIncomingInvites());
    }
  }, [userProfile?.email]);

  useEffect(() => {
    const email = userProfile?.email;
    if (!email) return;
    try {
      const raw = localStorage.getItem(conversationsStorageKey(email));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.threads?.length) setConversationStore(parsed);
        else setConversationStore(defaultConversationStore());
      } else {
        setConversationStore(defaultConversationStore());
      }
    } catch {
      setConversationStore(defaultConversationStore());
    }
  }, [userProfile?.email]);

  useEffect(() => {
    const email = userProfile?.email;
    if (!email) return;
    try {
      localStorage.setItem(savedJobsStorageKey(email), JSON.stringify([...savedJobIds]));
    } catch {
      /* ignore */
    }
  }, [savedJobIds, userProfile?.email]);

  useEffect(() => {
    const email = userProfile?.email;
    if (!email) return;
    try {
      localStorage.setItem(incomingInvitesStorageKey(email), JSON.stringify(incomingInvites));
    } catch {
      /* ignore */
    }
  }, [incomingInvites, userProfile?.email]);

  useEffect(() => {
    const email = userProfile?.email;
    if (!email) return;
    try {
      localStorage.setItem(conversationsStorageKey(email), JSON.stringify(conversationStore));
    } catch {
      /* ignore */
    }
  }, [conversationStore, userProfile?.email]);

  useEffect(() => {
    setApplicantsByJobId((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const job of jobs) {
        const key = String(job.id);
        if (next[key] === undefined) {
          next[key] = generateApplicantsForJob(job.id, job.applicants ?? 0);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [jobs]);

  /** Optional: hydrate jobs list from backend gateway after login (integration runs). */
  useEffect(() => {
    if (!BACKEND_INTEGRATION) return undefined;
    if (!userRole || !authToken) return undefined;

    let cancelled = false;
    (async () => {
      try {
        let payload = { query: '', limit: 200 };
        if (userRole === 'RECRUITER' && userProfile?.email) {
          payload = { ...payload, recruiter_email: userProfile.email };
        }

        const res = await api.jobs.search(payload);
        if (cancelled) return;

        const rows = extractJobsArray(res).map((r, idx) => mapBackendJobRow(r, idx));
        if (!rows.length) return;

        setJobs((prev) => {
          if (REPLACE_SEED_JOBS) return rows;
          const map = new Map();
          for (const j of prev) map.set(String(j.id), j);
          for (const j of rows) map.set(String(j.id), j);
          return Array.from(map.values());
        });
      } catch {
        // keep seeded/mock jobs if backend search differs or gateway is down
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, authToken, userProfile?.email, userRole]);

  /** Merge DummyJSON + optional VITE_EXTRA_SEED_URL (e.g. Kaggle export hosted as JSON). */
  useEffect(() => {
    if (!DEMO_SEED_ENABLED || import.meta.env.VITE_OPEN_SEED === 'false') return undefined;
    let cancelled = false;

    (async () => {
      const extraUrl = import.meta.env.VITE_EXTRA_SEED_URL;
      if (extraUrl) {
        const extra = await fetchExtraSeedFromUrl(extraUrl);
        if (cancelled || !extra) return;
        if (extra.jobs.length) {
          setJobs((prev) => [...prev, ...extra.jobs.map(normalizeMergedJob)]);
        }
        if (extra.posts.length) {
          setPosts((prev) => [...extra.posts.map(normalizeMergedPost), ...prev]);
        }
        if (extra.connections.length) {
          setConnections((prev) => [...prev, ...extra.connections.map(normalizeMergedConnection)]);
        }
      }

      const open = await fetchOpenSourceSeed();
      if (cancelled || !open) return;
      setPosts((prev) => [...open.posts, ...prev]);
      setConnections((prev) => [...prev, ...open.connections]);
      setJobs((prev) => [...prev, ...open.jobs]);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const demoRecruiterAnalytics = useMemo(() => {
    return {
      topJobsByApplicationsMonth: [
        { title: 'Software Engineer', count: 120 },
        { title: 'Product Manager', count: 85 },
        { title: 'Data Scientist', count: 65 },
        { title: 'UX Designer', count: 40 },
        { title: 'DevOps Eng', count: 35 },
        { title: 'HR Partner', count: 25 },
        { title: 'QA Automation', count: 21 },
        { title: 'SRE', count: 18 },
        { title: 'ML Engineer', count: 16 },
        { title: 'Support Engineer', count: 12 },
      ],
      cityWiseApplicationsMonth: [
        { name: 'San Francisco', value: 450, color: '#0A66C2' },
        { name: 'New York', value: 300, color: '#004182' },
        { name: 'Seattle', value: 200, color: '#c37d16' },
        { name: 'Austin', value: 150, color: '#378fe9' },
        { name: 'Chicago', value: 100, color: '#b24020' },
      ],
      lowTractionJobs: [
        { title: 'Senior COBOL Developer', applicants: 2 },
        { title: 'On-call IT Support (Night Shift)', applicants: 5 },
        { title: 'Legacy Systems Analyst', applicants: 7 },
        { title: 'Mainframe Operator', applicants: 9 },
        { title: 'Printer Technician', applicants: 11 },
      ],
      clicksPerJob: [
        { title: 'Software Engineer', clicks: 4250 },
        { title: 'Product Manager', clicks: 2980 },
        { title: 'Data Scientist', clicks: 2410 },
        { title: 'UX Designer', clicks: 1870 },
        { title: 'DevOps Eng', clicks: 1620 },
      ],
      savedJobsSeries: [
        { name: 'Mon', saves: 180 },
        { name: 'Tue', saves: 210 },
        { name: 'Wed', saves: 165 },
        { name: 'Thu', saves: 240 },
        { name: 'Fri', saves: 325 },
        { name: 'Sat', saves: 95 },
        { name: 'Sun', saves: 105 },
      ],
    };
  }, []);

  const demoMemberAnalytics = useMemo(() => {
    // Last 30 days-ish (simplified)
    const views = Array.from({ length: 30 }, (_, i) => ({
      name: `${i + 1}`,
      views: Math.max(0, Math.round(12 + 6 * Math.sin(i / 3) + (i % 5) * 2)),
    }));
    return {
      profileViewsLast30Days: views,
      applicationStatusBreakdown: [
        { name: 'Offer', value: 1, color: '#004182' },
        { name: 'Interview', value: 1, color: '#378fe9' },
        { name: 'Reviewing', value: 2, color: '#c37d16' },
        { name: 'Submitted', value: 2, color: '#0A66C2' },
        { name: 'Rejected', value: 1, color: '#cc0000' },
      ],
    };
  }, []);

  const getRecruiterAnalytics = async ({ window = 'month', job_id } = {}) => {
    try {
      const [top, geo, jobsTop, saved] = await Promise.all([
        api.analytics.jobsTop({ window, metric: 'applications', limit: 10 }),
        api.analytics.geo({ window, job_id }),
        api.analytics.jobsTop({ window, metric: 'clicks', limit: 10 }),
        api.analytics.funnel({ window, job_id }), // best available endpoint for engagement until saved-series exists
      ]);

      // Adapt to whatever backend returns; keep frontend resilient.
      return {
        topJobsByApplicationsMonth: top?.items || demoRecruiterAnalytics.topJobsByApplicationsMonth,
        cityWiseApplicationsMonth: geo?.items || demoRecruiterAnalytics.cityWiseApplicationsMonth,
        lowTractionJobs: top?.low_traction || demoRecruiterAnalytics.lowTractionJobs,
        clicksPerJob: jobsTop?.items || demoRecruiterAnalytics.clicksPerJob,
        savedJobsSeries: saved?.saved_series || demoRecruiterAnalytics.savedJobsSeries,
      };
    } catch {
      return demoRecruiterAnalytics;
    }
  };

  const getMemberAnalytics = async ({ member_id, window = '30d' } = {}) => {
    try {
      const mid = member_id ?? memberKey;
      const res = await api.analytics.memberDashboard({ member_id: mid, window });
      return {
        profileViewsLast30Days: res?.profile_views_series || demoMemberAnalytics.profileViewsLast30Days,
        applicationStatusBreakdown: res?.application_status_breakdown || demoMemberAnalytics.applicationStatusBreakdown,
      };
    } catch {
      return demoMemberAnalytics;
    }
  };

  // Actions
  const addPost = async (content, { image = null, articleTitle = null } = {}) => {
    const authorName = userProfile?.displayName || 'Member';
    const text = typeof content === 'string' ? content : '';
    const artTitle =
      typeof articleTitle === 'string' ? articleTitle.trim() : '';
    const isArticle = artTitle.length > 0;
    const newPost = {
      id: Date.now(),
      author: authorName,
      ownerEmail: userProfile?.email || null,
      headline: userRole === 'RECRUITER' ? 'Recruiter' : 'Member',
      time: 'Just now',
      content: text,
      articleTitle: isArticle ? artTitle : null,
      image: image || null,
      likes: 0,
      comments: 0,
      likedByMe: false,
      reposts: 0,
      repostedByMe: false,
      commentList: [],
    };
    setPosts((prev) => [newPost, ...prev]);

    try {
      await api.analytics.ingest({
        event_type: isArticle ? 'article.created' : 'post.created',
        trace_id: crypto.randomUUID?.() || String(Date.now()),
        timestamp: new Date().toISOString(),
        actor_id: String(memberKey),
        entity: { entity_type: 'post', entity_id: String(newPost.id) },
        payload: { content: text, has_image: !!image, is_article: isArticle },
        idempotency_key: crypto.randomUUID?.() || String(Date.now()),
      });
    } catch {
      // keep UI responsive even if backend is down
    }
  };

  const updatePost = useCallback(
    (postId, next) => {
      setPosts((prev) => {
        const post = prev.find((p) => p.id === postId);
        if (!post) return prev;
        const email = userProfile?.email;
        const isOwner = email && post.ownerEmail === email;
        const isModerator = userRole === 'RECRUITER';
        if (!isOwner && !isModerator) return prev;

        if (typeof next === 'string') {
          const text = next.trim();
          if (!text) return prev;
          return prev.map((p) => (p.id === postId ? { ...p, content: text } : p));
        }

        const text = (next?.content || '').trim();
        if (post.articleTitle != null) {
          const title =
            next?.articleTitle != null
              ? String(next.articleTitle).trim()
              : post.articleTitle;
          if (!title || !text) return prev;
          return prev.map((p) =>
            p.id === postId ? { ...p, content: text, articleTitle: title } : p,
          );
        }

        if (!text) return prev;
        return prev.map((p) => (p.id === postId ? { ...p, content: text } : p));
      });
    },
    [userProfile?.email, userRole],
  );

  const deletePost = useCallback(
    (postId) => {
      setPosts((prev) => {
        const post = prev.find((p) => p.id === postId);
        if (!post) return prev;
        const email = userProfile?.email;
        const isOwner = email && post.ownerEmail === email;
        const isModerator = userRole === 'RECRUITER';
        if (!isOwner && !isModerator) return prev;
        return prev.filter((p) => p.id !== postId);
      });
    },
    [userProfile?.email, userRole],
  );

  const togglePostLike = useCallback((postId) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const liked = !!p.likedByMe;
        return {
          ...p,
          likedByMe: !liked,
          likes: Math.max(0, (p.likes || 0) + (liked ? -1 : 1)),
        };
      }),
    );
  }, []);

  const addPostComment = useCallback(
    (postId, text) => {
      const t = (text || '').trim();
      if (!t) return;
      const author = userProfile?.displayName || 'You';
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const list = Array.isArray(p.commentList) ? p.commentList : [];
          return {
            ...p,
            comments: (p.comments || 0) + 1,
            commentList: [
              ...list,
              { id: `c-${Date.now()}`, author, text: t, time: 'Just now' },
            ],
          };
        }),
      );
    },
    [userProfile?.displayName],
  );

  const togglePostRepost = useCallback((postId) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const did = !!p.repostedByMe;
        return {
          ...p,
          repostedByMe: !did,
          reposts: Math.max(0, (p.reposts || 0) + (did ? -1 : 1)),
        };
      }),
    );
  }, []);

  /** New feed item with your words + embedded original (LinkedIn-style repost with thoughts). */
  const addRepostWithThoughts = useCallback(
    (originalPostId, thoughts) => {
      const text = (thoughts || '').trim();
      if (!text) return;
      const authorName = userProfile?.displayName || 'Member';
      const email = userProfile?.email || null;
      const headline = userRole === 'RECRUITER' ? 'Recruiter' : 'Member';

      setPosts((prev) => {
        const orig = prev.find((p) => p.id === originalPostId);
        if (!orig) return prev;

        const newEntry = {
          id: Date.now(),
          author: authorName,
          ownerEmail: email,
          headline,
          time: 'Just now',
          content: text,
          repostQuote: {
            id: orig.id,
            author: orig.author,
            headline: orig.headline,
            content: orig.content,
            time: orig.time,
            image: orig.image || null,
            articleTitle: orig.articleTitle || null,
          },
          likes: 0,
          comments: 0,
          likedByMe: false,
          reposts: 0,
          repostedByMe: false,
          commentList: [],
        };

        const bumped = prev.map((p) =>
          p.id === originalPostId
            ? {
                ...p,
                reposts: (p.reposts || 0) + 1,
                repostedByMe: true,
              }
            : p,
        );
        return [newEntry, ...bumped];
      });
    },
    [userProfile?.displayName, userProfile?.email, userRole],
  );

  const feedPermissions = useMemo(() => {
    const name = userProfile?.displayName?.trim() || '';
    const shortName = name.split(/\s+/)[0] || 'there';
    if (userRole === 'RECRUITER') {
      return {
        canPost: true,
        placeholder: `Share hiring news or an update, ${shortName}…`,
        helper: 'Moderator: you can post, edit, or delete any feed item.',
      };
    }
    return {
      canPost: true,
      placeholder: `Start a post, ${shortName}…`,
      helper: 'Share with your network. You can edit or delete your own posts.',
    };
  }, [userRole, userProfile?.displayName]);

  const addJob = async (job) => {
    const localJob = {
      ...job,
      id: Date.now(),
      hasApplied: false,
      applicants: 0,
      industry: job.industry || 'General',
      description: job.description || '',
    };
    setJobs((prev) => [localJob, ...prev]);

    try {
      const created = await api.jobs.create({
        title: job.title,
        company_name: job.company,
        location: job.location,
        employment_type: job.type,
        remote: !!job.remote,
      });
      // If backend returns a canonical job_id, you can reconcile here later.
      return created;
    } catch {
      return localJob;
    }
  };

  const editJob = async (updatedJob) => {
    setJobs((prev) => prev.map((j) => (j.id === updatedJob.id ? updatedJob : j)));
    try {
      await api.jobs.update({
        job_id: updatedJob.id,
        title: updatedJob.title,
        location: updatedJob.location,
        employment_type: updatedJob.type,
        remote: !!updatedJob.remote,
      });
    } catch {
      // ignore for now
    }
  };

  const deleteJob = async (jobId) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    setApplicantsByJobId((prev) => {
      const next = { ...prev };
      delete next[String(jobId)];
      return next;
    });
    try {
      await api.jobs.close({ job_id: jobId });
    } catch {
      // ignore for now
    }
  };

  const applyToJob = async (jobId, { resume_text, cover_letter } = {}) => {
    setJobs((prev) => {
      const j = prev.find((x) => x.id === jobId);
      const priorApplicants = j?.applicants ?? 0;
      const resumeSummary =
        (resume_text || '').trim().slice(0, 1200) ||
        'Application submitted via Easy Apply with your profile summary.';

      const live = {
        id: `live-${Date.now()}`,
        name: userProfile?.displayName || 'Member',
        email: userProfile?.email || DEMO_MEMBER_EMAIL,
        headline: 'Applied via job board',
        resumeSummary,
        status: 'New',
        appliedAgo: 'Just now',
      };

      setApplicantsByJobId((ap) => {
        const key = String(jobId);
        const existing = ap[key] ?? generateApplicantsForJob(jobId, priorApplicants);
        return { ...ap, [key]: [live, ...existing] };
      });

      return prev.map((x) =>
        x.id === jobId ? { ...x, hasApplied: true, applicants: (x.applicants || 0) + 1 } : x,
      );
    });

    try {
      await api.applications.submit({
        job_id: jobId,
        member_id: memberKey,
        resume_text,
        cover_letter,
      });
    } catch {
      // keep UI responsive even if backend is down
    }
  };

  const updateApplicantStatus = useCallback((jobId, applicantId, status) => {
    const key = String(jobId);
    setApplicantsByJobId((prev) => {
      const list = prev[key];
      if (!list) return prev;
      return {
        ...prev,
        [key]: list.map((a) => (a.id === applicantId ? { ...a, status } : a)),
      };
    });
  }, []);

  const requestConnection = async (userId) => {
    setConnections((prev) =>
      prev.map((c) => (c.id === userId ? { ...c, status: 'pending' } : c)),
    );
    try {
      await api.connections.request({ requester_id: memberKey, receiver_id: userId });
    } catch {
      // ignore for now
    }
  };

  const withdrawConnectionRequest = useCallback((userId) => {
    setConnections((prev) =>
      prev.map((c) => (c.id === userId && c.status === 'pending' ? { ...c, status: 'none' } : c)),
    );
  }, []);

  const acceptIncomingInvite = useCallback((inviteId) => {
    setIncomingInvites((prev) => {
      const inv = prev.find((i) => i.id === inviteId);
      if (!inv) return prev;
      setConnections((c) => [
        ...c,
        {
          id: `conn-${Date.now()}`,
          name: inv.name,
          headline: inv.headline,
          mutual: inv.mutual ?? 5,
          status: 'connected',
        },
      ]);
      return prev.filter((i) => i.id !== inviteId);
    });
  }, []);

  const declineIncomingInvite = useCallback((inviteId) => {
    setIncomingInvites((prev) => prev.filter((i) => i.id !== inviteId));
  }, []);

  const toggleSaveJob = useCallback((jobId) => {
    const id = typeof jobId === 'number' ? jobId : Number(jobId);
    setSavedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isJobSaved = useCallback(
    (jobId) => savedJobIds.has(typeof jobId === 'number' ? jobId : Number(jobId)),
    [savedJobIds],
  );

  const sendMessage = useCallback((threadId, text) => {
    const t = (text || '').trim();
    if (!t) return;
    setConversationStore((prev) => ({
      threads: prev.threads.map((th) =>
        th.id === threadId
          ? {
              ...th,
              messages: [
                ...th.messages,
                { id: `m-${Date.now()}`, text: t, isMine: true, time: 'Just now' },
              ],
            }
          : th,
      ),
    }));
  }, []);

  const clearMemberStoredProfile = useCallback(() => {
    const email = userProfile?.email;
    if (!email) return;
    try {
      localStorage.removeItem(savedJobsStorageKey(email));
      localStorage.removeItem(incomingInvitesStorageKey(email));
      localStorage.removeItem(conversationsStorageKey(email));
      localStorage.removeItem(`linkdln:memberExtraSections:${email}`);
      localStorage.removeItem(memberProfilePhotoKey(email));
    } catch {
      /* ignore */
    }
    setSavedJobIds(new Set());
    setIncomingInvites(defaultIncomingInvites());
    setConversationStore(defaultConversationStore());
    notifyProfilePhotoUpdated();
  }, [userProfile?.email]);

  /** Removes member browser data (same as clearMemberStoredProfile) then signs out. */
  const deleteMemberProfile = useCallback(() => {
    clearMemberStoredProfile();
    setUserRole(null);
    setAuthToken(null);
    setUserProfile(null);
  }, [clearMemberStoredProfile]);

  const login = async (role, { email, password, displayName: explicitDisplayName } = {}) => {
    let authRes = null;
    try {
      authRes = await api.auth.login({ role, email, password });
    } catch (err) {
      if (REQUIRE_BACKEND_AUTH) {
        throw err;
      }
      authRes = null;
    }

    const token =
      authRes?.token ||
      authRes?.access_token ||
      authRes?.accessToken ||
      authRes?.jwt ||
      authRes?.data?.token ||
      null;
    if (token) setAuthToken(token);

    if (REQUIRE_BACKEND_AUTH && !token) {
      const msg = authRes?.message || authRes?.error || 'Login failed';
      throw new Error(typeof msg === 'string' ? msg : 'Login failed');
    }

    const resolvedEmail =
      (email || '').trim() ||
      authRes?.email ||
      authRes?.user?.email ||
      (role === 'RECRUITER' ? DEMO_RECRUITER_EMAIL : DEMO_MEMBER_EMAIL);

    let me = null;
    if (token) {
      try {
        me = await api.auth.me();
      } catch {
        me = null;
      }
    }

    let prev = null;
    try {
      const raw = localStorage.getItem('userProfile');
      prev = raw ? JSON.parse(raw) : null;
    } catch {
      /* ignore */
    }

    const sameUser =
      prev &&
      prev.email &&
      prev.role === role &&
      String(prev.email).toLowerCase() === String(resolvedEmail).toLowerCase();

    let displayName = (explicitDisplayName || '').trim();
    if (!displayName) {
      displayName =
        (me?.displayName ||
          me?.name ||
          me?.full_name ||
          me?.user?.displayName ||
          authRes?.displayName ||
          '').trim();
    }
    if (!displayName) {
      if (sameUser && prev.displayName) displayName = prev.displayName;
      else if (String(resolvedEmail).toLowerCase() === DEMO_MEMBER_EMAIL.toLowerCase()) displayName = DEMO_MEMBER_NAME;
      else if (String(resolvedEmail).toLowerCase() === DEMO_RECRUITER_EMAIL.toLowerCase()) displayName = DEMO_RECRUITER_NAME;
      else displayName = displayNameFromEmail(resolvedEmail);
    }

    const headline =
      sameUser && prev.headline
        ? prev.headline
        : (me?.headline || me?.title || authRes?.headline || '').trim() ||
          (role === 'RECRUITER'
            ? 'Recruiting & talent · linkedlnDS'
            : 'Professional · Edit your profile to add a headline');

    const idPatch =
      me?.id != null
        ? { id: me.id }
        : authRes?.user?.id != null
          ? { id: authRes.user.id }
          : {};
    const memberPatch =
      me?.member_id != null
        ? { member_id: me.member_id }
        : me?.memberId != null
          ? { member_id: me.memberId }
          : authRes?.member_id != null
            ? { member_id: authRes.member_id }
            : {};

    setUserProfile({ displayName, email: resolvedEmail, role, headline, ...idPatch, ...memberPatch });
    setUserRole(role);
  };

  const updateUserProfile = useCallback((patch) => {
    setUserProfile((p) => (p ? { ...p, ...patch } : p));
  }, []);

  const logout = () => {
    setUserRole(null);
    setAuthToken(null);
    setUserProfile(null);
  };

  return (
    <MockDataContext.Provider
      value={{
        userRole,
        authToken,
        userProfile,
        login,
        logout,
        updateUserProfile,
        posts,
        addPost,
        updatePost,
        deletePost,
        togglePostLike,
        addPostComment,
        togglePostRepost,
        addRepostWithThoughts,
        feedPermissions,
        jobs,
        addJob,
        editJob,
        deleteJob,
        applyToJob,
        applicantsByJobId,
        updateApplicantStatus,
        connections,
        requestConnection,
        withdrawConnectionRequest,
        incomingInvites,
        acceptIncomingInvite,
        declineIncomingInvite,
        savedJobIds,
        toggleSaveJob,
        isJobSaved,
        conversationStore,
        sendMessage,
        clearMemberStoredProfile,
        deleteMemberProfile,
        getRecruiterAnalytics,
        getMemberAnalytics,
      }}
    >
      {children}
    </MockDataContext.Provider>
  );
};
