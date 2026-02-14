import React, { useState, useMemo } from 'react';
import authService from '../services/authService';
import { Loader2, X, Eye, EyeOff, CheckCircle2, XCircle, Info, Mail } from 'lucide-react';

type Mode = 'login' | 'signup';

interface AuthCardProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onAuth: () => void;
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
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-md relative animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
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
                <label className="block text-xs font-semibold text-gray-300 uppercase">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900/80 border border-slate-700 rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="Enter your email"
                />
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
                <label className="block text-xs font-semibold text-gray-300 uppercase">
                  Enter OTP <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                  className="w-full px-3 py-2.5 bg-slate-900/80 border border-slate-700 rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors text-center text-2xl tracking-widest"
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
                <label className="block text-xs font-semibold text-gray-300 uppercase">
                  New Password <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900/80 border border-slate-700 rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="Enter new password"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-300 uppercase">
                  Confirm Password <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900/80 border border-slate-700 rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="Confirm new password"
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded text-sm text-green-400">
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
            className="w-full mt-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
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
  onAuth: () => void;
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
      .then(() => {
        // Keep loading true during transition to app
        onAuth();
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

  return (
    <div className="w-full animate-fade-in">
      <div className="text-center mb-4">
        <h1 className="text-2xl font-semibold text-white mb-1">Welcome back!</h1>
        <p className="text-gray-400 text-sm">We're so excited to see you again!</p>
      </div>

      <div className="space-y-4" onKeyDown={handleKeyPress}>
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-300 uppercase">Email or Username <span className="text-red-400">*</span></label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`w-full px-3 py-2.5 bg-slate-900/80 border ${errors.email ? 'border-red-500' : 'border-slate-900'
              } rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors`}
          />
          {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-300 uppercase">Password <span className="text-red-400">*</span></label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full px-3 py-2.5 pr-10 bg-slate-900/80 border ${errors.password ? 'border-red-500' : 'border-slate-900'
                } rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
        </div>

        <button 
          type="button"
          onClick={onForgotPassword}
          className="text-sm text-indigo-400 hover:underline"
        >
          Forgot your password?
        </button>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Logging in...' : 'Log In'}
        </button>

        {errors.general && (
          <div className={`text-sm mt-2 p-3 rounded border ${unverifiedEmail ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
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

        <p className="text-sm text-gray-400">
          Need an account?{' '}
          <button onClick={onSwitchToSignup} className="text-indigo-400 hover:underline">
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
  { key: 'special', label: 'One special character (!@#$…)', test: (p: string) => /[!@#$%^&*()\-_=+\[\]{}|;:'",.<>?/`~\\]/.test(p) },
];

const getStrengthLevel = (password: string) => {
  const passed = passwordRules.filter((r) => r.test(password)).length;
  if (passed <= 1) return { level: 0, label: 'Very Weak', color: 'bg-red-500' };
  if (passed === 2) return { level: 1, label: 'Weak', color: 'bg-orange-500' };
  if (passed === 3) return { level: 2, label: 'Fair', color: 'bg-amber-500' };
  if (passed === 4) return { level: 3, label: 'Strong', color: 'bg-emerald-400' };
  return { level: 4, label: 'Very Strong', color: 'bg-emerald-500' };
};

const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
const usernameRegex = /^[a-zA-Z0-9_]+$/;

// Signup Component
const Signup: React.FC<{ onSwitchToLogin: () => void; darkMode?: boolean; onAuth: () => void }> = ({ onSwitchToLogin, darkMode, onAuth }) => {
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
      <div className="w-full animate-fade-in flex flex-col items-center justify-center h-[520px] text-center px-4">
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
          className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded transition-colors"
        >
          Go to Login
        </button>
      </div>
    );
  }

  // ── Signup form ──────────────────────────────────────────────────
  return (
    <div className="w-full animate-fade-in h-[520px] flex flex-col">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-semibold text-white mb-2">Create an account</h1>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <div className="space-y-5 pb-2" onKeyDown={handleKeyPress}>
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-300 uppercase">Email <span className="text-red-400">*</span></label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="you@example.com"
              className={`w-full px-3 py-2.5 bg-slate-900/80 border ${errors.email ? 'border-red-500' : 'border-slate-900'
                } rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors`}
            />
            {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-300 uppercase">Display Name <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) => handleChange('displayName', e.target.value)}
              className={`w-full px-3 py-2.5 bg-slate-900/80 border ${errors.displayName ? 'border-red-500' : 'border-slate-900'
                } rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors`}
            />
            {errors.displayName && <p className="text-xs text-red-400">{errors.displayName}</p>}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-300 uppercase">Username <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => handleChange('username', e.target.value)}
              placeholder="letters, numbers, underscores"
              className={`w-full px-3 py-2.5 bg-slate-900/80 border ${errors.username ? 'border-red-500' : 'border-slate-900'
                } rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors`}
            />
            {errors.username && <p className="text-xs text-red-400">{errors.username}</p>}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-300 uppercase">Password <span className="text-red-400">*</span></label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => handleChange('password', e.target.value)}
                className={`w-full px-3 py-2.5 pr-10 bg-slate-900/80 border ${errors.password ? 'border-red-500' : 'border-slate-900'
                  } rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
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
                className="w-4 h-4 mt-0.5 text-indigo-500 bg-slate-900/80 border-slate-700 rounded focus:ring-indigo-500"
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
            className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Creating account...' : 'Continue'}
          </button>

          <button onClick={onSwitchToLogin} className="text-indigo-400 hover:underline text-sm">
            Already have an account?
          </button>
          {errors.general && (
            <div className="text-sm text-red-400 mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded">
              {errors.general}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Animation timeline types
type AnimationStep = 'entering' | 'user-typing' | 'user-message' | 'analyzing' | 'insights-ready' | 'agent-responding' | 'tips-appearing' | 'loop-reset';

// Premium Desktop Mockup Branding Animation Component - Half screen appearing from right
const BrandingAnimation: React.FC = () => {
  const [step, setStep] = useState<AnimationStep>('entering');
  const [showTyping, setShowTyping] = useState(false);
  const [userMessage, setUserMessage] = useState<{ visible: boolean; status: 'sending' | 'sent' | 'delivered' }>({ visible: false, status: 'sending' });
  const [agentMessage, setAgentMessage] = useState(false);
  const [showTips, setShowTips] = useState(false);

  const userText = "Can someone summarize what we discussed?";
  const agentText = "📋 Summary: The team agreed on the new feature timeline and assigned tasks for next sprint.";

  React.useEffect(() => {
    const timeouts: NodeJS.Timeout[] = [];
    
    const runTimeline = () => {
      setStep('entering');
      setShowTyping(false);
      setUserMessage({ visible: false, status: 'sending' });
      setAgentMessage(false);
      setShowTips(false);

      timeouts.push(setTimeout(() => setStep('user-typing'), 600));
      timeouts.push(setTimeout(() => setShowTyping(true), 600));
      timeouts.push(setTimeout(() => {
        setShowTyping(false);
        setStep('user-message');
        setUserMessage({ visible: true, status: 'sending' });
      }, 1200));
      timeouts.push(setTimeout(() => setUserMessage(prev => ({ ...prev, status: 'sent' })), 1500));
      timeouts.push(setTimeout(() => setUserMessage(prev => ({ ...prev, status: 'delivered' })), 1800));
      timeouts.push(setTimeout(() => setStep('analyzing'), 2000));
      timeouts.push(setTimeout(() => setStep('insights-ready'), 3500));
      timeouts.push(setTimeout(() => {
        setStep('agent-responding');
        setAgentMessage(true);
      }, 3800));
      timeouts.push(setTimeout(() => {
        setStep('tips-appearing');
        setShowTips(true);
      }, 5000));
      timeouts.push(setTimeout(() => setStep('loop-reset'), 8000));
      timeouts.push(setTimeout(runTimeline, 8500));
    };

    runTimeline();
    return () => timeouts.forEach(clearTimeout);
  }, []);

  const isAnalyzing = step === 'analyzing';
  const isReady = ['insights-ready', 'agent-responding', 'tips-appearing'].includes(step);

  return (
    <div 
      className={`absolute -right-8 top-1/2 -translate-y-1/2 w-[340px] transition-all duration-700 ease-out ${
        step === 'entering' ? 'opacity-0 translate-x-20' : 'opacity-100 translate-x-0'
      }`}
    >
      {/* Glow effect */}
      <div className="absolute -inset-3 bg-gradient-to-l from-purple-500/20 via-indigo-500/15 to-transparent rounded-2xl blur-xl" />
      
      {/* Desktop Window */}
      <div className="relative bg-slate-900/95 backdrop-blur-xl rounded-l-2xl border-l border-t border-b border-slate-700/60 shadow-2xl shadow-purple-900/40 overflow-hidden">
        {/* Window Title Bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-800/90 border-b border-slate-700/50">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500/80" />
            <div className="w-2 h-2 rounded-full bg-yellow-500/80" />
            <div className="w-2 h-2 rounded-full bg-green-500/80" />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z"/>
              </svg>
            </div>
            <span className="text-[10px] text-gray-300 font-medium">AuraFlow</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[8px] text-gray-500">Online</span>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex h-[260px]">
          {/* Mini Sidebar */}
          <div className="w-11 bg-slate-800/60 border-r border-slate-700/30 flex flex-col items-center py-2 gap-1.5">
            {[
              { gradient: 'from-indigo-500 to-purple-600', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z', active: true },
              { gradient: 'from-emerald-500 to-teal-600', icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z', active: false },
              { gradient: 'from-orange-500 to-red-500', icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z', active: false },
            ].map((item, i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center transition-all ${
                  item.active ? 'ring-2 ring-white/30 shadow-lg' : 'opacity-50 hover:opacity-70'
                }`}
              >
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d={item.icon}/>
                </svg>
              </div>
            ))}
            <div className="w-6 h-px bg-slate-700 my-1" />
            <div className="w-8 h-8 rounded-xl bg-slate-700/50 flex items-center justify-center border border-dashed border-slate-600 opacity-60">
              <span className="text-gray-400 text-sm">+</span>
            </div>
          </div>

          {/* Channel List */}
          <div className="w-[90px] bg-slate-800/40 border-r border-slate-700/30 flex flex-col text-[8px]">
            <div className="px-2 py-2 border-b border-slate-700/30">
              <span className="font-semibold text-white flex items-center gap-1 text-[9px]">
                <svg className="w-3 h-3 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                </svg>
                Dev Team
              </span>
            </div>
            <div className="flex-1 p-1.5 space-y-0.5 overflow-hidden">
              <div className="px-1 py-0.5 text-gray-500 uppercase" style={{ fontSize: '6px' }}>Channels</div>
              {['general', 'standup', 'random'].map((ch, i) => (
                <div key={ch} className={`px-1.5 py-1 rounded flex items-center gap-1 ${i === 1 ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400'}`}>
                  <span className="opacity-50">#</span>
                  <span className="truncate">{ch}</span>
                </div>
              ))}
              <div className="px-1 py-0.5 text-gray-500 uppercase mt-1.5" style={{ fontSize: '6px' }}>AI Agents</div>
              {[
                { name: 'Summarizer', color: 'text-blue-400', bg: 'bg-blue-500/10', active: true },
                { name: 'Mood', color: 'text-pink-400', bg: 'bg-pink-500/10', active: false },
                { name: 'Moderator', color: 'text-orange-400', bg: 'bg-orange-500/10', active: false },
              ].map((agent) => (
                <div key={agent.name} className={`px-1.5 py-1 rounded flex items-center gap-1 ${agent.active ? `${agent.bg} ${agent.color} border border-current/20` : 'text-gray-500'}`}>
                  <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                  </svg>
                  <span className="truncate">{agent.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col bg-slate-900/70 min-w-0">
            {/* Chat Header */}
            <div className="px-2 py-1.5 border-b border-slate-700/30 flex items-center gap-2">
              <span className="text-gray-500 text-[9px]">#</span>
              <span className="text-[9px] font-medium text-white">standup</span>
              <div className="ml-auto px-1.5 py-0.5 bg-blue-500/10 rounded text-[7px] text-blue-400 border border-blue-500/20">
                AI Active
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 p-2 flex flex-col gap-1.5 overflow-hidden">
              <div className="flex-1" />
              
              {/* Typing */}
              <div className={`flex justify-end transition-all duration-200 ${showTyping ? 'opacity-100' : 'opacity-0 h-0'}`}>
                <div className="flex gap-0.5 px-2 py-1.5 bg-slate-700/50 rounded-lg rounded-br-sm">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 80}ms` }} />
                  ))}
                </div>
              </div>

              {/* User Message */}
              <div className={`flex justify-end transition-all duration-400 ${userMessage.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
                <div className="max-w-[90%]">
                  <div className="px-2.5 py-1.5 rounded-xl rounded-br-sm bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-purple-500/20">
                    <p className="text-[8px] leading-relaxed">{userText}</p>
                  </div>
                  <div className="flex items-center justify-end gap-0.5 mt-0.5 pr-0.5">
                    <span className="text-[6px] text-gray-500">2:34 PM</span>
                    <svg className={`w-2 h-2 transition-colors ${userMessage.status === 'delivered' ? 'text-blue-400' : 'text-gray-500'}`} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Analysis */}
              <div className={`transition-all duration-300 ${isAnalyzing || isReady ? 'opacity-100' : 'opacity-0 h-0'}`}>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/70 rounded-lg border border-slate-700/40">
                  <div className={isAnalyzing ? 'animate-pulse' : ''}>
                    <svg className={`w-3 h-3 ${isReady ? 'text-emerald-400' : 'text-blue-400'}`} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/>
                    </svg>
                  </div>
                  <span className={`text-[7px] ${isReady ? 'text-emerald-400' : 'text-gray-400'}`}>
                    {isAnalyzing ? 'Summarizer analyzing...' : '✓ Summary ready'}
                  </span>
                  {isAnalyzing && (
                    <div className="flex-1 h-0.5 bg-slate-700 rounded-full overflow-hidden ml-1">
                      <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500 rounded-full animate-shimmer" style={{ width: '100%', backgroundSize: '200% 100%' }} />
                    </div>
                  )}
                </div>
              </div>

              {/* Agent Response */}
              <div className={`transition-all duration-400 ${agentMessage ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
                <div className="flex items-start gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/30">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-[8px] font-medium text-blue-400">Summarizer</span>
                      <span className="text-[6px] text-gray-500">AI</span>
                    </div>
                    <div className="px-2 py-1.5 rounded-xl rounded-tl-sm bg-slate-700/80 border border-slate-600/30">
                      <p className="text-[8px] text-gray-200 leading-relaxed">{agentText}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div className={`flex gap-1 ml-6 transition-all duration-400 ${showTips ? 'opacity-100' : 'opacity-0'}`}>
                {['View full', 'Share'].map((tip, i) => (
                  <div key={tip} className="flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-700/50 rounded-full border border-slate-600/20 text-[7px] text-gray-400">
                    <svg className="w-2 h-2 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d={i === 0 ? "M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" : "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"}/>
                    </svg>
                    {tip}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Branding Section - Half screen mockup appearing from right edge
const BrandingSection: React.FC = () => (
  <div className="hidden lg:block w-[360px] border-l border-slate-700/50 bg-gradient-to-br from-purple-900/20 via-indigo-900/15 to-slate-900/30 relative overflow-hidden">
    {/* Background effects */}
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute top-10 right-0 w-32 h-32 bg-purple-500/20 rounded-full filter blur-3xl" />
      <div className="absolute bottom-10 left-0 w-24 h-24 bg-indigo-500/15 rounded-full filter blur-3xl" />
      <div className="absolute top-1/2 -translate-y-1/2 right-0 w-20 h-40 bg-blue-500/10 rounded-full filter blur-3xl" />
      {/* Grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(139, 92, 246, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.5) 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
      />
    </div>

    <div className="relative z-10 h-full flex flex-col p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/30 via-purple-500/20 to-transparent rounded-full blur-lg" />
          <img src="/AuraflowLogo.png" alt="AuraFlow" className="w-14 h-14 drop-shadow-lg relative" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">AuraFlow</h3>
          <p className="text-[10px] text-gray-400">AI-Powered Communication</p>
        </div>
      </div>

      {/* Desktop mockup container - positioned to overflow right */}
      <div className="flex-1 relative min-h-0">
        <BrandingAnimation />
      </div>

      {/* Feature badges */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {[
          { icon: '📝', label: 'Summarize' },
          { icon: '😊', label: 'Mood' },
          { icon: '🛡️', label: 'Moderate' },
          { icon: '💚', label: 'Wellness' },
        ].map((f) => (
          <div 
            key={f.label}
            className="flex items-center gap-1 px-2 py-1 bg-slate-800/60 backdrop-blur-sm rounded-full border border-slate-700/40"
          >
            <span className="text-[10px]">{f.icon}</span>
            <span className="text-[9px] text-gray-400">{f.label}</span>
          </div>
        ))}
      </div>

      {/* Tagline */}
      <p className="text-[9px] text-gray-500 mt-2 text-center">
        Smart communication with intelligent AI agents
      </p>
    </div>
  </div>
);

// Main AuthCard component
const AuthCard: React.FC<AuthCardProps> = ({ mode, onModeChange, onAuth }) => {
  const [darkMode, setDarkMode] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  return (
    <div className={darkMode ? 'dark' : ''}>
      {/* Full-page loading overlay */}
      <LoadingOverlay isVisible={isLoggingIn} />
      
      <div className="w-full max-w-5xl">
        <div className="flex backdrop-blur-xl bg-slate-800/95 dark:bg-slate-800/95 rounded-lg shadow-2xl overflow-hidden min-h-[420px]">
          <div className="w-full lg:w-[520px] p-6">
            {mode === 'login' ? (
              <Login 
                onSwitchToSignup={() => onModeChange('signup')} 
                darkMode={darkMode} 
                onAuth={onAuth}
                onForgotPassword={() => setShowForgotPassword(true)}
                onLoadingChange={setIsLoggingIn}
              />
            ) : (
              <Signup onSwitchToLogin={() => onModeChange('login')} darkMode={darkMode} onAuth={onAuth} />
            )}
          </div>

          <BrandingSection />
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />
      )}

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-float-delayed { animation: float 8s ease-in-out infinite reverse; }
        
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
        .animate-pulse-slow { animation: pulse-slow 4s ease-in-out infinite; }
        
        @keyframes wave {
          0%, 100% { height: 4px; }
          50% { height: 14px; }
        }
        
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .animate-shimmer {
          animation: shimmer 2s linear infinite;
        }
        
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(99, 102, 241, 0.3) transparent;
          scroll-behavior: smooth;
        }
        
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(99, 102, 241, 0.4), rgba(139, 92, 246, 0.4));
          border-radius: 10px;
          transition: background 0.3s ease;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(99, 102, 241, 0.6), rgba(139, 92, 246, 0.6));
        }
      `}</style>
    </div>
  );
};

export default AuthCard;