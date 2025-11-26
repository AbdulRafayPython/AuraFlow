// src/pages/OtpVerification.tsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../services/authService';

export default function OtpVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email;

  // OTP inputs state
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Timer state
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes = 300 seconds
  const [canResend, setCanResend] = useState(false);

  // Refs for OTP inputs
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect if no email provided
  useEffect(() => {
    if (!email) {
      navigate('/forgot-password');
    }
  }, [email, navigate]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) {
      setCanResend(true);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle OTP input change
  const handleOtpChange = (index: number, value: string) => {
    // Only allow numbers
    if (value && !/^\d+$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // Only take last character
    setOtp(newOtp);
    setError('');

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Handle backspace
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle paste
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    
    if (!/^\d+$/.test(pastedData)) return;

    const newOtp = pastedData.split('');
    while (newOtp.length < 6) newOtp.push('');
    
    setOtp(newOtp);
    inputRefs.current[5]?.focus();
  };

  // Verify OTP
  const handleVerifyOtp = async () => {
    const otpString = otp.join('');
    
    if (otpString.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await authService.verifyOtp(email, otpString);
      // Navigate to reset password page
      navigate('/reset-password', { state: { email, otp: otpString } });
    } catch (err: any) {
      setError(err.message || 'Invalid OTP. Please try again.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    setLoading(true);
    setError('');

    try {
      await authService.requestPasswordReset(email);
      setTimeLeft(300);
      setCanResend(false);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              Enter OTP
            </h1>
            <p className="text-gray-600">
              We've sent a 6-digit code to
            </p>
            <p className="text-purple-600 font-medium mt-1">{email}</p>
          </div>

          {/* OTP Inputs */}
          <div className="flex justify-center gap-3 mb-6">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                disabled={loading}
                className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition disabled:bg-gray-100"
              />
            ))}
          </div>

          {/* Timer */}
          <div className="text-center mb-6">
            <p className="text-sm text-gray-600">
              Time remaining:{' '}
              <span className={`font-bold ${timeLeft < 60 ? 'text-red-500' : 'text-purple-600'}`}>
                {formatTime(timeLeft)}
              </span>
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-6">
              {error}
            </div>
          )}

          {/* Verify Button */}
          <button
            onClick={handleVerifyOtp}
            disabled={loading || otp.join('').length !== 6}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
          >
            {loading ? 'Verifying...' : 'Verify OTP'}
          </button>

          {/* Resend OTP */}
          <div className="text-center">
            {canResend ? (
              <button
                onClick={handleResendOtp}
                disabled={loading}
                className="text-sm text-purple-600 hover:text-purple-800 font-medium disabled:opacity-50"
              >
                Resend OTP
              </button>
            ) : (
              <p className="text-sm text-gray-500">
                Didn't receive the code? Wait until timer expires
              </p>
            )}
          </div>

          {/* Back Button */}
          <div className="text-center mt-6">
            <button
              onClick={() => navigate('/forgot-password')}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              ← Change email address
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}