import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useMockData } from '../context/MockDataContext';
import {
  FaSearch,
  FaMapMarkerAlt,
  FaBriefcase,
  FaCheckCircle,
  FaSpinner,
  FaBookmark,
  FaRegBookmark,
  FaFileAlt,
  FaChartLine,
  FaRobot,
} from 'react-icons/fa';
import { extractSkillsFromResume, calculateMatchScore } from '../utils/unitFunctions';
import CareerCoachPanel from '../components/CareerCoachPanel';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Job search, apply, and client-side resume matching.
const Jobs = () => {
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
  }, []);
  const { jobs, applyToJob, toggleSaveJob, isJobSaved, userProfile, authToken } = useMockData();
  const [searchTerm, setSearchTerm] = useState('');
  const [isRemoteOnly, setIsRemoteOnly] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState(null);

  // Application Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [appState, setAppState] = useState('idle'); // idle | submitting | success
  const [resumeText, setResumeText] = useState('');
  const [coverLetter, setCoverLetter] = useState('');

  const [locationFilter, setLocationFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');

  // Resume matching (demo): parse skills from pasted resume and rank jobs.
  const [resumeMatchText, setResumeMatchText] = useState('');
  const [resumeSkills, setResumeSkills] = useState([]);
  const [resumeMatchResults, setResumeMatchResults] = useState([]);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeFileName, setResumeFileName] = useState('');
  const resumeFileInputRef = useRef(null);
  const [resumeUploadHovered, setResumeUploadHovered] = useState(false);
  const [parseHovered, setParseHovered] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);

  useEffect(() => {
    if (!coachOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setCoachOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [coachOpen]);

  const buildApplicationTemplate = () => {
    const name = userProfile?.displayName || 'Your Name';
    const headline = userProfile?.headline || 'Your professional headline';
    return `${name}\n${headline}\n\nExperience: Summarize roles and impact (edit in Profile).\nSkills: List key technologies and domains.\nEducation: Degree, institution, year.\n\n— Standard application template (demo). Fill in from your profile or paste a full resume below.`;
  };

  const filteredJobs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return jobs.filter((job) => {
      const industry = (job.industry || '').toLowerCase();
      const desc = (job.description || '').toLowerCase();
      const hay = `${job.title} ${job.company} ${job.location} ${industry} ${desc}`.toLowerCase();
      const matchesSearch = !q || hay.includes(q);
      const matchesLocation = (job.location || '').toLowerCase().includes(locationFilter.toLowerCase());
      const matchesType = typeFilter ? job.type === typeFilter : true;
      const matchesIndustry = industryFilter
        ? (job.industry || '').toLowerCase() === industryFilter.toLowerCase()
        : true;
      const matchesRemote = isRemoteOnly ? job.remote === true : true;
      return matchesSearch && matchesLocation && matchesType && matchesIndustry && matchesRemote;
    });
  }, [jobs, searchTerm, locationFilter, typeFilter, industryFilter, isRemoteOnly]);

  const industries = useMemo(() => {
    const s = new Set();
    jobs.forEach((j) => {
      if (j.industry) s.add(j.industry);
    });
    return Array.from(s).sort();
  }, [jobs]);

  const selectedJob = useMemo(() => {
    if (selectedJobId != null) {
      const match = filteredJobs.find((j) => j.id === selectedJobId);
      if (match) return match;
    }
    return filteredJobs[0] || null;
  }, [selectedJobId, filteredJobs]);

  useEffect(() => {
    if (filteredJobs.length === 0) {
      setSelectedJobId(null);
      return;
    }
    if (selectedJobId == null || !filteredJobs.some((j) => j.id === selectedJobId)) {
      setSelectedJobId(filteredJobs[0].id);
    }
  }, [filteredJobs, selectedJobId]);

  const handleParseResumeAndMatch = () => {
    const skills = extractSkillsFromResume(resumeMatchText);
    setResumeSkills(skills);
    const required = ['react', 'typescript', 'javascript', 'node', 'python', 'sql', 'kafka', 'aws', 'docker', 'kubernetes'];
    const ranked = jobs
      .map((job) => ({
        jobId: job.id,
        score: calculateMatchScore({ title: job.title, description: job.description }, skills, required),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    setResumeMatchResults(ranked);
  };

  const parsePdfToText = async (arrayBuffer) => {
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
  };

  const handleResumeUpload = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    setResumeFileName(file.name || '');
    const maxBytes = 7 * 1024 * 1024;
    if (file.size > maxBytes) {
      window.alert('Please upload a resume under 7 MB for this demo.');
      return;
    }

    setResumeLoading(true);
    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
      const isText = file.type.startsWith('text/') || /\.(txt|md|rtf)$/i.test(file.name || '');

      if (isText) {
        const txt = await file.text();
        setResumeMatchText(txt);
        // Auto-run match after upload
        setTimeout(() => handleParseResumeAndMatch(), 0);
        return;
      }

      if (isPdf) {
        const buf = await file.arrayBuffer();
        const txt = await parsePdfToText(buf);
        if (!txt) {
          window.alert('Could not extract text from that PDF. Try a text resume or copy/paste.');
          return;
        }
        setResumeMatchText(txt);
        setTimeout(() => handleParseResumeAndMatch(), 0);
        return;
      }

      window.alert('Supported resume formats: PDF or text files (.txt).');
    } catch {
      window.alert('Could not read that resume. Try another file or paste text.');
    } finally {
      setResumeLoading(false);
    }
  };

  const scoreByJobId = useMemo(() => {
    const m = new Map();
    (resumeMatchResults || []).forEach((r) => m.set(r.jobId, r.score));
    return m;
  }, [resumeMatchResults]);

  const handleApplyClick = () => {
    if (selectedJob) {
      setIsModalOpen(true);
      setAppState('idle');
      setResumeText(buildApplicationTemplate());
      setCoverLetter(
        `Dear ${selectedJob.company} team,\n\nI am excited to apply for the ${selectedJob.title} role. My background aligns with the responsibilities described, and I would welcome the opportunity to contribute.\n\nBest regards,\n${userProfile?.displayName || 'Applicant'}`,
      );
    }
  };

  const handleKafkaSubmit = async (e) => {
    e.preventDefault();
    setAppState('submitting');
    
    // Simulate asynchronous submit pipeline
    setTimeout(() => {
      // Failure mode: prevent duplicate application submissions
      if (selectedJob.hasApplied) {
        setAppState('duplicate');
      } else {
        applyToJob(selectedJob.id, { resume_text: resumeText, cover_letter: coverLetter });
        setAppState('success');
        
        // Auto close modal after showing success notification
        setTimeout(() => {
          setIsModalOpen(false);
        }, 2500);
      }
    }, 2000);  
  };

  return (

    <div style={{ gridColumn: 'span 3', display: 'flex', flexDirection: 'column', gap: 0, height: 'calc(100vh - 100px)', minHeight: 0 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, backgroundColor: '#ffffff', borderBottom: '1px solid #e0e0df', padding: '12px 20px 16px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 400, color: '#191919', margin: '0 0 14px', letterSpacing: '-0.02em' }}>Jobs</h1>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
         <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#eef3f8', padding: '0 12px', borderRadius: '4px', flex: 1, minWidth: '200px' }}>
            <FaSearch color="#666" size={14} />
            <input 
              type="text" 
              data-testid="jobs-keyword-search"
              placeholder="Keywords (title, company, industry, description)" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ border: 'none', backgroundColor: 'transparent', padding: '12px', width: '100%', outline: 'none', fontSize: '14px' }} 
            />
         </div>

         <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#eef3f8', padding: '0 12px', borderRadius: '4px', width: '150px' }}>
            <FaMapMarkerAlt color="#666" size={14} />
            <input 
              type="text" 
              placeholder="Location" 
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              style={{ border: 'none', backgroundColor: 'transparent', padding: '12px', width: '100%', outline: 'none', fontSize: '14px' }} 
            />
         </div>

         <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ padding: '10px 12px', border: '1px solid #e0e0df', borderRadius: '4px', backgroundColor: 'transparent', color: '#666', fontSize: '14px', outline: 'none' }}>
            <option value="">Job Type (All)</option>
            <option value="Full-time">Full-time</option>
            <option value="Part-time">Part-time</option>
            <option value="Contract">Contract</option>
            <option value="Internship">Internship</option>
         </select>
         <select
           value={industryFilter}
           onChange={(e) => setIndustryFilter(e.target.value)}
           style={{ padding: '10px 12px', border: '1px solid #e0e0df', borderRadius: '4px', backgroundColor: 'transparent', color: '#666', fontSize: '14px', outline: 'none', maxWidth: '200px' }}
         >
           <option value="">Industry (All)</option>
           {industries.map((ind) => (
             <option key={ind} value={ind}>
               {ind}
             </option>
           ))}
         </select>
         <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#000000e6', cursor: 'pointer' }}>
           <input type="checkbox" checked={isRemoteOnly} onChange={(e) => setIsRemoteOnly(e.target.checked)} />
           Remote Only
         </label>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, gap: '12px', minHeight: 0, padding: '12px 16px 16px', overflow: 'hidden' }}>
          <aside style={{ flex: '0 0 clamp(196px, 18vw, 232px)', maxWidth: 232, minWidth: 180, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
                  {/* Resume matcher */}
                  <div
                    className="card"
                    style={{
                      padding: 0,
                      overflow: 'hidden',
                      borderRadius: '14px',
                      border: '1px solid rgba(10, 102, 194, 0.12)',
                      boxShadow: '0 4px 24px rgba(15, 45, 85, 0.06)',
                    }}
                  >
                    <div
                      style={{
                        padding: '10px 12px',
                        background: 'linear-gradient(165deg, #f0f7ff 0%, #ffffff 60%)',
                        borderBottom: '1px solid #e4edf5',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '10px',
                          background: 'linear-gradient(145deg, #cfe8ff 0%, #e8f4ff 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 10px rgba(10, 102, 194, 0.12)',
                        }}
                      >
                        <FaFileAlt style={{ color: '#0A66C2', fontSize: '17px' }} aria-hidden />
                      </div>
                      <div>
                        <h2 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px', color: '#0d1c2e', letterSpacing: '-0.02em' }}>
                          Resume & match
                        </h2>
                        <p style={{ fontSize: '11px', color: '#5c6d82', margin: 0, lineHeight: 1.35 }}>
                          Paste text or upload a resume—we extract skills and rank openings from your results below.
                        </p>
                      </div>
                    </div>

                    <div style={{ padding: '14px', display: 'flex', alignItems: 'stretch', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 160px', minWidth: '0', display: 'flex', flexDirection: 'column' }}>
            <textarea
              value={resumeMatchText}
              onChange={(e) => setResumeMatchText(e.target.value)}
              placeholder="Paste resume text here…"
              rows={4}
              style={{
                width: '100%',
                flex: 1,
                minHeight: '88px',
                            boxSizing: 'border-box',
                            border: '1px solid #cfd9e6',
                            borderRadius: '10px',
                            padding: '12px 14px',
                            fontFamily: 'inherit',
                            fontSize: '13px',
                            lineHeight: 1.5,
                            resize: 'vertical',
                            background: '#fafcfe',
                            outline: 'none',
                            boxShadow: 'inset 0 2px 4px rgba(15, 45, 85, 0.04)',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <label
                            onMouseEnter={() => setResumeUploadHovered(true)}
                            onMouseLeave={() => setResumeUploadHovered(false)}
                            style={{
                              position: 'relative',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              background: resumeUploadHovered ? '#0A66C2' : '#fff',
                              border: '2px solid #0A66C2',
                              borderRadius: '999px',
                              padding: '9px 16px',
                              fontWeight: 700,
                              fontSize: '12px',
                              color: resumeUploadHovered ? '#fff' : '#0A66C2',
                              cursor: resumeLoading ? 'progress' : 'pointer',
                              userSelect: 'none',
                              transition: 'background 0.2s ease, color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
                              transform: resumeUploadHovered && !resumeLoading ? 'translateY(-1px)' : 'none',
                              boxShadow: resumeUploadHovered && !resumeLoading ? '0 4px 14px rgba(10, 102, 194, 0.3)' : '0 2px 8px rgba(10, 102, 194, 0.08)',
                            }}
                          >
                            <FaFileAlt size={13} aria-hidden />
                            {resumeLoading ? 'Uploading…' : 'Upload resume (PDF/TXT)'}
                            <input
                              ref={resumeFileInputRef}
                              type="file"
                              accept=".pdf,.txt,text/plain,application/pdf"
                              onChange={(e) => {
                                handleResumeUpload(e.target.files);
                                e.target.value = '';
                              }}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                opacity: 0,
                                cursor: resumeLoading ? 'progress' : 'pointer',
                              }}
                              disabled={resumeLoading}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={handleParseResumeAndMatch}
                            disabled={!resumeMatchText.trim()}
                            onMouseEnter={() => setParseHovered(true)}
                            onMouseLeave={() => setParseHovered(false)}
                            style={{
                              backgroundColor: resumeMatchText.trim() ? '#0A66C2' : '#d4dbe4',
                              color: resumeMatchText.trim() ? '#fff' : '#7a8794',
                              border: 'none',
                              borderRadius: '999px',
                              padding: '9px 18px',
                              fontWeight: 800,
                              fontSize: '13px',
                              cursor: resumeMatchText.trim() ? 'pointer' : 'not-allowed',
                              boxShadow:
                                resumeMatchText.trim() && parseHovered
                                  ? '0 6px 18px rgba(10, 102, 194, 0.4)'
                                  : resumeMatchText.trim()
                                    ? '0 3px 12px rgba(10, 102, 194, 0.25)'
                                    : 'none',
                              transform: resumeMatchText.trim() && parseHovered ? 'translateY(-1px)' : 'none',
                              transition: 'transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
                            }}
                          >
                            Parse resume & match
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResumeMatchText('');
                              setResumeSkills([]);
                              setResumeMatchResults([]);
                              setResumeFileName('');
                            }}
                            style={{
                              background: 'transparent',
                              border: '1px solid #cfd9e6',
                              borderRadius: '999px',
                              padding: '9px 16px',
                              fontWeight: 700,
                              fontSize: '12px',
                              color: '#5c6d82',
                              cursor: 'pointer',
                              transition: 'border-color 0.2s ease, background 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#f4f8fc';
                              e.currentTarget.style.borderColor = '#8fb8e8';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.borderColor = '#cfd9e6';
                            }}
                          >
                            Clear
                          </button>
                        </div>
                        {resumeFileName ? (
                          <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#5c6d82' }}>
                            <span style={{ fontWeight: 700, color: '#38434f' }}>Last upload:</span>{' '}
                            <span style={{ color: '#0d1c2e', fontWeight: 600 }}>{resumeFileName}</span>
                          </p>
                        ) : null}
                      </div>

                      <div
                        style={{
                          flex: '1 1 140px',
                          minWidth: 0,
                          maxWidth: '100%',
                          borderRadius: '10px',
                          border: '1px dashed #c5d4e4',
                          background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)',
                          padding: '10px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: '140px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                          <FaChartLine color="#0A66C2" size={15} aria-hidden />
                          <h3 style={{ fontSize: '14px', fontWeight: 800, margin: 0, color: '#0d1c2e' }}>Top matches</h3>
                        </div>
                        {resumeMatchResults.length === 0 ? (
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '12px 8px' }}>
                            <div
                              aria-hidden
                              style={{
                                width: 52,
                                height: 52,
                                borderRadius: '50%',
                                background: 'rgba(10, 102, 194, 0.08)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: '10px',
                              }}
                            >
                              <FaChartLine size={22} color="#0A66C2" style={{ opacity: 0.65 }} />
                            </div>
                            <p style={{ fontSize: '13px', color: '#8899a8', margin: 0, lineHeight: 1.45, maxWidth: '220px' }}>
                              Add resume text and tap <strong style={{ color: '#38434f' }}>Parse resume & match</strong> to see ranked roles here.
                            </p>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {resumeMatchResults.map((r) => {
                              const job = jobs.find((j) => j.id === r.jobId);
                              if (!job) return null;
                              return (
                                <button
                                  key={String(r.jobId)}
                                  type="button"
                                  onClick={() => setSelectedJobId(job.id)}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.boxShadow = '0 6px 18px rgba(10, 102, 194, 0.15)';
                                    e.currentTarget.style.borderColor = '#8fb8e8';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.boxShadow = 'none';
                                    e.currentTarget.style.borderColor = '#dce6f0';
                                  }}
                                  style={{
                                    textAlign: 'left',
                                    background: '#fff',
                                    border: '1px solid #dce6f0',
                                    borderRadius: '12px',
                                    padding: '11px 13px',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                    <div style={{ fontWeight: 800, color: '#0d1c2e', fontSize: '13px', lineHeight: 1.2 }}>
                                      {job.title}
                                      <div style={{ fontWeight: 600, color: '#5c6d82', fontSize: '12px', marginTop: '3px' }}>{job.company}</div>
                                    </div>
                                    <div
                                      style={{
                                        background: 'rgba(10, 102, 194, 0.14)',
                                        color: '#0A66C2',
                                        fontWeight: 800,
                                        borderRadius: '999px',
                                        padding: '6px 10px',
                                        fontSize: '12px',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {r.score}% match
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {resumeSkills.length > 0 ? (
                          <p style={{ margin: '14px 0 0', fontSize: '12px', color: '#5c6d82', lineHeight: 1.45 }}>
                            <span style={{ fontWeight: 800, color: '#38434f' }}>Extracted skills:</span>{' '}
                            <span style={{ color: '#0d1c2e', fontWeight: 600 }}>{resumeSkills.join(', ')}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

          </aside>

          <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRadius: '8px', border: '1px solid #e0e0df', overflow: 'hidden', backgroundColor: '#ffffff', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e0e0df', backgroundColor: '#fafaf9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '14px', color: '#666666' }} role="status" aria-live="polite" data-testid="jobs-result-count">
                <strong style={{ color: '#191919' }}>{filteredJobs.length}</strong>{' '}
                {filteredJobs.length === 1 ? 'result' : 'results'}
                <span style={{ color: '#999', marginLeft: '8px' }}>· Personalized for you</span>
              </span>
            </div>
                        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        
                    {/* Left Column: Job Cards */}
                    <div className="card" style={{ flex: '0 0 36%', maxWidth: '360px', minWidth: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', backgroundColor: '#fafaf9', borderRight: '1px solid #e0e0df' }}>
                      <div style={{ padding: '14px 16px', borderBottom: '1px solid #e0e0df', backgroundColor: '#fafaf9' }}>
                        <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#191919', margin: '0 0 4px' }}>Job picks</h2>
                        <p style={{ fontSize: '12px', color: '#666666', margin: 0 }}>Click a role to preview the posting</p>
                      </div>
          
                      {filteredJobs.map((job) => (
                        <div 
                          key={job.id} 
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedJobId(job.id); } }}
                          onClick={() => setSelectedJobId(job.id)}
                          onMouseEnter={(e) => {
                            if (selectedJob?.id !== job.id) {
                              e.currentTarget.style.backgroundColor = '#f3f2ef';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = selectedJob?.id === job.id ? '#E8F3FF' : '#fff';
                          }}
                          style={{ 
                            padding: '14px 16px', 
                            borderBottom: '1px solid #e0e0df', 
                            cursor: 'pointer', 
                            backgroundColor: selectedJob?.id === job.id ? '#e8f4fc' : '#ffffff',
                            borderLeft: selectedJob?.id === job.id ? '4px solid #0a66c2' : '4px solid transparent',
                            transition: 'background-color 0.15s ease',
                          }}>
                          <div style={{ display: 'flex', gap: '12px' }}>
                             <img src={`https://ui-avatars.com/api/?name=${job.company.replace(' ', '+')}&background=random&color=fff&size=56`} alt="" style={{ width: '48px', height: '48px', borderRadius: '4px', flexShrink: 0 }} />
                             <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0a66c2', lineHeight: 1.25 }}>{job.title}</h3>
                                  {scoreByJobId.has(job.id) ? (
                                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#0A66C2', background: 'rgba(10, 102, 194, 0.12)', padding: '4px 8px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                                      {scoreByJobId.get(job.id)}% match
                                    </span>
                                  ) : null}
                                </div>
                                <p style={{ fontSize: '14px', color: '#000000e6' }}>{job.company}</p>
                                <p style={{ fontSize: '14px', color: '#666' }}>{job.location} ({job.remote ? 'Remote' : 'On-site'})</p>
                                {job.industry ? (
                                  <p style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{job.industry}</p>
                                ) : null}
                                {job.hasApplied && <p style={{ fontSize: '12px', color: '#0A66C2', fontWeight: '600', marginTop: '4px' }}><FaCheckCircle size={10}/> Applied</p>}
                             </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right Column: Full Job Description */}
                    <div className="card" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '24px 28px', backgroundColor: '#ffffff', border: 'none', borderRadius: 0, boxShadow: 'none' }}>
                      {selectedJob ? (
                        <>
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <img
                              src={`https://ui-avatars.com/api/?name=${selectedJob.company.replace(' ', '+')}&background=0a66c2&color=fff&size=64`}
                              alt=""
                              style={{ width: '56px', height: '56px', borderRadius: '8px', flexShrink: 0 }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <h1 style={{ fontSize: '22px', fontWeight: 600, color: '#191919', margin: '0 0 6px', lineHeight: 1.25 }}>
                                {selectedJob.title}
                              </h1>
                              <button
                                type="button"
                                onClick={(e) => e.preventDefault()}
                                style={{
                                  border: 'none',
                                  background: 'none',
                                  padding: 0,
                                  margin: 0,
                                  fontSize: '16px',
                                  fontWeight: 600,
                                  color: '#0a66c2',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  fontFamily: 'inherit',
                                }}
                              >
                                {selectedJob.company}
                              </button>
                              <p style={{ fontSize: '13px', color: '#666666', margin: '8px 0 0', lineHeight: 1.45 }}>
                                {selectedJob.location}
                                {selectedJob.remote ? ' · Remote' : ' · On-site'}
                                {selectedJob.industry ? ` · ${selectedJob.industry}` : ''}
                                <span style={{ color: '#999999' }}>
                                  {' '}
                                  · Posted {1 + (Number(selectedJob.id) % 21)} days ago
                                </span>
                              </p>
                              <p style={{ fontSize: '12px', color: '#666666', margin: '6px 0 0' }}>
                                Promoted · Easy Apply
                              </p>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', margin: '20px 0', flexWrap: 'wrap' }}>
                             <button
                               type="button"
                               onClick={() => toggleSaveJob(selectedJob.id)}
                               style={{
                                 display: 'flex',
                                 alignItems: 'center',
                                 gap: '8px',
                                 backgroundColor: isJobSaved(selectedJob.id) ? '#E8F3FF' : '#0A66C2',
                                 color: isJobSaved(selectedJob.id) ? '#5c4a9e' : '#fff',
                                 border: isJobSaved(selectedJob.id) ? '2px solid #0A66C2' : 'none',
                                 borderRadius: '24px',
                                 padding: '10px 24px',
                                 fontSize: '16px',
                                 fontWeight: '600',
                                 cursor: 'pointer',
                               }}
                             >
                               {isJobSaved(selectedJob.id) ? <FaBookmark /> : <FaRegBookmark />}
                               {isJobSaved(selectedJob.id) ? 'Saved' : 'Save job'}
                             </button>
                             <button
                               type="button"
                               onClick={handleApplyClick}
                               disabled={selectedJob.hasApplied}
                               aria-label={
                                 selectedJob.hasApplied
                                   ? 'Already applied to this job'
                                   : 'Easy Apply to this job'
                               }
                               style={{
                                 display: 'flex',
                                 alignItems: 'center',
                                 gap: '4px',
                                 backgroundColor: selectedJob.hasApplied ? '#e0e0df' : '#fff',
                                 color: selectedJob.hasApplied ? '#666' : '#0A66C2',
                                 border: '2px solid #0A66C2',
                                 borderRadius: '24px',
                                 padding: '8px 24px',
                                 fontSize: '16px',
                                 fontWeight: '600',
                                 cursor: selectedJob.hasApplied ? 'not-allowed' : 'pointer',
                               }}
                             >
                               <FaBriefcase aria-hidden /> {selectedJob.hasApplied ? 'Applied' : 'Easy Apply'}
                             </button>
                          </div>

                          {/* Skills Match Section */}
                          <div style={{ backgroundColor: '#f3f2ef', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <FaCheckCircle color="#004182" /> Skills Match
                            </h3>
                            <p style={{ fontSize: '14px', color: '#666', marginTop: '8px' }}>
                              Your profile matches 4 of 5 required skills for this role: 
                              <br/><br/>
                              <span style={{ backgroundColor: '#004182', color: '#fff', padding: '4px 8px', borderRadius: '4px', marginRight: '8px', fontSize: '12px' }}>React.js</span> 
                              <span style={{ backgroundColor: '#004182', color: '#fff', padding: '4px 8px', borderRadius: '4px', marginRight: '8px', fontSize: '12px' }}>Node.js</span> 
                              <span style={{ backgroundColor: '#004182', color: '#fff', padding: '4px 8px', borderRadius: '4px', marginRight: '8px', fontSize: '12px' }}>System Design</span>
                            </p>
                          </div>

                          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>About the job</h2>
                          <div style={{ fontSize: '14px', color: '#000000e6', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                            <p style={{ marginTop: 0 }}>
                              {selectedJob.description ||
                                'We are seeking a highly skilled individual to join our growing team. Responsibilities and qualifications will be discussed during screening.'}
                            </p>
                          </div>
                        </>
                      ) : (
                         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
                            Select a job to view details
                         </div>
                      )}
                    </div>
                  </div>


          </main>
        </div>

        {createPortal(
          <>
        {!coachOpen ? (
        <button
          type="button"
          onClick={() => setCoachOpen(true)}
          aria-expanded={false}
          aria-controls="jobs-career-coach-drawer"
          style={{
            position: 'fixed',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 2050,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '14px 8px',
            width: '44px',
            minHeight: '120px',
            border: '1px solid #0A66C2',
            borderRight: 'none',
            borderRadius: '10px 0 0 10px',
            background: 'linear-gradient(180deg, #378fe9 0%, #0A66C2 100%)',
            color: '#fff',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '12px',
            fontWeight: 800,
            letterSpacing: '0.04em',
            lineHeight: 1.2,
            boxShadow: '-2px 4px 16px rgba(10, 102, 194, 0.28)',
            transition: 'background 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '-4px 6px 22px rgba(10, 102, 194, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '-2px 4px 16px rgba(10, 102, 194, 0.28)';
          }}
        >
          <FaRobot size={18} aria-hidden />
          <span
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              transform: 'rotate(180deg)',
            }}
          >
            Career Coach
          </span>
        </button>
        ) : null}

        {coachOpen ? (
          <>
            <div
              role="presentation"
              onClick={() => setCoachOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.28)',
                zIndex: 2055,
              }}
            />
            <aside
              id="jobs-career-coach-drawer"
              aria-modal="true"
              role="dialog"
              aria-label="Career Coach"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: 'var(--nav-height)',
                right: 0,
                bottom: 0,
                width: 'min(404px, calc(100vw - 16px))',
                zIndex: 2060,
                backgroundColor: '#f3f2ef',
                boxShadow: '-8px 0 32px rgba(10, 102, 194, 0.18)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 12px 16px' }}>
                <CareerCoachPanel
                  authToken={authToken}
                  userProfile={userProfile}
                  jobs={jobs}
                  lockJobId={selectedJob?.id ?? null}
                  showJobPicker={false}
                  seedResumeText={resumeMatchText}
                  profileHeadline={userProfile?.headline}
                  railMode
                  recruiterTheme
                  onClose={() => setCoachOpen(false)}
                />
              </div>
            </aside>
          </>
        ) : null}
          </>,
          document.body,
        )}

      </div>

      {/* Async Kafka Application Modal */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', width: '500px', borderRadius: '8px', display: 'flex', flexDirection: 'column', padding: '24px', position: 'relative' }}>
            
            {appState === 'idle' && (
              <>
                <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Apply to {selectedJob?.company}</h2>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>Submit your application to start the review process.</p>
                
                <form onSubmit={handleKafkaSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', fontWeight: '600' }}>
                    Parsed Resume (Text)
                    <textarea 
                      required 
                      value={resumeText}
                      onChange={(e) => setResumeText(e.target.value)}
                      placeholder="Paste resume content or skills here..." 
                      style={{ padding: '12px', border: '1px solid #000000e6', borderRadius: '4px', minHeight: '100px', fontFamily: 'inherit' }}
                    />
                  </label>
                  
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', fontWeight: '600' }}>
                    Cover Letter
                    <textarea 
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      placeholder="Why are you a great fit?" 
                      style={{ padding: '12px', border: '1px solid #000000e6', borderRadius: '4px', minHeight: '80px', fontFamily: 'inherit' }}
                    />
                  </label>
                  
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                     <button type="button" onClick={() => setIsModalOpen(false)} style={{ backgroundColor: 'transparent', color: '#666', border: 'none', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                     <button type="submit" disabled={!resumeText} style={{ backgroundColor: resumeText ? '#0A66C2' : '#e0e0df', color: resumeText ? '#fff' : '#666', padding: '10px 24px', borderRadius: '24px', border: 'none', fontWeight: '600', cursor: resumeText ? 'pointer' : 'default' }}>Submit Application</button>
                  </div>
                </form>
              </>
            )}

            {appState === 'submitting' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: '16px' }}>
                 <FaSpinner className="spin-animation" size={48} color="#0A66C2" />
                 <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#0A66C2' }}>Processing Event...</h2>
                 <p style={{ fontSize: '14px', color: '#666', textAlign: 'center' }}>Submitting your application…<br/>Please do not close this window.</p>
              </div>
            )}

            {appState === 'success' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: '16px' }}>
                 <FaCheckCircle size={48} color="#004182" />
                 <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#004182' }}>Application Received!</h2>
                 <p style={{ fontSize: '14px', color: '#666', textAlign: 'center' }}>Your application was submitted successfully.</p>
              </div>
            )}

            {appState === 'duplicate' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: '16px' }}>
                 <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#cc0000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 'bold' }}>!</div>
                 <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#cc0000' }}>Already applied</h2>
                 <p style={{ fontSize: '14px', color: '#666', textAlign: 'center' }}>You’ve already applied to this job.</p>
                 <button onClick={() => setIsModalOpen(false)} style={{ backgroundColor: '#cc0000', color: '#fff', border: 'none', padding: '8px 24px', borderRadius: '24px', fontWeight: '600', marginTop: '8px', cursor: 'pointer' }}>Close Modal</button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Global Spin Animation logic for spinner */}
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin-animation { animation: spin 1s linear infinite; }
      `}</style>

    </div>
  );
};

export default Jobs;
