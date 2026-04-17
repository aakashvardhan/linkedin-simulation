import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/realApi';
import { useAuth } from '../../hooks/useAuth';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import {
  MapPin, Clock, DollarSign, Bookmark, ArrowLeft, Building2, AlertCircle, Briefcase,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function JobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);

  const [applyForm, setApplyForm] = useState({ cover_letter: '', resume_url: '' });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await api.jobs.get(Number(jobId));
        setJob(data);

        // Check if member already applied
        if (user?.member_id) {
          try {
            const apps = await api.applications.byMember(user.member_id);
            const found = (apps.applications || []).some((a) => a.job_id === Number(jobId));
            setAlreadyApplied(found);
          } catch {
            // application service may not be available yet — soft fail
          }

          // Check if already saved
          try {
            const saved = await api.jobs.savedByMember(user.member_id);
            const alreadySaved = (saved.jobs || []).some((j) => j.job_id === Number(jobId));
            setIsSaved(alreadySaved);
          } catch {
            // soft fail
          }
        }
      } catch (err) {
        toast.error('Job not found');
        navigate('/jobs');
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId, user]);

  if (loading) return <LoadingSpinner message="Loading job details..." />;
  if (!job) return null;

  const isClosed = job.status === 'closed';

  const toggleSave = async () => {
    if (!user?.member_id) return toast.error('Please log in to save jobs');
    setSaving(true);
    try {
      await api.jobs.save(job.job_id, user.member_id);
      setIsSaved(true);
      toast.success('Job saved!');
    } catch (err) {
      if (err.response?.status === 409) {
        setIsSaved(true);
        toast('Already saved', { icon: '🔖' });
      } else {
        toast.error(err.message || 'Could not save job');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleApplyClick = () => {
    if (isClosed) return toast.error('This job is closed and no longer accepting applications');
    if (alreadyApplied) return toast.error('You have already applied to this job');
    if (!user?.member_id) return toast.error('Please log in to apply');
    setShowApply(true);
  };

  const handleApply = async () => {
    if (!applyForm.resume_url && !user?.resume_url) {
      // Allow submission without resume URL — backend makes it optional
    }
    setApplying(true);
    try {
      await api.applications.submit({
        job_id: job.job_id,
        member_id: user.member_id,
        resume_url: applyForm.resume_url || user?.resume_url || '',
        cover_letter: applyForm.cover_letter || '',
      });
      setAlreadyApplied(true);
      setShowApply(false);
      toast.success('Application submitted!');
    } catch (err) {
      if (err.response?.status === 409) {
        setAlreadyApplied(true);
        setShowApply(false);
        toast('Already applied to this job', { icon: 'ℹ️' });
      } else {
        toast.error(err.message || 'Could not submit application');
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {isClosed && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4" />
          This job is closed and no longer accepting applications.
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex gap-4 items-start">
          <div className="w-16 h-16 rounded bg-gray-100 flex items-center justify-center shrink-0">
            <Building2 className="w-8 h-8 text-gray-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-800">{job.title}</h1>
            <p className="text-lg text-gray-600">{job.company_name}</p>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
              {job.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {job.location}
                </span>
              )}
              {job.employment_type && (
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {job.employment_type}
                </span>
              )}
              {job.salary_min && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-4 h-4" />
                  ${job.salary_min.toLocaleString()}
                  {job.salary_max ? ` – $${job.salary_max.toLocaleString()}` : '+'}
                </span>
              )}
              {job.work_mode && (
                <span className="flex items-center gap-1">
                  <Briefcase className="w-4 h-4" />
                  {job.work_mode}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {(job.skills_required || []).map((skill) => (
                <span
                  key={skill}
                  className="px-2 py-0.5 bg-linkedin-light text-linkedin text-xs rounded-full"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 mt-4 text-xs text-gray-400">
          {job.views_count != null && <span>{job.views_count.toLocaleString()} views</span>}
          {job.applicants_count != null && (
            <span>{job.applicants_count.toLocaleString()} applicants</span>
          )}
          {job.saves_count != null && <span>{job.saves_count.toLocaleString()} saves</span>}
        </div>

        {/* Actions */}
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
          <button
            onClick={toggleSave}
            disabled={saving || isSaved}
            className={`px-6 py-2 border rounded-full font-medium transition-colors ${
              isSaved
                ? 'border-linkedin text-linkedin bg-linkedin-light cursor-default'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Bookmark className={`w-4 h-4 inline mr-1 ${isSaved ? 'fill-linkedin' : ''}`} />
            {isSaved ? 'Saved' : saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Description */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Description</h2>
          <p className="text-gray-600 whitespace-pre-line leading-relaxed">{job.description}</p>
        </div>
      </div>

      {/* Apply Modal */}
      {showApply && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setShowApply(false)}
        >
          <div
            className="bg-white rounded-xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold mb-1">Apply to {job.company_name}</h2>
            <p className="text-gray-500 text-sm mb-4">{job.title}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Resume URL (optional)
                </label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={applyForm.resume_url}
                  onChange={(e) => setApplyForm({ ...applyForm, resume_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-linkedin focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cover Letter (optional)
                </label>
                <textarea
                  value={applyForm.cover_letter}
                  onChange={(e) => setApplyForm({ ...applyForm, cover_letter: e.target.value })}
                  rows={4}
                  placeholder="Dear Hiring Manager..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-linkedin focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleApply}
                disabled={applying}
                className="flex-1 py-2 bg-linkedin text-white rounded-full font-medium hover:bg-linkedin-dark disabled:opacity-60"
              >
                {applying ? 'Submitting...' : 'Submit Application'}
              </button>
              <button
                onClick={() => setShowApply(false)}
                className="px-6 py-2 border border-gray-300 rounded-full hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
