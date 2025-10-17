const API_BASE = (import.meta.env as any).VITE_API_BASE || 'http://localhost:5000';

type Json = Record<string, any> | null;

function getToken(): string | null {
  try {
    return localStorage.getItem('token');
  } catch (e) {
    return null;
  }
}

async function request(path: string, opts: { method?: string; body?: any; noAuth?: boolean } = {}) {
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
    // credentials may be needed if backend uses cookies; token-based auth does not require this
    // credentials: 'include',
  });

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
