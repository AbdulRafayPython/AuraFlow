/**
 * System Admin Login Page
 * Dark purple themed login form for system administrators.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { login as authLogin, getMe } from '@/services/authService';
import { Shield, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';

export default function SystemAdminLogin() {
  const navigate = useNavigate();
  const { user, isAuthenticated, setUser, setIsAuthenticated, logout } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated && user?.role === 'system_admin') {
      navigate('/system-admin', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      setError('Please enter both username and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (isAuthenticated && user?.role !== 'system_admin') {
        await logout();
      }
      await authLogin({ username: identifier.trim(), password });
      const userData: any = await getMe();

      if (userData.role !== 'system_admin') {
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        setError('Access denied. System administrator credentials required.');
        return;
      }

      setUser(userData);
      setIsAuthenticated(true);
      navigate('/system-admin', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[hsl(var(--theme-bg-primary))]">
      {/* Dark purple background with gradient blobs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--theme-bg-primary))] via-[hsl(var(--theme-bg-secondary))] to-[hsl(var(--theme-bg-primary))]" />
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-[hsl(var(--theme-accent-primary)/0.15)] rounded-full filter blur-[120px]" />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-purple-500/10 rounded-full filter blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-[hsl(var(--theme-accent-primary)/0.1)] rounded-full filter blur-[90px]" />
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]">
          <div className="absolute inset-0" style={{
            backgroundImage: `linear-gradient(rgba(140, 43, 238, 0.3) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(140, 43, 238, 0.3) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }} />
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl overflow-hidden shadow-lg shadow-[hsl(var(--theme-accent-primary)/0.25)] mb-4">
            <img src="/AuraflowLogo.png" alt="AuraFlow" className="h-full w-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))] tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>AuroFlow</h1>
          <p className="text-sm text-[hsl(var(--theme-text-secondary))] mt-1">System Administration</p>
        </div>

        <div className="bg-[hsl(var(--theme-bg-secondary)/0.8)] border border-[hsl(var(--theme-border-default))] rounded-2xl p-8 shadow-2xl" style={{ backdropFilter: 'blur(12px)' }}>
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-[hsl(var(--theme-text-primary))]">Admin Sign In</h2>
            <p className="text-sm text-[hsl(var(--theme-text-secondary))] mt-1">Enter your administrator credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="identifier" className="text-[hsl(var(--theme-text-secondary))] text-sm font-medium">
                Username or Email
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter your username or email"
                className="w-full bg-[hsl(var(--theme-bg-primary))] border border-[hsl(var(--theme-border-default))] rounded-xl px-4 py-2.5 text-sm text-[hsl(var(--theme-text-primary))] placeholder:text-[hsl(var(--theme-text-muted))] focus:border-[hsl(var(--theme-accent-primary))] focus:ring-1 focus:ring-[hsl(var(--theme-accent-primary)/0.2)] focus:outline-none transition-all"
                disabled={loading}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-[hsl(var(--theme-text-secondary))] text-sm font-medium">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full bg-[hsl(var(--theme-bg-primary))] border border-[hsl(var(--theme-border-default))] rounded-xl px-4 py-2.5 pr-10 text-sm text-[hsl(var(--theme-text-primary))] placeholder:text-[hsl(var(--theme-text-muted))] focus:border-[hsl(var(--theme-accent-primary))] focus:ring-1 focus:ring-[hsl(var(--theme-accent-primary)/0.2)] focus:outline-none transition-all"
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-text-primary))]"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[hsl(var(--theme-accent-primary))] hover:bg-[hsl(var(--theme-accent-primary)/0.9)] text-white font-bold py-2.5 rounded-xl shadow-lg shadow-[hsl(var(--theme-accent-primary)/0.25)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[hsl(var(--theme-text-muted))] mt-6">
          This portal is restricted to authorized system administrators only.
        </p>
      </div>
    </div>
  );
}
