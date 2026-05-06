/**
 * Loads extra dummy data from open, no-key HTTP APIs (browser-safe).
 * Kaggle does not expose a public browser API; use scripts/kaggle_download_sample.py locally instead.
 *
 * Sources (see https://dummyjson.com/docs — free test data):
 * - Users → network connections + synthetic job rows from company fields
 * - Quotes → feed posts
 */

const DUMMYJSON = 'https://dummyjson.com';

/**
 * Optional hosted JSON merge: set VITE_EXTRA_SEED_URL to a URL returning
 * { "jobs": [...], "posts": [...], "connections": [...] } (all optional).
 * Use this for files exported from Kaggle after local download.
 */
export async function fetchExtraSeedFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    jobs: Array.isArray(data.jobs) ? data.jobs : [],
    posts: Array.isArray(data.posts) ? data.posts : [],
    connections: Array.isArray(data.connections) ? data.connections : [],
  };
}

/** Normalize rows from your own JSON / Kaggle export pipeline. */
export function normalizeMergedJob(row, index) {
  return {
    id: Number(row.id) || 100000 + index,
    title: String(row.title || row.job_title || 'Open role'),
    company: String(row.company || row.company_name || 'Company'),
    location: String(row.location || 'Remote'),
    type: String(row.type || row.employment_type || 'Full-time'),
    remote: Boolean(row.remote),
    industry: String(row.industry || row.sector || 'General'),
    description: String(
      row.description || row.summary || 'Role details will be shared during screening.',
    ),
    applicants: Math.max(0, Number(row.applicants) || 20),
    hasApplied: false,
  };
}

export function normalizeMergedPost(row, index) {
  return {
    id: Number(row.id) || 120000 + index,
    author: String(row.author || 'Member'),
    headline: String(row.headline || 'Member'),
    time: String(row.time || '1h'),
    content: String(row.content || ''),
    likes: Number(row.likes) || 0,
    comments: Number(row.comments) || 0,
    image: row.image || null,
    ownerEmail: row.ownerEmail ?? null,
    likedByMe: false,
    reposts: Number(row.reposts) || 0,
    repostedByMe: false,
    commentList: [],
  };
}

export function normalizeMergedConnection(row, index) {
  return {
    id: Number(row.id) || 130000 + index,
    name: String(row.name || 'Connection'),
    headline: String(row.headline || ''),
    mutual: Number(row.mutual) || 1,
    status: row.status || 'none',
  };
}

function mapUserToConnection(u, index) {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || `Member ${u.id}`;
  const title = u.company?.title || 'Professional';
  const company = u.company?.name || 'Open network';
  return {
    id: 1000 + u.id + index,
    name,
    headline: `${title} · ${company}`,
    mutual: 3 + (u.id % 40),
    status: 'none',
  };
}

function mapUserToJob(u) {
  const title = u.company?.title || 'Individual Contributor';
  const company = u.company?.name || 'Independent';
  const city = u.address?.city || 'Remote';
  const state = u.address?.state || '';
  const location = state ? `${city}, ${state}` : city;
  return {
    id: 5000 + u.id,
    title,
    company,
    location,
    type: 'Full-time',
    remote: u.id % 3 !== 0,
    applicants: 15 + (u.id % 90),
    hasApplied: false,
  };
}

function mapQuoteToPost(q) {
  return {
    id: 8000 + q.id,
    author: q.author,
    headline: 'Professional update',
    time: `${(q.id % 11) + 1}h`,
    content: q.quote,
    likes: 30 + (q.id % 200),
    comments: q.id % 35,
    image: null,
    ownerEmail: null,
  };
}

/**
 * @returns {Promise<{ posts: object[], connections: object[], jobs: object[] } | null>}
 */
export async function fetchOpenSourceSeed() {
  try {
    const [usersRes, quotesRes] = await Promise.all([
      fetch(`${DUMMYJSON}/users?limit=8&select=firstName,lastName,company,address,id`),
      fetch(`${DUMMYJSON}/quotes?limit=6`),
    ]);

    if (!usersRes.ok || !quotesRes.ok) return null;

    const usersJson = await usersRes.json();
    const quotesJson = await quotesRes.json();

    const users = usersJson.users || [];
    const quotes = quotesJson.quotes || [];

    const connections = users.map((u, i) => mapUserToConnection(u, i));
    const jobs = users.map(mapUserToJob);
    const posts = quotes.map(mapQuoteToPost);

    return { posts, connections, jobs };
  } catch {
    return null;
  }
}
