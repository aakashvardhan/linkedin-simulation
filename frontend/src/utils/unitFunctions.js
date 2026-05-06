/** Small pure helpers used by Jobs + tests (resume parsing, filtering, scoring). */

export const DEFAULT_SKILL_DICTIONARY = [
  'react',
  'typescript',
  'javascript',
  'node',
  'python',
  'sql',
  'kafka',
  'aws',
  'docker',
  'kubernetes',
  'mongodb',
  'redis',
  'postgres',
  'postgresql',
  'graphql',
  'tensorflow',
  'pytorch',
];

export function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    // Keep word tokens readable for substring matching (e.g., "boston" inside "Boston, MA")
    .replace(/[^a-z0-9+#.\s/,]/g, ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract normalized skill keywords from resume-ish text using a simple dictionary scan.
 */
export function extractSkillsFromResume(text, dictionary = DEFAULT_SKILL_DICTIONARY) {
  const hay = normalizeText(text);
  if (!hay) return [];

  const found = new Set();
  const dict = Array.isArray(dictionary) && dictionary.length ? dictionary : DEFAULT_SKILL_DICTIONARY;

  for (const skill of dict) {
    const s = String(skill).toLowerCase().trim();
    if (!s) continue;
    // Word-ish match: boundaries around tokens; special-case '+' skills like c++
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    if (re.test(` ${hay} `)) found.add(s === 'postgresql' ? 'postgres' : s);
  }

  // Normalize synonyms
  const out = [...found];
  // Prefer "postgres" over duplicated postgresql if both matched
  return Array.from(new Set(out.filter(Boolean))).sort();
}

/**
 * Lightweight job filtering used by unit tests + can be reused by UI lists.
 */
export function filterJobs(jobs, filters = {}) {
  const list = Array.isArray(jobs) ? jobs : [];
  const keyword = normalizeText(filters.keyword);
  const location = normalizeText(filters.location);
  const type = normalizeText(filters.type);
  const industry = normalizeText(filters.industry);
  const remoteOnly = !!filters.remoteOnly;

  return list.filter((job) => {
    const industryField = normalizeText(job.industry);
    const desc = normalizeText(job.description);
    const hay = normalizeText(`${job.title} ${job.company} ${job.location} ${industryField} ${desc}`);

    const matchesKeyword = !keyword || hay.includes(keyword);
    const matchesLocation = !location || normalizeText(job.location).includes(location);
    const matchesType = !type || normalizeText(job.type) === type;
    const matchesIndustry = !industry || industryField === industry;
    const matchesRemote = remoteOnly ? job.remote === true : true;

    return matchesKeyword && matchesLocation && matchesType && matchesIndustry && matchesRemote;
  });
}

function jobText(job) {
  return normalizeText(`${job?.title || ''} ${job?.description || ''}`);
}

/**
 * Score 0-100:
 * - Primary: percent of `requiredSkills` found in candidateSkills OR job text.
 * - If requiredSkills is empty => 0 (per tests).
 */
export function calculateMatchScore(job, candidateSkills = [], requiredSkills = []) {
  const req = Array.isArray(requiredSkills) ? requiredSkills.map((s) => String(s).toLowerCase().trim()).filter(Boolean) : [];
  if (!req.length) return 0;

  const cand = new Set((Array.isArray(candidateSkills) ? candidateSkills : []).map((s) => String(s).toLowerCase().trim()).filter(Boolean));
  const jt = jobText(job);

  let hits = 0;
  for (const r of req) {
    const okFromSkills = cand.has(r);
    const okFromText = jt.includes(r);
    if (okFromSkills || okFromText) hits += 1;
  }

  return Math.round((hits / req.length) * 100);
}

/**
 * Stable cache keys for client-side memoization (sorted JSON keys).
 */
export function makeCacheKey(namespace, obj) {
  const sortedObj = sortKeysDeep(obj);
  return `${String(namespace)}:${JSON.stringify(sortedObj)}`;
}

function sortKeysDeep(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (typeof value !== 'object') return value;
  const out = {};
  for (const k of Object.keys(value).sort()) {
    out[k] = sortKeysDeep(value[k]);
  }
  return out;
}
