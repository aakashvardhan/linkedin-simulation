/** Helpers for the recruiter-assistant FastAPI service (`/agent/*`). */

function evalStatusFromTier(tier) {
  if (tier === 'strong') return 'verified';
  if (tier === 'good') return 'needs_review';
  return 'needs_review';
}

function mapOneRankedRow(row, applicantsById) {
    const id = row.candidate_id != null ? String(row.candidate_id) : '';
    const applicant = id ? applicantsById.get(id) : null;
    const name = applicant?.name || `Candidate ${id || row.rank || ''}`;
    const email = applicant?.email || '';
    const headline = applicant?.headline || '';

    const overlap = Array.isArray(row.skills_overlap) ? row.skills_overlap : [];
    const matchedSkills =
      overlap.length > 0 ? overlap.map((s) => String(s)) : ['Skills overlap pending'];

    const rawScore = Number(row.match_score ?? 0);
    const scorePct =
      typeof row.score_pct === 'number'
        ? Math.min(100, Math.max(0, Math.round(row.score_pct)))
        : Math.min(100, Math.max(0, Math.round(rawScore > 1 ? rawScore : rawScore * 100)));

    const draft = row.outreach?.draft || '';

    const re = row.ranking_explanation;
    const iq = row.interview_questions;

    const humanEvaluation = [];
    if (re?.explanation) {
      humanEvaluation.push({
        key: 'Match rationale',
        value:
          typeof re.explanation === 'string'
            ? re.explanation.slice(0, 220) + (re.explanation.length > 220 ? '…' : '')
            : String(re.explanation),
        status: evalStatusFromTier(row.match_tier),
      });
    }
    if (overlap.length) {
      humanEvaluation.push({
        key: 'Overlapping skills',
        value: overlap.slice(0, 6).join(', '),
        status: 'verified',
      });
    }
    const gaps = iq?.skill_gaps;
    if (Array.isArray(gaps) && gaps.length) {
      humanEvaluation.push({
        key: 'Skill gaps',
        value: gaps.slice(0, 3).join(', '),
        status: 'needs_review',
      });
    }
    const tech = iq?.technical_questions;
    if (Array.isArray(tech) && tech.length) {
      humanEvaluation.push({
        key: 'Interview focus',
        value: typeof tech[0] === 'string' ? tech[0].slice(0, 120) : String(tech[0]),
        status: 'needs_review',
      });
    }
    if (humanEvaluation.length === 0) {
      humanEvaluation.push({
        key: 'Match tier',
        value: String(row.match_tier || 'review'),
        status: evalStatusFromTier(row.match_tier),
      });
    }

  return {
    candidateId: id || `rank-${row.rank}`,
    name,
    email,
    headline,
    matchScore: scorePct,
    matchedSkills,
    emailDraft: draft,
    humanEvaluation,
  };
}

/**
 * Maps `GET /agent/result/:traceId` to copilot cards — full `ranked_candidates`, else in-progress `ranked_candidates_preview`.
 */
export function mapAgentResultToCopilotCandidates(resultPayload, applicantsById) {
  const ranked = resultPayload?.ranked_candidates;
  if (Array.isArray(ranked) && ranked.length > 0) {
    return ranked.map((row) => mapOneRankedRow(row, applicantsById));
  }

  const preview = resultPayload?.ranked_candidates_preview;
  if (!Array.isArray(preview) || preview.length === 0) return [];

  return preview.map((row) => {
    const thin = {
      ...row,
      outreach: row.outreach || {
        draft:
          'Outreach drafts appear after the assistant finishes all steps. If scores show but no drafts, check LLM API keys on recruiter-assistant skill containers.',
      },
      ranking_explanation: row.ranking_explanation,
      interview_questions: row.interview_questions,
    };
    return mapOneRankedRow(thin, applicantsById);
  });
}

/**
 * Polls until trace completes processing or times out.
 * options.onProgress(steps, traceStatus) is called on each poll with the latest steps array.
 */
export async function pollRecruiterResult(getResult, traceId, options = {}) {
  const maxWaitMs = options.maxWaitMs ?? 300000;
  const intervalMs = options.intervalMs ?? 2000;
  const onProgress = options.onProgress ?? null;
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    const data = await getResult(traceId);
    const status = data?.trace?.status;
    if (onProgress && Array.isArray(data?.steps)) {
      onProgress(data.steps, status);
    }
    if (
      status === 'awaiting_approval' ||
      status === 'failed' ||
      status === 'completed' ||
      status === 'approved' ||
      status === 'rejected'
    ) {
      return data;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Recruiter assistant timed out while waiting for results.');
}
