import { useState } from "react";
import AuthCard from "@/components/AuthCard";
import type { User } from "@/types";

interface AuthPageProps {
  onAuth: (user?: User) => void;
}

const AuthPage = ({ onAuth }: AuthPageProps) => {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  return (
    <div className="auth-page">
      {/* Deep space background */}
      <div className="auth-page__bg">
        {/* Base gradient */}
        <div className="auth-page__bg-base" />
        
        {/* Subtle star dots */}
        <div className="auth-page__stars" />
        
        {/* Large ambient glows */}
        <div className="auth-page__glow auth-page__glow--1" />
        <div className="auth-page__glow auth-page__glow--2" />
        <div className="auth-page__glow auth-page__glow--3" />
      </div>
      
      <div className="auth-page__content">
        <AuthCard 
          mode={authMode}
          onModeChange={setAuthMode}
          onAuth={onAuth}
        />
      </div>

      <style>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
          background: #0a0a1a;
        }

        .auth-page__bg {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }

        .auth-page__bg-base {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #0d0b2e 0%, #141042 30%, #0c0a24 60%, #0a0818 100%);
        }

        .auth-page__stars {
          position: absolute;
          inset: 0;
          opacity: 0.04;
          background-image: radial-gradient(circle at 2px 2px, rgba(180, 160, 255, 0.5) 1px, transparent 0);
          background-size: 80px 80px;
        }

        .auth-page__glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          animation: auth-float 12s ease-in-out infinite;
        }

        .auth-page__glow--1 {
          top: 10%;
          left: 20%;
          width: 500px;
          height: 500px;
          background: rgba(88, 52, 180, 0.15);
        }

        .auth-page__glow--2 {
          bottom: 10%;
          right: 15%;
          width: 400px;
          height: 400px;
          background: rgba(49, 46, 180, 0.12);
          animation-delay: -4s;
        }

        .auth-page__glow--3 {
          top: 50%;
          left: 60%;
          width: 300px;
          height: 300px;
          background: rgba(100, 60, 200, 0.08);
          animation-delay: -8s;
        }

        .auth-page__content {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 1100px;
        }

        @keyframes auth-float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(25px, -35px) scale(1.05); }
          66% { transform: translate(-15px, 15px) scale(0.95); }
        }
      `}</style>
    </div>
  );
};

export default AuthPage;