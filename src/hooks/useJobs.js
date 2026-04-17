import { useState, useEffect } from 'react';
import { searchJobs } from '../api/jsearch';

export function useJobs(initialQuery = 'software engineer') {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchJobs = async (query = initialQuery, page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const result = await searchJobs(query, page);
      setJobs(result.jobs);
      return result;
    } catch (err) {
      setError(err.message);
      return { jobs: [], totalPages: 0 };
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  return { jobs, loading, error, fetchJobs };
}
