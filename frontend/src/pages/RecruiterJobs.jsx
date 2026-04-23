import React, { useMemo, useState } from 'react';
import { useMockData } from '../context/MockDataContext';
import { APPLICATION_STATUSES } from '../data/mockApplicants';
import { FaTrash, FaEdit, FaSearch, FaRobot, FaSpinner, FaPaperPlane, FaTimes, FaUser } from 'react-icons/fa';

const RecruiterJobs = () => {
  const { jobs, addJob, editJob, deleteJob, applicantsByJobId, updateApplicantStatus } = useMockData();
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
  const [copilotState, setCopilotState] = useState('idle'); // idle | parsing | matching | generating | review
  const [copilotLog, setCopilotLog] = useState([]);
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [applicantsModalJob, setApplicantsModalJob] = useState(null);
  const [applicantSearch, setApplicantSearch] = useState('');
  const [resumeViewerApplicant, setResumeViewerApplicant] = useState(null);

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

  const handleCreateJob = (e) => {
    e.preventDefault();
    if (newJob.title && newJob.location) {
      addJob(newJob);
      setNewJob({
        title: '',
        company: 'My Startup',
        location: '',
        type: 'Full-time',
        remote: false,
        industry: 'Technology',
        description: '',
      });
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

  // Stream Simulation (replace with WebSocket later)
  const triggerCopilot = () => {
    setCopilotState('parsing');
    setCopilotLog(['Starting copilot…']);
    
    setTimeout(() => {
      setCopilotLog(prev => [...prev, '✓ Connected.']);
      setCopilotLog(prev => [...prev, 'Analyzing candidate profile…']);
      
      setTimeout(() => {
        setCopilotState('matching');
        setCopilotLog(prev => [...prev, '✓ Profile analyzed.']);
        setCopilotLog(prev => [...prev, 'Matching against job requirements…']);
        
        setTimeout(() => {
           setCopilotState('generating');
           setCopilotLog(prev => [...prev, '✓ Match score computed.']);
           setCopilotLog(prev => [...prev, 'Drafting outreach message…']);
           
           setTimeout(() => {
             setCopilotLog(prev => [...prev, '✓ Draft ready.']);
             setGeneratedMessage("Hi there! I noticed your excellent background in System Design and React. We have a great Senior role open right now that matches your skill profile perfectly. Are you open to a quick chat?");
             setCopilotState('review');
           }, 2000);
        }, 2000);
      }, 2000);
    }, 1500);
  };

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
      <div className="card" style={{ width: '350px', height: 'fit-content', border: '2px solid #8f5849' }}>
         <div style={{ backgroundColor: '#8f5849', color: '#fff', padding: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaRobot size={24} />
            <span style={{ fontSize: '16px', fontWeight: '600' }}>Agentic Copilot</span>
         </div>
         
         <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '14px', color: '#000000e6' }}>Generate personalized outreach drafts based on job requirements and candidate profiles.</p>
            
            {copilotState === 'idle' ? (
              <button onClick={triggerCopilot} style={{ width: '100%', backgroundColor: '#0A66C2', color: '#fff', border: 'none', padding: '12px', borderRadius: '24px', fontWeight: '600', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                <FaRobot /> Generate Candidate Outreach
              </button>
            ) : (
              <div style={{ backgroundColor: '#f3f2ef', padding: '16px', borderRadius: '8px', border: '1px solid #e0e0df' }}>
                 <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Progress</h3>
                 
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', fontFamily: 'monospace', color: '#000', maxHeight: '150px', overflowY: 'auto' }}>
                    {copilotLog.map((log, i) => (
                      <span key={i} style={{ color: log.includes('✓') ? '#004182' : '#666' }}>{log}</span>
                    ))}
                 </div>
                 
                 {copilotState !== 'review' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', color: '#0A66C2', fontSize: '14px', fontWeight: '600' }}>
                       <FaSpinner className="spin-animation" /> 
                       {copilotState === 'parsing' && 'Analyzing…'}
                       {copilotState === 'matching' && 'Matching…'}
                       {copilotState === 'generating' && 'Drafting…'}
                    </div>
                 )}
              </div>
            )}

            {/* Human-in-the-loop Editing */}
            {copilotState === 'review' && (
               <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                 <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#c37d16' }}>Review before sending</h3>
                 <textarea 
                   value={generatedMessage}
                   onChange={(e) => setGeneratedMessage(e.target.value)}
                   style={{ width: '100%', padding: '12px', border: '1px solid #000000e6', borderRadius: '4px', height: '120px', fontFamily: 'inherit', fontSize: '13px' }}
                 />
                 <button onClick={() => setCopilotState('idle')} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', backgroundColor: '#004182', color: '#fff', border: 'none', padding: '12px', borderRadius: '24px', fontWeight: '600', cursor: 'pointer', marginTop: '8px' }}>
                   <FaPaperPlane /> Approve & Dispatch Message
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

            <div style={{ padding: '12px 20px', borderTop: '1px solid #e0e0df', background: '#f9f9f9', fontSize: '12px', color: '#666' }}>
              Demo data is generated locally. When members apply from the Jobs page, they appear at the top as &quot;New&quot;. Status changes stay in this session until refresh.
            </div>
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
