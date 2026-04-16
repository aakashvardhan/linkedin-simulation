import { useLocalStorage } from '../../hooks/useLocalStorage';
import JobCard from '../../components/member/JobCard';
import EmptyState from '../../components/shared/EmptyState';
import { Bookmark } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SavedJobs() {
  const [savedJobs, setSavedJobs] = useLocalStorage('linkedin_saved_jobs', []);

  const handleRemove = (job) => {
    setSavedJobs(savedJobs.filter((j) => j.id !== job.id));
    toast.success('Job removed from saved');
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Saved Jobs ({savedJobs.length})</h1>
      {savedJobs.length === 0 ? (
        <EmptyState title="No saved jobs" message="Save jobs you're interested in to view them here" icon={Bookmark} />
      ) : (
        <div className="space-y-3">
          {savedJobs.map((job) => (
            <JobCard key={job.id} job={job} onSave={handleRemove} isSaved={true} />
          ))}
        </div>
      )}
    </div>
  );
}
