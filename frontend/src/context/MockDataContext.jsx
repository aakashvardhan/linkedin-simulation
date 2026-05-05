/* eslint-disable react-refresh/only-export-components -- context module exports hooks, constants, and provider */
import React, { createContext, useEffect, useMemo, useState, useContext, useCallback, useRef } from 'react';
import { makeApi } from '../api';
import { generateApplicantsForJob } from '../data/mockApplicants';

const MockDataContext = createContext();

export const useMockData = () => useContext(MockDataContext);

function envFlag(name, defaultValue = false) {
  const v = import.meta.env?.[name];
  if (v === undefined || v === null || v === '') return defaultValue;
  return String(v).toLowerCase() === 'true' || v === '1';
}

/** When true, opt into extra backend hydration calls after login (best-effort). Defaults on for DB-backed / distributed runs. */
const BACKEND_INTEGRATION = envFlag('VITE_BACKEND_INTEGRATION', true);
/** When true, login must succeed against backend auth (no silent demo login). Defaults on so only real DB users can sign in. */
const REQUIRE_BACKEND_AUTH = envFlag('VITE_REQUIRE_BACKEND_AUTH', true);
/** When false, disables DummyJSON + extra seed merges for cleaner integration runs. */
const DEMO_SEED_ENABLED = import.meta.env.VITE_DEMO_SEED !== 'false';
/** When true, hydration replaces seeded jobs instead of merging (defaults on when backend integration is on and demo seed is off). */
const REPLACE_SEED_JOBS = envFlag('VITE_REPLACE_SEED_JOBS', !DEMO_SEED_ENABLED && BACKEND_INTEGRATION);
/** When true, member connections + incoming invites are replaced by `/connections/list` + `/connections/pending` after login. */
const REPLACE_SEED_CONNECTIONS = envFlag('VITE_REPLACE_SEED_CONNECTIONS', !DEMO_SEED_ENABLED && BACKEND_INTEGRATION);
/** When true, offline demo mode blocks apply until backend exists; when backend is on, applies always go through the API. */
const STRICT_APPLICATIONS = envFlag('VITE_STRICT_APPLICATIONS', BACKEND_INTEGRATION && !DEMO_SEED_ENABLED);

function isDuplicateApplicationError(err) {
  const status = err?.status;
  const msg = String(err?.message || '').toLowerCase();
  const details = err?.details;
  const bodyMsg =
    typeof details === 'object' && details !== null
      ? String(details.message || details.error || '').toLowerCase()
      : String(details || '').toLowerCase();
  return (
    status === 409 ||
    msg.includes('already applied') ||
    msg.includes('duplicate') ||
    bodyMsg.includes('already applied') ||
    bodyMsg.includes('duplicate')
  );
}

function resolveMemberKey(profile) {
  if (!profile) return 'me';
  if (profile.role === 'RECRUITER' && profile.recruiter_id != null && String(profile.recruiter_id).trim() !== '') {
    return profile.recruiter_id;
  }
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
  const root = payload?.status === 'success' && payload?.data !== undefined ? payload.data : payload;
  if (Array.isArray(root)) return root;
  if (Array.isArray(root.jobs)) return root.jobs;
  if (Array.isArray(root.items)) return root.items;
  if (Array.isArray(root.results)) return root.results;
  if (Array.isArray(root.data)) return root.data;
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
  const applicants =
    Number(raw?.applicants ?? raw?.applicant_count ?? raw?.applications_count ?? raw?.applicants_count ?? 0) ||
    0;
  const hasApplied = !!(raw?.hasApplied ?? raw?.has_applied ?? raw?.applied);

  const rawSkills = raw?.skills_required ?? raw?.skillsRequired ?? raw?.skills ?? [];
  const skillsRequired = Array.isArray(rawSkills)
    ? rawSkills
    : (() => { try { return JSON.parse(rawSkills); } catch { return String(rawSkills).split(',').map(s => s.trim()).filter(Boolean); } })();

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
    skills_required: skillsRequired,
  };
}

function formatAppliedAgo(iso) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function mapBackendApplicationRow(row) {
  const aid = row?.application_id ?? row?.id;
  const firstName = row?.first_name || '';
  const lastName = row?.last_name || '';
  const name = row?.name || [firstName, lastName].filter(Boolean).join(' ') || 'Member';
  const headline = row?.headline || '';

  // Build a rich resume summary for the AI service from all available fields
  const coverLetter = (row?.resume_summary || row?.cover_letter || '').trim();
  let resumeSummary = coverLetter;
  if (coverLetter.length < 200) {
    const parts = [];
    if (name && name !== 'Member') parts.push(`Name: ${name}`);
    if (headline) parts.push(`Title: ${headline}`);
    const skills = Array.isArray(row?.skills) ? row.skills : [];
    if (skills.length) parts.push(`Skills: ${skills.join(', ')}`);
    const profileText = parts.join('\n');
    resumeSummary = profileText + (coverLetter ? `\n\n${coverLetter}` : '');
  }

  return {
    id: aid,
    application_id: aid,
    name,
    email: row?.email || '',
    headline,
    resumeSummary: resumeSummary.slice(0, 1200),
    status: row?.status || 'submitted',
    appliedAgo: formatAppliedAgo(row?.application_datetime),
  };
}

function unwrapApiEnvelope(raw) {
  if (raw && raw.status === 'success' && raw.data !== undefined) return raw.data;
  return raw;
}

function mapBackendConnectionRow(row) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'Member';
  return {
    id: row.member_id,
    name,
    headline: row.headline || '',
    mutual: 0,
    status: 'connected',
  };
}

function mapBackendPendingInvite(row) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'Member';
  return {
    id: `pending-${row.request_id}`,
    request_id: row.request_id,
    requester_id: row.requester_id,
    name,
    headline: row.headline || '',
    mutual: 0,
  };
}

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

const defaultIncomingInvites = () =>
  DEMO_SEED_ENABLED
    ? [{ id: 'inv-seed-1', name: 'Alice Smith', headline: 'Data Scientist at OpenAI', mutual: 12 }]
    : [];

const defaultConversationStore = () =>
  DEMO_SEED_ENABLED
    ? {
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
      }
    : { threads: [] };

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

function splitDisplayName(fullName) {
  const t = (fullName || '').trim();
  if (!t) return { first: 'Member', last: '-' };
  const parts = t.split(/\s+/);
  const first = parts[0];
  const last = parts.slice(1).join(' ') || '-';
  return { first, last };
}

function formatRegisterError(err) {
  const d = err?.details;
  if (typeof d?.detail === 'string') return d.detail;
  if (Array.isArray(d?.detail)) return d.detail.map((x) => x?.msg || x).filter(Boolean).join(', ') || err.message;
  return err?.message || 'Registration failed';
}

async function hydrateProfileAfterLogin(role, token, base) {
  if (!token || !BACKEND_INTEGRATION) return base;
  const apiT = makeApi({ getAuthToken: () => token });
  try {
    if (role === 'MEMBER' && base.member_id != null) {
      const d = await apiT.members.get({ member_id: Number(base.member_id) });
      if (!d || typeof d !== 'object') return base;
      return {
        ...base,
        first_name: d.first_name,
        last_name: d.last_name,
        displayName: [d.first_name, d.last_name].filter(Boolean).join(' ').trim() || base.displayName,
        headline: (d.headline ?? base.headline) || '',
        about: d.about ?? '',
        skills: d.skills,
        experience: d.experience,
        education: d.education,
        phone: d.phone ?? '',
        location_city: d.location_city,
        location_state: d.location_state,
        location_country: d.location_country,
        profile_photo_url: d.profile_photo_url,
        resume_url: d.resume_url,
      };
    }
    if (role === 'RECRUITER' && base.recruiter_id != null) {
      const d = await apiT.recruiters.get({ recruiter_id: Number(base.recruiter_id) });
      if (!d || typeof d !== 'object') return base;
      const dn = [d.first_name, d.last_name].filter(Boolean).join(' ').trim();
      return {
        ...base,
        first_name: d.first_name,
        last_name: d.last_name,
        displayName: dn || base.displayName,
        headline: d.company_name ? `${dn} · ${d.company_name}` : base.headline,
        company_id: d.company_id,
        company_name: d.company_name,
        company_industry: d.company_industry,
        company_size: d.company_size,
        phone: d.phone ?? base.phone ?? '',
      };
    }
  } catch {
    return base;
  }
  return base;
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

  /** Corrupt session (role in storage but no profile) — clear so the user must sign in again. */
  useEffect(() => {
    if (!userRole || userProfile) return;
    setUserRole(null);
    localStorage.removeItem('userRole');
  }, [userRole, userProfile]);

  /** Start empty; demo bundles load asynchronously only when `VITE_DEMO_SEED` is not `false`. */
  const [posts, setPosts] = useState(() => []);

  const [jobs, setJobs] = useState(() => []);

  const [connections, setConnections] = useState(() => []);

  /** Recruiter view: synthetic + live applications per job id (string key). */
  const [applicantsByJobId, setApplicantsByJobId] = useState({});

  const [savedJobIds, setSavedJobIds] = useState(() => new Set());
  const [incomingInvites, setIncomingInvites] = useState(defaultIncomingInvites);
  const [conversationStore, setConversationStore] = useState(defaultConversationStore);
  const incomingInvitesRef = useRef(incomingInvites);
  useEffect(() => {
    incomingInvitesRef.current = incomingInvites;
  }, [incomingInvites]);

  const jobIdsKey = useMemo(() => jobs.map((j) => String(j.id)).sort().join('|'), [jobs]);

  useEffect(() => {
    if (!DEMO_SEED_ENABLED) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [jm, pm, cm] = await Promise.all([
          import('../data/kaggle/jobsSeed.json'),
          import('../data/kaggle/postsSeed.json'),
          import('../data/kaggle/connectionsSeed.json'),
        ]);
        if (cancelled) return;
        setJobs((prev) => (prev.length ? prev : [...jm.default]));
        setPosts((prev) => (prev.length ? prev : [...pm.default]));
        setConnections((prev) => (prev.length ? prev : [...cm.default]));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!DEMO_SEED_ENABLED || BACKEND_INTEGRATION) return;
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

  /** Optional: hydrate jobs list from core backend after login (integration runs). */
  useEffect(() => {
    if (!BACKEND_INTEGRATION) return undefined;
    if (!userRole || !authToken) return undefined;

    let cancelled = false;
    (async () => {
      try {
        let res;
        if (userRole === 'RECRUITER') {
          const rid = userProfile?.recruiter_id ?? userProfile?.member_id;
          if (rid == null || Number.isNaN(Number(rid))) return;
          res = await api.jobs.byRecruiter({
            recruiter_id: Number(rid),
            page: 1,
            page_size: 200,
          });
        } else {
          res = await api.jobs.search({
            keyword: '',
            page: 1,
            page_size: 200,
          });
        }
        if (cancelled) return;

        const rows = extractJobsArray(res).map((r, idx) => mapBackendJobRow(r, idx));
        if (!rows.length) {
          if (REPLACE_SEED_JOBS) setJobs([]);
          return;
        }

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
  }, [api, authToken, userProfile?.email, userProfile?.member_id, userProfile?.recruiter_id, userRole]);

  /** Recruiter: load real applicants from Application Service (replaces mock pipeline when integrated). */
  useEffect(() => {
    if (!BACKEND_INTEGRATION || userRole !== 'RECRUITER' || !authToken || !jobIdsKey) {
      if (BACKEND_INTEGRATION && userRole === 'RECRUITER' && !jobIdsKey) {
        setApplicantsByJobId({});
      }
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        jobs.map(async (j) => {
          const jid = Number(j.id);
          if (Number.isNaN(jid)) return null;
          try {
            const rid = userProfile?.recruiter_id;
            const res = await api.applications.byJob({ job_id: jid, recruiter_id: rid, page: 1, page_size: 500 });
            const apps = Array.isArray(res?.applications) ? res.applications : [];
            return [String(j.id), apps.map(mapBackendApplicationRow)];
          } catch {
            return [String(j.id), []];
          }
        }),
      );
      if (cancelled) return;
      const next = {};
      for (const r of results) {
        if (r) next[r[0]] = r[1];
      }
      setApplicantsByJobId(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [api, authToken, userRole, jobIdsKey, jobs]);

  /** Hydrate member connections + incoming invites from core backend after login. */
  useEffect(() => {
    if (!BACKEND_INTEGRATION || !authToken || userRole !== 'MEMBER') return undefined;
    const mid = userProfile?.member_id ?? userProfile?.id;
    if (mid == null || Number.isNaN(Number(mid))) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const uid = Number(mid);
        const [listRaw, pendingRaw] = await Promise.all([
          api.connections.list({ user_id: uid, page: 1, page_size: 200 }),
          api.connections.pending({ user_id: uid, page: 1, page_size: 100 }),
        ]);
        if (cancelled) return;

        const listData = unwrapApiEnvelope(listRaw);
        const pendData = unwrapApiEnvelope(pendingRaw);
        const apiConnected = Array.isArray(listData?.connections)
          ? listData.connections.map(mapBackendConnectionRow)
          : [];
        const apiPendingInvites = Array.isArray(pendData?.requests)
          ? pendData.requests.map(mapBackendPendingInvite)
          : [];

        setConnections((prev) => {
          const outboundPending = prev.filter((c) => c.status === 'pending');
          const connectedIds = new Set(apiConnected.map((c) => String(c.id)));
          const keepPending = outboundPending.filter((p) => !connectedIds.has(String(p.id)));

          if (REPLACE_SEED_CONNECTIONS) {
            return [...apiConnected, ...keepPending];
          }
          const map = new Map();
          for (const c of prev) map.set(String(c.id), c);
          for (const c of apiConnected) map.set(String(c.id), c);
          return Array.from(map.values());
        });

        if (REPLACE_SEED_CONNECTIONS) {
          setIncomingInvites(apiPendingInvites);
        } else if (apiPendingInvites.length) {
          setIncomingInvites((prev) => {
            const map = new Map();
            for (const i of prev) map.set(String(i.id), i);
            for (const i of apiPendingInvites) map.set(String(i.id), i);
            return Array.from(map.values());
          });
        }
      } catch {
        /* keep local / seeded network */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, authToken, userRole, userProfile?.member_id, userProfile?.id]);

  /** Merge DummyJSON + optional VITE_EXTRA_SEED_URL (e.g. Kaggle export hosted as JSON). */
  useEffect(() => {
    if (!DEMO_SEED_ENABLED || import.meta.env.VITE_OPEN_SEED === 'false') return undefined;
    let cancelled = false;

    (async () => {
      const {
        fetchOpenSourceSeed,
        fetchExtraSeedFromUrl,
        normalizeMergedJob,
        normalizeMergedPost,
        normalizeMergedConnection,
      } = await import('../data/openSeedLoader');
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
    if (!DEMO_SEED_ENABLED) {
      return {
        topJobsByApplicationsMonth: [],
        cityWiseApplicationsMonth: [],
        lowTractionJobs: [],
        clicksPerJob: [],
        savedJobsSeries: [],
      };
    }
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
    if (!DEMO_SEED_ENABLED) {
      return {
        profileViewsLast30Days: [],
        applicationStatusBreakdown: [],
      };
    }
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
    const empty = demoRecruiterAnalytics;
    try {
      const [top, geo, jobsTop, saved] = await Promise.all([
        api.analytics.jobsTop({ window, metric: 'applications', limit: 10 }),
        api.analytics.geo({ window, job_id }),
        api.analytics.jobsTop({ window, metric: 'clicks', limit: 10 }),
        api.analytics.funnel({ window, job_id }),
      ]);

      const clicksRaw = Array.isArray(jobsTop?.items) ? jobsTop.items : [];
      const clicksPerJob = clicksRaw.map((x) => ({
        title: x.title,
        clicks: Number(x.count ?? x.clicks ?? 0),
      }));

      return {
        topJobsByApplicationsMonth: top?.items ?? (DEMO_SEED_ENABLED ? empty.topJobsByApplicationsMonth : []),
        cityWiseApplicationsMonth: geo?.items ?? (DEMO_SEED_ENABLED ? empty.cityWiseApplicationsMonth : []),
        lowTractionJobs: top?.low_traction ?? (DEMO_SEED_ENABLED ? empty.lowTractionJobs : []),
        clicksPerJob: clicksPerJob.length ? clicksPerJob : DEMO_SEED_ENABLED ? empty.clicksPerJob : [],
        savedJobsSeries: saved?.saved_series ?? (DEMO_SEED_ENABLED ? empty.savedJobsSeries : []),
      };
    } catch {
      return empty;
    }
  };

  const getMemberAnalytics = async ({ member_id, window = '30d' } = {}) => {
    const empty = demoMemberAnalytics;
    try {
      const mid = Number(member_id != null ? member_id : userProfile?.member_id);
      if (Number.isNaN(mid)) {
        return empty;
      }
      const res = await api.analytics.memberDashboard({ member_id: mid, window });
      return {
        profileViewsLast30Days: res?.profile_views_series ?? (DEMO_SEED_ENABLED ? empty.profileViewsLast30Days : []),
        applicationStatusBreakdown:
          res?.application_status_breakdown ?? (DEMO_SEED_ENABLED ? empty.applicationStatusBreakdown : []),
      };
    } catch {
      return empty;
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
    if (BACKEND_INTEGRATION) {
      const rid = Number(userProfile?.recruiter_id ?? userProfile?.member_id);
      const cid = Number(userProfile?.company_id);
      if (Number.isNaN(rid) || Number.isNaN(cid)) {
        throw new Error('Recruiter profile is missing company_id. Sign out and sign in again.');
      }
      const created = await api.jobs.create({
        recruiter_id: rid,
        company_id: cid,
        title: job.title,
        description: (job.description || '').trim() || '—',
        employment_type: job.type || 'Full-time',
        location: job.location || '',
        work_mode: job.remote ? 'remote' : 'onsite',
        skills_required: [],
        seniority_level: null,
        salary_min: null,
        salary_max: null,
      });
      const row = mapBackendJobRow(
        {
          ...created,
          company: job.company || userProfile?.company_name,
          industry: job.industry,
          description: job.description,
          employment_type: job.type,
          remote: !!job.remote,
          applicants: 0,
        },
        0,
      );
      setJobs((prev) => [row, ...prev]);
      return created;
    }

    const localJob = {
      ...job,
      id: Date.now(),
      hasApplied: false,
      applicants: 0,
      industry: job.industry || 'General',
      description: job.description || '',
    };
    setJobs((prev) => [localJob, ...prev]);
    return localJob;
  };

  const editJob = async (updatedJob) => {
    if (BACKEND_INTEGRATION) {
      const rid = Number(userProfile?.recruiter_id ?? userProfile?.member_id);
      if (!Number.isNaN(rid)) {
        await api.jobs.update({
          job_id: Number(updatedJob.id),
          recruiter_id: rid,
          title: updatedJob.title,
          description: updatedJob.description,
          employment_type: updatedJob.type,
          location: updatedJob.location,
          work_mode: updatedJob.remote ? 'remote' : 'onsite',
        });
      }
    }
    setJobs((prev) => prev.map((j) => (j.id === updatedJob.id ? updatedJob : j)));
  };

  const deleteJob = async (jobId) => {
    if (BACKEND_INTEGRATION) {
      const rid = Number(userProfile?.recruiter_id ?? userProfile?.member_id);
      if (!Number.isNaN(rid)) {
        await api.jobs.close({ job_id: Number(jobId), recruiter_id: rid });
      }
    }
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    setApplicantsByJobId((prev) => {
      const next = { ...prev };
      delete next[String(jobId)];
      return next;
    });
  };

  const applyToJob = useCallback(
    async (jobId, { resume_text, cover_letter } = {}) => {
      const jid = typeof jobId === 'number' ? jobId : Number(jobId);
      const job = jobs.find((x) => x.id === jobId || Number(x.id) === jid);
      if (job?.hasApplied) {
        return { ok: false, duplicate: true };
      }

      if (BACKEND_INTEGRATION) {
        const mid = Number(userProfile?.member_id);
        if (userRole !== 'MEMBER' || Number.isNaN(mid)) {
          return { ok: false, error: new Error('Only signed-in members can apply.') };
        }
        try {
          await api.applications.submit({
            job_id: jid,
            member_id: mid,
            resume_text,
            cover_letter,
          });
        } catch (e) {
          if (isDuplicateApplicationError(e)) return { ok: false, duplicate: true };
          return { ok: false, error: e };
        }
        setJobs((prev) =>
          prev.map((x) =>
            String(x.id) === String(jobId) || Number(x.id) === jid
              ? { ...x, hasApplied: true, applicants: (x.applicants || 0) + 1 }
              : x,
          ),
        );
        return { ok: true };
      }

      if (STRICT_APPLICATIONS) {
        return { ok: false, error: new Error('Enable backend integration to submit applications.') };
      }

      const commitApplicationLocally = () => {
        setJobs((prev) => {
          const j = prev.find((x) => x.id === jobId);
          const priorApplicants = j?.applicants ?? 0;
          const resumeSummary =
            (resume_text || '').trim().slice(0, 1200) ||
            'Application submitted via Easy Apply with your profile summary.';

          const live = {
            id: `live-${Date.now()}`,
            name: userProfile?.displayName || 'Member',
            email: userProfile?.email || '',
            headline: 'Applied via job board',
            resumeSummary,
            status: 'submitted',
            appliedAgo: 'Just now',
          };

          setApplicantsByJobId((ap) => {
            const key = String(jobId);
            const existing =
              ap[key] ?? (DEMO_SEED_ENABLED ? generateApplicantsForJob(jobId, priorApplicants) : []);
            return { ...ap, [key]: [live, ...existing] };
          });

          return prev.map((x) =>
            x.id === jobId ? { ...x, hasApplied: true, applicants: (x.applicants || 0) + 1 } : x,
          );
        });
      };

      commitApplicationLocally();
      return { ok: true };
    },
    [api, jobs, userProfile?.displayName, userProfile?.email, userProfile?.member_id, userRole, DEMO_SEED_ENABLED],
  );

  const updateApplicantStatus = useCallback(
    async (jobId, applicantId, status) => {
      const key = String(jobId);
      setApplicantsByJobId((prev) => {
        const list = prev[key];
        if (!list) return prev;
        return {
          ...prev,
          [key]: list.map((a) => (a.id === applicantId ? { ...a, status } : a)),
        };
      });
      if (BACKEND_INTEGRATION && userRole === 'RECRUITER') {
        const rid = Number(userProfile?.recruiter_id ?? userProfile?.member_id);
        if (!Number.isNaN(rid)) {
          try {
            await api.applications.updateStatus({
              application_id: Number(applicantId),
              recruiter_id: rid,
              status,
            });
          } catch {
            /* optimistic UI; recruiter can refresh */
          }
        }
      }
    },
    [api, userRole, userProfile?.recruiter_id, userProfile?.member_id],
  );

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

  const acceptIncomingInvite = useCallback(
    async (inviteId) => {
      const inv = incomingInvitesRef.current.find((i) => i.id === inviteId);
      if (!inv) return;
      if (BACKEND_INTEGRATION && inv.request_id != null && userRole === 'MEMBER') {
        const rid = Number(memberKey);
        if (!Number.isNaN(rid)) {
          try {
            await api.connections.accept({ request_id: inv.request_id, receiver_id: rid });
          } catch {
            return;
          }
        }
      }
      setIncomingInvites((prev) => prev.filter((i) => i.id !== inviteId));
      const peerId = inv.requester_id != null ? inv.requester_id : `conn-${inviteId}`;
      setConnections((c) => [
        ...c.filter((x) => String(x.id) !== String(peerId)),
        {
          id: peerId,
          name: inv.name,
          headline: inv.headline,
          mutual: inv.mutual ?? 0,
          status: 'connected',
        },
      ]);
    },
    [api, memberKey, userRole],
  );

  const declineIncomingInvite = useCallback(
    async (inviteId) => {
      const inv = incomingInvitesRef.current.find((i) => i.id === inviteId);
      if (!inv) return;
      if (BACKEND_INTEGRATION && inv.request_id != null && userRole === 'MEMBER') {
        const rid = Number(memberKey);
        if (!Number.isNaN(rid)) {
          try {
            await api.connections.reject({ request_id: inv.request_id, receiver_id: rid });
          } catch {
            return;
          }
        }
      }
      setIncomingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    },
    [api, memberKey, userRole],
  );

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

  const saveMemberProfileRemote = useCallback(
    async (next) => {
      if (!BACKEND_INTEGRATION || !authToken || userRole !== 'MEMBER' || userProfile?.member_id == null) {
        return { ok: true, skipped: true };
      }
      try {
        const skillsArr = (next.skills || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const loc = (next.location || '').trim();
        const cityPart = loc.split(',')[0]?.trim() || undefined;
        await api.members.update({
          member_id: Number(userProfile.member_id),
          first_name: next.firstName,
          last_name: next.lastName,
          headline: next.headline || undefined,
          about: next.about || undefined,
          skills: skillsArr.length ? skillsArr : undefined,
          phone: (next.phone || '').trim() || undefined,
          location_city: cityPart,
          profile_photo_url: next.profilePhotoUrl?.startsWith('http') ? next.profilePhotoUrl : undefined,
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e };
      }
    },
    [api, authToken, userRole, userProfile?.member_id],
  );

  const login = async (
    role,
    {
      email,
      password,
      displayName: explicitDisplayName,
      isSignup,
      phone,
      city,
      companyName,
      companyIndustry,
    } = {},
  ) => {
    const em = (email || '').trim();
    const unauthApi = makeApi({ getAuthToken: () => null });

    if (isSignup && !BACKEND_INTEGRATION) {
      throw new Error('Create account requires the API. Set VITE_BACKEND_INTEGRATION=true in frontend/.env.');
    }

    /** Populated after successful `POST /members/create` or `POST /recruiters/create` (includes JWT once DB row is committed). */
    let signupSession = null;
    if (isSignup && BACKEND_INTEGRATION) {
      if (!password) throw new Error('Password is required.');
      const { first, last } = splitDisplayName((explicitDisplayName || '').trim() || displayNameFromEmail(em));
      try {
        if (role === 'MEMBER') {
          signupSession = await unauthApi.members.create({
            first_name: first,
            last_name: last,
            email: em,
            password,
            phone: (phone || '').trim() || undefined,
            location_city: (city || '').trim() || undefined,
          });
        } else {
          const cname = (companyName || '').trim();
          if (!cname) throw new Error('Company name is required for recruiter registration.');
          signupSession = await unauthApi.recruiters.create({
            first_name: first,
            last_name: last,
            email: em,
            password,
            phone: (phone || '').trim() || undefined,
            company_name: cname,
            company_industry: (companyIndustry || '').trim() || undefined,
          });
        }
      } catch (err) {
        if (err?.status === 409) throw new Error('An account with this email already exists.');
        throw new Error(formatRegisterError(err));
      }
    }

    let authRes = null;
    if (signupSession?.token) {
      authRes = signupSession;
    } else {
      try {
        authRes = await unauthApi.auth.login({ role, email: em, password });
      } catch (err) {
        if (REQUIRE_BACKEND_AUTH) {
          throw err;
        }
        authRes = null;
      }
    }

    const token =
      authRes?.token ||
      authRes?.access_token ||
      authRes?.accessToken ||
      authRes?.jwt ||
      authRes?.data?.token ||
      null;

    if (REQUIRE_BACKEND_AUTH && !token) {
      const msg = authRes?.message || authRes?.error || 'Login failed';
      throw new Error(typeof msg === 'string' ? msg : 'Login failed');
    }

    let me = null;
    if (token) {
      const apiWithToken = makeApi({ getAuthToken: () => token });
      if (REQUIRE_BACKEND_AUTH) {
        try {
          me = await apiWithToken.auth.me();
        } catch (err) {
          setAuthToken(null);
          throw new Error(err?.message || 'Could not verify your session. Check the API and sign in again.');
        }
        if (!me) {
          setAuthToken(null);
          throw new Error('Could not load your account. Try signing in again.');
        }
      } else {
        try {
          me = await apiWithToken.auth.me();
        } catch {
          me = null;
        }
      }
      setAuthToken(token);
    }

    const resolvedEmail =
      em ||
      (typeof me?.email === 'string' && me.email.trim() ? me.email.trim() : '') ||
      authRes?.email ||
      authRes?.user?.email ||
      '';

    const fromLoginNames = authRes
      ? [authRes.first_name, authRes.last_name].filter(Boolean).join(' ').trim()
      : '';

    /** Profile display fields: server truth only (no localStorage merge, no email-to-name guessing). */
    let displayName = (
      (me?.displayName || me?.name || me?.full_name || '').trim() ||
      fromLoginNames ||
      (isSignup ? (explicitDisplayName || '').trim() : '')
    ).trim();
    if (!displayName && resolvedEmail) {
      displayName = resolvedEmail;
    }

    const headline = (me?.headline || me?.title || authRes?.headline || '').trim();

    const idPatch =
      me?.id != null
        ? { id: me.id }
        : authRes?.user?.id != null
          ? { id: authRes.user.id }
          : role === 'MEMBER' && (me?.member_id ?? authRes?.member_id) != null
            ? { id: me.member_id ?? authRes.member_id }
            : role === 'RECRUITER' && (me?.recruiter_id ?? authRes?.recruiter_id) != null
              ? { id: me.recruiter_id ?? authRes.recruiter_id }
              : {};

    let memberPatch = {};
    if (role === 'MEMBER') {
      const mid = me?.member_id ?? me?.memberId ?? authRes?.member_id;
      if (mid != null) memberPatch = { member_id: mid };
    } else if (role === 'RECRUITER') {
      const rid = me?.recruiter_id ?? authRes?.recruiter_id ?? me?.member_id;
      const cid = me?.company_id ?? authRes?.company_id;
      if (rid != null) memberPatch = { recruiter_id: rid, member_id: rid };
      if (cid != null) memberPatch = { ...memberPatch, company_id: cid };
    }

    let profile = { displayName, email: resolvedEmail, role, headline, ...idPatch, ...memberPatch };
    if (token && BACKEND_INTEGRATION) {
      profile = await hydrateProfileAfterLogin(role, token, profile);
    }
    setUserProfile(profile);
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
        saveMemberProfileRemote,
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
