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
  }, [page, filters]);

  const fetchJobs = async (q = query) => {
    setLoading(true);
    try {
      const result = await searchJobs(q, page, filters);
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

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleSave = (job) => {
    setSavedJobs((prev) => {
      const exists = prev.some((j) => j.id === job.id);
      if (exists) {
        toast.success('Job removed from saved');
        return prev.filter((j) => j.id !== job.id);
      } else {
        toast.success('Job saved!');
        return [...prev, job];
      }
    });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Find Jobs</h1>
      <SearchBar onSearch={handleSearch} placeholder="Search by title, keyword, or company..." initialValue={query} />
      <div className="mt-4">
        <JobFilters filters={filters} onChange={handleFilterChange} />
      </div>
      {loading ? (
        <LoadingSpinner message="Searching jobs..." />
      ) : jobs.length === 0 ? (
        <EmptyState title="No jobs found" message="Try a different search query or adjust filters" />
      ) : (
        <div className="space-y-3 mt-4">
          {jobs.map((job) => (
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
