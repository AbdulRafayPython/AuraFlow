import React, { createContext, useContext, useState, useEffect } from "react";
import authService from '../services/authService';
import { connectSocket, disconnectSocket } from '../socket';
import { API_URL } from '@/config/api';

interface User {
  id?: number;  // Add user ID
  username: string;
  email: string;
  display_name?: string;  
  bio?: string;
  avatar?: string;
  avatar_url?: string;
  role?: string;
  statusMessage?: string;
  is_first_login: boolean;  
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  updateProfile: (data: { display_name?: string; bio?: string; avatar_url?: string; avatar?: File; remove_avatar?: boolean }) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  setUser: (user: User | null) => void; 
  setIsAuthenticated: (auth: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(!!localStorage.getItem('token')); // Loading if token exists

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsLoading(true);
      authService.getMe()
        .then((data: any) => {
          setUser(data);
          setIsAuthenticated(true);
          
          // Connect socket after restoring session
          connectSocket();
        })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('refresh_token');
          setIsAuthenticated(false);
          setUser(null);
          
          // Disconnect socket on auth failure
          disconnectSocket();
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  // ── Session expiry listener (fired by appService when refresh fails) ──
  useEffect(() => {
    const handleSessionExpired = () => {
      disconnectSocket();
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('auraflow_user');
      setUser(null);
      setIsAuthenticated(false);
    };
    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, []);

  // ── Proactive silent refresh: refresh access token before it expires ──
  useEffect(() => {
    if (!isAuthenticated) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      const token = localStorage.getItem('token');
      if (!token) return;

      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiresAt = payload.exp * 1000;
        // Refresh 2 minutes before expiry, minimum 10 seconds
        const refreshIn = Math.max(expiresAt - Date.now() - 120_000, 10_000);

        timer = setTimeout(async () => {
          const refreshToken = localStorage.getItem('refresh_token');
          if (!refreshToken) return;

          try {
            const res = await fetch(`${API_URL}/token/refresh`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${refreshToken}` },
            });

            if (res.ok) {
              const data = await res.json();
              if (data.token) localStorage.setItem('token', data.token);
              if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
              window.dispatchEvent(new CustomEvent('auth:token-refreshed'));
              // Re-schedule for the new token
              scheduleRefresh();
            }
          } catch {
            // Will be caught by appService interceptor on next API call
          }
        }, refreshIn);
      } catch {
        // Invalid token format
      }
    };

    scheduleRefresh();

    // Also re-schedule when token is refreshed elsewhere (e.g., by appService interceptor)
    const onRefreshed = () => scheduleRefresh();
    window.addEventListener('auth:token-refreshed', onRefreshed);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('auth:token-refreshed', onRefreshed);
    };
  }, [isAuthenticated]);

  const login = async (identifier: string, password: string) => {
    const data = await authService.login({ username: identifier, password });
    if (data.token && data.user) {
      localStorage.setItem('token', data.token);
      setUser(data.user);
      setIsAuthenticated(true);
      
      // Connect socket after successful login
      connectSocket();
    } else {
      throw new Error('Login failed');
    }
  };

  const logout = async () => {
    try {
      // Disconnect socket first
      disconnectSocket();
      
      // Call logout API to clear token on backend
      await authService.logout();
    } catch (error) {
      console.error('Logout API call failed:', error);
      // Continue with logout even if API call fails
    } finally {
      // Clear all local auth data
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('auraflow_user');
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      const updated = { ...user, ...updates };
      setUser(updated);
    }
  };

  const updateProfile = async (data: { display_name?: string; bio?: string; avatar_url?: string; avatar?: File; remove_avatar?: boolean }) => {
    try {
      const result = await authService.updateProfile(data);
      
      // Update user with new data
      const updates: Partial<User> = {};
      if (data.display_name !== undefined) updates.display_name = data.display_name;
      if (data.bio !== undefined) updates.bio = data.bio;
      
      // Always update avatar_url based on the result, even if null
      if ('avatar_url' in result) {
        updates.avatar_url = result.avatar_url || undefined;
        updates.avatar = result.avatar_url || undefined; // Also update avatar field
      }
      
      updateUser(updates);
      
      return result;
    } catch (error) {
      console.error('Failed to update profile:', error);
      throw error;
    }
  };

  const completeOnboarding = async () => {
    await authService.updateFirstLogin();
    updateUser({ is_first_login: false });
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoading,
      login,
      logout,
      updateUser,
      updateProfile,
      completeOnboarding,
      setUser,
      setIsAuthenticated,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}