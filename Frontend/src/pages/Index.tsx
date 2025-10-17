import { useState } from "react";
import SplashScreen from "@/components/SplashScreen";
import AuthPage from "@/pages/AuthPage";
import MainLayout from "@/components/layout/MainLayout";
import Dashboard from "@/pages/Dashboard";

const Index = () => {
  const [appState, setAppState] = useState<'splash' | 'auth' | 'dashboard'>('splash');

  const handleSplashComplete = () => {
    // Check if user is already logged in
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    setAppState(isLoggedIn ? 'dashboard' : 'auth');
  };

  const handleAuth = () => {
    localStorage.setItem('isLoggedIn', 'true');
    setAppState('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    setAppState('auth');
  };

  // Splash screen - show before auth/dashboard
  if (appState === 'splash') {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  // Auth page - show login/signup
  if (appState === 'auth') {
    return <AuthPage onAuth={handleAuth} />;
  }

  // Dashboard - main app with layout
  if (appState === 'dashboard') {
    return (
      <MainLayout>
        <Dashboard />
      </MainLayout>
    );
  }

  return null;
};

export default Index;