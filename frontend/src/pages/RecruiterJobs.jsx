import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useMockData } from '../context/MockDataContext';
import {
  APPLICATION_STATUSES,
  generateApplicantsForJob,
  generateCandidateMatches,
} from '../data/mockApplicants';
import { makeApi } from '../api';
import { FaTrash, FaEdit, FaSearch, FaRobot, FaSpinner, FaPaperPlane, FaTimes, FaUser, FaChevronDown, FaChevronUp, FaCopy, FaEnvelope } from 'react-icons/fa';

/**
 * Candidates are processed one-by-one (parse → match → explain → interview → outreach).
 * Default 3 for responsive UI; set `VITE_AI_CANDIDATE_BATCH=8` in `.env` if you want a larger batch.
 */
const AI_CANDIDATE_BATCH_LIMIT = Math.min(
  12,
  Math.max(1, Number(import.meta.env.VITE_AI_CANDIDATE_BATCH) || 3),
);
const AGENT_POLL_MS = 2500;
/** Each candidate runs parse → match → explain → interview → outreach (often 30–120s+). */
const AGENT_MAX_POLLS = 480;

const AGENT_STEP_LABELS = {
  resume_parsed: 'Resume parsed',
  match_scored: 'Match scored',
  ranking_explained: 'Ranking explained',
  interview_questions_generated: 'Interview questions',
  outreach_drafted: 'Outreach drafted',
  candidates_ranked: 'Final ranking',
};

/** Uses `steps` from GET /agent/result so the UI is not blind until the first match_scored. */
function pipelineHintFromAgentResult(data) {
  const steps = data?.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    return 'Waiting for worker — if this persists, check ai-service is consuming Kafka topic ai.requests.';
  }
  const last = steps[steps.length - 1];
  const step = last?.step;
  const status = last?.status;
  const d = last?.data && typeof last.data === 'object' ? last.data : {};
  const cid = d.candidate_id != null ? String(d.candidate_id).slice(0, 28) : '';
  const lbl = AGENT_STEP_LABELS[step] || step || 'step';
  const who = cid ? ` · ${cid}` : '';
  if (status === 'failed') {
    const err = typeof last?.error === 'string' ? last.error : 'see ai-service / skill logs';
    return `${lbl} failed${who} — ${err}`;
  }
  return `${lbl}: ${status}${who}`;
}

function mapAgentRankedRowToUi(row, applicantById) {
  const cid = String(row.candidate_id ?? '');
  const app = applicantById[cid] || {};
  const score =
    typeof row.score_pct === 'number'
      ? row.score_pct
      : Math.min(100, Math.round(Number(row.match_score || 0) * 100));
  const overlap = Array.isArray(row.skills_overlap) ? row.skills_overlap : [];
  const draft = row?.outreach?.draft || '';
  return {
    candidateId: cid,
    name: app.name || 'Candidate',
    email: app.email || '',
    headline: app.headline || '',
    matchScore: score,
    matchedSkills: overlap.length ? overlap : ['—'],
    emailDraft: draft,
    humanEvaluation: [],
    _rankingExplanation: row.ranking_explanation,
    _interviewQuestions: row.interview_questions,
  };
}

const RecruiterJobs = () => {
  const { jobs, addJob, editJob, deleteJob, applicantsByJobId, updateApplicantStatus, userProfile, authToken } = useMockData();
  const api = useMemo(() => makeApi({ getAuthToken: () => authToken }), [authToken]);
  const [newJob, setNewJob] = useState({
    title: '',
    company: 'My Startup',
    location: '',
    type: 'Full-time',
    remote: false,
    industry: 'Technology',
    description: '',
  });
  const [search, setSearch] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  
  const [editingJobId, setEditingJobId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  // Copilot States
  const [copilotState, setCopilotState] = useState('idle'); // idle | parsing | matching | generating | results
  const [copilotLog, setCopilotLog] = useState([]);
  const [selectedJobForMatching, setSelectedJobForMatching] = useState(null);
  const [matchedCandidates, setMatchedCandidates] = useState([]);
  const [expandedCandidateId, setExpandedCandidateId] = useState(null);
  const [editedEmails, setEditedEmails] = useState({});
  const [applicantsModalJob, setApplicantsModalJob] = useState(null);
  const [applicantSearch, setApplicantSearch] = useState('');
  const [resumeViewerApplicant, setResumeViewerApplicant] = useState(null);
  /** Set when the latest “Find candidates” run used `recruiter-ai-service` (for approval API). */
  const [agentTraceId, setAgentTraceId] = useState(null);
  /** `recruiter_ai` = ranked payload from `/agent/result`; `offline` = explicit local demo only. */
  const [copilotSource, setCopilotSource] = useState(null);
  /** Partial `ranked_candidates_preview` rows from the assistant while the pipeline is still running. */
  const [rankedPreviewRows, setRankedPreviewRows] = useState([]);
  /** Applicant map for the active “Find candidates” run (synthetic or API-backed). */
  const [copilotApplicantById, setCopilotApplicantById] = useState({});
  const [expandedInsightsId, setExpandedInsightsId] = useState(null);
  const [showOfflineFallback, setShowOfflineFallback] = useState(false);
  const offlineFallbackRef = useRef(null);

  const applicantsForModal = useMemo(() => {
    if (!applicantsModalJob) return [];
    const list = applicantsByJobId[String(applicantsModalJob.id)] ?? [];
    const q = applicantSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.headline && a.headline.toLowerCase().includes(q)),
    );
  }, [applicantsModalJob, applicantsByJobId, applicantSearch]);

  const handleCreateJob = async (e) => {
    e.preventDefault();
    if (!newJob.title || !newJob.location) return;
    try {
      await addJob(newJob);
      setNewJob({
        title: '',
        company: 'My Startup',
        location: '',
        type: 'Full-time',
        remote: false,
        industry: 'Technology',
        description: '',
      });
    } catch (err) {
      window.alert(err?.message || 'Could not create job. Check that you are signed in and the API is running.');
    }
  };

  const startEdit = (job) => {
    setEditingJobId(job.id);
    setEditForm({ ...job });
  };

  const saveEdit = () => {
    editJob(editForm);
    setEditingJobId(null);
    setEditForm(null);
  };

  const jobIndustries = useMemo(() => {
    const s = new Set();
    jobs.forEach((j) => {
      if (j.industry) s.add(j.industry);
    });
    return Array.from(s).sort();
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      const ind = (j.industry || '').toLowerCase();
      const desc = (j.description || '').toLowerCase();
      const hay = `${j.title} ${j.company} ${j.location} ${ind} ${desc}`.toLowerCase();
      const matchesText = !q || hay.includes(q);
      const matchesIndustry = industryFilter ? (j.industry || '') === industryFilter : true;
      return matchesText && matchesIndustry;
    });
  }, [jobs, search, industryFilter]);

  const triggerCandidateMatching = useCallback(
    async (job) => {
      setSelectedJobForMatching(job);
      setMatchedCandidates([]);
      setExpandedCandidateId(null);
      setEditedEmails({});
      setAgentTraceId(null);
      setCopilotSource(null);
      setRankedPreviewRows([]);
      setCopilotApplicantById({});
      setExpandedInsightsId(null);
      setShowOfflineFallback(false);
      offlineFallbackRef.current = null;

      const fromContext = applicantsByJobId[String(job.id)] ?? [];
      const demoSeedOn = import.meta.env.VITE_DEMO_SEED !== 'false';
      const listed = Number(job.applicants) || 0;
      const syntheticCount =
        demoSeedOn && fromContext.length === 0
          ? listed > 0
            ? Math.min(listed, 100)
            : 12
          : 0;
      const synthetic =
        syntheticCount > 0 ? generateApplicantsForJob(job.id, syntheticCount) : [];
      const applicants = fromContext.length > 0 ? fromContext : synthetic;
      const applicantById = Object.fromEntries(applicants.map((a) => [String(a.id), a]));
      setCopilotApplicantById(applicantById);

      if (applicants.length === 0) {
        setCopilotState('idle');
        setCopilotLog([
          `No applicant rows loaded for “${job.title}”.`,
          listed > 0
            ? 'The job shows an applicant count, but /applications/byJob returned none. Open “View Applicants”; if empty, turn on demo seed (VITE_DEMO_SEED) or submit real applications.'
            : 'Post the role and have members apply, or use demo seeding so synthetic applicants exist.',
        ]);
        return;
      }

      setCopilotState('matching');
      const batch = applicants.slice(0, AI_CANDIDATE_BATCH_LIMIT);
      setCopilotLog([
        `Calling recruiter assistant (/agent/request → recruiter-ai-service)…`,
        synthetic.length
          ? `Using ${batch.length} synthetic demo applicant(s) for “${job.title}” (${listed ? `card ${listed}; ` : ''}no rows from /applications/byJob).`
          : `Batch: ${batch.length} of ${applicants.length} applicant(s) for “${job.title}”.`,
      ]);

      const jobPayload = {
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        industry: job.industry || '',
        description: job.description || '',
        type: job.type || 'Full-time',
        remote: Boolean(job.remote),
      };

      const candidates = batch.map((a) => ({
        candidate_id: String(a.id),
        resume_text: (a.resumeSummary || `${a.name}\n${a.headline}`).trim() || `${a.name}`,
      }));

      const actorId =
        userProfile?.recruiter_id != null
          ? String(userProfile.recruiter_id)
          : String(userProfile?.email || userProfile?.member_id || 'recruiter');

      try {
        const queued = await api.recruiterAgent.request({
          actor_id: actorId,
          job: jobPayload,
          candidates,
        });
        const traceId = queued?.trace_id;
        if (!traceId) throw new Error('Agent did not return trace_id');
        setAgentTraceId(traceId);
        setCopilotLog((prev) => [
          ...prev,
          `Workflow started (trace ${traceId}). Polling for results…`,
          `Processing up to ${batch.length} candidate(s) sequentially; first step updates can take 1–4 min (cold skill containers).`,
        ]);

        const terminalStatus = (s) =>
          s === 'awaiting_approval' || s === 'approved' || s === 'edited' || s === 'rejected';

        let ranked = undefined;
        let lastPipelineHint = '';
        for (let i = 0; i < AGENT_MAX_POLLS; i += 1) {
          await new Promise((r) => setTimeout(r, AGENT_POLL_MS));
          const data = await api.recruiterAgent.result(traceId);
          const st = data?.trace?.status;
          if (st === 'failed' || st === 'error') {
            throw new Error(data?.trace?.last_error || data?.trace?.error || 'Recruiter AI pipeline failed');
          }
          const list = Array.isArray(data?.ranked_candidates) ? data.ranked_candidates : [];
          const preview = data?.ranked_candidates_preview;
          if (Array.isArray(preview) && preview.length > 0) {
            setRankedPreviewRows(preview);
          }
          if (terminalStatus(st)) {
            ranked = list;
            break;
          }
          const hint = pipelineHintFromAgentResult(data);
          if (hint && hint !== lastPipelineHint) {
            lastPipelineHint = hint;
            setCopilotLog((prev) => [...prev, hint]);
          } else if (i > 0 && i % 6 === 0) {
            const scored = data?.stats_preview?.candidates_scored;
            const extra =
              typeof scored === 'number' && scored > 0 ? ` · scored: ${scored}/${batch.length}` : '';
            setCopilotLog((prev) => [...prev, `…still in progress (${st || 'in_progress'})${extra}`]);
          }
        }

        if (ranked === undefined) {
          throw new Error(
            `Timed out after ~${Math.round((AGENT_MAX_POLLS * AGENT_POLL_MS) / 60000)} min (pipeline still in progress). Try fewer candidates or check recruiter-ai / skill container logs.`,
          );
        }

        setRankedPreviewRows([]);
        setCopilotSource('recruiter_ai');

        if (ranked.length === 0) {
          setMatchedCandidates([]);
          setCopilotLog((prev) => [
            ...prev,
            'Recruiter assistant finished with no ranked candidates (check skill services / logs if every step failed).',
          ]);
          setCopilotState('results');
        } else {
          setMatchedCandidates(ranked.map((row) => mapAgentRankedRowToUi(row, applicantById)));
          setCopilotLog((prev) => [
            ...prev,
            `✓ Recruiter assistant returned ${ranked.length} ranked candidate(s) (outreach + explanations in cards).`,
          ]);
          setCopilotState('results');
        }
      } catch (e) {
        const msg = e?.message || String(e);
        setRankedPreviewRows([]);
        setAgentTraceId(null);
        setCopilotSource(null);
        offlineFallbackRef.current = { job, applicants };
        setCopilotState('idle');
        setCopilotLog((prev) => [
          ...prev,
          `Recruiter assistant could not complete: ${msg}`,
          'Check Docker logs for ai-service and skill containers (resume-parser, matcher, …). Optional: run offline demo ranking below (local rules, not the assistant).',
        ]);
        setShowOfflineFallback(true);
      }
    },
    [api, applicantsByJobId, userProfile],
  );

  const runOfflineDemoRanking = useCallback(() => {
    const ctx = offlineFallbackRef.current;
    if (!ctx) return;
    const { job: j, applicants: apps } = ctx;
    const result = generateCandidateMatches(j, apps, userProfile?.displayName || 'Recruiter');
    setMatchedCandidates(result.candidates);
    setCopilotLog(['Ranked using local demo rules only (not the recruiter assistant).']);
    setCopilotSource('offline');
    setShowOfflineFallback(false);
    setCopilotState('results');
    setAgentTraceId(null);
    setSelectedJobForMatching(j);
    setRankedPreviewRows([]);
    setExpandedInsightsId(null);
    setCopilotApplicantById(Object.fromEntries(apps.map((a) => [String(a.id), a])));
  }, [userProfile?.displayName]);

  const resetCopilot = () => {
    setCopilotState('idle');
    setCopilotLog([]);
    setSelectedJobForMatching(null);
    setMatchedCandidates([]);
    setExpandedCandidateId(null);
    setEditedEmails({});
    setAgentTraceId(null);
    setCopilotSource(null);
    setRankedPreviewRows([]);
    setCopilotApplicantById({});
    setExpandedInsightsId(null);
    setShowOfflineFallback(false);
    offlineFallbackRef.current = null;
  };

  const STATUS_COLORS = { verified: '#004182', needs_review: '#c37d16', flagged: '#cc0000' };
  const SCORE_COLOR = (s) => s >= 85 ? '#057642' : s >= 70 ? '#c37d16' : '#cc0000';

  return (
    <div style={{ gridColumn: 'span 3', display: 'flex', gap: '24px' }}>
      
      {/* Main Recruiter Workflow (Left 70%) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Create Job Form */}
        <div className="card" style={{ padding: '24px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>Post a New Job</h1>
          <form onSubmit={handleCreateJob} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
               <input type="text" placeholder="Job Title (e.g. Frontend Engineer)" value={newJob.title} onChange={e => setNewJob({...newJob, title: e.target.value})} required style={{ flex: '1 1 200px', padding: '8px 12px', border: '1px solid #666', borderRadius: '4px' }} />
               <input type="text" placeholder="Location (e.g. San Francisco)" value={newJob.location} onChange={e => setNewJob({...newJob, location: e.target.value})} required style={{ flex: '1 1 200px', padding: '8px 12px', border: '1px solid #666', borderRadius: '4px' }} />
               <input type="text" placeholder="Industry (e.g. FinTech)" value={newJob.industry} onChange={e => setNewJob({...newJob, industry: e.target.value})} style={{ flex: '1 1 160px', padding: '8px 12px', border: '1px solid #666', borderRadius: '4px' }} />
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: '#666' }}>
              Job description (searchable by members)
              <textarea
                value={newJob.description}
                onChange={(e) => setNewJob({ ...newJob, description: e.target.value })}
                placeholder="Responsibilities, qualifications, keywords…"
                rows={4}
                style={{ padding: '10px 12px', border: '1px solid #666', borderRadius: '4px', fontFamily: 'inherit', fontSize: '14px' }}
              />
            </label>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
               <select value={newJob.type} onChange={e => setNewJob({...newJob, type: e.target.value})} style={{ padding: '8px 12px', border: '1px solid #666', borderRadius: '4px' }}>
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Contract">Contract</option>
               </select>
               
               <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={newJob.remote} onChange={e => setNewJob({...newJob, remote: e.target.checked})} />
                  Remote Role
               </label>

               <button type="submit" disabled={!newJob.title || !newJob.location} style={{ marginLeft: 'auto', backgroundColor: (!newJob.title || !newJob.location) ? '#e0e0df' : '#0A66C2', color: (!newJob.title || !newJob.location) ? '#666' : '#fff', padding: '10px 24px', borderRadius: '24px', fontWeight: '600', cursor: 'pointer' }}>
                 Post Job
               </button>
            </div>
          </form>
        </div>

        {/* Active Jobs Pipeline */}
        <div className="card" style={{ padding: '24px' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: '600' }}>Active Postings ({jobs.length})</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#eef3f8', padding: '0 12px', borderRadius: '4px', minWidth: '220px' }}>
                  <FaSearch color="#666" size={14} />
                  <input type="text" placeholder="Search title, location, industry…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ border: 'none', backgroundColor: 'transparent', padding: '8px', width: '100%', outline: 'none', fontSize: '14px' }} />
                </div>
                <select
                  value={industryFilter}
                  onChange={(e) => setIndustryFilter(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #e0e0df', borderRadius: '4px', fontSize: '14px', maxWidth: '200px' }}
                >
                  <option value="">All industries</option>
                  {jobIndustries.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
              </div>
           </div>

           <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filteredJobs.map((job) => (
                <div key={job.id} style={{ display: 'flex', gap: '16px', padding: '16px 0', borderBottom: '1px solid #e0e0df', alignItems: 'flex-start' }}>
                  
                  {editingJobId === job.id ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input type="text" value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} style={{ padding: '8px' }} />
                      <input type="text" value={editForm.location} onChange={e => setEditForm({...editForm, location: e.target.value})} style={{ padding: '8px' }} />
                      <input
                        type="text"
                        value={editForm.industry || ''}
                        onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                        placeholder="Industry"
                        style={{ padding: '8px' }}
                      />
                      <textarea
                        value={editForm.description || ''}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        placeholder="Description"
                        rows={3}
                        style={{ padding: '8px', fontFamily: 'inherit', fontSize: '14px' }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={saveEdit} style={{ backgroundColor: '#004182', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                        <button onClick={() => setEditingJobId(null)} style={{ border: '1px solid #666', background: 'transparent', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0A66C2' }}>{job.title}</h3>
                        <p style={{ fontSize: '14px', color: '#000000e6', marginTop: '2px' }}>
                          {job.company} &bull; {job.location} ({job.remote ? 'Remote' : 'On-site'})
                          {job.industry ? ` · ${job.industry}` : ''} &bull;{' '}
                          <span style={{ color: '#004182', fontWeight: '600'}}>Actively recruiting</span>
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                         <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: '24px', color: '#000', fontWeight: '300' }}>{job.applicants}</p>
                            <button
                              type="button"
                              onClick={() => {
                                setApplicantSearch('');
                                setApplicantsModalJob(job);
                              }}
                              style={{
                                fontSize: '12px',
                                color: '#0A66C2',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                fontFamily: 'inherit',
                              }}
                            >
                              View Applicants
                            </button>
                         </div>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button onClick={() => triggerCandidateMatching(job)} style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'transparent', color: '#0A66C2', border: 'none', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}><FaRobot /> Find Candidates</button>
                            <button onClick={() => startEdit(job)} style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'transparent', color: '#666', border: 'none', fontWeight: '600', cursor: 'pointer' }}><FaEdit /> Edit</button>
                            <button onClick={() => deleteJob(job.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'transparent', color: '#cc0000', border: 'none', fontWeight: '600', cursor: 'pointer' }}><FaTrash /> Close Job</button>
                         </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
        </div>

      </div>

      {/* Recruiter Copilot Sidebar (Right 30%) */}
      <div className="card" style={{ width: '350px', height: 'fit-content', border: '2px solid #0A66C2', maxHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
         <div style={{ background: 'linear-gradient(165deg, #378fe9 0%, #0A66C2 55%, #0a58ad 100%)', color: '#fff', padding: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
            <FaRobot size={24} />
            <span style={{ fontSize: '16px', fontWeight: '600', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Agentic Copilot{selectedJobForMatching ? ` — ${selectedJobForMatching.title}` : ''}
            </span>
            {selectedJobForMatching && (
              <button onClick={resetCopilot} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px' }} title="Clear">
                <FaTimes size={14} />
              </button>
            )}
         </div>

         <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1 }}>

            {copilotState === 'idle' && copilotLog.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 8px', color: '#666' }}>
                <FaRobot size={32} style={{ color: '#0A66C2', marginBottom: '12px' }} />
                <p style={{ fontSize: '14px', lineHeight: '1.5' }}>
                  Click <strong>&ldquo;Find Candidates&rdquo;</strong> to run the integrated <strong>recruiter assistant</strong> (recruiter-ai-service): ranked matches, outreach drafts, and interview ideas from the live pipeline.
                </p>
              </div>
            )}

            {copilotState === 'idle' && copilotLog.length > 0 && (
              <div
                style={{
                  backgroundColor: '#fff8f0',
                  border: '1px solid #e0c4a8',
                  borderRadius: '8px',
                  padding: '14px',
                  fontSize: '13px',
                  lineHeight: 1.45,
                  color: '#333',
                }}
              >
                <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#804a00' }}>Copilot</p>
                {copilotLog.map((line, i) => (
                  <p key={i} style={{ margin: '0 0 6px' }}>
                    {line}
                  </p>
                ))}
                {showOfflineFallback && (
                  <button
                    type="button"
                    onClick={runOfflineDemoRanking}
                    style={{
                      marginTop: '10px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #ccc',
                      background: '#fff',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    Run offline demo ranking (not the assistant)
                  </button>
                )}
              </div>
            )}

            {['parsing', 'matching', 'generating'].includes(copilotState) && (
              <div style={{ backgroundColor: '#f3f2ef', padding: '16px', borderRadius: '8px', border: '1px solid #e0e0df' }}>
                 <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Progress</h3>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', fontFamily: 'monospace', color: '#000', maxHeight: '150px', overflowY: 'auto' }}>
                    {copilotLog.map((log, i) => (
                      <span key={i} style={{ color: log.includes('✓') ? '#004182' : '#666' }}>{log}</span>
                    ))}
                 </div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', color: '#0A66C2', fontSize: '14px', fontWeight: '600' }}>
                    <FaSpinner className="spin-animation" />
                    {copilotState === 'parsing' && 'Analyzing…'}
                    {copilotState === 'matching' && 'Matching…'}
                    {copilotState === 'generating' && 'Drafting…'}
                 </div>
              </div>
            )}

            {copilotState === 'matching' && rankedPreviewRows.length > 0 && (
              <div
                style={{
                  border: '1px solid #b4d4f5',
                  borderRadius: '8px',
                  padding: '12px',
                  background: '#f5f9ff',
                }}
              >
                <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 700, color: '#004182' }}>
                  Recruiter assistant — live partial rankings
                </p>
                <p style={{ margin: '0 0 10px', fontSize: '11px', color: '#555' }}>
                  Scores from the service while outreach steps finish for remaining candidates.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                  {rankedPreviewRows.map((row) => {
                    const c = mapAgentRankedRowToUi(row, copilotApplicantById);
                    return (
                      <div
                        key={c.candidateId}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '12px',
                          padding: '6px 8px',
                          background: '#fff',
                          borderRadius: '6px',
                          border: '1px solid #e0e0df',
                        }}
                      >
                        <span style={{ fontWeight: 600, color: '#000000e6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                          {c.name}
                        </span>
                        <span style={{ color: '#004182', fontWeight: 700, marginLeft: '8px', flexShrink: 0 }}>{c.matchScore}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {copilotState === 'results' && matchedCandidates.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '600', margin: 0 }}>
                      {matchedCandidates.length} Candidates Matched
                    </h3>
                    <p style={{ fontSize: '12px', color: '#666', margin: '2px 0 0' }}>{selectedJobForMatching?.title}</p>
                    {copilotSource === 'recruiter_ai' && (
                      <p style={{ fontSize: '11px', color: '#057642', margin: '8px 0 0', fontWeight: 600 }}>
                        From recruiter assistant
                        {agentTraceId ? ` · trace …${agentTraceId.slice(-8)}` : ''}
                      </p>
                    )}
                    {copilotSource === 'offline' && (
                      <p style={{ fontSize: '11px', color: '#804a00', margin: '8px 0 0', fontWeight: 600 }}>
                        Offline demo ranking (local rules, not the AI service)
                      </p>
                    )}
                  </div>
                  <button onClick={resetCopilot} style={{ fontSize: '12px', color: '#0A66C2', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}>
                    New Search
                  </button>
                </div>

                {matchedCandidates.map((c) => {
                  const isExpanded = expandedCandidateId === c.candidateId;
                  const emailText = editedEmails[c.candidateId] ?? c.emailDraft;
                  return (
                    <div key={c.candidateId} style={{ backgroundColor: '#fff', border: '1px solid #e0e0df', borderRadius: '8px', padding: '12px', transition: 'box-shadow 0.15s', boxShadow: isExpanded ? '0 2px 8px rgba(0,0,0,0.1)' : 'none' }}>
                      {/* Header: avatar, name, score */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#E8F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#004182', flexShrink: 0 }}>
                          <FaUser size={14} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '14px', fontWeight: '600', margin: 0, color: '#000000e6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                          <p style={{ fontSize: '11px', color: '#666', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.headline}</p>
                        </div>
                        <div style={{ backgroundColor: SCORE_COLOR(c.matchScore) + '18', color: SCORE_COLOR(c.matchScore), fontWeight: '700', fontSize: '13px', padding: '4px 8px', borderRadius: '12px', whiteSpace: 'nowrap' }}>
                          {c.matchScore}/100
                        </div>
                      </div>

                      {/* Skill pills */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
                        {c.matchedSkills.slice(0, 4).map((sk) => (
                          <span key={sk} style={{ backgroundColor: '#eef3f8', color: '#004182', borderRadius: '12px', padding: '2px 8px', fontSize: '11px', fontWeight: '500' }}>{sk}</span>
                        ))}
                      </div>

                      {copilotSource === 'recruiter_ai' &&
                        (Boolean(c._rankingExplanation?.explanation) ||
                          Boolean(c._rankingExplanation?.error) ||
                          Boolean(c._interviewQuestions?.error) ||
                          (Array.isArray(c._interviewQuestions?.technical_questions) &&
                            c._interviewQuestions.technical_questions.length > 0) ||
                          (Array.isArray(c._interviewQuestions?.behavioral_questions) &&
                            c._interviewQuestions.behavioral_questions.length > 0)) && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedInsightsId(expandedInsightsId === c.candidateId ? null : c.candidateId)
                            }
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'none',
                              border: 'none',
                              color: '#004182',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              padding: '4px 0',
                              width: '100%',
                              marginBottom: '4px',
                            }}
                          >
                            Assistant insights
                            {expandedInsightsId === c.candidateId ? (
                              <FaChevronUp size={10} style={{ marginLeft: 'auto' }} />
                            ) : (
                              <FaChevronDown size={10} style={{ marginLeft: 'auto' }} />
                            )}
                          </button>
                          {expandedInsightsId === c.candidateId && (
                            <div
                              style={{
                                marginBottom: '10px',
                                padding: '10px',
                                background: '#f8fafc',
                                borderRadius: '6px',
                                border: '1px solid #e5e7eb',
                                fontSize: '12px',
                                lineHeight: 1.45,
                                color: '#333',
                              }}
                            >
                              {typeof c._rankingExplanation?.explanation === 'string' &&
                                c._rankingExplanation.explanation.trim() !== '' && (
                                  <p style={{ margin: '0 0 10px' }}>
                                    <span style={{ fontWeight: 700, color: '#004182' }}>Why this rank: </span>
                                    {c._rankingExplanation.explanation}
                                  </p>
                                )}
                              {c._rankingExplanation?.error && (
                                <p style={{ margin: '0 0 8px', color: '#804a00' }}>Ranking note: {c._rankingExplanation.error}</p>
                              )}
                              {Array.isArray(c._interviewQuestions?.technical_questions) &&
                                c._interviewQuestions.technical_questions.length > 0 && (
                                  <div style={{ marginBottom: '8px' }}>
                                    <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#004182' }}>Technical interview ideas</p>
                                    <ul style={{ margin: 0, paddingLeft: '18px' }}>
                                      {c._interviewQuestions.technical_questions.slice(0, 4).map((q, qi) => (
                                        <li key={qi} style={{ marginBottom: '2px' }}>
                                          {typeof q === 'string' ? q : q?.question || JSON.stringify(q)}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              {Array.isArray(c._interviewQuestions?.behavioral_questions) &&
                                c._interviewQuestions.behavioral_questions.length > 0 && (
                                  <div>
                                    <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#004182' }}>Behavioral interview ideas</p>
                                    <ul style={{ margin: 0, paddingLeft: '18px' }}>
                                      {c._interviewQuestions.behavioral_questions.slice(0, 3).map((q, qi) => (
                                        <li key={qi} style={{ marginBottom: '2px' }}>
                                          {typeof q === 'string' ? q : q?.question || JSON.stringify(q)}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              {c._interviewQuestions?.error && (
                                <p style={{ margin: '8px 0 0', color: '#804a00' }}>Interview Q note: {c._interviewQuestions.error}</p>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {/* Email draft toggle */}
                      <button
                        onClick={() => setExpandedCandidateId(isExpanded ? null : c.candidateId)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#0A66C2', fontSize: '12px', fontWeight: '600', cursor: 'pointer', padding: '4px 0', width: '100%' }}
                      >
                        <FaEnvelope size={11} />
                        Email Draft
                        {isExpanded ? <FaChevronUp size={10} style={{ marginLeft: 'auto' }} /> : <FaChevronDown size={10} style={{ marginLeft: 'auto' }} />}
                      </button>

                      {isExpanded && (
                        <div style={{ marginTop: '8px' }}>
                          <textarea
                            value={emailText}
                            onChange={(e) => setEditedEmails(prev => ({ ...prev, [c.candidateId]: e.target.value }))}
                            style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', lineHeight: '1.5', maxHeight: '140px', minHeight: '100px', resize: 'vertical', boxSizing: 'border-box' }}
                          />
                          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                            <button
                              onClick={() => navigator.clipboard?.writeText(emailText)}
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#666', background: '#f3f2ef', border: '1px solid #e0e0df', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                            >
                              <FaCopy size={10} /> Copy
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!agentTraceId || copilotSource !== 'recruiter_ai') {
                                  window.alert(
                                    'Send/approve is only available for rankings returned by the recruiter assistant.',
                                  );
                                  return;
                                }
                                try {
                                  await api.recruiterAgent.approve(agentTraceId, {
                                    action: 'approve',
                                    candidate_id: String(c.candidateId),
                                  });
                                  window.alert('Outreach approval recorded for this candidate.');
                                } catch (err) {
                                  window.alert(err?.message || 'Could not record approval');
                                }
                              }}
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#fff', background: '#004182', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', marginLeft: 'auto' }}
                            >
                              <FaPaperPlane size={10} /> Send
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Human Evaluation (mock pipeline only) */}
                      {Array.isArray(c.humanEvaluation) && c.humanEvaluation.length > 0 && (
                        <div style={{ marginTop: '10px', borderTop: '1px solid #f0f0f0', paddingTop: '8px' }}>
                          <p style={{ fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Human Evaluation Required</p>
                          {c.humanEvaluation.map((ev) => (
                            <div key={ev.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: '12px' }}>
                              <span style={{ color: '#333' }}>{ev.key}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#555' }}>
                                {ev.value}
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: STATUS_COLORS[ev.status] || '#999', display: 'inline-block', flexShrink: 0 }} />
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {copilotState === 'results' && matchedCandidates.length === 0 && (
              <div
                style={{
                  backgroundColor: '#f3f2ef',
                  border: '1px solid #e0e0df',
                  borderRadius: '8px',
                  padding: '14px',
                  fontSize: '13px',
                  color: '#333',
                }}
              >
                <p style={{ margin: '0 0 8px', fontWeight: 600 }}>No candidates to show</p>
                <p style={{ margin: 0, lineHeight: 1.45 }}>
                  {copilotSource === 'recruiter_ai'
                    ? 'The recruiter assistant completed but returned no ranked rows (every candidate may have failed resume, match, or outreach steps). Check ai-service and skill container logs.'
                    : 'Ranking finished but returned an empty list. Confirm the AI service is running and reachable from the gateway, then try again.'}
                </p>
                {copilotLog.length > 0 && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '8px',
                      background: '#fff',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      color: '#444',
                      maxHeight: '120px',
                      overflowY: 'auto',
                    }}
                  >
                    {copilotLog.map((line, i) => (
                      <div key={i} style={{ marginBottom: '4px' }}>
                        {line}
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={resetCopilot}
                  style={{
                    marginTop: '12px',
                    fontSize: '12px',
                    color: '#0A66C2',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  New Search
                </button>
              </div>
            )}

         </div>
      </div>

      {applicantsModalJob ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="applicants-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setApplicantsModalJob(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setApplicantsModalJob(null);
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '920px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              margin: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e0e0df',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '16px',
              }}
            >
              <div>
                <h2 id="applicants-modal-title" style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#000000e6' }}>
                  Applicants
                </h2>
                <p style={{ fontSize: '14px', color: '#666', margin: '6px 0 0' }}>
                  <span style={{ color: '#0A66C2', fontWeight: 600 }}>{applicantsModalJob.title}</span>
                  {' · '}
                  {applicantsModalJob.company} —{' '}
                  {(applicantsByJobId[String(applicantsModalJob.id)] ?? []).length} total
                  {applicantSearch.trim() ? ` · showing ${applicantsForModal.length}` : ''}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setApplicantsModalJob(null)}
                style={{
                  border: 'none',
                  background: '#f3f2ef',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FaTimes color="#666" />
              </button>
            </div>

            <div style={{ padding: '12px 20px', borderBottom: '1px solid #e0e0df' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#eef3f8', padding: '0 12px', borderRadius: '8px' }}>
                <FaSearch color="#666" size={14} />
                <input
                  type="search"
                  placeholder="Search by name, email, headline…"
                  value={applicantSearch}
                  onChange={(e) => setApplicantSearch(e.target.value)}
                  style={{ border: 'none', background: 'transparent', padding: '10px 8px', flex: 1, outline: 'none', fontSize: '14px' }}
                />
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '0 0 16px' }}>
              {applicantsForModal.length === 0 ? (
                <p style={{ padding: '32px 20px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
                  No applicants match your search.
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#666', borderBottom: '1px solid #e0e0df', background: '#fafafa' }}>
                      <th style={{ padding: '12px 20px', fontWeight: 600 }}>Candidate</th>
                      <th style={{ padding: '12px 12px', fontWeight: 600 }}>Email</th>
                      <th style={{ padding: '12px 12px', fontWeight: 600 }}>Headline</th>
                      <th style={{ padding: '12px 12px', fontWeight: 600 }}>Resume</th>
                      <th style={{ padding: '12px 12px', fontWeight: 600 }}>Applied</th>
                      <th style={{ padding: '12px 20px', fontWeight: 600 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applicantsForModal.map((a) => (
                      <tr key={a.id} style={{ borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' }}>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                backgroundColor: '#E8F3FF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#004182',
                                flexShrink: 0,
                              }}
                            >
                              <FaUser size={16} />
                            </div>
                            <span style={{ fontWeight: 600, color: '#000000e6' }}>{a.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 12px', color: '#555' }}>{a.email}</td>
                        <td style={{ padding: '14px 12px', color: '#555', maxWidth: '220px' }}>{a.headline}</td>
                        <td style={{ padding: '14px 12px' }}>
                          <button
                            type="button"
                            onClick={() => setResumeViewerApplicant(a)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#0A66C2',
                              fontWeight: 600,
                              cursor: 'pointer',
                              textDecoration: 'underline',
                              fontSize: '13px',
                              padding: 0,
                              fontFamily: 'inherit',
                            }}
                          >
                            View resume
                          </button>
                        </td>
                        <td style={{ padding: '14px 12px', color: '#666', whiteSpace: 'nowrap' }}>{a.appliedAgo}</td>
                        <td style={{ padding: '14px 20px' }}>
                          <select
                            value={a.status}
                            onChange={(e) => updateApplicantStatus(applicantsModalJob.id, a.id, e.target.value)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid #cfcfce',
                              fontSize: '13px',
                              backgroundColor: '#fff',
                              cursor: 'pointer',
                              maxWidth: '160px',
                            }}
                          >
                            {APPLICATION_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {import.meta.env.VITE_DEMO_SEED !== 'false' ? (
              <div style={{ padding: '12px 20px', borderTop: '1px solid #e0e0df', background: '#f9f9f9', fontSize: '12px', color: '#666' }}>
                Sample applicants are generated when demo seeding is on. New applies from the Jobs page appear as &quot;New&quot; for this session.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {resumeViewerApplicant ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resume-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setResumeViewerApplicant(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setResumeViewerApplicant(null);
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '560px',
              maxHeight: '85vh',
              overflow: 'auto',
              padding: '24px',
              margin: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
              <div>
                <h2 id="resume-modal-title" style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
                  Resume / application text
                </h2>
                <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#666' }}>
                  {resumeViewerApplicant.name} · {resumeViewerApplicant.email}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setResumeViewerApplicant(null)}
                style={{
                  border: 'none',
                  background: '#f3f2ef',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  cursor: 'pointer',
                }}
              >
                <FaTimes color="#666" />
              </button>
            </div>
            <div
              style={{
                fontSize: '14px',
                lineHeight: 1.55,
                color: '#000000e6',
                whiteSpace: 'pre-wrap',
                padding: '14px',
                background: '#faf9fc',
                borderRadius: '8px',
                border: '1px solid #e8e6ef',
              }}
            >
              {resumeViewerApplicant.resumeSummary ||
                'No resume text on file for this candidate (legacy synthetic row).'}
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin-animation { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};

export default RecruiterJobs;
