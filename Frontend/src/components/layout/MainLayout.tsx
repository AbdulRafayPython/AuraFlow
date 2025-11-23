// components/layout/MainLayout.tsx
import React, { useState } from "react";
import { Menu, X } from "lucide-react";
import FriendsSidebar from "../sidebar/FriendsSidebar";
import ChannelSidebar from "../sidebar/ChannelSidebar";
import RightSidebar from "../sidebar/RightSidebar";
import Friends from "@/pages/Friends";
import { useTheme } from "../../contexts/ThemeContext";
import { useRealtime } from "@/contexts/RealtimeContext";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { isDarkMode } = useTheme();
  const { currentCommunity, selectCommunity, currentChannel } = useRealtime();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentView, setCurrentView] = useState<"dashboard" | "friends" | "settings">("dashboard");
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);

  const handleNavigation = (view: string, communityId?: string) => {
    setCurrentView(view as "dashboard" | "friends" | "settings");
    if (view === "dashboard" && communityId) {
      selectCommunity(parseInt(communityId));
    } else if (view === "dashboard" && !communityId) {
      // Navigate to dashboard without community
    }
    setMobileMenuOpen(false);
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
        className={`md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg transition-colors ${
          isDarkMode 
            ? 'bg-slate-800 text-white hover:bg-slate-700' 
            : 'bg-white text-gray-900 hover:bg-gray-100'
        } shadow-lg`}
      >
        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex bg-black bg-opacity-50">
          <div className="flex">
            <div className="flex-shrink-0">
              <FriendsSidebar 
                onNavigate={handleNavigation} 
                currentView={currentView}
                selectedCommunity={currentCommunity?.id.toString()}
              />
            </div>
            {currentView === "dashboard" && hasCommunitySelected && (
              <div className="flex-shrink-0">
                <ChannelSidebar 
                  onNavigate={handleNavigation}
                />
              </div>
            )}
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {currentView === "friends" ? (
          <Friends />
        ) : currentView === "settings" ? (
          <div className={`flex items-center justify-center h-full ${
            isDarkMode ? 'bg-slate-700' : 'bg-gray-50'
          }`}>
            <div className={`text-center ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              <h2 className="text-2xl font-bold mb-2">Settings</h2>
              <p className="text-gray-500">Settings page coming soon...</p>
            </div>
          </div>
        ) : hasCommunitySelected ? (
          // Show main content (Dashboard) when a community is selected
          <div className={`flex-1 overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-white'}`}>
            {React.cloneElement(children as React.ReactElement, { toggleRightSidebar })}
          </div>
        ) : (
          // Welcome screen when no community is selected
          <div className={`flex items-center justify-center h-full ${
            isDarkMode ? 'bg-slate-700' : 'bg-gray-50'
          }`}>
            <div className={`text-center max-w-2xl px-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              <div className="mb-8">
                <h1 className="text-4xl font-bold mb-3">Welcome to AuroFlow</h1>
                <p className={`text-lg ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  Select a community from the sidebar to access channels and start collaborating.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                <div className={`p-6 rounded-xl transition-all hover:scale-105 ${
                  isDarkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200 shadow-sm'
                }`}>
                  <div className="text-4xl mb-4">💬</div>
                  <h3 className="font-semibold text-lg mb-2">Real-time Chat</h3>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    Instant messaging with WebSocket connections
                  </p>
                </div>
                
                <div className={`p-6 rounded-xl transition-all hover:scale-105 ${
                  isDarkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200 shadow-sm'
                }`}>
                  <div className="text-4xl mb-4">🤖</div>
                  <h3 className="font-semibold text-lg mb-2">AI Agents</h3>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    Smart assistants to help with tasks and analysis
                  </p>
                </div>
                
                <div className={`p-6 rounded-xl transition-all hover:scale-105 ${
                  isDarkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200 shadow-sm'
                }`}>
                  <div className="text-4xl mb-4">👥</div>
                  <h3 className="font-semibold text-lg mb-2">Collaborate</h3>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    Work together with your team in real-time
                  </p>
                </div>
              </div>

              <div className="mt-12">
                <p className={`text-sm ${isDarkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                  💡 <strong>Tip:</strong> Use the friends button to manage your connections
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar - Only show on dashboard with selected community */}
      {currentView === "dashboard" && hasCommunitySelected && (
        <div className={`flex-shrink-0 transition-all duration-200 ${
          isRightSidebarCollapsed ? 'w-0 overflow-hidden' : 'w-64 lg:flex'
        }`}>
          <RightSidebar isCollapsed={isRightSidebarCollapsed} />
        </div>
      )}
    </div>
  );
}