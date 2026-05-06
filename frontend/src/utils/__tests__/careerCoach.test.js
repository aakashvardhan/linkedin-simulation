import { describe, it, expect } from 'vitest';
import { buildCareerCoachPlan, jobHaystack } from '../careerCoach';

describe('careerCoach: buildCareerCoachPlan', () => {
  it('suggests gap bullets when job signals are missing from resume', () => {
    const job = {
      id: 1,
      title: 'Backend Engineer',
      company: 'Acme',
      location: 'Remote',
      remote: true,
      industry: 'Technology',
      description: 'We need Kafka, Docker, and AWS experience.',
    };

    const resumeText = 'Built services with Python and SQL; deployed containers.';
    const plan = buildCareerCoachPlan({
      job,
      resumeText,
      headline: 'Software Engineer | Python · SQL',
      about: '',
    });

    expect(plan.headlineSuggestion.toLowerCase()).toContain('backend engineer');
    expect(plan.headlineSuggestion.toLowerCase()).toContain('acme');

    const bulletText = plan.bullets.map((b) => b.text.toLowerCase()).join(' ');
    // kafka appears in job description but isn't extracted from resume by our skill scan in this example
    expect(bulletText.includes('kafka') || plan.rationale.toLowerCase().includes('kafka')).toBe(true);

    expect(plan.bullets.length).toBeGreaterThanOrEqual(3);
    plan.bullets.forEach((b) => {
      expect(b.text.length).toBeGreaterThan(10);
      expect(b.rationale.length).toBeGreaterThan(10);
    });
  });

  it('jobHaystack includes title and description', () => {
    const h = jobHaystack({ title: 'X', company: 'Y', description: 'Z' });
    expect(h).toContain('x');
    expect(h).toContain('y');
    expect(h).toContain('z');
  });
});
