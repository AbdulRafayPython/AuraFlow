import React, { createContext, useContext, useState, useEffect } from "react";
import authService from '../services/authService';
import { connectSocket, disconnectSocket } from '../socket';

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