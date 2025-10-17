import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    // Start animation immediately
    setAnimate(true);
    
    // Complete after animation
    const timer = setTimeout(() => {
      onComplete();
    }, 2500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Futuristic Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
      
      <div className="text-center relative z-10">
        {/* Animated Logo */}
        <div 
          className={`mb-8 transition-all duration-1000 ${
            animate ? 'scale-110 opacity-100' : 'scale-75 opacity-0'
          }`}
        >
          <div className="relative mx-auto w-32 h-32 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center shadow-large">
            <Zap className="w-16 h-16 text-primary-foreground animate-pulse" />
            {/* Neon Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary to-accent rounded-2xl blur-2xl opacity-60 animate-pulse scale-150"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-primary to-accent rounded-2xl shadow-neon"></div>
          </div>
        </div>

        {/* Brand Name */}
        <div 
          className={`transition-all duration-1000 delay-300 ${
            animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-4">
            AuraFlow
          </h1>
          <p className="text-lg text-muted-foreground font-medium">
            Next-Gen AI Communication
          </p>
        </div>

        {/* Loading indicator */}
        <div 
          className={`mt-12 transition-all duration-1000 delay-700 ${
            animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          <div className="flex justify-center space-x-3">
            <div className="w-3 h-3 bg-primary rounded-full animate-bounce shadow-neon"></div>
            <div className="w-3 h-3 bg-accent rounded-full animate-bounce delay-100 shadow-neon"></div>
            <div className="w-3 h-3 bg-primary rounded-full animate-bounce delay-200 shadow-neon"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;