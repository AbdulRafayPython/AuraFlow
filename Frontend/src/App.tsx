import { useState, useEffect } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { FriendsProvider } from './contexts/FriendsContext';
import { DirectMessagesProvider } from './contexts/DirectMessagesContext';
import { RealtimeProvider } from './contexts/RealtimeContext';
import { VoiceProvider } from './contexts/VoiceContext';
import { CallProvider } from './contexts/CallContext';
import { NotificationsProvider } from './contexts/NotificationsContext';
import { AIAgentProvider } from './contexts/AIAgentContext';
import { CommunityDashboardProvider } from './contexts/CommunityDashboardContext';
import { MediaViewerProvider } from './contexts/MediaViewerContext';
import MediaViewer from './components/media/MediaViewer';
import { useRealtime } from './hooks/useRealtime';
import AuthPageWrapper from '@/pages/AuthPageWrapper';
import Welcome from './components/onboarding/Welcome';
import WorkspaceSetup from './components/onboarding/WorkspaceSetup';
import ProfileSetup from './components/onboarding/ProfileSetup';
import MainLayout from './components/layout/MainLayout';
import Dashboard from '@/pages/Dashboard';
import AgentDetails from '@/pages/AgentDetails';
import DiscoverCommunities from '@/pages/DiscoverCommunities';
import Home from '@/pages/Home';
import NotFound from '@/pages/NotFound';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ForgotPassword from './pages/ForgotPassword';
import OtpVerification from './pages/OtpVerification';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import { Toaster } from './components/ui/toaster';
import { ModerationToastListener } from './components/ModerationToast';
import IncomingCallOverlay from './components/call/IncomingCallOverlay';
import OutgoingCallOverlay from './components/call/OutgoingCallOverlay';
import CallScreen from './components/call/CallScreen';
import { CallAudioRenderer } from './components/call/CallScreen';
import VoiceDock from './components/voice/VoiceDock';
import VoiceRoomModal from './components/voice/VoiceRoomModal';
// Admin Dashboard Pages
import {
  AdminLayout,
  AdminOverview,
  FlaggedContent,
  BlockedUsers,
  CommunityHealth,
  EngagementAnalytics,
  MoodTrends,
  UserManagement,
  Reports
} from './pages/admin';

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
  return (
    <Routes>
      {/* Community routes with dynamic segments */}
      <Route path="/community/:communityId/channel/:channelId" element={
        <MainLayout>
          <Dashboard />
        </MainLayout>
      } />
      <Route path="/community/:communityId" element={
        <MainLayout>
          <Dashboard />
        </MainLayout>
      } />
      {/* Standalone pages */}
      <Route path="/discover" element={
        <MainLayout>
          <DiscoverCommunities />
        </MainLayout>
      } />
      <Route path="/agent/:agentId" element={
        <MainLayout>
          <AgentDetails />
        </MainLayout>
      } />
      {/* Views handled internally by MainLayout */}
      <Route path="/friends" element={<MainLayout>{null}</MainLayout>} />
      <Route path="/settings" element={<MainLayout>{null}</MainLayout>} />
      <Route path="/dm/:userId" element={<MainLayout>{null}</MainLayout>} />
      <Route path="/" element={<MainLayout>{null}</MainLayout>} />
      {/* 404 fallback */}
      <Route path="*" element={
        <MainLayout>
          <NotFound />
        </MainLayout>
      } />
    </Routes>
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
                    <CallProvider>
                    <AIAgentProvider>
                      <MediaViewerProvider>
                        <BrowserRouter>
                          <ModerationToastListener />
                          <Routes>
                            <Route path="/forgot-password" element={<ForgotPassword />} />
                            <Route path="/otp-verification" element={<OtpVerification />} />
                            <Route path="/reset-password" element={<ResetPassword />} />
                            <Route path="/verify-email" element={<VerifyEmail />} />
                            {/* Admin Dashboard Routes (wrapped with CommunityDashboardProvider) */}
                            <Route path="/admin" element={
                              <CommunityDashboardProvider>
                                <AdminLayout />
                              </CommunityDashboardProvider>
                            }>
                              <Route index element={<AdminOverview />} />
                              <Route path="moderation">
                                <Route path="flagged" element={<FlaggedContent />} />
                                <Route path="blocked" element={<BlockedUsers />} />
                              </Route>
                              <Route path="users" element={<UserManagement />} />
                              <Route path="analytics">
                                <Route path="health" element={<CommunityHealth />} />
                                <Route path="engagement" element={<EngagementAnalytics />} />
                                <Route path="mood" element={<MoodTrends />} />
                              </Route>
                              <Route path="reports" element={<Reports />} />
                            </Route>
                            <Route path="/*" element={<AppRouter />} />
                          </Routes>
                          <MediaViewer />
                          <VoiceDock />
                          <VoiceRoomModal />
                          <IncomingCallOverlay />
                          <OutgoingCallOverlay />
                          <CallScreen />
                          <CallAudioRenderer />
                          <Toaster />
                        </BrowserRouter>
                      </MediaViewerProvider>
                    </AIAgentProvider>
                    </CallProvider>
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
