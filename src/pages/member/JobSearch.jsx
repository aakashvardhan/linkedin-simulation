import { useState, useEffect } from 'react';
import { searchJobs } from '../../api/jsearch';
import SearchBar from '../../components/shared/SearchBar';
import JobFilters from '../../components/member/JobFilters';
import JobCard from '../../components/member/JobCard';
import Pagination from '../../components/shared/Pagination';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import EmptyState from '../../components/shared/EmptyState';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import toast from 'react-hot-toast';

export default function JobSearch() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('software engineer');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({});
  const [savedJobs, setSavedJobs] = useLocalStorage('linkedin_saved_jobs', []);

  useEffect(() => {
    fetchJobs();
  }, [page]);

  const fetchJobs = async (q = query) => {
    setLoading(true);
    try {
      const result = await searchJobs(q, page);
      setJobs(result.jobs);
      setTotalPages(result.totalPages);
    } catch {
      toast.error('Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (q) => {
    setQuery(q);
    setPage(1);
    fetchJobs(q);
  };

  const handleSave = (job) => {
    const exists = savedJobs.some((j) => j.id === job.id);
    if (exists) {
      setSavedJobs(savedJobs.filter((j) => j.id !== job.id));
      toast.success('Job removed from saved');
    } else {
      setSavedJobs([...savedJobs, job]);
      toast.success('Job saved!');
    }
  };

  const filteredJobs = jobs.filter((job) => {
    if (filters.employmentType && job.employment_type !== filters.employmentType) return false;
    if (filters.remote === 'remote' && !job.is_remote) return false;
    if (filters.remote === 'onsite' && job.is_remote) return false;
    if (filters.location && !job.location?.toLowerCase().includes(filters.location.toLowerCase())) return false;
    if (filters.industry && job.industry && job.industry !== filters.industry) return false;
    if (filters.seniority && job.seniority_level && job.seniority_level !== filters.seniority) return false;
    return true;
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Find Jobs</h1>
      <SearchBar onSearch={handleSearch} placeholder="Search by title, keyword, or company..." initialValue={query} />
      <div className="mt-4">
        <JobFilters filters={filters} onChange={setFilters} />
      </div>
      {loading ? (
        <LoadingSpinner message="Searching jobs..." />
      ) : filteredJobs.length === 0 ? (
        <EmptyState title="No jobs found" message="Try a different search query or adjust filters" />
      ) : (
        <div className="space-y-3 mt-4">
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onSave={handleSave}
              isSaved={savedJobs.some((j) => j.id === job.id)}
            />
          ))}
        </div>
      )}
      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
