import { useState, useEffect } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { FriendsProvider } from './contexts/FriendsContext';
import { DirectMessagesProvider } from './contexts/DirectMessagesContext';
import { RealtimeProvider } from './contexts/RealtimeContext';
import { VoiceProvider } from './contexts/VoiceContext';
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
import { Toaster } from './components/ui/toaster';

function AppRouter() {
  const { user, isAuthenticated, completeOnboarding } = useAuth();
  const { isLoadingWorkspaces, error, clearError } = useWorkspace();
  const [onboardingStep, setOnboardingStep] = useState(1);

  useEffect(() => {
    // Reset onboarding step when user changes
    if (user?.is_first_login) {
      setOnboardingStep(1);
    }
  }, [user]);

  // Show error notifications
  useEffect(() => {
    if (error) {
      console.error('[AppRouter] Workspace error:', error);
      // Clear error after 5 seconds
      const timer = setTimeout(clearError, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  // Not logged in - show auth page
  if (!isAuthenticated) {
    return <AuthPageWrapper />;
  }

  // Loading workspaces
  if (isLoadingWorkspaces && !user?.is_first_login) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white text-lg font-medium">Loading workspace...</p>
        </div>
      </div>
    );
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
              // Error toast is shown by the completeOnboarding function
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
            <DirectMessagesProvider>
              <VoiceProvider>
                <BrowserRouter>
                  <Routes>
                    <Route path="/*" element={<AppRouter />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/otp-verification" element={<OtpVerification />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                  </Routes>
                  <Toaster />
                </BrowserRouter>
              </VoiceProvider>
            </DirectMessagesProvider>
          </FriendsProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
