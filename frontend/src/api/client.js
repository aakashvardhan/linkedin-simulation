const DEFAULT_TIMEOUT_MS = 15000;

function withTimeout(promise, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, promise: Promise.resolve(promise).finally(() => clearTimeout(t)) };
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
  baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
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

    const { controller, promise } = withTimeout(
      fetch(url, { ...fetchOptions, signal: controller.signal }),
      timeoutMs,
    );

    let res;
    try {
      res = await promise;
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
      const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
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

