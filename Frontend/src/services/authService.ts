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

import { API_SERVER } from '@/config/api';

const API_BASE_URL = API_SERVER;
const AUTH_PREFIX = '/api';

interface ApiResponse {
  message?: string;
  error?: string;
}

// ---------- AUTH FUNCTIONS -----------

export async function signup(payload: SignupPayload) {
  return await api.post(`${AUTH_PREFIX}/signup`, payload, { noAuth: true });
}

export async function login(payload: LoginPayload) {
  const data: any = await api.post(`${AUTH_PREFIX}/login`, payload, { noAuth: true });
  if (data?.token) localStorage.setItem('token', data.token);
  if (data?.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
  return data;
}

export async function logout() {
  try {
    const refreshToken = localStorage.getItem('refresh_token');
    await api.post(`${AUTH_PREFIX}/logout`, refreshToken ? { refresh_token: refreshToken } : undefined);
  } catch (e) {
    console.error('Logout failed:', e);
  } finally {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
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

// Request OTP for password reset
export async function requestPasswordReset(email: string): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to send OTP');
  return data;
}

// Verify OTP
export async function verifyOtp(email: string, otp: string): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Invalid or expired OTP');
  return data;
}

// Reset password
export async function resetPassword(email: string, otp: string, new_password: string): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp, new_password }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to reset password');
  return data;
}

// Verify email via token (called from verification link)
export async function verifyEmail(token: string, email: string): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`, {
    method: 'GET',
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Verification failed');
  return data;
}

// Resend verification email
export async function resendVerification(email: string): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to resend verification');
  return data;
}

export async function updateProfile(data: { display_name?: string; bio?: string; avatar_url?: string; avatar?: File; remove_avatar?: boolean }) {
  // If avatar file is provided, use FormData
  if (data.avatar || data.remove_avatar) {
    const formData = new FormData();
    
    if (data.display_name) formData.append('display_name', data.display_name);
    if (data.bio) formData.append('bio', data.bio);
    if (data.avatar) formData.append('avatar', data.avatar);
    if (data.remove_avatar) formData.append('remove_avatar', 'true');
    
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_SERVER}${AUTH_PREFIX}/user/profile`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update profile');
    }
    
    return await response.json();
  }
  
  // Otherwise use JSON
  return await api.put(`${AUTH_PREFIX}/user/profile`, data);
}

export const authService = {
  signup,
  login,
  logout,
  getProtected,
  getMe,
  updateFirstLogin,
  updateProfile,
  requestPasswordReset,
  verifyOtp,
  resetPassword,
  verifyEmail,
  resendVerification,
  getSessions,
  revokeSession,
  revokeAllSessions,
};

export default authService;

// ─── Session Management ───────────────────────────────────────────

export async function getSessions() {
  return await api.get(`${AUTH_PREFIX}/sessions`);
}

export async function revokeSession(sessionId: number) {
  return await api.post(`${AUTH_PREFIX}/sessions/revoke`, { session_id: sessionId });
}

export async function revokeAllSessions() {
  return await api.post(`${AUTH_PREFIX}/sessions/revoke-all`);
}