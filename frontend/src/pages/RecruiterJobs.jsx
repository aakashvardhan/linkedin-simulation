import React, { useMemo, useState } from 'react';
import { useMockData } from '../context/MockDataContext';
import { makeApi } from '../api';
import {
  APPLICATION_STATUSES,
  generateApplicantsForJob,
  generateCandidateMatches,
} from '../data/mockApplicants';
import { mapAgentResultToCopilotCandidates, pollRecruiterResult } from '../utils/recruiterAssistant';
import { FaTrash, FaEdit, FaSearch, FaRobot, FaSpinner, FaPaperPlane, FaTimes, FaUser, FaChevronDown, FaChevronUp, FaCopy, FaEnvelope } from 'react-icons/fa';

const RECRUITER_ASSISTANT_OFFLINE = import.meta.env.VITE_RECRUITER_ASSISTANT_OFFLINE === 'true';

/** Max applicants sent to the recruiter-assistant agent in one request (LLM cost / latency). */
const MAX_AGENT_APPLICANT_BATCH = 50;

/**
 * Applicants stored from Application Service, or synthetic rows when the API returned none but the job
 * still shows an applicant count (common with backend integration + seeded job metadata).
 */
function getEffectiveApplicants(job, applicantsByJobId) {
  const fromStore = applicantsByJobId[String(job.id)] ?? [];
  if (fromStore.length > 0) return fromStore;
  const n = Number(job.applicants) || 0;
  if (n > 0) return generateApplicantsForJob(job.id, Math.min(n, 500));
  return [];
}

const RecruiterJobs = () => {
  const { jobs, addJob, editJob, deleteJob, applicantsByJobId, updateApplicantStatus, userProfile, authToken } = useMockData();
  const recruiterApi = useMemo(() => makeApi({ getAuthToken: () => authToken }), [authToken]);
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
  const [copilotError, setCopilotError] = useState('');

  const applicantsForModal = useMemo(() => {
    if (!applicantsModalJob) return [];
    const list = getEffectiveApplicants(applicantsModalJob, applicantsByJobId);
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

  const runOfflineCandidateMatching = (job) => {
    setCopilotError('');
    const applicants = getEffectiveApplicants(job, applicantsByJobId);
    setCopilotState('matching');
    setCopilotLog([`Offline ranking: ${applicants.length} applicant(s) for “${job.title}”…`]);
    const result = generateCandidateMatches(job, applicants, userProfile?.displayName || 'Recruiter');
    setMatchedCandidates(result.candidates);
    setCopilotLog((prev) => [...prev, `Done — ${result.candidates.length} candidate(s) ranked.`]);
    setCopilotState('results');
  };

  /** Rank applicants via `services/recruiter-assistant` (or offline mock when `VITE_RECRUITER_ASSISTANT_OFFLINE=true`). */
  const triggerCandidateMatching = async (job) => {
    setSelectedJobForMatching(job);
    setMatchedCandidates([]);
    setExpandedCandidateId(null);
    setEditedEmails({});
    setCopilotError('');

    const pool = getEffectiveApplicants(job, applicantsByJobId);
    const fromApi = (applicantsByJobId[String(job.id)] ?? []).length;
    const applicants = pool.slice(0, MAX_AGENT_APPLICANT_BATCH);

    if (RECRUITER_ASSISTANT_OFFLINE) {
      runOfflineCandidateMatching(job);
      return;
    }

    if (pool.length === 0) {
      window.alert(
        'There are no applicants for this job yet. When members apply from the Jobs page, they appear here for matching.',
      );
      setCopilotState('idle');
      return;
    }

    setCopilotState('matching');
    const originNote =
      fromApi === 0 && pool.length > 0
        ? ' (demo résumés generated from job applicant count — Application Service returned no rows)'
        : '';
    const batchNote =
      pool.length > applicants.length
        ? ` — sending top ${applicants.length} of ${pool.length} for scoring`
        : '';
    setCopilotLog([
      `Contacting recruiter assistant for “${job.title}” (${pool.length} applicant(s))${originNote}${batchNote}…`,
    ]);

    try {
      const actorId = String(userProfile?.recruiter_id ?? userProfile?.id ?? 'recruiter');
      const jobPayload = {
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description || '',
        remote: !!job.remote,
        industry: job.industry || '',
        type: job.type || '',
        skills_required: [],
      };
      const candidates = applicants.map((a) => ({
        candidate_id: String(a.id),
        resume_text:
          (a.resumeSummary || '').trim() ||
          `${a.name}. ${a.headline || ''}. ${a.email || ''}`,
      }));

      const queued = await recruiterApi.recruiterAssistant.request({
        actor_id: actorId,
        job: jobPayload,
        candidates,
      });
      const traceId = queued?.trace_id;
      if (!traceId) {
        throw new Error('Recruiter assistant did not return a trace_id.');
      }
      setCopilotLog((prev) => [...prev, `Task queued (${String(traceId).slice(0, 8)}…). Scoring resumes…`]);

      const result = await pollRecruiterResult(
        (id) => recruiterApi.recruiterAssistant.result(id),
        traceId,
        { maxWaitMs: 300000, intervalMs: 2000 },
      );

      const byId = new Map(pool.map((a) => [String(a.id), a]));
      let mapped = mapAgentResultToCopilotCandidates(result, byId);

      if (mapped.length === 0 && pool.length > 0) {
        const offline = generateCandidateMatches(
          job,
          pool.slice(0, Math.min(pool.length, MAX_AGENT_APPLICANT_BATCH)),
          userProfile?.displayName || 'Recruiter',
        );
        mapped = offline.candidates;
        setCopilotLog((prev) => [
          ...prev,
          'Assistant returned no ranked candidates (missing LLM keys or all pipeline steps failed). Showing offline demo ranking — configure OPENROUTER_API_KEY or GROQ_API_KEY on recruiter-assistant containers for live AI.',
          `Done — ${mapped.length} candidate(s) (offline demo).`,
        ]);
      } else {
        setCopilotLog((prev) => [...prev, `Done — ${mapped.length} candidate(s) ranked.`]);
      }

      setMatchedCandidates(mapped);
      setCopilotState('results');
    } catch (err) {
      const msg = err?.message || String(err);
      setCopilotError(msg);
      setCopilotLog((prev) => [...prev, `Error: ${msg}`]);
      setCopilotState('idle');
    }
  };

  const resetCopilot = () => {
    setCopilotState('idle');
    setCopilotLog([]);
    setSelectedJobForMatching(null);
    setMatchedCandidates([]);
    setExpandedCandidateId(null);
    setEditedEmails({});
    setCopilotError('');
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

            {copilotState === 'idle' && (
              <div style={{ textAlign: 'center', padding: '24px 8px', color: '#666' }}>
                <FaRobot size={32} style={{ color: '#0A66C2', marginBottom: '12px' }} />
                <p style={{ fontSize: '14px', lineHeight: '1.5' }}>
                  Click <strong>&ldquo;Find Candidates&rdquo;</strong> on any job posting to discover top-matched candidates with personalized outreach drafts.
                </p>
                {copilotError ? (
                  <div
                    style={{
                      marginTop: '16px',
                      textAlign: 'left',
                      padding: '12px',
                      borderRadius: '8px',
                      background: '#fff4f4',
                      border: '1px solid #f5c6cb',
                      color: '#721c24',
                      fontSize: '13px',
                      lineHeight: 1.45,
                    }}
                  >
                    <strong>Assistant unavailable.</strong> {copilotError}
                    <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setCopilotError('');
                          if (selectedJobForMatching) runOfflineCandidateMatching(selectedJobForMatching);
                        }}
                        disabled={!selectedJobForMatching}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '16px',
                          border: '1px solid #004182',
                          background: '#fff',
                          color: '#004182',
                          fontWeight: 600,
                          cursor: selectedJobForMatching ? 'pointer' : 'not-allowed',
                          fontSize: '12px',
                        }}
                      >
                        Use offline demo ranking
                      </button>
                      <button
                        type="button"
                        onClick={() => setCopilotError('')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '16px',
                          border: '1px solid #ccc',
                          background: '#fff',
                          color: '#666',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : null}
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

            {copilotState === 'results' && matchedCandidates.length === 0 && (
              <div style={{ padding: '12px', fontSize: '13px', color: '#666', textAlign: 'center' }}>
                No ranked candidates to display. Try{' '}
                <button
                  type="button"
                  onClick={() => selectedJobForMatching && runOfflineCandidateMatching(selectedJobForMatching)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0A66C2',
                    fontWeight: 600,
                    cursor: selectedJobForMatching ? 'pointer' : 'default',
                    textDecoration: 'underline',
                    padding: 0,
                    fontFamily: 'inherit',
                  }}
                >
                  offline demo ranking
                </button>{' '}
                or check recruiter-assistant logs.
              </div>
            )}

            {copilotState === 'results' && matchedCandidates.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: '600', margin: 0 }}>
                      {matchedCandidates.length} Candidates Matched
                    </h3>
                    <p style={{ fontSize: '12px', color: '#666', margin: '2px 0 0' }}>{selectedJobForMatching?.title}</p>
                  </div>
                  <button onClick={resetCopilot} style={{ fontSize: '12px', color: '#0A66C2', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
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
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#fff', background: '#004182', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', marginLeft: 'auto' }}
                            >
                              <FaPaperPlane size={10} /> Send
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Human Evaluation */}
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
                    </div>
                  );
                })}
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
