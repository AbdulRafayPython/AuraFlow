import React, { createContext, useContext, useState, useEffect } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  avatar?: string;
  role?: string;
  statusMessage?: string;
  isFirstLogin: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  setAuthenticatedUser: (username: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  completeOnboarding: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to decode JWT and extract username
function decodeJWT(token: string): string | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    return payload.sub || null; // JWT identity is stored in 'sub' claim
  } catch (e) {
    console.error('Failed to decode JWT:', e);
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    // Check if user is logged in via token
    const token = localStorage.getItem('token');
    if (token) {
      const saved = localStorage.getItem("auraflow_user");
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem("auraflow_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("auraflow_user");
    }
  }, [user]);

  // This will be called from your existing AuthCard after successful login
  const setAuthenticatedUser = (username: string) => {
    // Check if this is a first-time user
    const userKey = `user_${username}`;
    const existingUser = localStorage.getItem(userKey);
    
    if (existingUser) {
      // Returning user
      const userData = JSON.parse(existingUser);
      setUser(userData);
    } else {
      // First-time user - trigger onboarding
      const newUser: User = {
        id: Math.random().toString(36).substr(2, 9),
        name: username,
        email: username,
        username: username,
        isFirstLogin: true,
      };
      localStorage.setItem(userKey, JSON.stringify(newUser));
      setUser(newUser);
    }
  };

  // Auto-detect user from token on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && !user) {
      const username = decodeJWT(token);
      if (username) {
        setAuthenticatedUser(username);
      }
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    localStorage.removeItem("auraflow_user");
  };

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
      localStorage.setItem(`user_${user.username}`, JSON.stringify(updatedUser));
    }
  };

  const completeOnboarding = () => {
    if (user) {
      updateUser({ isFirstLogin: false });
    }
  };

  const isAuthenticated = !!user && !!localStorage.getItem('token');

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      setAuthenticatedUser,
      logout,
      updateUser,
      completeOnboarding,
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