import { useState, useEffect, Suspense, lazy } from 'react';
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
import { AgentModalsProvider } from './contexts/AgentModalsContext';
import { CommunityDashboardProvider } from './contexts/CommunityDashboardContext';
import { MediaViewerProvider } from './contexts/MediaViewerContext';
import MediaViewer from './components/media/MediaViewer';
import { useRealtime } from './hooks/useRealtime';
import AuthPageWrapper from '@/pages/AuthPageWrapper';
import MainLayout from './components/layout/MainLayout';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from './components/ui/toaster';
import { ModerationToastListener } from './components/ModerationToast';
import { AgentEventListener } from './components/AgentEventListener';
import { AgentActivityTimeline } from './components/AgentActivityTimeline';
import IncomingCallOverlay from './components/call/IncomingCallOverlay';
import OutgoingCallOverlay from './components/call/OutgoingCallOverlay';
import CallScreen from './components/call/CallScreen';
import { CallAudioRenderer } from './components/call/CallScreen';
import VoiceDock from './components/voice/VoiceDock';
import VoiceRoomModal from './components/voice/VoiceRoomModal';
import FaviconBadge from './components/FaviconBadge';
import { ErrorBoundary } from 'react-error-boundary';

// Lazy-loaded pages
const Welcome = lazy(() => import('./components/onboarding/Welcome'));
const WorkspaceSetup = lazy(() => import('./components/onboarding/WorkspaceSetup'));
const ProfileSetup = lazy(() => import('./components/onboarding/ProfileSetup'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const AgentDetails = lazy(() => import('@/pages/AgentDetails'));
const DiscoverCommunities = lazy(() => import('@/pages/DiscoverCommunities'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const OtpVerification = lazy(() => import('./pages/OtpVerification'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));

// Admin Dashboard Pages (lazy) - Community Admin
const AdminLayout = lazy(() => import('./pages/admin').then(m => ({ default: m.AdminLayout })));
const AdminOverview = lazy(() => import('./pages/admin').then(m => ({ default: m.AdminOverview })));
const FlaggedContent = lazy(() => import('./pages/admin').then(m => ({ default: m.FlaggedContent })));
const BlockedUsers = lazy(() => import('./pages/admin').then(m => ({ default: m.BlockedUsers })));
const CommunityHealth = lazy(() => import('./pages/admin').then(m => ({ default: m.CommunityHealth })));
const EngagementAnalytics = lazy(() => import('./pages/admin').then(m => ({ default: m.EngagementAnalytics })));
const MoodTrends = lazy(() => import('./pages/admin').then(m => ({ default: m.MoodTrends })));
const UserManagement = lazy(() => import('./pages/admin').then(m => ({ default: m.UserManagement })));
const CommunityManagement = lazy(() => import('./pages/admin').then(m => ({ default: m.CommunityManagement })));
const AIAgentsManagement = lazy(() => import('./pages/admin').then(m => ({ default: m.AIAgentsManagement })));
const AgentSettings = lazy(() => import('./pages/admin').then(m => ({ default: m.AgentSettings })));
const AgentGoals = lazy(() => import('./pages/admin').then(m => ({ default: m.AgentGoals })));
const Announcements = lazy(() => import('./pages/admin').then(m => ({ default: m.Announcements })));

// System Admin Dashboard Pages (lazy) - Platform-wide Admin
const SystemAdminLogin = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SystemAdminLogin })));
const SystemAdminLayout = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SystemAdminLayout })));
const SystemAdminOverview = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SystemAdminOverview })));
const SysFlaggedContent = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SysFlaggedContent })));
const SysBlockedUsers = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SysBlockedUsers })));
const SysUserManagement = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SysUserManagement })));
const SysCommunityHealth = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SysCommunityHealth })));
const SysMoodTrends = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SysMoodTrends })));
const SysEngagementAnalytics = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SysEngagementAnalytics })));
const SysAgentMetrics = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SysAgentMetrics })));
const SysAgentCollaboration = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SysAgentCollaboration })));
const SysReports = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SysReports })));
const SysCommunityManagement = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SysCommunityManagement })));
const SysAIAgentsManagement = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SysAIAgentsManagement })));
const SysPlatformSettings = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SysPlatformSettings })));
const SysAuditLogs = lazy(() => import('./pages/system-admin').then(m => ({ default: m.SysAuditLogs })));

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="flex items-center justify-center w-full h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="flex flex-col items-center gap-4 text-center p-6">
        <h2 className="text-white text-xl font-semibold">Something went wrong</h2>
        <p className="text-gray-400 text-sm max-w-md">{error.message}</p>
        <button onClick={resetErrorBoundary} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
          Try again
        </button>
      </div>
    </div>
  );
}

/**
 * Skeleton placeholder that mirrors the app shell (sidebars + chat area) while
 * a lazy route or initial workspace data is loading. Replaces the old full-page
 * spinner so navigation feels instant rather than blocked.
 */
const AppShellSkeleton = () => (
  <div className="flex w-full h-screen bg-[hsl(var(--theme-bg-primary,222_47%_11%))] text-[hsl(var(--theme-text-primary,210_40%_98%))] overflow-hidden">
    {/* Community rail */}
    <div className="hidden md:flex w-[72px] flex-col items-center gap-3 py-4 border-r border-white/5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="w-10 h-10 rounded-2xl bg-white/5 animate-pulse" />
      ))}
    </div>
    {/* Channel sidebar */}
    <div className="hidden lg:flex w-60 flex-col gap-2 px-3 py-4 border-r border-white/5">
      <div className="h-6 w-32 rounded bg-white/5 animate-pulse mb-2" />
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="h-7 w-full rounded bg-white/5 animate-pulse" style={{ opacity: 1 - i * 0.08 }} />
      ))}
      <div className="mt-auto flex items-center gap-2 pt-3 border-t border-white/5">
        <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
        <div className="flex-1 space-y-1">
          <div className="h-3 w-20 rounded bg-white/10 animate-pulse" />
          <div className="h-2 w-14 rounded bg-white/5 animate-pulse" />
        </div>
      </div>
    </div>
    {/* Main column */}
    <div className="flex-1 flex flex-col min-w-0">
      <div className="h-12 border-b border-white/5 flex items-center px-4 gap-3">
        <div className="h-5 w-40 rounded bg-white/5 animate-pulse" />
        <div className="ml-auto h-7 w-7 rounded-full bg-white/5 animate-pulse" />
      </div>
      <div className="flex-1 px-4 sm:px-8 py-6 space-y-5 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-white/5 animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 rounded bg-white/5 animate-pulse" />
              <div className="h-3 rounded bg-white/5 animate-pulse" style={{ width: `${60 + ((i * 13) % 30)}%` }} />
              {i % 2 === 0 && (
                <div className="h-3 rounded bg-white/5 animate-pulse" style={{ width: `${40 + ((i * 7) % 35)}%` }} />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="h-14 border-t border-white/5 mx-4 sm:mx-8 mb-4 rounded-lg bg-white/5 animate-pulse" />
    </div>
  </div>
);

const PageSpinner = AppShellSkeleton;

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

  // Loading communities after login (but not first login) — show app-shell skeleton
  // instead of a centered spinner so the layout doesn't visibly "pop in".
  if (isLoadingCommunities) {
    return <AppShellSkeleton />;
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
    <ErrorBoundary FallbackComponent={ErrorFallback}>
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
                      <AgentModalsProvider>
                      <MediaViewerProvider>
                        <BrowserRouter>
                          <Suspense fallback={<PageSpinner />}>
                          <ModerationToastListener />
                          <AgentEventListener />
                          <AgentActivityTimeline />
                          <Routes>
                            <Route path="/forgot-password" element={<ForgotPassword />} />
                            <Route path="/otp-verification" element={<OtpVerification />} />
                            <Route path="/reset-password" element={<ResetPassword />} />
                            <Route path="/verify-email" element={<VerifyEmail />} />
                            {/* System Admin Routes (separate flow from community admin) */}
                            <Route path="/system-admin/login" element={<SystemAdminLogin />} />
                            <Route path="/system-admin" element={<SystemAdminLayout />}>
                              <Route index element={<SystemAdminOverview />} />
                              <Route path="moderation">
                                <Route path="flagged" element={<SysFlaggedContent />} />
                                <Route path="blocked" element={<SysBlockedUsers />} />
                              </Route>
                              <Route path="users" element={<SysUserManagement />} />
                              <Route path="communities" element={<SysCommunityManagement />} />
                              <Route path="agents" element={<SysAIAgentsManagement />} />
                              <Route path="analytics">
                                <Route path="health" element={<SysCommunityHealth />} />
                                <Route path="engagement" element={<SysEngagementAnalytics />} />
                                <Route path="mood" element={<SysMoodTrends />} />
                                <Route path="agents" element={<SysAgentMetrics />} />
                                <Route path="agent-collaboration" element={<SysAgentCollaboration />} />
                              </Route>
                              <Route path="reports" element={<SysReports />} />
                              <Route path="audit-logs" element={<SysAuditLogs />} />
                              <Route path="settings" element={<SysPlatformSettings />} />
                            </Route>
                            {/* Community Admin Dashboard Routes (wrapped with CommunityDashboardProvider) */}
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
                              <Route path="communities" element={<CommunityManagement />} />
                              <Route path="agents" element={<AIAgentsManagement />} />
                              <Route path="agents/settings" element={<AgentSettings />} />
                              <Route path="agents/goals" element={<AgentGoals />} />
                              <Route path="announcements" element={<Announcements />} />
                            </Route>
                            <Route path="/*" element={<AppRouter />} />
                          </Routes>
                          </Suspense>
                          <MediaViewer />
                          <FaviconBadge />
                          <VoiceDock />
                          <VoiceRoomModal />
                          <IncomingCallOverlay />
                          <OutgoingCallOverlay />
                          <CallScreen />
                          <CallAudioRenderer />
                          <Toaster />
                        </BrowserRouter>
                      </MediaViewerProvider>
                      </AgentModalsProvider>
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
    </ErrorBoundary>
  );
}
