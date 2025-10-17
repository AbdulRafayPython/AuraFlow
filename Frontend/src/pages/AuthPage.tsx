import { useState } from "react";
import AuthCard from "@/components/AuthCard";

interface AuthPageProps {
  onAuth: () => void;
}

const AuthPage = ({ onAuth }: AuthPageProps) => {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#1a0b2e]">
      {/* Deep purple futuristic background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Base gradient - deep purple tones */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a0b2e] via-[#2d1b69] to-[#0f0a1e]" />
        
        {/* Large glowing orbs - purple/blue */}
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-600/40 rounded-full filter blur-[120px] animate-blob" />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-indigo-500/30 rounded-full filter blur-[100px] animate-blob animation-delay-2000" />
        <div className="absolute bottom-1/4 left-1/2 w-[350px] h-[350px] bg-blue-600/25 rounded-full filter blur-[90px] animate-blob animation-delay-4000" />
        
        {/* Smaller accent glows */}
        <div className="absolute top-[15%] right-[35%] w-32 h-32 bg-purple-400/50 rounded-full filter blur-[60px]" />
        <div className="absolute bottom-[20%] right-[15%] w-24 h-24 bg-indigo-400/40 rounded-full filter blur-[50px]" />
        <div className="absolute top-[60%] left-[10%] w-20 h-20 bg-blue-400/35 rounded-full filter blur-[40px]" />
        
        {/* Floating particles - stars effect */}
        <div className="absolute inset-0">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full animate-float"
              style={{
                width: `${2 + Math.random() * 4}px`,
                height: `${2 + Math.random() * 4}px`,
                background: `rgba(${150 + Math.random() * 105}, ${100 + Math.random() * 155}, 255, ${0.3 + Math.random() * 0.4})`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${8 + Math.random() * 12}s`,
                boxShadow: `0 0 ${4 + Math.random() * 8}px rgba(147, 112, 219, 0.6)`
              }}
            />
          ))}
        </div>

        {/* Subtle texture overlay */}
        <div className="absolute inset-0 opacity-[0.03]">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, rgba(147, 112, 219, 0.4) 1px, transparent 0)`,
            backgroundSize: '60px 60px'
          }} />
        </div>

        {/* Vignette effect */}
        <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-[#0a0515]/60" />
      </div>
      
      <div className="relative z-10">
        <AuthCard 
          mode={authMode}
          onModeChange={setAuthMode}
          onAuth={onAuth}
        />
      </div>

      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0; }
          10% { opacity: 0.3; }
          50% { transform: translateY(-100px) translateX(50px); opacity: 0.6; }
          90% { opacity: 0.3; }
        }
        .animate-float {
          animation: float linear infinite;
        }
      `}</style>
    </div>
  );
};

export default AuthPage;