import { useState, useEffect } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { FriendsProvider } from './contexts/FriendsContext';
import { DirectMessagesProvider } from './contexts/DirectMessagesContext';
import { RealtimeProvider } from './contexts/RealtimeContext';
import { VoiceProvider } from './contexts/VoiceContext';
import { NotificationsProvider } from './contexts/NotificationsContext';
import { AIAgentProvider } from './contexts/AIAgentContext';
import { useRealtime } from './hooks/useRealtime';
import AuthPageWrapper from '@/pages/AuthPageWrapper';
import Welcome from './components/onboarding/Welcome';
import WorkspaceSetup from './components/onboarding/WorkspaceSetup';
import ProfileSetup from './components/onboarding/ProfileSetup';
import MainLayout from './components/layout/MainLayout';
import Dashboard from '@/pages/Dashboard';
import AgentDetails from '@/pages/AgentDetails';
import Home from '@/pages/Home';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ForgotPassword from './pages/ForgotPassword';
import OtpVerification from './pages/OtpVerification';
import ResetPassword from './pages/ResetPassword';
import { Toaster } from './components/ui/toaster';
import { ModerationToastListener } from './components/ModerationToast';

function AppRouter() {
  const { user, isAuthenticated, completeOnboarding } = useAuth();
  const { isLoadingCommunities, communities } = useRealtime();
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
              // Error toast is shown by the completeOnboarding function
            }
          }}
          onBack={() => setOnboardingStep(2)}
        />
      );
    }
  }

  // Loading communities after login (but not first login)
  if (isLoadingCommunities) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white text-lg font-medium">Loading workspace...</p>
        </div>
      </div>
    );
  }

  // Returning user or onboarding complete - show main app with real-time support
  // Show Home page if no communities, otherwise show Dashboard
  return (
    <MainLayout>
      {communities.length === 0 ? <Home /> : <Dashboard />}
    </MainLayout>
  );
}


export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RealtimeProvider>
          <WorkspaceProvider>
            <NotificationsProvider>
              <FriendsProvider>
                <DirectMessagesProvider>
                  <VoiceProvider>
                    <AIAgentProvider>
                      <BrowserRouter>
                        <ModerationToastListener />
                        <Routes>
                          <Route path="/*" element={<AppRouter />} />
                          <Route path="/home" element={<Home />} />
                          <Route path="/forgot-password" element={<ForgotPassword />} />
                          <Route path="/otp-verification" element={<OtpVerification />} />
                          <Route path="/reset-password" element={<ResetPassword />} />
                          <Route path="/agent/:agentId" element={<AgentDetails />} />
                        </Routes>
                        <Toaster />
                      </BrowserRouter>
                    </AIAgentProvider>
                  </VoiceProvider>
                </DirectMessagesProvider>
              </FriendsProvider>
            </NotificationsProvider>
          </WorkspaceProvider>
        </RealtimeProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
