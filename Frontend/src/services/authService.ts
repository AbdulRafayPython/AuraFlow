import api from './appService';
import type { User } from '@/types';

type SignupPayload = {
  username: string;
  password: string;
  email?: string;
  displayName?: string;
};
type LoginPayload = {
  username: string; 
  password: string;
};

const AUTH_PREFIX = '/api';

export async function signup(payload: SignupPayload) {
  return await api.post(`${AUTH_PREFIX}/signup`, payload, { noAuth: true });
}

export async function login(payload: LoginPayload) {
  const data: any = await api.post(`${AUTH_PREFIX}/login`, payload, { noAuth: true });
  if (data && data.token) {
    try {
      localStorage.setItem('token', data.token);
    } catch (e) {}
  }
  return data;
}

export async function logout() {
  try {
    await api.post(`${AUTH_PREFIX}/logout`);
  } catch (e) {
    console.error('Logout failed:', e);
  } finally {
    localStorage.removeItem('token');
  }
}

export async function getProtected() {
  return await api.get(`${AUTH_PREFIX}/protected`);
}

export async function getMe(): Promise<User> {
  return (await api.get(`${AUTH_PREFIX}/me`)) as User;
}

export async function updateFirstLogin() {
  return await api.post(`${AUTH_PREFIX}/user/update-first-login`);
}

export default { signup, login, logout, getProtected, getMe, updateFirstLogin };