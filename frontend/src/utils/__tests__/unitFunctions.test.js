import { describe, it, expect } from 'vitest';
import {
  extractSkillsFromResume,
  filterJobs,
  calculateMatchScore,
  makeCacheKey,
} from '../unitFunctions';

describe('unit: extractSkillsFromResume', () => {
  it('extracts unique skills from resume text', () => {
    const resume = `
      Built React apps with TypeScript. Used Kafka for event streaming.
      Deployed on AWS. Some SQL and PostgreSQL.
    `;
    const skills = extractSkillsFromResume(resume);
    expect(skills).toEqual(expect.arrayContaining(['react', 'typescript', 'kafka', 'aws', 'sql']));
  });

  it('returns empty array for empty text', () => {
    expect(extractSkillsFromResume('')).toEqual([]);
  });
});

describe('unit: filterJobs', () => {
  const jobs = [
    { title: 'Frontend Engineer', company: 'A', location: 'Remote - US', type: 'Full-time', industry: 'Technology', description: 'React', remote: true },
    { title: 'Data Analyst', company: 'B', location: 'Boston, MA', type: 'Contract', industry: 'Retail', description: 'SQL dashboards', remote: false },
  ];

  it('filters by keyword across multiple fields', () => {
    const out = filterJobs(jobs, { keyword: 'sql' });
    expect(out.map((j) => j.title)).toEqual(['Data Analyst']);
  });

  it('filters by location and type', () => {
    const out = filterJobs(jobs, { location: 'boston', type: 'contract' });
    expect(out.map((j) => j.title)).toEqual(['Data Analyst']);
  });

  it('filters by industry + remoteOnly', () => {
    const out = filterJobs(jobs, { industry: 'technology', remoteOnly: true });
    expect(out.map((j) => j.title)).toEqual(['Frontend Engineer']);
  });
});

describe('unit: calculateMatchScore', () => {
  it('computes percent of required skills matched', () => {
    const job = { title: 'ML Engineer', description: 'Python, SQL, Docker' };
    const candidateSkills = ['python', 'docker'];
    const required = ['python', 'sql', 'docker', 'kafka'];
    expect(calculateMatchScore(job, candidateSkills, required)).toBe(75);
  });

  it('returns 0 when requiredSkills is empty', () => {
    expect(calculateMatchScore({ title: 'X' }, ['react'], [])).toBe(0);
  });
});

describe('unit: makeCacheKey', () => {
  it('creates stable key regardless of object key order', () => {
    const a = makeCacheKey('jobs', { q: 'sql', location: 'boston' });
    const b = makeCacheKey('jobs', { location: 'boston', q: 'sql' });
    expect(a).toBe(b);
  });
});

