import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import authService from '@/services/authService';
import { Loader2, CheckCircle2, XCircle, MailWarning } from 'lucide-react';

type VerifyState = 'loading' | 'success' | 'error' | 'expired';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<VerifyState>('loading');
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  useEffect(() => {
    if (!token || !email) {
      setState('error');
      setMessage('Invalid verification link. Missing token or email.');
      return;
    }

    authService
      .verifyEmail(token, email)
      .then((data) => {
        setState('success');
        setMessage(data.message || 'Email verified successfully!');
      })
      .catch((err: any) => {
        const errorMsg = err.message || 'Verification failed';
        if (errorMsg.toLowerCase().includes('expired')) {
          setState('expired');
        } else {
          setState('error');
        }
        setMessage(errorMsg);
      });
  }, [token, email]);

  const handleResend = async () => {
    if (!email || resending) return;
    setResending(true);
    setResendSuccess(false);
    try {
      await authService.resendVerification(email);
      setResendSuccess(true);
    } catch {
      setMessage('Failed to resend. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const stateConfig = {
    loading: {
      icon: <Loader2 className="w-16 h-16 text-indigo-400 animate-spin" />,
      title: 'Verifying your email…',
      color: 'text-indigo-400',
    },
    success: {
      icon: <CheckCircle2 className="w-16 h-16 text-emerald-400" />,
      title: 'Email Verified!',
      color: 'text-emerald-400',
    },
    error: {
      icon: <XCircle className="w-16 h-16 text-red-400" />,
      title: 'Verification Failed',
      color: 'text-red-400',
    },
    expired: {
      icon: <MailWarning className="w-16 h-16 text-amber-400" />,
      title: 'Link Expired',
      color: 'text-amber-400',
    },
  };

  const cfg = stateConfig[state];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a0b2e] p-4">
      {/* Background glow */}
      <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-purple-600/30 rounded-full filter blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/3 w-[300px] h-[300px] bg-indigo-500/20 rounded-full filter blur-[100px]" />

      <div className="relative z-10 w-full max-w-md bg-slate-800/95 backdrop-blur-xl rounded-xl shadow-2xl p-8 text-center">
        {/* Logo */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-purple-400 tracking-wide">AuraFlow</h1>
        </div>

        {/* State icon */}
        <div className="flex justify-center mb-4">{cfg.icon}</div>
        <h2 className={`text-xl font-semibold mb-2 ${cfg.color}`}>{cfg.title}</h2>
        <p className="text-gray-400 text-sm mb-6">{message}</p>

        {/* Success → go to login */}
        {state === 'success' && (
          <button
            onClick={() => navigate('/')}
            className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Continue to Login
          </button>
        )}

        {/* Expired → resend */}
        {state === 'expired' && (
          <div className="space-y-3">
            {resendSuccess ? (
              <p className="text-emerald-400 text-sm">A new verification email has been sent!</p>
            ) : (
              <button
                onClick={handleResend}
                disabled={resending}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {resending && <Loader2 className="w-4 h-4 animate-spin" />}
                {resending ? 'Sending…' : 'Resend Verification Email'}
              </button>
            )}
            <button
              onClick={() => navigate('/')}
              className="w-full py-2.5 border border-slate-600 text-gray-300 text-sm font-medium rounded-lg hover:bg-slate-700/50 transition-colors"
            >
              Back to Login
            </button>
          </div>
        )}

        {/* Error → back to login */}
        {state === 'error' && (
          <button
            onClick={() => navigate('/')}
            className="w-full py-2.5 border border-slate-600 text-gray-300 text-sm font-medium rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            Back to Login
          </button>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
