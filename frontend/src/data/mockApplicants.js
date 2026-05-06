/** Deterministic synthetic applicants for recruiter demo (no backend). */

const FIRST = [
  'Alex', 'Jordan', 'Sam', 'Taylor', 'Riley', 'Casey', 'Morgan', 'Quinn', 'Avery', 'Jamie',
  'Priya', 'Diego', 'Kenji', 'Amara', 'Elena', 'Marcus', 'Zara', 'Omar', 'Lin', 'Sofia',
];
const LAST = [
  'Chen', 'Patel', 'García', 'Kim', 'Okafor', 'Nielsen', 'Sato', 'Hernandez', 'Brown', 'Singh',
  'Müller', 'Cohen', 'Park', 'Silva', 'Ito', 'Kowalski', 'Nguyen', 'Rossi', 'Khan', 'Dubois',
];
const COMPANIES = ['FinTech Co', 'HealthAI', 'DataScale', 'CloudNine', 'RetailNext', 'AutoDrive'];
/** Matches MySQL `applications.status` enum (backend Application Service). */
export const APPLICATION_STATUSES = ['submitted', 'reviewing', 'interview', 'offer', 'rejected'];

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {string|number} jobId
 * @param {number} count
 * @returns {Array<{ id: string, name: string, email: string, headline: string, status: string, appliedAgo: string }>}
 */
export function generateApplicantsForJob(jobId, count) {
  const n = Math.min(Math.max(0, Number(count) || 0), 500);
  const rnd = mulberry32(Number(jobId) || String(jobId).split('').reduce((s, c) => s + c.charCodeAt(0), 0));
  const out = [];
  for (let i = 0; i < n; i++) {
    const fn = FIRST[Math.floor(rnd() * FIRST.length)];
    const ln = LAST[Math.floor(rnd() * LAST.length)];
    const slug = `${fn}${ln}${i}`.toLowerCase().replace(/[^a-z]/g, '');
    const skills = ['React', 'Python', 'Kafka', 'AWS', 'SQL', 'System design'];
    const pick = skills[Math.floor(rnd() * skills.length)];
    out.push({
      id: `syn-${jobId}-${i}`,
      name: `${fn} ${ln}`,
      email: `${slug}@demo.linkdln`,
      headline: `Software Engineer · ${COMPANIES[Math.floor(rnd() * COMPANIES.length)]}`,
      resumeSummary: `${fn} brings ${4 + Math.floor(rnd() * 8)} years building distributed systems and ${pick.toLowerCase()} stacks. Recent work: led migration to event-driven architecture, improved p99 latency by 35%, and mentored junior engineers. Education: BS Computer Science. Open to relocation.`,
      status: APPLICATION_STATUSES[1 + Math.floor(rnd() * (APPLICATION_STATUSES.length - 1))],
      appliedAgo: `${1 + Math.floor(rnd() * 56)}d ago`,
    });
  }
  return out;
}

const EVALUATION_ITEMS = [
  {
    key: 'Culture Fit',
    values: [
      { value: 'Strong signal', status: 'verified' },
      { value: 'Needs review', status: 'needs_review' },
      { value: 'Insufficient data', status: 'needs_review' },
    ],
  },
  {
    key: 'Salary Alignment',
    values: [
      { value: 'Within range', status: 'verified' },
      { value: 'Above range', status: 'flagged' },
      { value: 'Verify with candidate', status: 'needs_review' },
    ],
  },
  {
    key: 'Visa / Work Auth',
    values: [
      { value: 'Authorized', status: 'verified' },
      { value: 'Needs sponsorship', status: 'flagged' },
      { value: 'Unknown', status: 'needs_review' },
    ],
  },
  {
    key: 'Notice Period',
    values: [
      { value: 'Immediate', status: 'verified' },
      { value: '2 weeks', status: 'verified' },
      { value: '30 days', status: 'needs_review' },
      { value: 'Unknown', status: 'needs_review' },
    ],
  },
  {
    key: 'Reference Check',
    values: [
      { value: 'Pending', status: 'needs_review' },
      { value: '1 of 2 complete', status: 'needs_review' },
      { value: 'Not started', status: 'needs_review' },
    ],
  },
];

const SKILL_KEYWORDS = ['React', 'Python', 'Kafka', 'AWS', 'SQL', 'System design', 'Machine Learning', 'Docker', 'Kubernetes', 'TypeScript', 'Node.js', 'Java', 'Go', 'Data Engineering', 'NLP'];

export function generateCandidateMatches(job, applicants, recruiterName = 'Recruiter', maxResults = 5) {
  const seed = Number(job.id) || String(job.id).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const rnd = mulberry32(seed + 9999);
  const pool = applicants.slice(0, Math.max(applicants.length, 0));
  const descLower = ((job.description || '') + ' ' + (job.title || '')).toLowerCase();

  const scored = pool.map((a) => {
    const resumeLower = (a.resumeSummary || '').toLowerCase();
    const matched = SKILL_KEYWORDS.filter(
      (sk) => resumeLower.includes(sk.toLowerCase()) || descLower.includes(sk.toLowerCase()),
    );
    const baseScore = 60 + Math.floor(rnd() * 35);
    const skillBonus = Math.min(matched.length * 3, 15);
    const matchScore = Math.min(baseScore + skillBonus, 97);
    return { ...a, matchScore, matchedSkills: matched.length > 0 ? matched : ['General Engineering'] };
  });

  scored.sort((a, b) => b.matchScore - a.matchScore);
  const top = scored.slice(0, maxResults);

  const candidates = top.map((c) => {
    const firstName = c.name.split(' ')[0];
    const topSkill = c.matchedSkills[0];
    const skillsList = c.matchedSkills.slice(0, 3).join(', ');

    const emailDraft =
      `Subject: Exciting ${job.title} opportunity at ${job.company}\n\n` +
      `Hi ${firstName},\n\n` +
      `I came across your profile and was impressed by your background in ${topSkill}. ` +
      `We're looking for a ${job.title} at ${job.company} in ${job.location}, ` +
      `and your experience with ${skillsList} aligns well with what we're building.\n\n` +
      `Would you be open to a brief conversation this week?\n\n` +
      `Best regards,\n${recruiterName}`;

    const evalCount = 3 + Math.floor(rnd() * 2);
    const shuffled = [...EVALUATION_ITEMS].sort(() => rnd() - 0.5);
    const humanEvaluation = shuffled.slice(0, evalCount).map((item) => {
      const pick = item.values[Math.floor(rnd() * item.values.length)];
      return { key: item.key, value: pick.value, status: pick.status };
    });

    return {
      candidateId: c.id,
      name: c.name,
      email: c.email,
      headline: c.headline,
      matchScore: c.matchScore,
      matchedSkills: c.matchedSkills,
      emailDraft,
      humanEvaluation,
    };
  });

  return {
    jobId: job.id,
    jobTitle: job.title,
    matchedAt: new Date().toISOString(),
    candidates,
  };
}
