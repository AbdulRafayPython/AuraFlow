// components/layout/MainLayout.tsx
import React, { useState, useEffect, useMemo } from "react";
import { Menu, X, Home as HomeIcon, Users, Settings } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import FriendsSidebar from "../sidebar/FriendsSidebar";
import ChannelSidebar from "../sidebar/ChannelSidebar";
import Friends from "@/pages/Friends";
import SettingsPage from "@/pages/Settings";
import HomePage from "@/pages/Home";
import { DirectMessageView } from "../DirectMessageView";
import { useTheme } from "../../contexts/ThemeContext";
import { useRealtime } from "@/hooks/useRealtime";
import { useDirectMessages } from "@/contexts/DirectMessagesContext";
import { useFriends } from "@/contexts/FriendsContext";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { isDarkMode } = useTheme();
  const { currentCommunity, selectCommunity, currentChannel, selectChannel, channels, communities } = useRealtime();
  const { selectConversation } = useDirectMessages();
  const { friends } = useFriends();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedDMUser, setSelectedDMUser] = useState<{ id: number; username: string; display_name: string; avatar_url?: string } | null>(null);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isCommunityManagementModalOpen, setIsCommunityManagementModalOpen] = useState(false);

  // Derive current view from URL pathname
  const currentView = useMemo(() => {
    const pathname = location.pathname;
    if (pathname.startsWith('/community/')) return "dashboard" as const;
    if (pathname.startsWith('/agent/')) return "agent" as const;
    if (pathname === '/discover') return "discover" as const;
    if (pathname === '/friends') return "friends" as const;
    if (pathname === '/settings') return "settings" as const;
    if (pathname.startsWith('/dm/')) return "direct-message" as const;
    if (pathname === '/') return "home" as const;
    return "not-found" as const;
  }, [location.pathname]);

  // Check if we're on an agent page or discover page
  const isAgentPage = currentView === "agent";
  const isDiscoverPage = currentView === "discover";

  // --- URL → State sync: community ---
  useEffect(() => {
    const communityIdStr = params.communityId;
    if (communityIdStr) {
      const communityId = parseInt(communityIdStr, 10);
      if (!isNaN(communityId) && currentCommunity?.id !== communityId) {
        // Only select if community exists in loaded communities list
        const exists = communities.find(c => c.id === communityId);
        if (exists) {
          selectCommunity(communityId);
        }
      }
    } else if (currentView !== "dashboard" && currentView !== "agent" && currentView !== "discover") {
      // Non-community route: clear community selection
      if (currentCommunity) {
        selectCommunity(null);
      }
    }
  }, [params.communityId, communities, currentView]);

  // --- URL → State sync: channel (after channels are loaded) ---
  // --- URL → State sync: channel (after channels are loaded) ---
  useEffect(() => {
    const channelIdStr = params.channelId;
    if (channelIdStr && channels.length > 0) {
      const channelId = parseInt(channelIdStr, 10);
      if (!isNaN(channelId) && currentChannel?.id !== channelId) {
        const exists = channels.find(c => c.id === channelId);
        if (exists) {
          selectChannel(channelId);
        }
      }
    } else if (!channelIdStr && params.communityId && channels.length > 0 && !currentChannel) {
      // At /community/:id without /channel/:id — auto-select first channel and update URL
      const firstChannel = channels[0];
      selectChannel(firstChannel.id);
      navigate(`/community/${params.communityId}/channel/${firstChannel.id}`, { replace: true });
    }
  }, [params.channelId, params.communityId, channels, currentChannel, navigate, selectChannel]);

  // --- URL → State sync: DM user ---
  useEffect(() => {
    if (currentView === "direct-message") {
      const userIdStr = params.userId;
      if (userIdStr) {
        const userId = parseInt(userIdStr, 10);
        if (!isNaN(userId) && selectedDMUser?.id !== userId) {
          const friend = friends.find(f => f.id === userId);
          if (friend) {
            setSelectedDMUser({
              id: friend.id,
              username: friend.username,
              display_name: friend.display_name,
              avatar_url: friend.avatar_url
            });
            selectConversation(userId);
          }
        }
      }
    }
  }, [currentView, params.userId, friends]);

  // Listen for navigate-home events from RealtimeContext (community deleted/left/removed)
  useEffect(() => {
    const handler = () => navigate('/');
    window.addEventListener('auraflow:navigate-home', handler);
    return () => window.removeEventListener('auraflow:navigate-home', handler);
  }, [navigate]);

  // Listen for custom event to open DMs from anywhere (e.g., profile popover)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.userId) {
        handleOpenDM(detail.userId);
      }
    };
    window.addEventListener('auraflow:open-dm', handler);
    return () => window.removeEventListener('auraflow:open-dm', handler);
  }, [friends]);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen, isMobile]);

  const handleNavigation = (view: string, communityId?: string) => {
    if (view === "home") {
      navigate('/');
    } else if (view === "dashboard" && communityId) {
      navigate(`/community/${communityId}`);
    } else if (view === "friends") {
      navigate('/friends');
    } else if (view === "settings") {
      navigate('/settings');
    } else if (view === "direct-message" && communityId) {
      // communityId is overloaded as userId for DMs
      const userId = parseInt(communityId);
      const friend = friends.find(f => f.id === userId);
      if (friend) {
        navigate(`/dm/${userId}`);
        return;
      }
    }
    setMobileMenuOpen(false);
  };

  const handleOpenDM = async (friendId: number) => {
    const friend = friends.find(f => f.id === friendId);
    if (friend) {
      try {
        setSelectedDMUser({
          id: friend.id,
          username: friend.username,
          display_name: friend.display_name,
          avatar_url: friend.avatar_url
        });
        await selectConversation(friendId);
        navigate(`/dm/${friendId}`);
        setMobileMenuOpen(false);
      } catch (error) {
        console.error("Failed to open DM:", error);
      }
    }
  };

  const handleCloseDM = () => {
    navigate('/friends');
    setSelectedDMUser(null);
  };

  const hasCommunitySelected = currentCommunity !== null;

  return (
    <div 
      className="flex h-screen overflow-hidden transition-colors duration-300"
      style={{ background: 'var(--theme-bg-gradient)' }}
    >
      {/* Desktop: Friends Sidebar - Always Visible */}
      <div className="hidden md:flex flex-shrink-0 relative z-[200]">
        <FriendsSidebar 
          onNavigate={handleNavigation} 
          currentView={currentView} 
          selectedCommunity={currentCommunity?.id.toString()}
          isMembersModalOpen={isMembersModalOpen}
          isCommunityManagementModalOpen={isCommunityManagementModalOpen}
        />
      </div>

      {/* Desktop: Channel Sidebar - Show when community is selected and not on agent/discover page */}
      {currentView === "dashboard" && hasCommunitySelected && !isAgentPage && !isDiscoverPage && (
        <div className="hidden md:flex flex-shrink-0 relative z-[50]">
          <ChannelSidebar 
            onNavigate={handleNavigation}
            onMembersModalChange={setIsMembersModalOpen}
            onCommunityManagementModalChange={setIsCommunityManagementModalOpen}
          />
        </div>
      )}

      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className={`md:hidden fixed top-4 left-4 z-[60] p-3 rounded-xl transition-all shadow-lg ${
          mobileMenuOpen 
            ? 'bg-red-500 hover:bg-red-600 text-white' 
            : 'bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]'
        }`}
      >
        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile Overlay & Sidebars */}
      {mobileMenuOpen && isMobile && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          
          {/* Sidebars Container */}
          <div className="relative flex max-w-[85vw] h-full overflow-x-auto">
            {/* Friends Sidebar */}
            <div className="flex-shrink-0 h-full overflow-y-auto">
              <FriendsSidebar 
                onNavigate={handleNavigation} 
                currentView={currentView}
                selectedCommunity={currentCommunity?.id.toString()}
              />
            </div>
            
            {/* Channel Sidebar - Show when community is selected and not on agent/discover page */}
            {currentView === "dashboard" && hasCommunitySelected && !isAgentPage && !isDiscoverPage && (
              <div className="flex-shrink-0 h-full overflow-y-auto">
                <ChannelSidebar 
                  onNavigate={handleNavigation}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative z-[10]">
        {isAgentPage || isDiscoverPage || currentView === "not-found" ? (
          // Agent/Discover/NotFound pages take full width
          <div className="flex-1 overflow-hidden">
            <div className="h-full overflow-hidden">
              {children}
            </div>
          </div>
        ) : currentView === "home" ? (
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--theme-bg-tertiary)) transparent' }}>
            <HomePage />
          </div>
        ) : currentView === "friends" ? (
          <div className="flex-1 overflow-hidden">
            <Friends onOpenDM={handleOpenDM} />
          </div>
        ) : currentView === "settings" ? (
          <div className="flex-1 overflow-hidden">
            <SettingsPage />
          </div>
        ) : currentView === "direct-message" && selectedDMUser ? (
          <div className="flex-1 overflow-hidden">
            <DirectMessageView 
              userId={selectedDMUser.id} 
              username={selectedDMUser.username} 
              displayName={selectedDMUser.display_name}
              avatar={selectedDMUser.avatar_url} 
              onClose={handleCloseDM} 
            />
          </div>
        ) : hasCommunitySelected ? (
          // Show main content (Dashboard) when a community is selected
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-hidden bg-[hsl(var(--theme-bg-primary))]">
              {children}
            </div>
          </div>
        ) : currentView === "dashboard" ? (
          // Community route but community not loaded yet - show loading
          <div className="flex items-center justify-center h-full bg-[hsl(var(--theme-bg-primary))]">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-[hsl(var(--theme-accent-primary))] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-[hsl(var(--theme-text-secondary))]">Loading community...</p>
            </div>
          </div>
        ) : (
          // Welcome screen when no community is selected
          <div className="flex items-center justify-center h-full overflow-y-auto bg-[hsl(var(--theme-bg-primary))]">
            <div className="text-center max-w-2xl px-4 sm:px-6 py-8 pt-14 md:pt-8 text-[hsl(var(--theme-text-primary))]">
              <div className="mb-8 sm:mb-12">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4">
                  Welcome to AuroFlow
                </h1>
                <p className="text-base sm:text-lg text-[hsl(var(--theme-text-secondary))]">
                  Select a community from the sidebar to access channels and start collaborating.
                </p>
              </div>
              
              {/* Feature Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-8 sm:mt-12">
                <div className="p-5 sm:p-6 rounded-xl sm:rounded-2xl transition-all hover:scale-105 bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))]">
                  <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">💬</div>
                  <h3 className="font-semibold text-base sm:text-lg mb-2">Real-time Chat</h3>
                  <p className="text-xs sm:text-sm text-[hsl(var(--theme-text-secondary))]">
                    Instant messaging with WebSocket connections
                  </p>
                </div>
                
                <div className="p-5 sm:p-6 rounded-xl sm:rounded-2xl transition-all hover:scale-105 bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))]">
                  <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">🤖</div>
                  <h3 className="font-semibold text-base sm:text-lg mb-2">AI Agents</h3>
                  <p className="text-xs sm:text-sm text-[hsl(var(--theme-text-secondary))]">
                    Smart assistants to help with tasks and analysis
                  </p>
                </div>
                
                <div className="p-5 sm:p-6 rounded-xl sm:rounded-2xl transition-all hover:scale-105 sm:col-span-2 lg:col-span-1 bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))]">
                  <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">👥</div>
                  <h3 className="font-semibold text-base sm:text-lg mb-2">Collaborate</h3>
                  <p className="text-xs sm:text-sm text-[hsl(var(--theme-text-secondary))]">
                    Work together with your team in real-time
                  </p>
                </div>
              </div>

              {/* Tip Section */}
              <div className="mt-8 sm:mt-12">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[hsl(var(--theme-accent-primary)/0.1)] border border-[hsl(var(--theme-accent-primary)/0.3)]">
                  <span className="text-lg">💡</span>
                  <p className="text-xs sm:text-sm text-[hsl(var(--theme-text-secondary))]">
                    <strong className="text-[hsl(var(--theme-text-primary))]">Tip:</strong> Use the friends button to manage your connections
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation - Only show when no menu is open */}
      {isMobile && !mobileMenuOpen && (
        <div className={`md:hidden fixed bottom-0 left-0 right-0 z-40 border-t ${
          isDarkMode 
            ? 'bg-slate-900/95 border-slate-700 backdrop-blur-lg' 
            : 'bg-white/95 border-gray-200 backdrop-blur-lg'
        }`} style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="flex items-center justify-around px-2 py-2 max-w-md mx-auto">
            <button
              onClick={() => handleNavigation("home")}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                currentView === "home"
                  ? isDarkMode
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-500 text-white'
                  : isDarkMode
                    ? 'text-gray-400 hover:bg-slate-800'
                    : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <HomeIcon className="w-5 h-5" />
              <span className="text-xs font-medium">Home</span>
            </button>

            <button
              onClick={() => handleNavigation("friends")}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                currentView === "friends"
                  ? isDarkMode
                    ? 'bg-green-600 text-white'
                    : 'bg-green-500 text-white'
                  : isDarkMode
                    ? 'text-gray-400 hover:bg-slate-800'
                    : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="text-xs font-medium">Friends</span>
            </button>

            <button
              onClick={() => handleNavigation("settings")}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                currentView === "settings"
                  ? isDarkMode
                    ? 'bg-purple-600 text-white'
                    : 'bg-purple-500 text-white'
                  : isDarkMode
                    ? 'text-gray-400 hover:bg-slate-800'
                    : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span className="text-xs font-medium">Settings</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}