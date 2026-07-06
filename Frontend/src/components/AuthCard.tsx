import React, { useState, useMemo } from 'react';
import authService from '../services/authService';
import type { User } from '../types';
import { Loader2, X, Eye, EyeOff, CheckCircle2, XCircle, Mail, User as UserIcon, Lock, Bot, Users, FileText, Shield } from 'lucide-react';

type Mode = 'login' | 'signup';

interface AuthCardProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onAuth: (user?: User) => void;
}

// Loading overlay with static logo and surrounding spinner
const LoadingOverlay: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
  if (!isVisible) return null;
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md transition-all duration-300">
      <div className="relative flex flex-col items-center gap-6">
        {/* Pulsing glow behind logo */}
        <div className="absolute w-44 h-44 bg-purple-500/20 rounded-full filter blur-3xl animate-pulse" />
        
        {/* Spinner container */}
        <div className="relative w-32 h-32 flex items-center justify-center">
          {/* Outer spinning ring */}
          <div className="absolute inset-0 rounded-full animate-spin-ring">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="spinnerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity="1" />
                  <stop offset="50%" stopColor="#A855F7" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
                </linearGradient>
              </defs>
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="url(#spinnerGradient)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </div>
          
          {/* Secondary spinning ring (opposite direction) */}
          <div className="absolute inset-2 rounded-full animate-spin-ring-reverse">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="spinnerGradient2" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#6366F1" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#818CF8" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
                </linearGradient>
              </defs>
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="url(#spinnerGradient2)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="70 200"
              />
            </svg>
          </div>
          
          {/* Glowing dots on the ring */}
          <div className="absolute inset-0 animate-spin-ring">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-purple-400 rounded-full shadow-[0_0_10px_4px_rgba(168,85,247,0.6)]" />
          </div>
          
          {/* Static Logo in center */}
          <div className="relative z-10 animate-pulse-subtle">
            <img 
              src="/AuraflowLogo.png" 
              alt="AuraFlow" 
              className="w-16 h-16 drop-shadow-[0_0_20px_rgba(139,92,246,0.6)]"
            />
          </div>
        </div>
        
        {/* Loading text with shimmer effect */}
        <div className="relative overflow-hidden">
          <p className="text-gray-300 text-sm font-medium tracking-wider">
            Signing you in
            <span className="inline-flex ml-1">
              <span className="animate-bounce-dot" style={{ animationDelay: '0ms' }}>.</span>
              <span className="animate-bounce-dot" style={{ animationDelay: '150ms' }}>.</span>
              <span className="animate-bounce-dot" style={{ animationDelay: '300ms' }}>.</span>
            </span>
          </p>
        </div>
      </div>
      
      <style>{`
        @keyframes spin-ring {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes spin-ring-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes pulse-subtle {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.9; }
        }
        @keyframes bounce-dot {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        .animate-spin-ring {
          animation: spin-ring 1.5s linear infinite;
        }
        .animate-spin-ring-reverse {
          animation: spin-ring-reverse 2s linear infinite;
        }
        .animate-pulse-subtle {
          animation: pulse-subtle 2s ease-in-out infinite;
        }
        .animate-bounce-dot {
          animation: bounce-dot 1.2s ease-in-out infinite;
          display: inline-block;
        }
      `}</style>
    </div>
  );
};

// Forgot Password Modal Component
const ForgotPasswordModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [step, setStep] = useState<'email' | 'otp' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleRequestOtp = async () => {
    if (!email) {
      setError('Email is required');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      await authService.requestPasswordReset(email);
      setSuccess('OTP sent to your email!');
      setTimeout(() => {
        setSuccess('');
        setStep('otp');
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp) {
      setError('OTP is required');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      await authService.verifyOtp(email, otp);
      setSuccess('OTP verified!');
      setTimeout(() => {
        setSuccess('');
        setStep('reset');
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      await authService.resetPassword(email, otp, newPassword);
      setSuccess('Password reset successful!');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') {
      action();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="auth-modal rounded-2xl shadow-2xl w-full max-w-md relative animate-fade-in border border-white/[0.06]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/[0.06]">
          <h2 className="text-xl font-semibold text-white">
            {step === 'email' && 'Reset Password'}
            {step === 'otp' && 'Verify OTP'}
            {step === 'reset' && 'Set New Password'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Email Step */}
          {step === 'email' && (
            <div className="space-y-4" onKeyDown={(e) => handleKeyPress(e, handleRequestOtp)}>
              <p className="text-sm text-gray-400">
                Enter your email address and we'll send you an OTP to reset your password.
              </p>
              <div className="space-y-2">
                <label className="auth-label">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <div className="auth-input-wrapper">
                  <Mail className="auth-input-icon" />
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    enterKeyHint="next"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="auth-input"
                    placeholder="Enter your email"
                  />
                </div>
              </div>
            </div>
          )}

          {/* OTP Step */}
          {step === 'otp' && (
            <div className="space-y-4" onKeyDown={(e) => handleKeyPress(e, handleVerifyOtp)}>
              <p className="text-sm text-gray-400">
                We've sent a 6-digit OTP to <span className="text-white font-medium">{email}</span>
              </p>
              <div className="space-y-2">
                <label className="auth-label">
                  Enter OTP <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  enterKeyHint="done"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                  className="auth-input text-center text-2xl tracking-widest"
                  placeholder="000000"
                />
              </div>
              <button
                onClick={() => setStep('email')}
                className="text-sm text-indigo-400 hover:underline"
              >
                Change email address
              </button>
            </div>
          )}

          {/* Reset Password Step */}
          {step === 'reset' && (
            <div className="space-y-4" onKeyDown={(e) => handleKeyPress(e, handleResetPassword)}>
              <p className="text-sm text-gray-400">
                Create a new password for your account.
              </p>
              <div className="space-y-2">
                <label className="auth-label">
                  New Password <span className="text-red-400">*</span>
                </label>
                <div className="auth-input-wrapper">
                  <Lock className="auth-input-icon" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    enterKeyHint="next"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="auth-input"
                    placeholder="Enter new password"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="auth-label">
                  Confirm Password <span className="text-red-400">*</span>
                </label>
                <div className="auth-input-wrapper">
                  <Lock className="auth-input-icon" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    enterKeyHint="done"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="auth-input"
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-sm text-green-400">
              {success}
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={() => {
              if (step === 'email') handleRequestOtp();
              else if (step === 'otp') handleVerifyOtp();
              else if (step === 'reset') handleResetPassword();
            }}
            disabled={loading}
            className="auth-btn-primary w-full mt-6"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Processing...' : (
              step === 'email' ? 'Send OTP' :
              step === 'otp' ? 'Verify OTP' :
              'Reset Password'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// Login Component
const Login: React.FC<{ 
  onSwitchToSignup: () => void; 
  darkMode?: boolean; 
  onAuth: (user?: User) => void;
  onForgotPassword: () => void;
  onLoadingChange: (loading: boolean) => void;
}> = ({ onSwitchToSignup, darkMode, onAuth, onForgotPassword, onLoadingChange }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleResendVerification = async () => {
    if (!unverifiedEmail || resending) return;
    setResending(true);
    setResendSuccess(false);
    try {
      await authService.resendVerification(unverifiedEmail);
      setResendSuccess(true);
    } catch {
      setErrors({ general: 'Failed to resend verification email.' });
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = () => {
    setErrors({});
    setUnverifiedEmail(null);
    setResendSuccess(false);

    const newErrors: Record<string, string> = {};
    if (!email) newErrors.email = 'Email or username is required';
    if (!password) newErrors.password = 'Password is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    onLoadingChange(true);
    authService
      .login({ username: email, password })
      .then((data: any) => {
        // Pass user data directly — skips redundant /api/me call
        onAuth(data?.user);
      })
      .catch((err: any) => {
        setLoading(false);
        onLoadingChange(false);

        // Handle email-not-verified case specifically
        const code = err?.data?.code;
        const errEmail = err?.data?.email;
        if (code === 'EMAIL_NOT_VERIFIED' && errEmail) {
          setUnverifiedEmail(errEmail);
          setErrors({ general: err?.data?.error || 'Please verify your email before logging in.' });
          return;
        }

        const message = err?.data?.error || err?.message || 'Login failed';
        setErrors({ general: String(message) });
      });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const handleGoogleLogin = () => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    window.location.href = `${backendUrl}/api/auth/google`;
  };

  return (
    <div className="w-full auth-animate-in">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-3">
        <img src="/AuraflowLogo.png" alt="AuraFlow" className="w-9 h-9" />
        <div>
          <h2 className="text-white font-bold text-lg leading-tight">AuraFlow</h2>
          <p className="text-xs text-indigo-400 font-medium">AI-Powered Communication</p>
        </div>
      </div>

      {/* Welcome heading */}
      <div className="mb-5">
        <h1 className="text-[26px] font-bold text-white mb-1">Welcome back!</h1>
        <p className="text-gray-400 text-sm">We're so excited to see you again!</p>
      </div>

      <div className="space-y-3" onKeyDown={handleKeyPress}>
        {/* Email field */}
        <div className="space-y-2">
          <label className="auth-label">EMAIL OR USERNAME</label>
          <div className={`auth-input-wrapper ${errors.email ? 'auth-input-wrapper--error' : ''}`}>
            <UserIcon className="auth-input-icon" />
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="next"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-input"
              placeholder="Enter your email or username"
            />
          </div>
          {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
        </div>

        {/* Password field */}
        <div className="space-y-2">
          <label className="auth-label">PASSWORD</label>
          <div className={`auth-input-wrapper ${errors.password ? 'auth-input-wrapper--error' : ''}`}>
            <Lock className="auth-input-icon" />
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              enterKeyHint="go"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input"
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="auth-input-toggle"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
        </div>

        {/* Forgot password */}
        <button 
          type="button"
          onClick={onForgotPassword}
          className="auth-link text-sm"
        >
          Forgot your password?
        </button>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="auth-btn-primary w-full"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Logging in...' : 'Log In'}
        </button>

        {/* Divider */}
        {/* <div className="auth-divider">
          <span>OR</span>
        </div> */}

        {/* Google */}
        {/* <button 
          onClick={handleGoogleLogin}
          className="auth-btn-google w-full"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button> */}

        {/* Error messages */}
        {errors.general && (
          <div className={`text-sm p-3 rounded-xl border ${unverifiedEmail ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
            <div className="flex items-start gap-2">
              {unverifiedEmail ? <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              <div className="flex-1">
                <p>{errors.general}</p>
                {unverifiedEmail && (
                  <div className="mt-2">
                    {resendSuccess ? (
                      <p className="text-emerald-400 text-xs flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Verification email sent! Check your inbox.
                      </p>
                    ) : (
                      <button
                        onClick={handleResendVerification}
                        disabled={resending}
                        className="text-xs text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1"
                      >
                        {resending && <Loader2 className="w-3 h-3 animate-spin" />}
                        {resending ? 'Sending…' : 'Resend verification email'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Register link */}
        <p className="text-sm text-gray-400 text-center">
          Don't have an account?{' '}
          <button onClick={onSwitchToSignup} className="auth-link font-medium">
            Register
          </button>
        </p>
      </div>
    </div>
  );
};

// ── Password strength helpers ──────────────────────────────────────
const passwordRules = [
  { key: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { key: 'upper', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { key: 'digit', label: 'One digit', test: (p: string) => /\d/.test(p) },
  { key: 'special', label: 'One special character (!@#$…)', test: (p: string) => /[!@#$%^&*()\-_=+[\]{}|;:'",.<>?/`~\\]/.test(p) },
];

const getStrengthLevel = (password: string) => {
  const passed = passwordRules.filter((r) => r.test(password)).length;
  if (passed <= 1) return { level: 0, label: 'Very Weak', color: 'bg-red-500' };
  if (passed === 2) return { level: 1, label: 'Weak', color: 'bg-orange-500' };
  if (passed === 3) return { level: 2, label: 'Fair', color: 'bg-amber-500' };
  if (passed === 4) return { level: 3, label: 'Strong', color: 'bg-emerald-400' };
  return { level: 4, label: 'Very Strong', color: 'bg-emerald-500' };
};

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const usernameRegex = /^[a-zA-Z0-9_]+$/;

// Signup Component
const Signup: React.FC<{ onSwitchToLogin: () => void; darkMode?: boolean; onAuth: (user?: User) => void }> = ({ onSwitchToLogin, darkMode, onAuth }) => {
  const [formData, setFormData] = useState({ email: '', displayName: '', username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const strength = useMemo(() => getStrengthLevel(formData.password), [formData.password]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validate = (): Record<string, string> => {
    const newErrors: Record<string, string> = {};

    // Email
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!emailRegex.test(formData.email.trim())) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Display name
    if (!formData.displayName) newErrors.displayName = 'Display name is required';

    // Username
    if (!formData.username) {
      newErrors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    } else if (formData.username.length > 32) {
      newErrors.username = 'Username must be less than 32 characters';
    } else if (!usernameRegex.test(formData.username)) {
      newErrors.username = 'Only letters, numbers, and underscores allowed';
    }

    // Password
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (strength.level < 4) {
      newErrors.password = 'Password does not meet all requirements';
    }

    // Terms
    if (!agreedToTerms) newErrors.terms = 'You must agree to the terms';

    return newErrors;
  };

  const handleSubmit = () => {
    setErrors({});
    const newErrors = validate();

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    authService
      .signup({
        username: formData.username,
        password: formData.password,
        email: formData.email,
        displayName: formData.displayName
      })
      .then((data: any) => {
        setLoading(false);
        if (data?.requiresVerification) {
          setVerificationEmail(formData.email);
          setVerificationPending(true);
        } else {
          onSwitchToLogin();
        }
      })
      .catch((err: any) => {
        setLoading(false);
        const message = err?.data?.error || err?.message || 'Signup failed';
        setErrors({ general: String(message) });
      });
  };

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    setResendSuccess(false);
    try {
      await authService.resendVerification(verificationEmail);
      setResendSuccess(true);
    } catch {
      // silent
    } finally {
      setResending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  // ── Verification pending screen ─────────────────────────────────
  if (verificationPending) {
    return (
      <div className="w-full auth-animate-in flex flex-col items-center justify-center h-[520px] text-center px-4">
        <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center mb-4">
          <Mail className="w-8 h-8 text-indigo-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Check Your Email</h2>
        <p className="text-gray-400 text-sm mb-1">
          We've sent a verification link to
        </p>
        <p className="text-indigo-300 font-medium text-sm mb-6">{verificationEmail}</p>
        <p className="text-gray-500 text-xs mb-6 max-w-xs">
          Click the link in the email to verify your account. The link expires in 24 hours.
        </p>

        {resendSuccess ? (
          <p className="text-emerald-400 text-sm flex items-center gap-1 mb-4">
            <CheckCircle2 className="w-4 h-4" /> Verification email resent!
          </p>
        ) : (
          <button
            onClick={handleResend}
            disabled={resending}
            className="text-sm text-indigo-400 hover:text-indigo-300 underline mb-4 flex items-center gap-1"
          >
            {resending && <Loader2 className="w-3 h-3 animate-spin" />}
            {resending ? 'Sending…' : "Didn't get it? Resend email"}
          </button>
        )}

        <button
          onClick={onSwitchToLogin}
          className="auth-btn-primary w-full"
        >
          Go to Login
        </button>
      </div>
    );
  }

  // ── Signup form ──────────────────────────────────────────────────
  return (
    <div className="w-full auth-animate-in h-[520px] flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-6">
        <img src="/AuraflowLogo.png" alt="AuraFlow" className="w-10 h-10" />
        <div>
          <h2 className="text-white font-bold text-lg leading-tight">AuraFlow</h2>
          <p className="text-xs text-indigo-400 font-medium">AI-Powered Communication</p>
        </div>
      </div>

      <div className="mb-4">
        <h1 className="text-[28px] font-bold text-white mb-1">Create an account</h1>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <div className="space-y-4 pb-2" onKeyDown={handleKeyPress}>
          <div className="space-y-2">
            <label className="auth-label">EMAIL <span className="text-red-400">*</span></label>
            <div className={`auth-input-wrapper ${errors.email ? 'auth-input-wrapper--error' : ''}`}>
              <Mail className="auth-input-icon" />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                enterKeyHint="next"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="you@example.com"
                className="auth-input"
              />
            </div>
            {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <label className="auth-label">DISPLAY NAME <span className="text-red-400">*</span></label>
            <div className={`auth-input-wrapper ${errors.displayName ? 'auth-input-wrapper--error' : ''}`}>
              <UserIcon className="auth-input-icon" />
              <input
                type="text"
                autoComplete="name"
                autoCapitalize="words"
                enterKeyHint="next"
                value={formData.displayName}
                onChange={(e) => handleChange('displayName', e.target.value)}
                className="auth-input"
              />
            </div>
            {errors.displayName && <p className="text-xs text-red-400">{errors.displayName}</p>}
          </div>

          <div className="space-y-2">
            <label className="auth-label">USERNAME <span className="text-red-400">*</span></label>
            <div className={`auth-input-wrapper ${errors.username ? 'auth-input-wrapper--error' : ''}`}>
              <UserIcon className="auth-input-icon" />
              <input
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                enterKeyHint="next"
                value={formData.username}
                onChange={(e) => handleChange('username', e.target.value)}
                placeholder="letters, numbers, underscores"
                className="auth-input"
              />
            </div>
            {errors.username && <p className="text-xs text-red-400">{errors.username}</p>}
          </div>

          <div className="space-y-2">
            <label className="auth-label">PASSWORD <span className="text-red-400">*</span></label>
            <div className={`auth-input-wrapper ${errors.password ? 'auth-input-wrapper--error' : ''}`}>
              <Lock className="auth-input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                enterKeyHint="next"
                value={formData.password}
                onChange={(e) => handleChange('password', e.target.value)}
                className="auth-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="auth-input-toggle"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}

            {/* Password strength meter */}
            {formData.password.length > 0 && (
              <div className="space-y-2 mt-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                          i <= strength.level ? strength.color : 'bg-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                  <span className={`text-[10px] font-medium ${
                    strength.level <= 1 ? 'text-red-400' :
                    strength.level === 2 ? 'text-amber-400' :
                    'text-emerald-400'
                  }`}>{strength.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {passwordRules.map((rule) => {
                    const passed = rule.test(formData.password);
                    return (
                      <div key={rule.key} className="flex items-center gap-1">
                        {passed
                          ? <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                          : <XCircle className="w-3 h-3 text-gray-600 flex-shrink-0" />}
                        <span className={`text-[10px] ${passed ? 'text-emerald-400' : 'text-gray-500'}`}>{rule.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-indigo-500 bg-[#1a1a3e] border-white/10 rounded focus:ring-indigo-500"
              />
              <span className="text-xs text-gray-400">
                I have read and agree to AuraFlow's Terms of Service and Privacy Policy.
              </span>
            </label>
            {errors.terms && <p className="text-xs text-red-400">{errors.terms}</p>}
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="auth-btn-primary w-full"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Creating account...' : 'Continue'}
          </button>

          <button onClick={onSwitchToLogin} className="auth-link text-sm">
            Already have an account?
          </button>
          {errors.general && (
            <div className="text-sm text-red-400 mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              {errors.general}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Right Panel Branding Section ──────────────────────────────────
const BrandingSection: React.FC = () => (
  <div className="auth-branding">
    {/* Background effects */}
    <div className="auth-branding__bg">
      <div className="auth-branding__glow auth-branding__glow--1" />
      <div className="auth-branding__glow auth-branding__glow--2" />
    </div>
    

    <div className="auth-branding__content">
      {/* Badge */}
      <br />
      <div className="auth-branding__badge">
        AI-Powered Communication
      </div>

      {/* Headline */}
      <h2 className="auth-branding__headline">
        Smart conversations.<br />
        Smarter <span className="auth-branding__highlight">outcomes.</span>
      </h2>

      <p className="auth-branding__subtext">
        AuraFlow combines intelligent AI agents with real-time communication to help teams move faster and work smarter.
      </p>

      <br />

      {/* Feature list */}
      <div className="auth-branding__features">
        <div className="auth-branding__feature">
          <div className="auth-branding__feature-icon auth-branding__feature-icon--agents">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="auth-branding__feature-title">AI Agents</h4>
            <p className="auth-branding__feature-desc">Intelligent agents that understand and respond contextually.</p>
          </div>
        </div>

        <div className="auth-branding__feature">
          <div className="auth-branding__feature-icon auth-branding__feature-icon--collab">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="auth-branding__feature-title">Real-time Collaboration</h4>
            <p className="auth-branding__feature-desc">Work together seamlessly with your team in real-time.</p>
          </div>
        </div>

        <div className="auth-branding__feature">
          <div className="auth-branding__feature-icon auth-branding__feature-icon--summaries">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="auth-branding__feature-title">Smart Summaries</h4>
            <p className="auth-branding__feature-desc">Get AI-generated summaries and action items instantly.</p>
          </div>
        </div>
      </div>

      {/* Robot image */}
      <div className="auth-branding__robot-container">
        <img 
          src="/ai-robot-mascot.png" 
          alt="AuraFlow AI Assistant" 
          className="auth-branding__robot"
        />
      </div>

      {/* Status bar */}
      <div className="auth-branding__status">
        <span className="auth-branding__status-dot" />
        <span className="auth-branding__status-text">All systems operational</span>
        <span className="auth-branding__status-sep">•</span>
        <Shield className="w-3 h-3 text-gray-400" />
        <span className="auth-branding__status-text">99.9% uptime</span>
      </div>
    </div>
  </div>
);

// Main AuthCard component
const AuthCard: React.FC<AuthCardProps> = ({ mode, onModeChange, onAuth }) => {
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  return (
    <>
      {/* Full-page loading overlay */}
      <LoadingOverlay isVisible={isLoggingIn} />
      
      <div className="auth-card">
        <div className="auth-card__inner">
          {/* Left panel - Form */}
          <div className="auth-card__form-panel">
            {mode === 'login' ? (
              <Login 
                onSwitchToSignup={() => onModeChange('signup')} 
                onAuth={onAuth}
                onForgotPassword={() => setShowForgotPassword(true)}
                onLoadingChange={setIsLoggingIn}
              />
            ) : (
              <Signup onSwitchToLogin={() => onModeChange('login')} onAuth={onAuth} />
            )}
          </div>

          {/* Right panel - Branding */}
          <BrandingSection />
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />
      )}

      <style>{`
        /* ─── Auth Card Container ──────────────────────── */
        .auth-card {
          width: 100%;
          max-width: 1100px;
        }

        .auth-card__inner {
          display: flex;
          border-radius: 20px;
          overflow: hidden;
          background: rgba(15, 12, 41, 0.85);
          backdrop-filter: blur(40px);
          border: 1px solid rgba(255, 255, 255, 0.06);
          box-shadow: 
            0 25px 60px rgba(0, 0, 0, 0.5),
            0 0 100px rgba(88, 52, 180, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
          min-height: 0;
        }

        /* ─── Form Panel (Left) ────────────────────────── */
        .auth-card__form-panel {
          width: 100%;
          padding: 20px 32px;
        }

        @media (min-width: 1024px) {
          .auth-card__form-panel {
            width: 40%;
            flex-shrink: 0;
          }
        }

        /* ─── Shared Input Styles ──────────────────────── */
        .auth-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.7);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .auth-input-wrapper {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(18, 15, 50, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 0 14px;
          transition: all 0.2s ease;
        }

        .auth-input-wrapper:focus-within {
          border-color: rgba(99, 102, 241, 0.6);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .auth-input-wrapper--error {
          border-color: rgba(239, 68, 68, 0.5) !important;
        }

        .auth-input-icon {
          width: 16px;
          height: 16px;
          color: rgba(255, 255, 255, 0.25);
          flex-shrink: 0;
        }

        .auth-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #e2e8f0;
          font-size: 14px;
          padding: 10px 0;
          width: 100%;
        }

        .auth-input::placeholder {
          color: rgba(255, 255, 255, 0.25);
        }

        .auth-input-toggle {
          color: rgba(255, 255, 255, 0.3);
          transition: color 0.2s;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
        }

        .auth-input-toggle:hover {
          color: rgba(255, 255, 255, 0.6);
        }

        /* ─── Buttons ──────────────────────────────────── */
        .auth-btn-primary {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 24px;
          background: linear-gradient(135deg, #6366f1 0%, #7c3aed 100%);
          color: white;
          font-size: 14px;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: filter 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
        }

        .auth-btn-primary:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(99, 102, 241, 0.28);
        }

        .auth-btn-primary:active {
          transform: translateY(0);
          filter: brightness(0.97);
          box-shadow: none;
        }

        .auth-btn-primary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none !important;
          filter: none !important;
          box-shadow: none !important;
        }

        .auth-btn-google {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 12px 24px;
          background: rgba(18, 15, 50, 0.6);
          color: rgba(255, 255, 255, 0.8);
          font-size: 14px;
          font-weight: 500;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .auth-btn-google:hover {
          background: rgba(25, 22, 60, 0.8);
          border-color: rgba(255, 255, 255, 0.18);
        }

        /* ─── Links ────────────────────────────────────── */
        .auth-link {
          color: #818cf8;
          background: none;
          border: none;
          cursor: pointer;
          transition: color 0.2s;
          padding: 0;
        }

        .auth-link:hover {
          color: #a5b4fc;
          text-decoration: underline;
        }

        /* ─── Divider ──────────────────────────────────── */
        .auth-divider {
          display: flex;
          align-items: center;
          gap: 16px;
          color: rgba(255, 255, 255, 0.2);
          font-size: 12px;
          font-weight: 500;
        }

        .auth-divider::before,
        .auth-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(255, 255, 255, 0.08);
        }

        /* ─── Modal ────────────────────────────────────── */
        .auth-modal {
          background: rgba(15, 12, 41, 0.95);
          backdrop-filter: blur(40px);
        }

        /* ─── Branding Section (Right Panel) ───────────── */
        .auth-branding {
          display: none;
          position: relative;
          flex: 1;
          overflow: hidden;
          border-left: 1px solid rgba(255, 255, 255, 0.04);
        }

        @media (min-width: 1024px) {
          .auth-branding {
            display: block;
          }
        }

        .auth-branding__bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .auth-branding__glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
        }

        .auth-branding__glow--1 {
          top: -50px;
          right: -80px;
          width: 300px;
          height: 300px;
          background: rgba(99, 52, 200, 0.15);
        }

        .auth-branding__glow--2 {
          bottom: -60px;
          left: -40px;
          width: 250px;
          height: 250px;
          background: rgba(59, 46, 180, 0.1);
        }

        .auth-branding__content {
          position: relative;
          z-index: 2;
          height: 100%;
          display: flex;
          flex-direction: column;
          padding: 20px 22px 16px;
        }

        .auth-branding__badge {
          display: inline-flex;
          align-self: flex-start;
          padding: 5px 12px;
          background: rgba(99, 102, 241, 0.15);
          border: 1px solid rgba(99, 102, 241, 0.25);
          border-radius: 20px;
          color: #a5b4fc;
          font-size: 12px;
          font-weight: 500;
          margin-bottom: 12px;
        }

        .auth-branding__headline {
          font-size: 24px;
          font-weight: 800;
          color: white;
          line-height: 1.2;
          margin-bottom: 6px;
        }

        .auth-branding__highlight {
          background: linear-gradient(135deg, #22c55e, #10b981);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .auth-branding__subtext {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.45);
          line-height: 1.5;
          margin-bottom: 14px;
          max-width: 370px;
        }

        /* ─── Features ─────────────────────────────────── */
        .auth-branding__features {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: auto;
          max-width: 280px;
          position: relative;
          z-index: 3;
        }

        .auth-branding__feature {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .auth-branding__feature-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .auth-branding__feature-icon--agents {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
        }

        .auth-branding__feature-icon--collab {
          background: linear-gradient(135deg, #7c3aed, #a855f7);
        }

        .auth-branding__feature-icon--summaries {
          background: linear-gradient(135deg, #4f46e5, #6366f1);
        }

        .auth-branding__feature-title {
          font-size: 14px;
          font-weight: 600;
          color: white;
          margin-bottom: 2px;
        }

        .auth-branding__feature-desc {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.4);
          line-height: 1.4;
        }

        /* ─── Robot Image ──────────────────────────────── */
        .auth-branding__robot-container {
          position: absolute;
          top: 50%;
          right: -110px;
          transform: translateY(-45%);
          width: 580px;
          height: 580px;
          pointer-events: none;
          opacity: 1;
          z-index: 1;
        }

        .auth-branding__robot {
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 0 60px rgba(99, 102, 241, 0.3));
          animation: auth-robot-float 6s ease-in-out infinite;
        }

        @keyframes auth-robot-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        /* ─── Status Bar ───────────────────────────────── */
        .auth-branding__status {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          background: rgba(12, 10, 35, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
          align-self: flex-start;
          margin-top: 14px;
          position: relative;
          z-index: 3;
        }

        .auth-branding__status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
        }

        .auth-branding__status-text {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
        }

        .auth-branding__status-sep {
          color: rgba(255, 255, 255, 0.15);
          font-size: 10px;
        }

        /* ─── Animations ───────────────────────────────── */
        @keyframes auth-fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .auth-animate-in {
          animation: auth-fade-in 0.4s ease-out;
        }

        .animate-fade-in {
          animation: auth-fade-in 0.3s ease-out;
        }

        /* ─── Scrollbar ────────────────────────────────── */
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </>
  );
};

export default AuthCard;