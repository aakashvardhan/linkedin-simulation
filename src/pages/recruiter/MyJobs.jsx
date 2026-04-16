import { useLocalStorage } from '../../hooks/useLocalStorage';
import PostedJobCard from '../../components/recruiter/PostedJobCard';
import EmptyState from '../../components/shared/EmptyState';
import { Briefcase } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

const defaultJobs = [
  { id: 'rjob-1', title: 'Senior Software Engineer', location: 'San Francisco, CA', employment_type: 'FULLTIME', workplace_type: 'onsite', seniority_level: 'Senior', skills_required: ['React', 'Node.js', 'AWS'], postedDate: '2026-04-01', applicantCount: 45, views: 320, status: 'open' },
  { id: 'rjob-2', title: 'Frontend Developer', location: 'Remote', employment_type: 'FULLTIME', workplace_type: 'remote', seniority_level: 'Mid', skills_required: ['React', 'TypeScript', 'CSS'], postedDate: '2026-04-03', applicantCount: 38, views: 280, status: 'open' },
  { id: 'rjob-3', title: 'Data Scientist', location: 'New York, NY', employment_type: 'FULLTIME', workplace_type: 'hybrid', seniority_level: 'Senior', skills_required: ['Python', 'SQL', 'ML'], postedDate: '2026-04-05', applicantCount: 32, views: 250, status: 'open' },
];

export default function MyJobs() {
  const [recruiterJobs, setRecruiterJobs] = useLocalStorage('linkedin_recruiter_jobs', defaultJobs);

  const handleDelete = (id) => {
    if (!window.confirm('Delete this job posting?')) return;
    setRecruiterJobs(recruiterJobs.filter((j) => j.id !== id));
    toast.success('Job deleted');
  };

  const handleClose = (id) => {
    setRecruiterJobs(recruiterJobs.map((j) => j.id === id ? { ...j, status: 'closed' } : j));
    toast.success('Job closed — no new applications');
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">My Posted Jobs ({recruiterJobs.length})</h1>
        <Link to="/recruiter/post-job" className="px-6 py-2 bg-linkedin text-white rounded-full font-medium hover:bg-linkedin-dark transition-colors">
          Post New Job
        </Link>
      </div>
      {recruiterJobs.length === 0 ? (
        <EmptyState title="No jobs posted yet" message="Post your first job to start receiving applicants" icon={Briefcase} />
      ) : (
        <div className="space-y-3">
          {recruiterJobs.map((job) => (
            <PostedJobCard key={job.id} job={job} onDelete={handleDelete} onClose={handleClose} />
          ))}
        </div>
      )}
    </div>
  );
}
