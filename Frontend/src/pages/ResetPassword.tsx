// src/pages/ResetPassword.tsx
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../services/authService';

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email;
  const otp = location.state?.otp;

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Redirect if no email or OTP provided
  useEffect(() => {
    if (!email || !otp) {
      navigate('/forgot-password');
    }
  }, [email, otp, navigate]);

  // Password validation
  const validatePassword = () => {
    if (!newPassword) {
      return 'Please enter a new password';
    }

    if (newPassword.length < 8) {
      return 'Password must be at least 8 characters long';
    }

    if (!/[A-Z]/.test(newPassword)) {
      return 'Password must contain at least one uppercase letter';
    }

    if (!/[a-z]/.test(newPassword)) {
      return 'Password must contain at least one lowercase letter';
    }

    if (!/[0-9]/.test(newPassword)) {
      return 'Password must contain at least one number';
    }

    if (!confirmPassword) {
      return 'Please confirm your password';
    }

    if (newPassword !== confirmPassword) {
      return 'Passwords do not match';
    }

    return null;
  };

  // Handle password reset
  const handleResetPassword = async () => {
    setError('');

    const validationError = validatePassword();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      await authService.resetPassword(email, otp, newPassword);
      setSuccess(true);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login', { 
          state: { message: 'Password reset successful! Please login with your new password.' } 
        });
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Password strength indicator
  const getPasswordStrength = () => {
    if (!newPassword) return { strength: 0, label: '', color: '' };

    let strength = 0;
    if (newPassword.length >= 8) strength++;
    if (/[A-Z]/.test(newPassword)) strength++;
    if (/[a-z]/.test(newPassword)) strength++;
    if (/[0-9]/.test(newPassword)) strength++;
    if (/[^A-Za-z0-9]/.test(newPassword)) strength++;

    if (strength <= 2) return { strength, label: 'Weak', color: 'bg-red-500' };
    if (strength <= 3) return { strength, label: 'Medium', color: 'bg-yellow-500' };
    return { strength, label: 'Strong', color: 'bg-green-500' };
  };

  const passwordStrength = getPasswordStrength();

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Password Reset Successful!</h2>
            <p className="text-gray-600">Redirecting to login...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              Reset Password
            </h1>
            <p className="text-gray-600">
              Create a strong new password for your account
            </p>
          </div>

          <div className="space-y-6">
            {/* New Password */}
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {newPassword && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded ${
                          level <= passwordStrength.strength
                            ? passwordStrength.color
                            : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-600">
                    Password strength: <span className="font-medium">{passwordStrength.label}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>

              {/* Match indicator */}
              {confirmPassword && (
                <p className={`text-xs mt-1 ${
                  newPassword === confirmPassword ? 'text-green-600' : 'text-red-600'
                }`}>
                  {newPassword === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                </p>
              )}
            </div>

            {/* Password Requirements */}
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Password must contain:</p>
              <ul className="text-xs text-gray-600 space-y-1">
                <li className={newPassword.length >= 8 ? 'text-green-600' : ''}>
                  {newPassword.length >= 8 ? '✓' : '○'} At least 8 characters
                </li>
                <li className={/[A-Z]/.test(newPassword) ? 'text-green-600' : ''}>
                  {/[A-Z]/.test(newPassword) ? '✓' : '○'} One uppercase letter
                </li>
                <li className={/[a-z]/.test(newPassword) ? 'text-green-600' : ''}>
                  {/[a-z]/.test(newPassword) ? '✓' : '○'} One lowercase letter
                </li>
                <li className={/[0-9]/.test(newPassword) ? 'text-green-600' : ''}>
                  {/[0-9]/.test(newPassword) ? '✓' : '○'} One number
                </li>
              </ul>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleResetPassword}
              disabled={loading || !newPassword || !confirmPassword}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Resetting Password...' : 'Reset Password'}
            </button>

            {/* Back to Login */}
            <div className="text-center">
              <button
                onClick={() => navigate('/login')}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                ← Back to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}