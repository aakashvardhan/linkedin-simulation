import axios from 'axios';

const JSEARCH_BASE = 'https://jsearch.p.rapidapi.com';
const API_KEY = import.meta.env.VITE_JSEARCH_API_KEY;

const jsearchClient = axios.create({
  baseURL: JSEARCH_BASE,
  headers: {
    'X-RapidAPI-Key': API_KEY || '',
    'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
  },
});

function normalizeJob(raw) {
  return {
    id: raw.job_id,
    title: raw.job_title,
    company_name: raw.employer_name,
    company_logo: raw.employer_logo,
    location: raw.job_city
      ? `${raw.job_city}, ${raw.job_state || ''} ${raw.job_country || ''}`.trim()
      : raw.job_country || 'Remote',
    description: raw.job_description,
    employment_type: raw.job_employment_type,
    date_posted: raw.job_posted_at_datetime_utc,
    apply_link: raw.job_apply_link,
    is_remote: raw.job_is_remote,
    min_salary: raw.job_min_salary,
    max_salary: raw.job_max_salary,
    qualifications: raw.job_highlights?.Qualifications || [],
    responsibilities: raw.job_highlights?.Responsibilities || [],
  };
}

function cacheKey(query, page) {
  return `jsearch_${query}_${page}`;
}

export async function searchJobs(query = 'software engineer', page = 1) {
  const key = cacheKey(query, page);
  const cached = sessionStorage.getItem(key);
  if (cached) return JSON.parse(cached);

  if (!API_KEY) {
    const { mockJobs } = await import('../data/mockJobs');
    return { jobs: mockJobs, totalPages: 1 };
  }

  try {
    const { data } = await jsearchClient.get('/search', {
      params: { query, page, num_pages: 1 },
    });
    const result = {
      jobs: (data.data || []).map(normalizeJob),
      totalPages: Math.ceil((data.total || 10) / 10),
    };
    sessionStorage.setItem(key, JSON.stringify(result));
    return result;
  } catch (err) {
    console.warn('JSearch API failed, using mock data:', err.message);
    const { mockJobs } = await import('../data/mockJobs');
    return { jobs: mockJobs, totalPages: 1 };
  }
}

export async function getJobById(jobId) {
  const key = `jsearch_detail_${jobId}`;
  const cached = sessionStorage.getItem(key);
  if (cached) return JSON.parse(cached);

  if (!API_KEY) {
    const { mockJobs } = await import('../data/mockJobs');
    return mockJobs.find((j) => j.id === jobId) || mockJobs[0];
  }

  try {
    const { data } = await jsearchClient.get('/job-details', {
      params: { job_id: jobId },
    });
    const job = data.data?.[0] ? normalizeJob(data.data[0]) : null;
    if (job) sessionStorage.setItem(key, JSON.stringify(job));
    return job;
  } catch (err) {
    console.warn('JSearch detail failed, using mock:', err.message);
    const { mockJobs } = await import('../data/mockJobs');
    return mockJobs[0];
  }
}
