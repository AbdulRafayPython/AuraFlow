import React, { createContext, useContext, useState, useEffect } from "react";
import authService from '../services/authService';

interface User {
  username: string;
  email: string;
  display_name?: string;  
  bio?: string;
  avatar?: string;
  role?: string;
  statusMessage?: string;
  is_first_login: boolean;  
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  completeOnboarding: () => Promise<void>;
  setUser: (user: User | null) => void; 
  setIsAuthenticated: (auth: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      authService.getMe()
        .then((data: any) => {
          setUser(data);
          setIsAuthenticated(true);
        })
        .catch(() => {
          localStorage.removeItem('token');
          setIsAuthenticated(false);
          setUser(null);
        });
    }
  }, []);

  const login = async (identifier: string, password: string) => {
    const data = await authService.login({ username: identifier, password });
    if (data.token && data.user) {
      localStorage.setItem('token', data.token);
      setUser(data.user);
      setIsAuthenticated(true);
    } else {
      throw new Error('Login failed');
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem("auraflow_user");
  };

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      const updated = { ...user, ...updates };
      setUser(updated);
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
  login,
  logout,
  updateUser,
  completeOnboarding,
  setUser,                // Add this
  setIsAuthenticated,     // Add this
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