import React, { useState } from 'react';
import authService from '../services/authService';
import { Loader2, X } from 'lucide-react';
import logo from '../assets/logo.png';

type Mode = 'login' | 'signup';

interface AuthCardProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onAuth: () => void;
}

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
}> = ({ onSwitchToSignup, darkMode, onAuth, onForgotPassword }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = () => {
    setErrors({});

    const newErrors: Record<string, string> = {};
    if (!email) newErrors.email = 'Email is required';
    if (!password) newErrors.password = 'Password is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    authService
      .login({ username: email, password })
      .then(() => {
        setLoading(false);
        onAuth();
      })
      .catch((err: any) => {
        setLoading(false);
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
      <div className="text-center mb-6">
        <h1 className="text-2xl font-semibold text-white mb-2">Welcome back!</h1>
        <p className="text-gray-400 text-sm">We're so excited to see you again!</p>
      </div>

      <div className="space-y-5" onKeyDown={handleKeyPress}>
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
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full px-3 py-2.5 bg-slate-900/80 border ${errors.password ? 'border-red-500' : 'border-slate-900'
              } rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors`}
          />
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

        {errors.general && <p className="text-sm text-red-400 mt-2">{errors.general}</p>}

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

// Signup Component
const Signup: React.FC<{ onSwitchToLogin: () => void; darkMode?: boolean; onAuth: () => void }> = ({ onSwitchToLogin, darkMode, onAuth }) => {
  const [formData, setFormData] = useState({ email: '', displayName: '', username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubmit = () => {
    setErrors({});

    const newErrors: Record<string, string> = {};
    if (!formData.email) newErrors.email = 'Email is required';
    if (!formData.displayName) newErrors.displayName = 'Display name is required';
    if (!formData.username) newErrors.username = 'Username is required';
    if (!formData.password) newErrors.password = 'Password is required';
    if (!agreedToTerms) newErrors.terms = 'You must agree to the terms';

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
      .then(() => {
        setLoading(false);
        onSwitchToLogin();
      })
      .catch((err: any) => {
        setLoading(false);
        const message = err?.data?.error || err?.message || 'Signup failed';
        setErrors({ general: String(message) });
      });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

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
              className={`w-full px-3 py-2.5 bg-slate-900/80 border ${errors.username ? 'border-red-500' : 'border-slate-900'
                } rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors`}
            />
            {errors.username && <p className="text-xs text-red-400">{errors.username}</p>}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-300 uppercase">Password <span className="text-red-400">*</span></label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              className={`w-full px-3 py-2.5 bg-slate-900/80 border ${errors.password ? 'border-red-500' : 'border-slate-900'
                } rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors`}
            />
            {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
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
          {errors.general && <p className="text-sm text-red-400 mt-2">{errors.general}</p>}
        </div>
      </div>
    </div>
  );
};

// Branding Section Component
const BrandingSection: React.FC = () => (
  <div className="hidden lg:flex lg:flex-col items-center justify-center w-[360px] border-l border-slate-700/50 p-8 bg-gradient-to-br from-purple-900/30 via-indigo-900/20 to-slate-900/40 relative overflow-hidden">
    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full filter blur-3xl"></div>
    <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full filter blur-3xl"></div>

    <div className="text-center space-y-6 relative z-10">
      <div className="flex justify-center">
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full blur-2xl opacity-30 group-hover:opacity-50 transition-opacity"></div>
          <div className="relative w-24 h-24 flex items-center justify-center transform transition-transform group-hover:scale-110">
            <img
              src={logo}
              alt="AuraFlow Logo"
              className="w-full h-full object-contain drop-shadow-2xl"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
          AuraFlow
        </h3>
        <p className="text-sm text-gray-300 leading-relaxed px-2">
          AI-powered communication for modern teams
        </p>
      </div>

      <div className="space-y-3 text-left w-full">
        {[
          {
            icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
            text: 'Real-time AI assistance',
            color: 'from-blue-400 to-cyan-400'
          },
          {
            icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
            text: 'Smart insights & analytics',
            color: 'from-purple-400 to-pink-400'
          },
          {
            icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
            text: 'Enterprise-grade security',
            color: 'from-green-400 to-emerald-400'
          },
          {
            icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
            text: 'Lightning-fast performance',
            color: 'from-yellow-400 to-orange-400'
          }
        ].map((feature, i) => (
          <div key={i} className="flex items-center gap-3 px-2 group cursor-default">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center text-white shadow-lg transform transition-all group-hover:scale-110`}>
              {feature.icon}
            </div>
            <span className="text-sm text-gray-200 group-hover:text-white transition-colors">{feature.text}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Main AuthCard component
const AuthCard: React.FC<AuthCardProps> = ({ mode, onModeChange, onAuth }) => {
  const [darkMode, setDarkMode] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="w-full max-w-4xl">
        <div className="flex backdrop-blur-xl bg-slate-800/95 dark:bg-slate-800/95 rounded-lg shadow-2xl overflow-hidden">
          <div className="w-full lg:w-[480px] p-8">
            {mode === 'login' ? (
              <Login 
                onSwitchToSignup={() => onModeChange('signup')} 
                darkMode={darkMode} 
                onAuth={onAuth}
                onForgotPassword={() => setShowForgotPassword(true)}
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