import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getJobById } from '../../api/jsearch';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useAuth } from '../../hooks/useAuth';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { MapPin, Clock, DollarSign, ExternalLink, Bookmark, ArrowLeft, Building2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function JobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showApply, setShowApply] = useState(false);
  const [savedJobs, setSavedJobs] = useLocalStorage('linkedin_saved_jobs', []);
  const [applications, setApplications] = useLocalStorage('linkedin_applications', []);

  // Apply form state
  const [applyForm, setApplyForm] = useState({ name: '', email: '', cover_letter: '', resume_file: '' });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await getJobById(decodeURIComponent(jobId));
      setJob(data);
      setLoading(false);
    })();
  }, [jobId]);

  useEffect(() => {
    if (user) {
      setApplyForm((f) => ({ ...f, name: user.name || '', email: user.email || '' }));
    }
  }, [user]);

  if (loading) return <LoadingSpinner message="Loading job details..." />;
  if (!job) return <p className="text-center py-10 text-gray-500">Job not found.</p>;

  const isSaved = savedJobs.some((j) => j.id === job.id);
  const alreadyApplied = applications.some((a) => a.jobId === job.id);
  const isClosed = job.status === 'closed';

  const toggleSave = () => {
    if (isSaved) {
      setSavedJobs(savedJobs.filter((j) => j.id !== job.id));
      toast.success('Removed from saved');
    } else {
      setSavedJobs([...savedJobs, job]);
      toast.success('Job saved!');
    }
  };

  const handleApplyClick = () => {
    if (isClosed) return toast.error('This job is closed and no longer accepting applications');
    if (alreadyApplied) return toast.error('You have already applied to this job');
    setShowApply(true);
  };

  const handleApply = () => {
    if (!applyForm.name || !applyForm.email) return toast.error('Name and email are required');
    const newApp = {
      id: `app-${Date.now()}`,
      jobId: job.id,
      jobTitle: job.title,
      company: job.company_name,
      logo: job.company_logo,
      status: 'applied',
      appliedDate: new Date().toISOString().split('T')[0],
      cover_letter: applyForm.cover_letter,
      resume_file: applyForm.resume_file,
    };
    setApplications([newApp, ...applications]);
    setShowApply(false);
    toast.success('Application submitted!');
  };

  return (
    <div>
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {isClosed && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4" /> This job is closed and no longer accepting applications.
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex gap-4 items-start">
          {job.company_logo ? (
            <img src={job.company_logo} alt="" className="w-16 h-16 rounded object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
          ) : (
            <div className="w-16 h-16 rounded bg-gray-100 flex items-center justify-center">
              <Building2 className="w-8 h-8 text-gray-400" />
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-800">{job.title}</h1>
            <p className="text-lg text-gray-600">{job.company_name}</p>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{job.location}</span>
              {job.employment_type && <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{job.employment_type}</span>}
              {job.min_salary && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-4 h-4" />
                  ${job.min_salary.toLocaleString()} - ${job.max_salary?.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleApplyClick}
            disabled={isClosed || alreadyApplied}
            className={`px-6 py-2 rounded-full font-medium transition-colors ${
              isClosed || alreadyApplied
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-linkedin text-white hover:bg-linkedin-dark'
            }`}
          >
            {alreadyApplied ? 'Already Applied' : isClosed ? 'Job Closed' : 'Apply Now'}
          </button>
          <button onClick={toggleSave} className={`px-6 py-2 border rounded-full font-medium transition-colors ${isSaved ? 'border-linkedin text-linkedin bg-linkedin-light' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            <Bookmark className={`w-4 h-4 inline mr-1 ${isSaved ? 'fill-linkedin' : ''}`} />
            {isSaved ? 'Saved' : 'Save'}
          </button>
          {job.apply_link && job.apply_link !== '#' && (
            <a href={job.apply_link} target="_blank" rel="noopener noreferrer" className="px-6 py-2 border border-gray-300 text-gray-700 rounded-full font-medium hover:bg-gray-50 flex items-center gap-1">
              <ExternalLink className="w-4 h-4" /> External
            </a>
          )}
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Description</h2>
          <p className="text-gray-600 whitespace-pre-line leading-relaxed">{job.description}</p>
        </div>

        {job.qualifications?.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Qualifications</h2>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              {job.qualifications.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </div>
        )}

        {job.responsibilities?.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Responsibilities</h2>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              {job.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Apply Modal */}
      {showApply && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowApply(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-4">Apply to {job.company_name}</h2>
            <p className="text-gray-600 mb-4">{job.title}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input type="text" value={applyForm.name} onChange={(e) => setApplyForm({ ...applyForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-linkedin focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" value={applyForm.email} onChange={(e) => setApplyForm({ ...applyForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-linkedin focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resume (PDF)</label>
                <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setApplyForm({ ...applyForm, resume_file: e.target.files?.[0]?.name || '' })}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-linkedin-light file:text-linkedin hover:file:bg-blue-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cover Letter (optional)</label>
                <textarea value={applyForm.cover_letter} onChange={(e) => setApplyForm({ ...applyForm, cover_letter: e.target.value })}
                  rows={4} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-linkedin focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleApply} className="flex-1 py-2 bg-linkedin text-white rounded-full font-medium hover:bg-linkedin-dark">
                Submit Application
              </button>
              <button onClick={() => setShowApply(false)} className="px-6 py-2 border border-gray-300 rounded-full hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
