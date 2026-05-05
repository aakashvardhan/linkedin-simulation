const DEFAULT_TIMEOUT_MS = 15000;

/** Same-origin `/api` in production (Docker `client` + nginx gateway); local dev defaults to FastAPI on 8000. */
function defaultApiBaseUrl() {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  return import.meta.env.PROD ? '/api' : 'http://127.0.0.1:8000';
}

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createApiClient({
  baseUrl = defaultApiBaseUrl(),
  getAuthToken,
} = {}) {
  async function request(path, { method = 'GET', body, headers, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const token = typeof getAuthToken === 'function' ? getAuthToken() : null;

    const fetchOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers || {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };

    const abortCtl = new AbortController();
    const t = setTimeout(() => abortCtl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, { ...fetchOptions, signal: abortCtl.signal }).finally(() => clearTimeout(t));
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new ApiError('Request timed out', { code: 'TIMEOUT' });
      }
      throw new ApiError('Network error', { code: 'NETWORK', details: String(err?.message || err) });
    }

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      if (data && typeof data === 'object') {
        if (data.error && typeof data.error === 'object' && data.error.message) {
          msg = String(data.error.message);
        } else if (typeof data.message === 'string') {
          msg = data.message;
        } else if (typeof data.error === 'string') {
          msg = data.error;
        }
      }
      throw new ApiError(msg, { status: res.status, details: data });
    }

    return data;
  }

  return {
    request,
    get: (path, opts) => request(path, { ...opts, method: 'GET' }),
    post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  };
}

