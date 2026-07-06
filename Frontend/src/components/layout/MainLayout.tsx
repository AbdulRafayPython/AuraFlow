// components/layout/MainLayout.tsx
import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { useEdgeSwipe } from "@/hooks/use-edge-swipe";
import { channelService } from "@/services/channelService";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

// Lazy: needed only when /settings is opened on top of /community/:id so the
// Dashboard stays mounted underneath the modal.
const DashboardLazy = lazy(() => import("@/pages/Dashboard"));

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { isDarkMode } = useTheme();
  const { currentCommunity, selectCommunity, currentChannel, selectChannel, channels, communities, isLoadingCommunities } = useRealtime();
  const { selectConversation } = useDirectMessages();
  const { friends } = useFriends();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const [selectedDMUser, setSelectedDMUser] = useState<{ id: number; username: string; display_name: string; avatar_url?: string } | null>(null);
  // Tracks which DM conversation we've already told the context to load, so we
  // don't refetch on every friends-list update.
  const loadedDMRef = useRef<number | null>(null);
  // The URL now carries an opaque public_id, not the int id DirectMessageView
  // needs — tracks which public_id we've already resolved (or failed to
  // resolve) via the backend lookup, so we don't refetch on every render.
  const dmLookupRef = useRef<string | null>(null);
  const [dmLookupNotFound, setDmLookupNotFound] = useState(false);
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

  // Remember the last non-settings view + location so the underlying content
  // stays mounted when the Settings modal overlay opens. Without this the
  // chat would unmount and have to refetch when settings closes.
  const lastNonSettingsViewRef = useRef<typeof currentView>(currentView);
  const lastNonSettingsLocationRef = useRef(location);
  useEffect(() => {
    if (currentView !== "settings") {
      lastNonSettingsViewRef.current = currentView;
      lastNonSettingsLocationRef.current = location;
    }
  }, [currentView, location]);
  const effectiveView =
    currentView === "settings"
      ? lastNonSettingsViewRef.current
      : currentView;

  // Check if we're on an agent page or discover page (use effectiveView so
  // that opening /settings doesn't visually unmount these layouts).
  const isAgentPage = effectiveView === "agent";
  const isDiscoverPage = effectiveView === "discover";

  // The /dm/:userId URL segment is now an opaque public_id (UUID), not the
  // int id DirectMessageView needs, so we can no longer render an instant
  // placeholder parsed straight from the URL the way communities do — the
  // resolution below (friends list, then backend lookup) has to complete
  // first. See the loading branch in the render tree.
  const dmUserToRender = selectedDMUser;

  // --- URL → State sync: community ---
  useEffect(() => {
    const communityIdStr = params.communityId;
    if (communityIdStr) {
      const communityId = communityIdStr;
      if (currentCommunity?.id !== communityId) {
        // Only select if community exists in loaded communities list
        const exists = communities.find(c => c.id === communityId);
        if (exists) {
          selectCommunity(communityId);
        } else if (!isLoadingCommunities && communities.length > 0) {
          // Communities finished loading but this one isn't in the list
          // User was likely removed/blocked — redirect to home
          navigate('/', { replace: true });
        }
      }
    } else if (
      currentView !== "dashboard" &&
      currentView !== "agent" &&
      currentView !== "discover" &&
      currentView !== "settings"
    ) {
      // Non-community route: clear community selection.
      // Settings is treated as an overlay — keep the community selected so
      // the chat is still mounted when the modal closes.
      if (currentCommunity) {
        selectCommunity(null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.communityId, communities, currentView, isLoadingCommunities]);

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
      // At /community/:id without /channel/:id — auto-select the first non-voice
      // channel (voice channels have no message view to land on) and update the URL.
      const firstChannel = channels.find(c => c.type !== 'voice') || channels[0];
      selectChannel(firstChannel.id);
      navigate(`/community/${params.communityId}/channel/${firstChannel.id}`, { replace: true });
    }
  }, [params.channelId, params.communityId, channels, currentChannel, navigate, selectChannel]);

  // --- URL → State sync: DM user ---
  // params.userId is now an opaque public_id (UUID), not the int id
  // DirectMessageView/selectConversation need. Resolve it in two steps:
  // fast path against the already-loaded friends list, falling back to a
  // backend lookup for DM history with someone no longer on that list.
  useEffect(() => {
    if (currentView !== "direct-message") {
      loadedDMRef.current = null;
      dmLookupRef.current = null;
      setDmLookupNotFound(false);
      return;
    }
    const publicId = params.userId;
    if (!publicId) return;

    const applyResolved = (resolved: { id: number; username: string; display_name: string; avatar_url?: string }) => {
      if (selectedDMUser?.id !== resolved.id || !selectedDMUser?.username) {
        setSelectedDMUser(resolved);
      }
      if (loadedDMRef.current !== resolved.id) {
        loadedDMRef.current = resolved.id;
        selectConversation(resolved.id);
      }
    };

    const friend = friends.find(f => f.public_id === publicId);
    if (friend) {
      applyResolved({ id: friend.id, username: friend.username, display_name: friend.display_name, avatar_url: friend.avatar_url });
      return;
    }

    // Not a current friend — fall back to the backend, but only once per
    // public_id (avoid refiring on every friends-list update while we wait).
    if (dmLookupRef.current !== publicId) {
      dmLookupRef.current = publicId;
      setDmLookupNotFound(false);
      channelService.getUserByPublicId(publicId).then(user => {
        if (dmLookupRef.current !== publicId) return; // URL moved on while this was in flight
        if (user) {
          applyResolved(user);
        } else {
          setDmLookupNotFound(true);
        }
      }).catch(() => {
        if (dmLookupRef.current === publicId) setDmLookupNotFound(true);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, params.userId, friends]);

  // A resolved-but-stale/invalid DM link (404 from the lookup) bounces to
  // the friends list rather than getting stuck on a loading spinner forever.
  useEffect(() => {
    if (dmLookupNotFound) {
      navigate('/friends', { replace: true });
    }
  }, [dmLookupNotFound, navigate]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends]);

  // Auto-close the mobile menu when we cross into desktop width.
  useEffect(() => {
    if (!isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

  // Edge-pull from the left edge opens the sidebar drawer.
  // Only active on mobile, when the drawer is closed, and only inside views
  // where the drawer is actually reachable (chat / DM / friends pages).
  useEdgeSwipe({
    enabled:
      isMobile &&
      !mobileMenuOpen &&
      (currentView === "dashboard" ||
        currentView === "direct-message" ||
        currentView === "friends" ||
        currentView === "home"),
    onSwipe: () => setMobileMenuOpen(true),
  });

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
      if (friend?.public_id) {
        navigate(`/dm/${friend.public_id}`);
        return;
      }
    }
    setMobileMenuOpen(false);
  };

  const handleOpenDM = async (friendId: number) => {
    const friend = friends.find(f => f.id === friendId);
    if (friend?.public_id) {
      try {
        setSelectedDMUser({
          id: friend.id,
          username: friend.username,
          display_name: friend.display_name,
          avatar_url: friend.avatar_url
        });
        await selectConversation(friendId);
        navigate(`/dm/${friend.public_id}`);
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

  // Inside an active conversation (a channel's chat, or a DM), the message
  // composer sits at the very bottom of the view — same spot the fixed
  // bottom nav occupies on mobile, so the nav would sit on top of/hide it.
  // Standard chat-app pattern (WhatsApp/Discord/Telegram mobile): hide the
  // tab bar once you've drilled into a conversation; the hamburger drawer
  // remains the way back out.
  const isInActiveChat =
    (effectiveView === "direct-message" && !!dmUserToRender) ||
    (hasCommunitySelected && effectiveView === "dashboard" && !isAgentPage && !isDiscoverPage);

  return (
    <div 
      className="flex h-screen overflow-hidden transition-colors duration-300"
      style={{ background: 'var(--theme-bg-gradient)' }}
    >
      {/* Desktop: Friends Sidebar - Always Visible */}
      <div className="hidden md:flex flex-shrink-0">
        <FriendsSidebar 
          onNavigate={handleNavigation} 
          currentView={currentView} 
          selectedCommunity={currentCommunity?.id.toString()}
          isMembersModalOpen={isMembersModalOpen}
          isCommunityManagementModalOpen={isCommunityManagementModalOpen}
        />
      </div>

      {/* Desktop: Channel Sidebar - Show when community is selected and not on agent/discover page */}
      {effectiveView === "dashboard" && hasCommunitySelected && !isAgentPage && !isDiscoverPage && (
        <div className="hidden md:flex flex-shrink-0">
          <ChannelSidebar
            onNavigate={handleNavigation}
            onMembersModalChange={setIsMembersModalOpen}
            onCommunityManagementModalChange={setIsCommunityManagementModalOpen}
          />
        </div>
      )}

      {/* Mobile Menu Button — hamburger toggles the Sheet drawer below.
          Hidden while the drawer is open so it doesn't sit on top of the
          drawer's own header/close button. */}
      {!mobileMenuOpen && (
        <button
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation"
          className={`md:hidden fixed top-4 left-4 z-[60] p-3 rounded-xl transition-colors shadow-lg
            bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]`}
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Mobile Sidebars: Friends + Channels as a left-slide Sheet drawer.
          Replaces the hand-rolled overlay with Radix's accessible sheet —
          gives us focus-trap, ESC handling, scroll-lock, and animation. */}
      {isMobile && (
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent
            side="left"
            className="p-0 w-[88vw] max-w-[420px] sm:max-w-[420px] bg-transparent border-0 overflow-hidden"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-full overflow-x-auto snap-x snap-mandatory pt-safe pb-safe">
              <div className="w-full flex-shrink-0 h-full overflow-y-auto snap-start">
                <FriendsSidebar
                  onNavigate={(v) => { handleNavigation(v); setMobileMenuOpen(false); }}
                  currentView={currentView}
                  selectedCommunity={currentCommunity?.id.toString()}
                  hideIconRail
                />
              </div>
              {effectiveView === "dashboard" && hasCommunitySelected && !isAgentPage && !isDiscoverPage && (
                <div className="w-full flex-shrink-0 h-full overflow-y-auto snap-start">
                  <ChannelSidebar
                    onNavigate={(v) => { handleNavigation(v); setMobileMenuOpen(false); }}
                  />
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        {isAgentPage || isDiscoverPage || effectiveView === "not-found" ? (
          // Agent/Discover/NotFound pages take full width
          <div className="flex-1 overflow-hidden">
            <div className="h-full overflow-hidden">
              {children}
            </div>
          </div>
        ) : effectiveView === "home" ? (
          <div className="flex-1 overflow-y-auto pb-24 md:pb-0">
            <HomePage />
          </div>
        ) : effectiveView === "friends" ? (
          <div className="flex-1 overflow-hidden pb-24 md:pb-0">
            <Friends onOpenDM={handleOpenDM} />
          </div>
        ) : effectiveView === "direct-message" && dmUserToRender ? (
          <div className="flex-1 overflow-hidden">
            <DirectMessageView
              userId={dmUserToRender.id}
              username={dmUserToRender.username}
              displayName={dmUserToRender.display_name}
              avatar={dmUserToRender.avatar_url}
              onClose={handleCloseDM}
            />
          </div>
        ) : effectiveView === "direct-message" ? (
          // public_id in the URL hasn't resolved yet (friends list still
          // loading, or the backend lookup is in flight) — dmLookupNotFound
          // handles the invalid-link case by redirecting away.
          <div className="flex items-center justify-center h-full bg-[hsl(var(--theme-bg-primary))]">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-[hsl(var(--theme-accent-primary))] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-[hsl(var(--theme-text-secondary))]">Loading conversation...</p>
            </div>
          </div>
        ) : hasCommunitySelected ? (
          // Show main content (Dashboard) when a community is selected.
          // When the Settings overlay is open, `children` is null (the route
          // is /settings), so we mount Dashboard directly to keep the chat
          // visible behind the modal.
          <div className="flex-1 flex overflow-hidden">
            <div
              className={`flex-1 overflow-hidden bg-[hsl(var(--theme-bg-primary))] ${
                currentView === "settings" ? "pointer-events-none select-none" : ""
              }`}
              aria-hidden={currentView === "settings" ? true : undefined}
            >
              {currentView === "settings" ? (
                <Suspense fallback={null}>
                  <DashboardLazy />
                </Suspense>
              ) : (
                children
              )}
            </div>
          </div>
        ) : effectiveView === "dashboard" ? (
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

      {/* Mobile Bottom Navigation — hidden when the drawer is open or while
          inside an active chat (see isInActiveChat above). */}
      {isMobile && !mobileMenuOpen && !isInActiveChat && (
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

      {/* Settings is rendered as a fixed overlay (z-9999) so the underlying
          view (Dashboard, Home, Friends, etc.) stays mounted behind it.
          Closing the modal returns to that view instantly — no reload. */}
      {currentView === "settings" && <SettingsPage />}
    </div>
  );
}
