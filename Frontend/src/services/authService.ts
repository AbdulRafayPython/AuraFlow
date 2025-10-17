import api from './appService';

type SignupPayload = { username: string; password: string };
type LoginPayload = { username: string; password: string };

const AUTH_PREFIX = '/api';

export async function signup(payload: SignupPayload) {
  return await api.post(`${AUTH_PREFIX}/signup`, payload, { noAuth: true });
}

export async function login(payload: LoginPayload) {
  const data: any = await api.post(`${AUTH_PREFIX}/login`, payload, { noAuth: true });
  // backend returns { token }
  if (data && data.token) {
    try {
      localStorage.setItem('token', data.token);
    } catch (e) {
      // ignore storage errors
    }
  }
  return data;
}

export async function logout() {
  try {
    localStorage.removeItem('token');
  } catch (e) {
    // ignore
  }
}

export async function getProtected() {
  return await api.get(`${AUTH_PREFIX}/protected`);
}

export default { signup, login, logout, getProtected };
