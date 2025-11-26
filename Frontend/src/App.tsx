import { useState, useEffect } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { FriendsProvider } from './contexts/FriendsContext';
import { RealtimeProvider } from './contexts/RealtimeContext';
import AuthPageWrapper from '@/pages/AuthPageWrapper';
import Welcome from './components/onboarding/Welcome';
import WorkspaceSetup from './components/onboarding/WorkspaceSetup';
import ProfileSetup from './components/onboarding/ProfileSetup';
import MainLayout from './components/layout/MainLayout';
import Dashboard from '@/pages/Dashboard';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ForgotPassword from './pages/ForgotPassword';
import OtpVerification from './pages/OtpVerification';
import ResetPassword from './pages/ResetPassword';

function AppRouter() {
  const { user, isAuthenticated, completeOnboarding } = useAuth();
  const [onboardingStep, setOnboardingStep] = useState(1);

  useEffect(() => {
    // Reset onboarding step when user changes
    if (user?.is_first_login) {
      setOnboardingStep(1);
    }
  }, [user]);

  // Not logged in - show auth page
  if (!isAuthenticated) {
    return <AuthPageWrapper />;
  }

  // First-time login - show onboarding flow
  if (user?.is_first_login) {
    if (onboardingStep === 1) {
      return <Welcome onContinue={() => setOnboardingStep(2)} />;
    }
    if (onboardingStep === 2) {
      return (
        <WorkspaceSetup
          onContinue={() => setOnboardingStep(3)}
          onBack={() => setOnboardingStep(1)}
        />
      );
    }
    if (onboardingStep === 3) {
      return (
        <ProfileSetup
          onComplete={async () => {
            try {
              await completeOnboarding();
              // user.is_first_login change will trigger re-render to dashboard
            } catch (error) {
              console.error("Failed to complete onboarding:", error);
              alert("Error completing onboarding. Please try again.");
            }
          }}
          onBack={() => setOnboardingStep(2)}
        />
      );
    }
  }

  // Returning user or onboarding complete - show main app with real-time support
  return (
    <RealtimeProvider>
      <MainLayout>
        <Dashboard />
      </MainLayout>
    </RealtimeProvider>
  );
}


export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <FriendsProvider>
            <AppRouter />
          </FriendsProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
