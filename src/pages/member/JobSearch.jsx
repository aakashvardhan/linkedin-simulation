import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/realApi';
import SearchBar from '../../components/shared/SearchBar';
import JobFilters from '../../components/member/JobFilters';
import JobCard from '../../components/member/JobCard';
import Pagination from '../../components/shared/Pagination';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import EmptyState from '../../components/shared/EmptyState';
import { useAuth } from '../../hooks/useAuth';
import toast from 'react-hot-toast';

// ── normalise backend job shape → what JobCard expects ──────────────────────
function normaliseJob(job) {
  return {
    id: job.job_id,
    job_id: job.job_id,
    title: job.title,
    company_name: job.company_name,
    location: job.location,
    employment_type: job.employment_type,
    work_mode: job.work_mode,
    seniority_level: job.seniority_level,
    min_salary: job.salary_min,
    max_salary: job.salary_max,
    posted_datetime: job.posted_datetime,
    applicants_count: job.applicants_count,
    views_count: job.views_count,
    status: job.status || 'open',
    is_remote: job.work_mode === 'remote',
  };
}

export default function JobSearch() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({});
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    fetchJobs(query, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const fetchJobs = async (q = query, p = page) => {
    setLoading(true);
    try {
      const result = await api.jobs.search({
        keyword: q || undefined,
        location: filters.location || undefined,
        employment_type: filters.employmentType || undefined,
        work_mode: filters.remote === 'remote' ? 'remote' : filters.remote === 'onsite' ? 'onsite' : undefined,
        seniority_level: filters.seniority || undefined,
        status: 'open',
        page: p,
        page_size: 20,
      });
      setJobs((result.jobs || []).map(normaliseJob));
      setTotalPages(result.total_pages || 1);
    } catch (err) {
      toast.error('Failed to fetch jobs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (q) => {
    setQuery(q);
    setPage(1);
    fetchJobs(q, 1);
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setPage(1);
    fetchJobs(query, 1);
  };

  const handleSave = async (job) => {
    if (!user) return toast.error('Please log in to save jobs');
    if (user.role !== 'member') return toast.error('Only members can save jobs');
    setSavingId(job.job_id);
    try {
      await api.jobs.save(job.job_id, user.member_id);
      toast.success('Job saved!');
    } catch (err) {
      // 409 = already saved — treat as info not error
      if (err.response?.status === 409) {
        toast('Already saved', { icon: '🔖' });
      } else {
        toast.error(err.message || 'Could not save job');
      }
    } finally {
      setSavingId(null);
    }
  };

  const handleJobClick = (job) => {
    navigate(`/jobs/${job.job_id}`);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Find Jobs</h1>
      <SearchBar
        onSearch={handleSearch}
        placeholder="Search by title, keyword, or company..."
        initialValue={query}
      />
      <div className="mt-4">
        <JobFilters filters={filters} onChange={handleFilterChange} />
      </div>

      {loading ? (
        <LoadingSpinner message="Searching jobs..." />
      ) : jobs.length === 0 ? (
        <EmptyState title="No jobs found" message="Try a different search query or adjust filters" />
      ) : (
        <>
          <div className="space-y-3 mt-4">
            {jobs.map((job) => (
              <JobCard
                key={job.job_id}
                job={job}
                onSave={handleSave}
                onClick={() => handleJobClick(job)}
                saving={savingId === job.job_id}
              />
            ))}
          </div>
          <div className="mt-6">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
}
