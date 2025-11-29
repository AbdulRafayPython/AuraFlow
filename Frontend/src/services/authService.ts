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

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const AUTH_PREFIX = '/api';

interface ApiResponse {
  message?: string;
  error?: string;
}

export const authService = {
  // Request OTP for password reset
  async requestPasswordReset(email: string): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE_URL}/api/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send OTP');
    return data;
  },

  // Verify OTP
  async verifyOtp(email: string, otp: string): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE_URL}/api/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Invalid or expired OTP');
    return data;
  },

  // Reset password
  async resetPassword(email: string, otp: string, new_password: string): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE_URL}/api/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, new_password }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to reset password');
    return data;
  },
};

// ---------- AUTH FUNCTIONS OUTSIDE OBJECT -----------

export async function signup(payload: SignupPayload) {
  return await api.post(`${AUTH_PREFIX}/signup`, payload, { noAuth: true });
}

export async function login(payload: LoginPayload) {
  const data: any = await api.post(`${AUTH_PREFIX}/login`, payload, { noAuth: true });
  if (data?.token) localStorage.setItem('token', data.token);
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

export async function updateProfile(data: { display_name?: string; bio?: string; avatar_url?: string }) {
  return await api.put(`${AUTH_PREFIX}/user/profile`, data);
}

export default { signup, login, logout, getProtected, getMe, updateFirstLogin, updateProfile };
