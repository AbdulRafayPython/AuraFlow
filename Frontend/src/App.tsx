import { useState, useEffect } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import AuthPageWrapper from '@/pages/AuthPageWrapper';
import Welcome from './components/onboarding/Welcome';
import WorkspaceSetup from './components/onboarding/WorkspaceSetup';
import ProfileSetup from './components/onboarding/ProfileSetup';
import MainLayout from './components/layout/MainLayout';
import Dashboard from '@/pages/Dashboard';

function AppRouter() {
  const { user, isAuthenticated, updateUser } = useAuth(); // Added updateUser from AuthContext
  const [onboardingStep, setOnboardingStep] = useState(1);

  useEffect(() => {
    // Reset onboarding step when user changes
    if (user?.isFirstLogin) {
      setOnboardingStep(1);
    }
  }, [user]);

  // Not logged in - show your existing AuthPage
  if (!isAuthenticated) {
    return <AuthPageWrapper />;
  }

  // First-time login - show onboarding flow
  if (user?.isFirstLogin) {
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
            // Update user to mark onboarding as complete
            try {
              if (updateUser) {
                await updateUser({ ...user, isFirstLogin: false });
              }
              // No need to setOnboardingStep, as user.isFirstLogin change will trigger dashboard rendering
            } catch (error) {
              console.error("Failed to update user:", error);
              alert("Error completing onboarding. Please try again.");
            }
          }}
          onBack={() => setOnboardingStep(2)}
        />
      );
    }
  }

  // Returning user or onboarding complete - show main app
  return (
    <MainLayout>
      <Dashboard />
    </MainLayout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <AppRouter />
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}