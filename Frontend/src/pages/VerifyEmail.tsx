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
      icon: <Loader2 className="w-16 h-16 text-[hsl(var(--theme-text-accent))] animate-spin" />,
      title: 'Verifying your email…',
      color: 'text-[hsl(var(--theme-text-accent))]',
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">

      <div className="relative z-10 w-full max-w-md bg-card text-card-foreground border border-border rounded-lg p-8 text-center">
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center">
          <img src="/AuraflowLogo.png" alt="Auraflow" className="w-14 h-14 mb-2" />
          <h1 className="text-2xl font-bold text-[hsl(var(--theme-text-accent))] tracking-wide">Auraflow</h1>
        </div>

        {/* State icon */}
        <div className="flex justify-center mb-4">{cfg.icon}</div>
        <h2 className={`text-xl font-semibold mb-2 ${cfg.color}`}>{cfg.title}</h2>
        <p className="text-muted-foreground text-sm mb-6">{message}</p>

        {/* Success → go to login */}
        {state === 'success' && (
          <button
            onClick={() => navigate('/')}
            className="w-full py-2.5 bg-primary hover:bg-primary text-foreground text-sm font-medium rounded-lg transition-colors"
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
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {resending && <Loader2 className="w-4 h-4 animate-spin" />}
                {resending ? 'Sending…' : 'Resend Verification Email'}
              </button>
            )}
            <button
              onClick={() => navigate('/')}
              className="w-full py-2.5 border border-border text-muted-foreground text-sm font-medium rounded-lg hover:bg-accent transition-colors"
            >
              Back to Login
            </button>
          </div>
        )}

        {/* Error → back to login */}
        {state === 'error' && (
          <button
            onClick={() => navigate('/')}
            className="w-full py-2.5 border border-border text-muted-foreground text-sm font-medium rounded-lg hover:bg-accent transition-colors"
          >
            Back to Login
          </button>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
