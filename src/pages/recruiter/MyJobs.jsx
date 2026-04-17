import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/realApi';
import { useAuth } from '../../hooks/useAuth';
import PostedJobCard from '../../components/recruiter/PostedJobCard';
import EmptyState from '../../components/shared/EmptyState';
import LoadingSpinner from '../../components/shared/LoadingSpinner';

// Normalise backend shape → what PostedJobCard expects
function normaliseJob(job) {
  return {
    id: job.job_id,
    job_id: job.job_id,
    title: job.title,
    status: job.status,
    postedDate: job.posted_datetime,
    applicantCount: job.applicants_count,
    views: job.views_count,
    saves_count: job.saves_count,
  };
}

export default function MyJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadJobs = async () => {
    if (!user?.recruiter_id) return;
    try {
      const result = await api.jobs.byRecruiter(user.recruiter_id);
      setJobs((result.jobs || []).map(normaliseJob));
    } catch (err) {
      toast.error('Failed to load jobs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [user]);

  const handleClose = async (jobId) => {
    if (!window.confirm('Close this job posting? It will no longer accept applications.')) return;
    try {
      await api.jobs.close(jobId, user.recruiter_id);
      toast.success('Job closed');
      setJobs((prev) =>
        prev.map((j) => (j.job_id === jobId ? { ...j, status: 'closed' } : j))
      );
    } catch (err) {
      toast.error(err.message || 'Could not close job');
    }
  };

  // PostedJobCard passes job.id to onClose/onDelete — we only support close via backend
  const handleDelete = (id) => {
    toast('To delete a job, close it first using the Close button.', { icon: 'ℹ️' });
  };

  if (loading) return <LoadingSpinner message="Loading your jobs..." />;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">My Posted Jobs ({jobs.length})</h1>
        <Link
          to="/recruiter/post-job"
          className="px-6 py-2 bg-linkedin text-white rounded-full font-medium hover:bg-linkedin-dark transition-colors"
        >
          Post New Job
        </Link>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="No jobs posted yet"
          message="Post your first job to start receiving applicants"
          icon={Briefcase}
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <PostedJobCard
              key={job.job_id}
              job={job}
              onDelete={handleDelete}
              onClose={() => handleClose(job.job_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
