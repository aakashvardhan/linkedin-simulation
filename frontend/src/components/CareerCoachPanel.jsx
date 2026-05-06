import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FaBriefcase,
  FaExclamationCircle,
  FaFileAlt,
  FaLightbulb,
  FaRobot,
  FaSyncAlt,
  FaTimes,
} from 'react-icons/fa';
import { makeApi } from '../api';
import { buildCareerCoachPlan } from '../utils/careerCoach';
import { loadPdfJs } from '../utils/loadPdfJs';

/** Local rule-based coach (no API). Off by default — set VITE_CAREER_COACH_OFFLINE=true to allow. */
const CAREER_COACH_OFFLINE = import.meta.env.VITE_CAREER_COACH_OFFLINE === 'true';

async function parsePdfToText(arrayBuffer) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  const maxPages = Math.min(doc.numPages || 0, 12);
  for (let p = 1; p <= maxPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const pageText = (content.items || [])
      .map((it) => (typeof it.str === 'string' ? it.str : ''))
      .filter(Boolean)
      .join(' ');
    text += `${pageText}\n`;
    if (text.length > 20000) break;
  }
  return text.trim();
}

function normalizeCoachResponse(raw, fallbackHeadline) {
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  const headline =
    payload.headlineSuggestion ||
    payload.headline ||
    payload.recommended_headline ||
    payload?.result?.headline ||
    fallbackHeadline ||
    '';

  const bulletsIn =
    payload.bulletSuggestions ||
    payload.bullets ||
    payload.suggestions ||
    payload.items ||
    payload.resumeBullets ||
    payload?.result?.bullets ||
    [];

  const aboutSuggestion =
    payload.aboutSuggestion || payload.about || payload.summarySuggestion || payload?.result?.about || '';

  const rationale =
    payload.rationale ||
    payload.reasoning ||
    payload?.result?.rationale ||
    payload?.meta?.rationale ||
    '';

  const bullets = Array.isArray(bulletsIn)
    ? bulletsIn
        .map((b) => {
          if (typeof b === 'string') {
            return { text: b, rationale: '' };
          }
          if (b && typeof b === 'object') {
            return {
              text: b.text || b.suggestion || b.bullet || '',
              rationale: b.rationale || b.why || b.reason || '',
            };
          }
          return { text: '', rationale: '' };
        })
        .filter((b) => b.text)
    : [];

  if (!headline && bullets.length === 0 && !aboutSuggestion) return null;

  const meta = payload.meta || payload.signals || payload?.result?.meta || null;

  return { headline, bullets, aboutSuggestion, rationale, meta };
}

/**
 * Career Coach:
 * - Calls `/ai/career-coach`, falls back to `/ai/request`, then deterministic offline planner.
 */
export default function CareerCoachPanel({
  authToken,
  jobs = [],
  userProfile,
  /** When set, coaching targets this job id (Jobs page). */
  lockJobId = null,
  /** Show dropdown of jobs (Profile page). */
  showJobPicker = true,
  /** Seed textarea when empty / when upstream resume text changes (Jobs page). */
  seedResumeText = '',
  /** Pull headline/about/skills from profile editing state when provided. */
  profileHeadline,
  profileAbout,
  profileSkills,
  /** Narrow right-rail on Jobs (compact spacing, scroll-friendly). */
  railMode = false,
  /** Match Recruiter “Agentic Copilot” brown header, borders, and cards (Jobs drawer). */
  recruiterTheme = false,
  /** When set with recruiterTheme, shows header close control (e.g. Jobs slide-over). */
  onClose = null,
}) {
  const api = useMemo(() => makeApi({ getAuthToken: () => authToken }), [authToken]);

  const [coachJobId, setCoachJobId] = useState('');
  const [coachResumeDraft, setCoachResumeDraft] = useState('');
  const [resumeDirty, setResumeDirty] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState('');
  const [coachSource, setCoachSource] = useState('');
  const [coachResult, setCoachResult] = useState(null);
  const [resumeUploadLoading, setResumeUploadLoading] = useState(false);
  const [coachResumeFileName, setCoachResumeFileName] = useState('');
  const coachResumeFileInputRef = useRef(null);
  const [resumeFieldFocus, setResumeFieldFocus] = useState(false);
  const [generateHovered, setGenerateHovered] = useState(false);
  const [uploadHovered, setUploadHovered] = useState(false);

  const effectiveHeadline = profileHeadline ?? userProfile?.headline ?? '';
  const effectiveAbout = profileAbout ?? userProfile?.about ?? '';
  const effectiveSkills = profileSkills ?? userProfile?.skills ?? '';

  const selectedCoachJob = useMemo(() => {
    const id = lockJobId != null ? String(lockJobId) : coachJobId;
    if (!id) return null;
    return (jobs || []).find((j) => String(j.id) === String(id)) || null;
  }, [jobs, coachJobId, lockJobId]);

  useEffect(() => {
    if (lockJobId != null) {
      setCoachJobId(String(lockJobId));
      return;
    }
    if (coachJobId) return;
    const first = (jobs || [])[0];
    if (first?.id != null) setCoachJobId(String(first.id));
  }, [jobs, coachJobId, lockJobId]);

  useEffect(() => {
    const seed = (seedResumeText || '').trim();
    if (!seed) return;
    if (!resumeDirty) setCoachResumeDraft(seed);
  }, [seedResumeText, resumeDirty]);

  const runCareerCoach = async () => {
    setCoachError('');
    setCoachResult(null);
    setCoachSource('');

    const job = selectedCoachJob;
    if (!job) {
      setCoachError(lockJobId != null ? 'Select a job in the list first.' : 'Pick a target job first.');
      return;
    }

    const resumeText = coachResumeDraft.trim();
    if (!resumeText) {
      setCoachError('Add resume/profile text to tailor against.');
      return;
    }

    setCoachLoading(true);
    try {
      const payload = {
        intent: 'career_coach.profile_tailor',
        job: {
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          industry: job.industry,
          description: job.description,
          type: job.type,
          remote: job.remote,
        },
        member: {
          headline: effectiveHeadline,
          about: effectiveAbout,
          skills: effectiveSkills,
          resume_text: resumeText,
        },
      };

      let remote = null;
      try {
        remote = await api.ai.careerCoach(payload);
      } catch {
        remote = null;
      }

      const normalizedRemote = normalizeCoachResponse(remote, effectiveHeadline);
      if (normalizedRemote) {
        setCoachResult(normalizedRemote);
        setCoachSource('AI service (/ai/career-coach)');
        return;
      }

      try {
        const generic = await api.ai.request({
          agent: 'career_coach',
          action: 'tailor_profile_for_job',
          ...payload,
        });
        const normalizedGeneric = normalizeCoachResponse(generic, effectiveHeadline);
        if (normalizedGeneric) {
          setCoachResult(normalizedGeneric);
          setCoachSource('AI service (/ai/request)');
          return;
        }
      } catch {
        // fall through
      }

      if (!CAREER_COACH_OFFLINE) {
        setCoachError(
          'Career coach API did not return data. Ensure /ai/career-coach or /ai/request is available, or set VITE_CAREER_COACH_OFFLINE=true for local-only suggestions.',
        );
        return;
      }

      const plan = buildCareerCoachPlan({
        job,
        resumeText,
        headline: effectiveHeadline,
        about: effectiveAbout,
      });
      setCoachResult({
        headline: plan.headlineSuggestion,
        bullets: plan.bullets,
        aboutSuggestion: plan.aboutSuggestion,
        rationale: plan.rationale,
        meta: plan.meta,
      });
      setCoachSource('Career Coach (offline planner)');
    } catch (e) {
      setCoachError(e?.message || 'Could not generate suggestions.');
    } finally {
      setCoachLoading(false);
    }
  };

  const handleCoachResumeUpload = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    const maxBytes = 7 * 1024 * 1024;
    if (file.size > maxBytes) {
      window.alert('Please upload a resume under 7 MB.');
      return;
    }

    const lower = (file.name || '').toLowerCase();
    const isLegacyDoc = lower.endsWith('.doc') && !lower.endsWith('.docx');
    if (isLegacyDoc) {
      window.alert(
        'Legacy Word .doc files cannot be read in the browser. Save as .docx or PDF, or paste your resume text.',
      );
      return;
    }

    setResumeUploadLoading(true);
    setCoachResumeFileName(file.name || '');
    try {
      const isPdf = file.type === 'application/pdf' || lower.endsWith('.pdf');
      const isDocx =
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        lower.endsWith('.docx');
      const isText =
        file.type.startsWith('text/') || /\.(txt|md)$/i.test(lower);

      let txtOut = '';

      if (isText) {
        txtOut = await file.text();
      } else if (isPdf) {
        const buf = await file.arrayBuffer();
        txtOut = await parsePdfToText(buf);
      } else if (isDocx) {
        const mammoth = await import('mammoth');
        const buf = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buf });
        txtOut = result.value || '';
      } else {
        window.alert('Supported formats: PDF, Word (.docx), or plain text (.txt).');
        return;
      }

      const trimmed = (txtOut || '').trim();
      if (!trimmed) {
        window.alert('Could not extract text from that file. Try another format or paste your resume.');
        return;
      }
      setResumeDirty(true);
      setCoachResumeDraft(trimmed);
    } catch {
      window.alert('Could not read that resume. Try another file or paste text.');
    } finally {
      setResumeUploadLoading(false);
      if (coachResumeFileInputRef.current) coachResumeFileInputRef.current.value = '';
    }
  };

  const rail = railMode;
  const rt = recruiterTheme;
  const headerTitle =
    rt && selectedCoachJob?.title ? `Career Coach — ${selectedCoachJob.title}` : 'Career Coach';

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: 'hidden',
        borderRadius: rt ? '12px' : rail ? '12px' : '14px',
        border: rt ? `1px solid rgba(10, 102, 194, 0.22)` : '1px solid rgba(10, 102, 194, 0.14)',
        boxShadow: rt
          ? '0 4px 24px rgba(10, 102, 194, 0.14), 0 1px 2px rgba(0, 0, 0, 0.04)'
          : rail
            ? '0 2px 12px rgba(15, 45, 85, 0.06)'
            : '0 4px 24px rgba(15, 45, 85, 0.07)',
        maxHeight: rail ? '100%' : undefined,
        minHeight: rail ? 0 : undefined,
        display: rail ? 'flex' : undefined,
        flexDirection: rail ? 'column' : undefined,
        flex: rail ? '1 1 auto' : undefined,
      }}
    >
      {rt ? (
        <header
          style={{
            flexShrink: 0,
            background: 'linear-gradient(165deg, #3d8fda 0%, #0A66C2 48%, #084e96 100%)',
            color: '#fff',
            padding: rail ? '14px 16px' : '16px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            borderBottom: '1px solid rgba(255,255,255,0.18)',
            boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.06)',
          }}
        >
          <FaRobot size={rail ? 22 : 24} style={{ flexShrink: 0, color: '#fff', opacity: 0.95 }} aria-hidden />
          <span
            style={{
              fontSize: rail ? '15px' : '16px',
              fontWeight: 600,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.01em',
            }}
          >
            {headerTitle}
          </span>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              title="Close"
              aria-label="Close Career Coach"
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                padding: '8px',
                flexShrink: 0,
                lineHeight: 0,
                borderRadius: '8px',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.22)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
              }}
            >
              <FaTimes size={15} />
            </button>
          ) : null}
        </header>
      ) : (
        <header
          style={{
            padding: rail ? '10px 12px 8px' : '20px 22px 18px',
            background: 'linear-gradient(165deg, #f0f7ff 0%, #ffffff 55%)',
            borderBottom: '1px solid #e4edf5',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: rail ? '10px' : '14px' }}>
            <div
              aria-hidden
              style={{
                flexShrink: 0,
                width: rail ? 36 : 50,
                height: rail ? 36 : 50,
                borderRadius: '14px',
                background: 'linear-gradient(145deg, #cfe8ff 0%, #e8f4ff 55%, #ffffff 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(10, 102, 194, 0.15), inset 0 1px 0 rgba(255,255,255,0.9)',
              }}
            >
              <FaRobot style={{ color: '#0A66C2', fontSize: rail ? '18px' : '24px' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <h2
                  style={{
                    fontSize: rail ? '14px' : '19px',
                    fontWeight: 700,
                    margin: 0,
                    color: '#0d1c2e',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Career Coach
                </h2>
              </div>
              <p
                style={{
                  fontSize: rail ? '11px' : '13px',
                  color: '#5c6d82',
                  margin: rail ? '0 0 4px' : '0 0 10px',
                  lineHeight: 1.45,
                }}
              >
                {rail
                  ? 'Tailor headline & bullets for this role—each suggestion includes rationale.'
                  : 'Align your headline and resume bullets with this role—each suggestion includes a short rationale so you can ship updates with confidence.'}
              </p>
              {!rail ? (
                <details style={{ fontSize: '12px', color: '#5c6d82' }}>
                  <summary
                    style={{
                      cursor: 'pointer',
                      fontWeight: 700,
                      color: '#0A66C2',
                      listStyle: 'none',
                      outline: 'none',
                    }}
                  >
                    How it works
                  </summary>
                  <p style={{ margin: '10px 0 0', lineHeight: 1.6, paddingLeft: '2px' }}>
                    With a live backend we call <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#38434f' }}>/ai/career-coach</span> and fall back to{' '}
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#38434f' }}>/ai/request</span>. Offline, we still produce structured suggestions with rationale.
                  </p>
                </details>
              ) : null}
            </div>
          </div>
        </header>
      )}

      {rt && rail ? (
        <p
          style={{
            margin: 0,
            padding: '12px 16px 10px',
            fontSize: '13px',
            color: '#5c6d82',
            lineHeight: 1.5,
            background: 'linear-gradient(180deg, #fafcfe 0%, #ffffff 100%)',
            borderBottom: '1px solid #e8eef5',
          }}
        >
          Tailor headline and bullets for this role—each suggestion includes rationale.
        </p>
      ) : null}

      <div
        style={{
          padding: rt ? '16px 16px 20px' : rail ? '10px 12px 12px' : '20px 22px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: rt ? '18px' : rail ? '10px' : '18px',
          flex: rail ? '1 1 auto' : undefined,
          minHeight: rail ? 0 : undefined,
          overflow: rail ? 'auto' : undefined,
          background: rt ? '#fff' : undefined,
        }}
      >
        <section aria-labelledby="coach-target-heading">
          <div
            id="coach-target-heading"
            style={{
              fontSize: '11px',
              fontWeight: rt ? 700 : 800,
              color: rt ? '#6b7280' : '#5c6d82',
              letterSpacing: rt ? '0.08em' : '0.08em',
              marginBottom: rt ? '8px' : '10px',
              textTransform: 'uppercase',
            }}
          >
            {lockJobId != null ? 'Selected role' : 'Target job'}
          </div>
          <div
            style={{
              borderRadius: '10px',
              border: rt ? '1px solid rgba(10, 102, 194, 0.14)' : '1px solid #dce6f0',
              background: '#fff',
              overflow: 'hidden',
              boxShadow: rt ? '0 1px 3px rgba(10, 102, 194, 0.07)' : '0 1px 4px rgba(15, 45, 85, 0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              <div
                aria-hidden
                style={{
                  width: 4,
                  flexShrink: 0,
                  background: 'linear-gradient(180deg, #0A66C2 0%, #378fe9 100%)',
                }}
              />
              <div style={{ flex: 1, padding: rt ? '16px 18px 18px' : '14px 16px 16px', minWidth: 0 }}>
                {showJobPicker ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#38434f' }}>
                      <FaBriefcase size={13} color="#0A66C2" />
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>Job opening</span>
                    </div>
                    <select
                      value={coachJobId}
                      onChange={(e) => setCoachJobId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: '1px solid #cfd9e6',
                        fontFamily: 'inherit',
                        fontSize: '14px',
                        background: '#fafcfe',
                        cursor: 'pointer',
                        boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.9)',
                      }}
                    >
                      {(jobs || []).length === 0 ? <option value="">No jobs loaded</option> : null}
                      {(jobs || []).map((j) => (
                        <option key={String(j.id)} value={String(j.id)}>
                          {j.title} · {j.company}
                        </option>
                      ))}
                    </select>
                    {selectedCoachJob ? (
                      <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>
                        {selectedCoachJob.location ? `${selectedCoachJob.location} · ` : ''}
                        {selectedCoachJob.remote ? 'Remote' : 'On-site'}
                        {selectedCoachJob.industry ? ` · ${selectedCoachJob.industry}` : ''}
                      </p>
                    ) : null}
                  </>
                ) : selectedCoachJob ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <FaBriefcase size={14} color="#0A66C2" />
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 800,
                          color: rt ? '#555' : '#5c6d82',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                        }}
                      >
                        Coaching for
                      </span>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: rt ? '#0A66C2' : '#0d1c2e', lineHeight: 1.3 }}>{selectedCoachJob.title}</div>
                    <div style={{ fontSize: '14px', color: '#5c6d82', marginTop: '6px', fontWeight: 600 }}>{selectedCoachJob.company}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '14px' }}>
                      {selectedCoachJob.location ? (
                        <span
                          style={{
                            fontSize: '12px',
                            padding: '6px 12px',
                            borderRadius: '999px',
                            background: rt ? '#e8f3ff' : '#eef3f8',
                            color: rt ? '#004182' : '#38434f',
                            fontWeight: 600,
                            border: rt ? '1px solid rgba(10, 102, 194, 0.12)' : 'none',
                          }}
                        >
                          {selectedCoachJob.location}
                        </span>
                      ) : null}
                      <span
                        style={{
                          fontSize: '12px',
                          padding: '6px 12px',
                          borderRadius: '999px',
                          background: rt ? '#e8f3ff' : '#eef3f8',
                          color: rt ? '#004182' : '#38434f',
                          fontWeight: 600,
                          border: rt ? '1px solid rgba(10, 102, 194, 0.12)' : 'none',
                        }}
                      >
                        {selectedCoachJob.remote ? 'Remote' : 'On-site'}
                      </span>
                      {selectedCoachJob.industry ? (
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: rt ? '#e8f3ff' : '#eef3f8',
                            color: '#004182',
                            fontWeight: 500,
                            border: rt ? '1px solid rgba(10, 102, 194, 0.12)' : 'none',
                          }}
                        >
                          {selectedCoachJob.industry}
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <FaBriefcase size={22} color="#b0bec9" />
                    <p style={{ margin: 0, fontSize: '14px', color: '#8899a8', lineHeight: 1.45 }}>
                      Choose a job from the list below—coaching stays tied to whatever role you select.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="coach-resume-heading">
          <div
            id="coach-resume-heading"
            style={{
              fontSize: '11px',
              fontWeight: rt ? 700 : 800,
              color: rt ? '#6b7280' : '#5c6d82',
              letterSpacing: '0.08em',
              marginBottom: rt ? '8px' : '10px',
              textTransform: 'uppercase',
            }}
          >
            Resume input
          </div>
          <div
            style={{
              borderRadius: '10px',
              background: rt ? 'linear-gradient(180deg, #f0f7ff 0%, #ffffff 65%)' : 'linear-gradient(180deg, #f1f6fb 0%, #fafcfe 100%)',
              border: rt
                ? `1px solid ${resumeFieldFocus ? 'rgba(10, 102, 194, 0.45)' : 'rgba(10, 102, 194, 0.16)'}`
                : `1px solid ${resumeFieldFocus ? '#8fb8e8' : '#dce6f0'}`,
              padding: rt ? '18px' : '16px',
              boxShadow: rt
                ? resumeFieldFocus
                  ? '0 0 0 3px rgba(10, 102, 194, 0.12), 0 2px 8px rgba(10, 102, 194, 0.06)'
                  : '0 1px 3px rgba(10, 102, 194, 0.06)'
                : resumeFieldFocus
                  ? '0 0 0 3px rgba(10, 102, 194, 0.12)'
                  : 'none',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '14px',
                flexWrap: 'wrap',
                marginBottom: '12px',
              }}
            >
              <div style={{ flex: '1 1 200px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0d1c2e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FaFileAlt size={15} color="#0A66C2" aria-hidden />
                  Your resume text
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#6b7280', lineHeight: 1.45 }}>
                  Paste your resume or upload PDF / Word—we extract text and keep everything editable.
                </p>
              </div>
              <label
                aria-label="Upload resume PDF or Word document"
                onMouseEnter={() => setUploadHovered(true)}
                onMouseLeave={() => setUploadHovered(false)}
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: uploadHovered ? (rt ? '#0A66C2' : '#0A66C2') : '#fff',
                  border: '2px solid #0A66C2',
                  borderRadius: '999px',
                  padding: '10px 18px',
                  fontWeight: 700,
                  fontSize: '12px',
                  color: uploadHovered ? '#fff' : '#0A66C2',
                  cursor: resumeUploadLoading ? 'progress' : 'pointer',
                  userSelect: 'none',
                  fontFamily: 'inherit',
                  boxShadow:
                    uploadHovered && !resumeUploadLoading ? '0 4px 14px rgba(10, 102, 194, 0.35)' : '0 1px 4px rgba(10, 102, 194, 0.1)',
                  transform: uploadHovered && !resumeUploadLoading ? 'translateY(-1px)' : 'none',
                  transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
                }}
              >
                <FaFileAlt size={13} aria-hidden />
                {resumeUploadLoading ? 'Reading…' : 'Upload PDF / Word'}
                <input
                  ref={coachResumeFileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={(e) => {
                    handleCoachResumeUpload(e.target.files);
                    e.target.value = '';
                  }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: resumeUploadLoading ? 'progress' : 'pointer',
                  }}
                  disabled={resumeUploadLoading}
                />
              </label>
            </div>

            <textarea
              value={coachResumeDraft}
              onChange={(e) => {
                setResumeDirty(true);
                setCoachResumeDraft(e.target.value);
              }}
              onFocus={() => setResumeFieldFocus(true)}
              onBlur={() => setResumeFieldFocus(false)}
              rows={6}
              placeholder="Paste your resume here, or use Upload to load PDF / Word (.docx)…"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                minHeight: rt ? '152px' : '140px',
                borderRadius: '10px',
                border: rt ? '1px solid rgba(10, 102, 194, 0.2)' : '1px solid #cfd9e6',
                padding: '14px 16px',
                fontFamily: 'inherit',
                fontSize: '13px',
                lineHeight: 1.55,
                resize: 'vertical',
                background: '#fff',
                outline: 'none',
                boxShadow: 'inset 0 1px 3px rgba(10, 102, 194, 0.05)',
                color: '#1d2226',
              }}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
              {coachResumeFileName ? (
                <span
                  style={{
                    fontSize: '12px',
                    padding: '6px 12px',
                    borderRadius: '999px',
                    background: '#fff',
                    border: '1px solid #dce6f0',
                    color: '#38434f',
                    fontWeight: 600,
                  }}
                >
                  File: <span style={{ color: '#0d1c2e' }}>{coachResumeFileName}</span>
                </span>
              ) : null}
              {seedResumeText?.trim() ? (
                <button
                  type="button"
                  onClick={() => {
                    setResumeDirty(false);
                    setCoachResumeDraft(seedResumeText);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: '1px solid #cfd9e6',
                    background: '#fff',
                    borderRadius: '999px',
                    padding: '6px 14px',
                    fontWeight: 700,
                    fontSize: '12px',
                    color: '#0A66C2',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background 0.2s ease, border-color 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f0f7ff';
                    e.currentTarget.style.borderColor = '#8fb8e8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#fff';
                    e.currentTarget.style.borderColor = '#cfd9e6';
                  }}
                >
                  <FaSyncAlt size={11} /> Sync from resume box above
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <div
          style={{
            display: 'flex',
            flexDirection: rt ? 'column' : 'row',
            flexWrap: rt ? 'nowrap' : 'wrap',
            alignItems: rt ? 'stretch' : 'center',
            gap: rt ? '10px' : '12px 16px',
            borderTop: rt ? '1px solid #e8eef5' : 'none',
            marginTop: rt ? '4px' : 0,
            padding: rt ? '16px 0 0' : 0,
          }}
        >
          <button
            type="button"
            onClick={runCareerCoach}
            disabled={coachLoading || !(jobs || []).length || !selectedCoachJob}
            onMouseEnter={() => setGenerateHovered(true)}
            onMouseLeave={() => setGenerateHovered(false)}
            style={{
              backgroundColor:
                coachLoading || !(jobs || []).length || !selectedCoachJob ? '#d4dbe4' : '#0A66C2',
              color: coachLoading || !(jobs || []).length || !selectedCoachJob ? '#7a8794' : '#fff',
              border: 'none',
              borderRadius: '999px',
              padding: rt ? '14px 24px' : '12px 22px',
              fontWeight: 800,
              fontSize: '14px',
              cursor: coachLoading || !(jobs || []).length || !selectedCoachJob ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: rt ? 'center' : undefined,
              gap: '10px',
              width: rt ? '100%' : undefined,
              boxShadow:
                coachLoading || !(jobs || []).length || !selectedCoachJob
                  ? 'none'
                  : generateHovered
                    ? '0 8px 22px rgba(10, 102, 194, 0.42)'
                    : '0 4px 14px rgba(10, 102, 194, 0.28)',
              transform:
                coachLoading || !(jobs || []).length || !selectedCoachJob ? 'none' : generateHovered ? 'translateY(-2px)' : 'translateY(0)',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
            }}
          >
            {coachLoading ? (
              <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ opacity: 0.85 }}>●</span> Generating…
              </span>
            ) : (
              <>
                <FaLightbulb size={16} /> Generate coaching
              </>
            )}
          </button>
          {coachSource ? (
            <span
              style={{
                fontSize: '12px',
                color: '#5c6d82',
                padding: '8px 12px',
                borderRadius: '10px',
                background: '#eef3f8',
                fontWeight: 600,
              }}
            >
              Source: <span style={{ color: '#0d1c2e' }}>{coachSource}</span>
            </span>
          ) : (
            <span style={{ fontSize: '12px', color: rt ? '#6b7280' : '#8899a8', lineHeight: 1.45, textAlign: rt ? 'center' : undefined }}>
              Add resume text, then generate tailored bullets for this role.
            </span>
          )}
        </div>

        {coachError ? (
          <div
            role="alert"
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid #f5c2c7',
              background: 'linear-gradient(180deg, #fff5f5 0%, #fff 100%)',
              color: '#842029',
            }}
          >
            <FaExclamationCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden />
            <span style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.45 }}>{coachError}</span>
          </div>
        ) : null}

        {coachResult ? (
          <div
            style={{
              marginTop: '4px',
              paddingTop: '22px',
              borderTop: rt ? '1px solid #f0f0f0' : '1px solid #e4edf5',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: rt ? 600 : 800,
                color: rt ? '#555' : '#5c6d82',
                letterSpacing: rt ? '0.5px' : '0.08em',
                textTransform: 'uppercase',
                marginBottom: '14px',
              }}
            >
              Coaching output
            </div>

            <div
              style={{
                borderRadius: '8px',
                border: rt ? '1px solid #e0e0df' : '1px solid #dce6f0',
                padding: '14px 16px',
                background: '#fff',
                marginBottom: '14px',
                boxShadow: rt ? 'none' : '0 1px 4px rgba(15, 45, 85, 0.05)',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: rt ? '#555' : '#0A66C2',
                  letterSpacing: rt ? '0.5px' : '0.06em',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                }}
              >
                Suggested headline
              </div>
              <p style={{ fontSize: '15px', color: '#0d1c2e', lineHeight: 1.45, margin: 0, fontWeight: 700 }}>{coachResult.headline}</p>
            </div>

            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 10px', color: '#0d1c2e' }}>Bullet upgrades</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(coachResult.bullets || []).map((b, idx) => (
                <div
                  key={idx}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = rt ? '0 2px 8px rgba(0,0,0,0.1)' : '0 6px 18px rgba(15, 45, 85, 0.08)';
                    e.currentTarget.style.borderColor = rt ? '#cfcfcf' : '#b8d4f0';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = rt ? 'none' : '0 1px 4px rgba(15, 45, 85, 0.05)';
                    e.currentTarget.style.borderColor = rt ? '#e0e0df' : '#dce6f0';
                  }}
                  style={{
                    border: rt ? '1px solid #e0e0df' : '1px solid #dce6f0',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    background: rt ? '#fff' : '#fafcfe',
                    boxShadow: rt ? 'none' : '0 1px 4px rgba(15, 45, 85, 0.05)',
                    transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '14px', color: '#0d1c2e', fontWeight: 700 }}>{b.text}</p>
                  {b.rationale ? (
                    <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#5c6d82', lineHeight: 1.45 }}>
                      <span style={{ fontWeight: 800, color: '#38434f' }}>Why:</span> {b.rationale}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            {coachResult.meta ? (
              <div
                style={{
                  marginTop: '16px',
                  padding: '14px 16px',
                  borderRadius: '8px',
                  background: rt ? 'linear-gradient(180deg, #f5f9fc 0%, #ffffff 100%)' : '#f4f8fc',
                  border: rt ? '1px solid rgba(10, 102, 194, 0.14)' : '1px solid #dce6f0',
                }}
              >
                <p
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#555',
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    margin: '0 0 10px',
                  }}
                >
                  {rt ? 'Match signals' : `Signals (${coachSource?.startsWith('AI service') ? 'AI response' : 'offline planner'})`}
                </p>
                {rt && (coachResult.meta.matchedSkills || []).length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
                    {(coachResult.meta.matchedSkills || []).map((sk) => (
                      <span
                        key={sk}
                        style={{
                          backgroundColor: '#eef3f8',
                          color: '#004182',
                          borderRadius: '12px',
                          padding: '2px 8px',
                          fontSize: '11px',
                          fontWeight: 500,
                        }}
                      >
                        {sk}
                      </span>
                    ))}
                  </div>
                ) : null}
                {rt ? (
                  (coachResult.meta.matchedSkills || []).length === 0 ? (
                    <p style={{ fontSize: '12px', color: '#5c6d82', lineHeight: 1.55, margin: '0 0 6px' }}>
                      <span style={{ fontWeight: 800, color: '#38434f' }}>Matched resume skills:</span>{' '}
                      <span style={{ color: '#0d1c2e', fontWeight: 600 }}>—</span>
                    </p>
                  ) : null
                ) : (
                  <p style={{ fontSize: '12px', color: '#5c6d82', lineHeight: 1.55, margin: '0 0 6px' }}>
                    <span style={{ fontWeight: 800, color: '#38434f' }}>Matched resume skills:</span>{' '}
                    <span style={{ color: '#0d1c2e', fontWeight: 600 }}>
                      {(coachResult.meta.matchedSkills || []).length ? coachResult.meta.matchedSkills.join(', ') : '—'}
                    </span>
                  </p>
                )}
                <p style={{ fontSize: '12px', color: '#5c6d82', lineHeight: 1.55, margin: '0 0 6px' }}>
                  <span style={{ fontWeight: 800, color: '#38434f' }}>Job signals:</span>{' '}
                  <span style={{ color: '#0d1c2e', fontWeight: 600 }}>
                    {(coachResult.meta.jobSignals || []).length ? coachResult.meta.jobSignals.join(', ') : '—'}
                  </span>
                </p>
                <p style={{ fontSize: '12px', color: '#5c6d82', lineHeight: 1.55, margin: 0 }}>
                  <span style={{ fontWeight: 800, color: '#38434f' }}>Gaps vs resume evidence:</span>{' '}
                  <span style={{ color: '#0d1c2e', fontWeight: 600 }}>
                    {(coachResult.meta.missingSignalsVsResume || []).length ? coachResult.meta.missingSignalsVsResume.join(', ') : '—'}
                  </span>
                </p>
              </div>
            ) : null}

            {coachResult.aboutSuggestion ? (
              <div style={{ marginTop: '14px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 8px', color: '#0d1c2e' }}>About section tweak</h3>
                <p style={{ fontSize: '13px', color: '#38434f', lineHeight: 1.55, margin: 0 }}>{coachResult.aboutSuggestion}</p>
              </div>
            ) : null}

            {coachResult.rationale ? (
              <div style={{ marginTop: '14px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 8px', color: '#0d1c2e' }}>Overall rationale</h3>
                <p style={{ fontSize: '13px', color: '#5c6d82', lineHeight: 1.55, margin: 0 }}>{coachResult.rationale}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
