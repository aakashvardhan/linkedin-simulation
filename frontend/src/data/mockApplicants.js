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
export const APPLICATION_STATUSES = ['New', 'Screening', 'Reviewed', 'Interview', 'Offer extended', 'Rejected'];

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
