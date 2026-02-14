import { API_SERVER } from '@/config/api';

const API_BASE = API_SERVER;

type Json = Record<string, any> | null;

function getToken(): string | null {
  try {
    return localStorage.getItem('token');
  } catch (e) {
    return null;
  }
}

// ─── Silent Token Refresh ──────────────────────────────────────────
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/api/token/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${refreshToken}`,
      },
    });

    if (!res.ok) {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
      return null;
    }

    const data = await res.json();
    if (data.token && data.refresh_token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('refresh_token', data.refresh_token);
      window.dispatchEvent(new CustomEvent('auth:token-refreshed'));
      return data.token;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Attempt to refresh the access token.
 * Deduplicates concurrent calls so only one refresh runs at a time.
 */
function tryRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}
// ─── End Silent Token Refresh ──────────────────────────────────────

async function request(path: string, opts: { method?: string; body?: any; noAuth?: boolean; _retry?: boolean } = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = {};

  let body = undefined as undefined | string | FormData;
  if (opts.body !== undefined && opts.body !== null) {
    if (opts.body instanceof FormData) {
      body = opts.body;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
  }

  const token = getToken();
  if (token && !opts.noAuth) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: opts.method || (body ? 'POST' : 'GET'),
    headers,
    body,
    credentials: 'include',
  });

  // ─── Silent Refresh on 401 ──────────────────────────────────────
  if (res.status === 401 && !opts.noAuth && !opts._retry) {
    const newToken = await tryRefresh();
    if (newToken) {
      // Retry the original request with the new token
      return request(path, { ...opts, _retry: true });
    }
    // Refresh failed — fall through to error handling
  }
  // ─── End Silent Refresh ─────────────────────────────────────────

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  let data: Json = null;
  if (isJson) {
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
  } else {
    try {
      const text = await res.text();
      data = { text };
    } catch (e) {
      data = null;
    }
  }

  if (!res.ok) {
    const err: any = new Error((data && (data as any).error) || (data && (data as any).message) || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export async function get(path: string, opts: { noAuth?: boolean } = {}) {
  return await request(path, { method: 'GET', noAuth: opts.noAuth });
}

export async function post(path: string, body?: any, opts: { noAuth?: boolean } = {}) {
  return await request(path, { method: 'POST', body, noAuth: opts.noAuth });
}

export async function put(path: string, body?: any, opts: { noAuth?: boolean } = {}) {
  return await request(path, { method: 'PUT', body, noAuth: opts.noAuth });
}

export async function del(path: string, opts: { noAuth?: boolean } = {}) {
  return await request(path, { method: 'DELETE', noAuth: opts.noAuth });
}

export default { get, post, put, del };
