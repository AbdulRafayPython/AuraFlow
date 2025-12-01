// components/layout/MainLayout.tsx
import React, { useState, useEffect } from "react";
import { Menu, X, Home, Users, Settings } from "lucide-react";
import FriendsSidebar from "../sidebar/FriendsSidebar";
import ChannelSidebar from "../sidebar/ChannelSidebar";
import RightSidebar from "../sidebar/RightSidebar";
import Friends from "@/pages/Friends";
import SettingsPage from "@/pages/Settings";
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
  const { currentCommunity, selectCommunity, currentChannel } = useRealtime();
  const { selectConversation } = useDirectMessages();
  const { friends } = useFriends();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentView, setCurrentView] = useState<"dashboard" | "friends" | "settings" | "direct-message">("dashboard");
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedDMUser, setSelectedDMUser] = useState<{ id: number; username: string; display_name: string; avatar_url?: string } | null>(null);

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
    setCurrentView(view as "dashboard" | "friends" | "settings" | "direct-message");
    if (view === "dashboard" && communityId) {
      selectCommunity(parseInt(communityId));
    } else if (view === "dashboard" && !communityId) {
      // Navigate to dashboard without community
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
        setCurrentView("direct-message");
        setMobileMenuOpen(false);
      } catch (error) {
        console.error("Failed to open DM:", error);
      }
    }
  };

  const handleCloseDM = () => {
    setCurrentView("friends");
    setSelectedDMUser(null);
  };

  const toggleRightSidebar = () => {
    setIsRightSidebarCollapsed(!isRightSidebarCollapsed);
  };

  const hasCommunitySelected = currentCommunity !== null;

  return (
    <div className={`flex h-screen overflow-hidden ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
      {/* Desktop: Friends Sidebar - Always Visible */}
      <div className="hidden md:flex flex-shrink-0">
        <FriendsSidebar 
          onNavigate={handleNavigation} 
          currentView={currentView} 
          selectedCommunity={currentCommunity?.id.toString()}
        />
      </div>

      {/* Desktop: Channel Sidebar - Show when community is selected */}
      {currentView === "dashboard" && hasCommunitySelected && (
        <div className="hidden md:flex flex-shrink-0">
          <ChannelSidebar 
            onNavigate={handleNavigation}
          />
        </div>
      )}

      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className={`md:hidden fixed top-4 left-4 z-[60] p-3 rounded-xl transition-all shadow-lg ${
          mobileMenuOpen 
            ? 'bg-red-500 hover:bg-red-600 text-white' 
            : isDarkMode 
              ? 'bg-slate-800 text-white hover:bg-slate-700' 
              : 'bg-white text-gray-900 hover:bg-gray-100'
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
            
            {/* Channel Sidebar - Show when community is selected */}
            {currentView === "dashboard" && hasCommunitySelected && (
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
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {currentView === "friends" ? (
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
            <div className={`flex-1 overflow-hidden ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
              {React.cloneElement(children as React.ReactElement, { toggleRightSidebar })}
            </div>
            
            {/* Right Sidebar - Desktop & Tablet */}
            <div className={`hidden lg:flex flex-shrink-0 transition-all duration-200 ${
              isRightSidebarCollapsed ? 'w-0 overflow-hidden' : 'w-64'
            }`}>
              <RightSidebar isCollapsed={isRightSidebarCollapsed} />
            </div>
          </div>
        ) : (
          // Welcome screen when no community is selected
          <div className={`flex items-center justify-center h-full overflow-y-auto ${
            isDarkMode ? 'bg-slate-900' : 'bg-gray-50'
          }`}>
            <div className={`text-center max-w-2xl px-4 sm:px-6 py-8 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              <div className="mb-8 sm:mb-12">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4">
                  Welcome to AuroFlow
                </h1>
                <p className={`text-base sm:text-lg ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  Select a community from the sidebar to access channels and start collaborating.
                </p>
              </div>
              
              {/* Feature Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-8 sm:mt-12">
                <div className={`p-5 sm:p-6 rounded-xl sm:rounded-2xl transition-all hover:scale-105 ${
                  isDarkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200 shadow-sm'
                }`}>
                  <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">💬</div>
                  <h3 className="font-semibold text-base sm:text-lg mb-2">Real-time Chat</h3>
                  <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    Instant messaging with WebSocket connections
                  </p>
                </div>
                
                <div className={`p-5 sm:p-6 rounded-xl sm:rounded-2xl transition-all hover:scale-105 ${
                  isDarkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200 shadow-sm'
                }`}>
                  <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">🤖</div>
                  <h3 className="font-semibold text-base sm:text-lg mb-2">AI Agents</h3>
                  <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    Smart assistants to help with tasks and analysis
                  </p>
                </div>
                
                <div className={`p-5 sm:p-6 rounded-xl sm:rounded-2xl transition-all hover:scale-105 sm:col-span-2 lg:col-span-1 ${
                  isDarkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200 shadow-sm'
                }`}>
                  <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">👥</div>
                  <h3 className="font-semibold text-base sm:text-lg mb-2">Collaborate</h3>
                  <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    Work together with your team in real-time
                  </p>
                </div>
              </div>

              {/* Tip Section */}
              <div className="mt-8 sm:mt-12">
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
                  isDarkMode ? 'bg-slate-800 border border-slate-700' : 'bg-blue-50 border border-blue-200'
                }`}>
                  <span className="text-lg">💡</span>
                  <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    <strong className={isDarkMode ? 'text-white' : 'text-gray-900'}>Tip:</strong> Use the friends button to manage your connections
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
        } safe-bottom`}>
          <div className="flex items-center justify-around px-2 py-2 max-w-md mx-auto">
            <button
              onClick={() => handleNavigation("dashboard")}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                currentView === "dashboard"
                  ? isDarkMode
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-500 text-white'
                  : isDarkMode
                    ? 'text-gray-400 hover:bg-slate-800'
                    : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Home className="w-5 h-5" />
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