import { DEFAULT_SKILL_DICTIONARY, extractSkillsFromResume, normalizeText } from './unitFunctions';

export { extractSkillsFromResume, normalizeText };

export function jobHaystack(job) {
  return normalizeText(
    `${job?.title || ''} ${job?.company || ''} ${job?.location || ''} ${job?.industry || ''} ${job?.description || ''}`,
  );
}

/**
 * Pull likely keywords from the job text using the same dictionary scanning approach as resumes.
 * This keeps Career Coach aligned with how we extract resume skills.
 */
export function extractJobSignals(jobText, dictionary = DEFAULT_SKILL_DICTIONARY) {
  return extractSkillsFromResume(jobText, dictionary);
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function headlineStem(headline) {
  const h = String(headline || '').trim();
  if (!h) return '';
  const parts = h.split('|').map((p) => p.trim()).filter(Boolean);
  return parts[0] || h;
}

function clip(s, max = 220) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Offline/deterministic Career Coach output used when AI endpoints are unavailable.
 * Always returns suggestions + rationale strings (never empty bullets).
 */
export function buildCareerCoachPlan({ job, resumeText, headline, about }) {
  const title = String(job?.title || 'Target role').trim();
  const company = String(job?.company || 'Company').trim();
  const hay = jobHaystack(job);

  const resumeSkills = extractSkillsFromResume(resumeText || '');
  const jobSignals = extractJobSignals(hay);

  const matched = uniq(resumeSkills.filter((s) => hay.includes(s)));
  const missingForJob = uniq(jobSignals.filter((s) => !resumeSkills.includes(s))).slice(0, 6);

  const topPick = matched[0] || resumeSkills[0] || jobSignals[0] || null;

  const remoteHint = job?.remote ? 'Remote' : job?.location ? String(job.location) : '';

  const stem = headlineStem(headline);
  const baseLead =
    stem ||
    (resumeSkills.length ? `${resumeSkills.slice(0, 2).join(' · ')} practitioner` : 'Operator');

  const headlineSuggestion = clip(
    `${baseLead} · targeting ${title} @ ${company}${topPick ? ` · ${topPick}` : ''}${remoteHint ? ` · ${remoteHint}` : ''}`,
    220,
  );

  const bullets = [];

  // 1) Strength reinforcement (skills already evidenced AND in the job)
  matched.slice(0, 2).forEach((kw) => {
    bullets.push({
      text: `Strengthen a resume bullet to prove ${kw}: add 1–2 quantified outcomes (%, revenue, latency, users) directly tied to ${title} responsibilities.`,
      rationale: `The job posting mentions ${kw}; recruiters and ATS parsers reward concrete outcomes tied to stated keywords.`,
    });
  });

  // 2) Gap closure (job expects keywords not clearly evidenced in resume extraction)
  missingForJob.slice(0, 3).forEach((kw) => {
    bullets.push({
      text: `Add a short project or bullet demonstrating ${kw} in the same domain as ${title} (what you built, how you measured success).`,
      rationale: `Extracted job signals include ${kw}, but it’s not clearly evidenced in the pasted resume text—closing this gap improves keyword alignment.`,
    });
  });

  // 3) Always include metric scaffolding bullets if we still need density
  const minBullets = 5;
  const fillers = [
    {
      text: `Rewrite your top bullet as STAR: Situation/Task → Action → Result with metrics; tie explicitly to ${title}.`,
      rationale: `Structured evidence reads clearer than adjectives and improves ATS + recruiter scanning.`,
    },
    {
      text: `Mirror the job’s language: reuse 4–6 phrases from the responsibilities section verbatim where truthful.`,
      rationale: `ATS and recruiters scan for terminology overlap between resume and job description.`,
    },
    {
      text: `Add a “Skills” line grouped by category (languages/frameworks/cloud/data) aligned to ${company}’s stack keywords.`,
      rationale: `Grouped keywords increase recall without stuffing bullets.`,
    },
  ];

  for (const f of fillers) {
    if (bullets.length >= minBullets) break;
    bullets.push(f);
  }

  const aboutSuggestion = clip(
    String(about || '').trim()
      ? `Rewrite About as 3 sentences: (1) what you ship, (2) proof with metrics, (3) why ${title} @ ${company} next. Weave in: ${uniq(
          [...matched, ...missingForJob].slice(0, 6),
        ).join(', ') || 'keywords from the job description'}.`
      : `Add a 3–4 sentence About that leads with outcomes for roles like ${title}, and mentions tools/themes seen in the job description.`,
    900,
  );

  const overallRationale = (() => {
    if (matched.length && missingForJob.length) {
      return `We matched your resume’s extracted skills (${matched.join(', ')}) to the job text, and highlighted gaps where the job signals (${missingForJob.join(
        ', ',
      )}) aren’t clearly evidenced in your pasted resume.`;
    }
    if (matched.length) {
      return `Strong overlap signals between extracted resume skills (${matched.join(', ')}) and keywords from the job posting—next step is quantifying impact under those themes.`;
    }
    if (missingForJob.length) {
      return `Limited clear overlap from dictionary extraction; prioritized closing gaps on job-signaled keywords (${missingForJob.join(
        ', ',
      )}) using truthful evidence bullets.`;
    }
    return `Used conservative, ATS-friendly headline + bullet scaffolding tailored to ${title} @ ${company}. Paste more resume detail (projects/tools/metrics) for tighter coaching.`;
  })();

  return {
    headlineSuggestion,
    bullets,
    aboutSuggestion,
    rationale: overallRationale,
    meta: {
      matchedSkills: matched,
      jobSignals: jobSignals,
      missingSignalsVsResume: missingForJob,
    },
  };
}
