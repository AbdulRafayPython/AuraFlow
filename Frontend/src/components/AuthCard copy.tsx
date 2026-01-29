import React, { useState } from 'react';
import authService from '../services/authService';
import { Loader2, X } from 'lucide-react';

// 3D AuraFlow Logo Component
const AuraFlowLogo3D: React.FC<{ size?: number }> = ({ size = 120 }) => (
  <div className="relative" style={{ width: size, height: size }}>
    {/* Outer glow rings */}
    <div className="absolute inset-0 animate-pulse-slow">
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 blur-xl"></div>
    </div>
    
    {/* Main 3D SVG */}
    <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-2xl" style={{ filter: 'drop-shadow(0 0 20px rgba(139, 92, 246, 0.4))' }}>
      <defs>
        {/* Main gradient */}
        <linearGradient id="mainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
        
        {/* Inner gradient */}
        <linearGradient id="innerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
        
        {/* Glow gradient */}
        <radialGradient id="glowGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
        
        {/* 3D shadow */}
        <filter id="shadow3d" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#1e1b4b" floodOpacity="0.5"/>
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#4c1d95" floodOpacity="0.3"/>
        </filter>
        
        {/* Inner shadow for depth */}
        <filter id="innerShadow">
          <feOffset dx="0" dy="2"/>
          <feGaussianBlur stdDeviation="3" result="offset-blur"/>
          <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse"/>
          <feFlood floodColor="#1e1b4b" floodOpacity="0.4" result="color"/>
          <feComposite operator="in" in="color" in2="inverse" result="shadow"/>
          <feComposite operator="over" in="shadow" in2="SourceGraphic"/>
        </filter>
        
        {/* Shine effect */}
        <linearGradient id="shine" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="white" stopOpacity="0.3"/>
          <stop offset="50%" stopColor="white" stopOpacity="0.1"/>
          <stop offset="100%" stopColor="white" stopOpacity="0"/>
        </linearGradient>
      </defs>
      
      {/* Background glow */}
      <circle cx="100" cy="100" r="80" fill="url(#glowGradient)" className="animate-pulse-slow"/>
      
      {/* Main outer ring - 3D effect */}
      <circle 
        cx="100" cy="100" r="70" 
        fill="none" 
        stroke="url(#mainGradient)" 
        strokeWidth="8"
        filter="url(#shadow3d)"
        className="origin-center"
      />
      
      {/* Inner decorative ring */}
      <circle 
        cx="100" cy="100" r="55" 
        fill="none" 
        stroke="url(#innerGradient)" 
        strokeWidth="3"
        strokeDasharray="20 10"
        opacity="0.7"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 100 100"
          to="360 100 100"
          dur="20s"
          repeatCount="indefinite"
        />
      </circle>
      
      {/* Flowing aura waves */}
      <g filter="url(#shadow3d)">
        {/* Wave 1 */}
        <path 
          d="M60 100 Q80 70 100 100 Q120 130 140 100" 
          fill="none" 
          stroke="url(#mainGradient)" 
          strokeWidth="4" 
          strokeLinecap="round"
          opacity="0.9"
        >
          <animate
            attributeName="d"
            values="M60 100 Q80 70 100 100 Q120 130 140 100;M60 100 Q80 130 100 100 Q120 70 140 100;M60 100 Q80 70 100 100 Q120 130 140 100"
            dur="3s"
            repeatCount="indefinite"
          />
        </path>
        
        {/* Wave 2 */}
        <path 
          d="M65 85 Q85 60 100 85 Q115 110 135 85" 
          fill="none" 
          stroke="url(#innerGradient)" 
          strokeWidth="3" 
          strokeLinecap="round"
          opacity="0.7"
        >
          <animate
            attributeName="d"
            values="M65 85 Q85 60 100 85 Q115 110 135 85;M65 85 Q85 110 100 85 Q115 60 135 85;M65 85 Q85 60 100 85 Q115 110 135 85"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </path>
        
        {/* Wave 3 */}
        <path 
          d="M65 115 Q85 140 100 115 Q115 90 135 115" 
          fill="none" 
          stroke="url(#innerGradient)" 
          strokeWidth="3" 
          strokeLinecap="round"
          opacity="0.7"
        >
          <animate
            attributeName="d"
            values="M65 115 Q85 140 100 115 Q115 90 135 115;M65 115 Q85 90 100 115 Q115 140 135 115;M65 115 Q85 140 100 115 Q115 90 135 115"
            dur="2.8s"
            repeatCount="indefinite"
          />
        </path>
      </g>
      
      {/* Center AI core */}
      <g filter="url(#innerShadow)">
        <circle cx="100" cy="100" r="25" fill="url(#mainGradient)"/>
        <circle cx="100" cy="100" r="25" fill="url(#shine)"/>
      </g>
      
      {/* Core pulse ring */}
      <circle cx="100" cy="100" r="20" fill="none" stroke="white" strokeWidth="2" opacity="0.3">
        <animate
          attributeName="r"
          values="18;25;18"
          dur="2s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.3;0.1;0.3"
          dur="2s"
          repeatCount="indefinite"
        />
      </circle>
      
      {/* Center icon - stylized "A" or connection symbol */}
      <g transform="translate(100, 100)">
        <path 
          d="M-8 8 L0 -10 L8 8 M-5 2 L5 2" 
          fill="none" 
          stroke="white" 
          strokeWidth="3" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          opacity="0.95"
        />
      </g>
      
      {/* Orbiting particles */}
      <g>
        <circle cx="100" cy="30" r="4" fill="#818cf8">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 100 100"
            to="360 100 100"
            dur="8s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="170" cy="100" r="3" fill="#c084fc">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="120 100 100"
            to="480 100 100"
            dur="10s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="100" cy="170" r="3.5" fill="#f472b6">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="240 100 100"
            to="600 100 100"
            dur="12s"
            repeatCount="indefinite"
          />
        </circle>
      </g>
      
      {/* Highlight shine */}
      <ellipse cx="85" cy="70" rx="15" ry="8" fill="white" opacity="0.1" transform="rotate(-30 85 70)"/>
    </svg>
  </div>
);

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
  <div className="hidden lg:flex lg:flex-col items-center justify-center w-[320px] border-l border-slate-700/50 p-6 bg-gradient-to-br from-purple-900/30 via-indigo-900/20 to-slate-900/40 relative overflow-hidden">
    {/* Animated background orbs */}
    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/15 rounded-full filter blur-3xl animate-float"></div>
    <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/15 rounded-full filter blur-3xl animate-float-delayed"></div>
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5 rounded-full filter blur-3xl"></div>

    <div className="text-center space-y-2 relative z-10">
      {/* 3D Logo */}
      <div className="flex justify-center">
        <div className="relative group">
          {/* Outer glow effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/40 via-purple-500/40 to-pink-500/40 rounded-full blur-2xl opacity-40 group-hover:opacity-60 transition-all duration-500 scale-125"></div>
          
          {/* Logo container with hover effect */}
          <div className="relative transform transition-all duration-500 group-hover:scale-105 group-hover:rotate-3">
            <AuraFlowLogo3D size={140} />
          </div>
        </div>
      </div>

      {/* Brand name with enhanced styling */}
      <div className="space-y-0.5">
        <h3 className="text-2xl font-black tracking-tight">
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent drop-shadow-lg">
            AuraFlow
          </span>
        </h3>
        <p className="text-xs text-gray-300/90 leading-tight px-2 font-medium">
          AI-powered communication that understands your emotions
        </p>
      </div>

      {/* Feature list with enhanced styling */}
      <div className="space-y-1 text-left w-full mt-1">
        {[
          {
            icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>,
            text: 'Emotional Intelligence',
            color: 'from-pink-400 to-rose-500'
          },
          {
            icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
            text: 'Smart AI Agents',
            color: 'from-purple-400 to-violet-500'
          },
          {
            icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
            text: 'Real-time Insights',
            color: 'from-indigo-400 to-blue-500'
          },
          {
            icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
            text: 'Enterprise Security',
            color: 'from-emerald-400 to-teal-500'
          }
        ].map((feature, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1 group cursor-default rounded-lg transition-all duration-300 hover:bg-white/5">
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center text-white shadow-md shadow-purple-500/20 transform transition-all duration-300 group-hover:scale-110`}>
              {feature.icon}
            </div>
            <span className="text-xs text-gray-300 group-hover:text-white transition-colors font-medium">{feature.text}</span>
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