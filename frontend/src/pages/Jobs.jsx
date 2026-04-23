import React, { useState, useMemo } from 'react';
import { useMockData } from '../context/MockDataContext';
import { FaSearch, FaMapMarkerAlt, FaBriefcase, FaCheckCircle, FaSpinner, FaBookmark, FaRegBookmark } from 'react-icons/fa';

const Jobs = () => {
  const { jobs, applyToJob, toggleSaveJob, isJobSaved, userProfile } = useMockData();
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
      const found = jobs.find((j) => j.id === selectedJobId);
      if (found) return found;
    }
    return filteredJobs[0] || null;
  }, [jobs, selectedJobId, filteredJobs]);

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
    <div style={{ gridColumn: 'span 3', display: 'flex', flexDirection: 'column', gap: '16px', height: 'calc(100vh - 100px)' }}>
      
      {/* Dynamic Search Filter Bar */}
      <div className="card" style={{ padding: '16px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
         <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#eef3f8', padding: '0 12px', borderRadius: '4px', flex: 1, minWidth: '200px' }}>
            <FaSearch color="#666" size={14} />
            <input 
              type="text" 
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

      {/* Split-View Layout */}
      <div style={{ display: 'flex', flex: 1, gap: '24px', overflow: 'hidden' }}>
        
        {/* Left Column: Job Cards */}
        <div className="card" style={{ width: '40%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #e0e0df' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600' }}>Jobs based on your profile</h2>
            <p style={{ fontSize: '12px', color: '#666' }}>{filteredJobs.length} results</p>
          </div>
          
          {filteredJobs.map((job) => (
            <div 
              key={job.id} 
              onClick={() => setSelectedJobId(job.id)}
              style={{ 
                padding: '16px', 
                borderBottom: '1px solid #e0e0df', 
                cursor: 'pointer', 
                backgroundColor: selectedJob?.id === job.id ? '#E8F3FF' : '#fff',
                borderLeft: selectedJob?.id === job.id ? '4px solid #004182' : '4px solid transparent'
              }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                 <img src={`https://ui-avatars.com/api/?name=${job.company.replace(' ', '+')}&background=random&color=fff&size=56`} alt="Company" style={{ width: '56px', height: '56px' }} />
                 <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0A66C2' }}>{job.title}</h3>
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
        <div className="card" style={{ width: '60%', overflowY: 'auto', padding: '24px' }}>
          {selectedJob ? (
            <>
              <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#000000e6' }}>{selectedJob.title}</h1>
              <p style={{ fontSize: '16px', color: '#000000e6', marginTop: '4px' }}>
                {selectedJob.company} &bull; {selectedJob.location}
                {selectedJob.industry ? ` · ${selectedJob.industry}` : ''}
              </p>
              
              <div style={{ display: 'flex', gap: '8px', margin: '24px 0', flexWrap: 'wrap' }}>
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
                   <FaBriefcase /> {selectedJob.hasApplied ? 'Applied' : 'Easy Apply'}
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
