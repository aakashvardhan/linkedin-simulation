import axios from 'axios';

const apiClient = axios.create({
  // Vite replaces VITE_API_BASE_URL at build time.
  // Create a .env file in the frontend root with:
  //   VITE_API_BASE_URL=http://localhost:8000
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT from localStorage on every request
apiClient.interceptors.request.use((config) => {
  try {
    const stored = localStorage.getItem('linkedin_user');
    if (stored) {
      const { token } = JSON.parse(stored);
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // ignore malformed storage
  }
  return config;
});

// Global error normalisation — surfaces backend { status, error } shape
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const message =
      err.response?.data?.error?.message ||
      err.response?.data?.message ||
      err.message ||
      'Request failed';
    // Attach a clean message so callers can do: catch(e) => toast.error(e.message)
    err.message = message;
    return Promise.reject(err);
  }
);

export default apiClient;
