import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthCard from '@/components/AuthCard';
import MarketingBrand from '@/components/marketing/MarketingBrand';
import type { User } from '@/types';
import '@/styles/marketing.css';

interface AuthPageProps {
  onAuth: (user?: User) => void;
}

export default function AuthPage({ onAuth }: AuthPageProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mode = pathname === '/signup' ? 'signup' : 'login';

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <main className={`marketing marketing-auth marketing-auth--${mode}`}>
      <section className="marketing-auth__story" aria-label="About AuraFlow">
        <MarketingBrand />
        <div className="marketing-auth__story-copy">
          <h2>Good things<br />happen <span>here.</span></h2>
          <p>Communities, conversations, and a little intelligence to help everyone feel part of it.</p>
        </div>
        <img className="marketing-auth__illustration" src="/marketing/auraflow-community-hero-1280.webp" alt="" width="1280" height="853" />
        <div className="marketing-auth__story-bottom">A place to connect. A space to grow.</div>
      </section>
      <section className="marketing-auth__form-side" aria-labelledby="auth-heading">
        <div className="marketing-auth__top"><MarketingBrand tone="dark" /><Link to="/">← Back to home</Link></div>
        <div className="marketing-auth__form-wrap">
          <p className="marketing-auth__eyebrow">{mode === 'login' ? 'Welcome back' : 'Join AuraFlow'}</p>
          <h1 id="auth-heading" className="marketing-auth__heading">{mode === 'login' ? 'Pick up where you left off.' : 'Your space starts here.'}</h1>
          <p className="marketing-auth__subheading">{mode === 'login' ? 'Log in to get back to your people.' : 'Create your account and join the conversation.'}</p>
          <AuthCard mode={mode} onModeChange={(nextMode) => navigate(`/${nextMode}`)} onAuth={onAuth} />
        </div>
        <div className="marketing-auth__bottom">© {new Date().getFullYear()} AuraFlow</div>
      </section>
    </main>
  );
}
