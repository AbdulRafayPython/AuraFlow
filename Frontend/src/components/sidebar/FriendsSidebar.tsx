import { useState, useEffect } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { useFriends } from "../../contexts/FriendsContext";
import { useAuth } from "../../contexts/AuthContext";
import { Users, Plus, Home, ChevronLeft, ChevronRight, LogOut, Moon, Sun, Settings, User, Bell, Shield, Palette, HelpCircle, MessageSquare } from "lucide-react";
import CreateCommunityModal from "../modals/CreateCommunityModal";
import { channelService } from "../../services/channelService";
import { useRealtime } from "@/hooks/useRealtime";
import authService from "@/services/authService";

export interface CommunityFormData {
  name: string;
  description: string;
  icon: string;
  color: string;
}

interface FriendsSidebarProps {
  onNavigate: (view: string, communityId?: string) => void;
  currentView: string;
  selectedCommunity?: string;
}

const statusColors = {
  online: "bg-green-500",
  idle: "bg-yellow-500",
  dnd: "bg-red-500",
  offline: "bg-gray-500",
};

export default function FriendsSidebar({ onNavigate, currentView, selectedCommunity }: FriendsSidebarProps) {
  const { isDarkMode, toggleTheme } = useTheme();
  const { friendRequests } = useFriends();
  const { logout } = useAuth();
  const { 
    communities, 
    selectCommunity
  } = useRealtime();
  
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showCreateCommunityModal, setShowCreateCommunityModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userStatus, setUserStatus] = useState<'online' | 'idle' | 'dnd' | 'offline'>('online');

  // Load current user data
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const userData = await authService.getMe();
        setCurrentUser(userData);
      } catch (error) {
        console.error("Failed to load user data:", error);
      }
    };
    loadUserData();
  }, []);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showProfileMenu && !target.closest('.profile-menu-container')) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      logout();
      setShowProfileMenu(false);
    }
  };

  const handleCommunityClick = (communityId: string) => {
    const community = communities.find(c => c.id.toString() === communityId);
    if (community) {
      selectCommunity(community.id);
      onNavigate("dashboard", communityId);
    }
  };

  const handleCreateCommunity = async (data: CommunityFormData) => {
    try {
      const newCommunity = await channelService.createCommunity(data);
      await selectCommunity(newCommunity.id);
      onNavigate("dashboard", newCommunity.id.toString());
    } catch (error) {
      console.error("Failed to create community:", error);
      throw error;
    }
  };

  const getAvatarInitials = (name: string) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getCommunityColor = (index: number) => {
    const colors = ["bg-blue-600", "bg-purple-600", "bg-green-600", "bg-red-600", "bg-yellow-600", "bg-pink-600"];
    return colors[index % colors.length];
  };

  const renderUserAvatar = () => {
    if (!currentUser) return null;

    if (currentUser.avatar_url) {
      return (
        <img 
          src={currentUser.avatar_url} 
          alt={currentUser.display_name || currentUser.username} 
          className="w-full h-full rounded-full object-cover"
        />
      );
    }

    return (
      <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-white text-lg">
        {getAvatarInitials(currentUser.display_name || currentUser.username)}
      </div>
    );
  };

  const handleStatusChange = (status: 'online' | 'idle' | 'dnd' | 'offline') => {
    setUserStatus(status);
    // TODO: Send status update to server
  };

  return (
    <div className={`relative flex-shrink-0 h-full transition-all duration-200 ${isCollapsed ? 'w-0' : 'w-[72px]'}`}>
      {/* Main Content */}
      {!isCollapsed && (
        <div className={`flex flex-col items-center py-3 gap-2 w-[72px] h-full ${
          isDarkMode ? 'bg-slate-900' : 'bg-gray-100'
        }`}>
          {/* Collapse Button */}
          <button
            onClick={() => setIsCollapsed(true)}
            className={`absolute -right-3 top-3 z-50 w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-lg ${
              isDarkMode ? 'bg-slate-700 hover:bg-slate-600 border border-slate-600' : 'bg-gray-200 hover:bg-gray-300 border border-gray-300'
            }`}
            title="Collapse sidebar"
          >
            <ChevronLeft className={`w-3.5 h-3.5 ${isDarkMode ? 'text-white' : 'text-gray-900'}`} />
          </button>

          {/* Home/Dashboard Button */}
          <div
            className="relative w-full flex justify-center"
            onMouseEnter={() => setHoveredItem('home')}
            onMouseLeave={() => setHoveredItem(null)}
          >
            {currentView === "dashboard" && !selectedCommunity && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-white rounded-r-full" />
            )}
            <button
              onClick={() => onNavigate("dashboard")}
              className={`w-12 h-12 rounded-3xl flex items-center justify-center transition-all duration-200 ${
                currentView === "dashboard" && !selectedCommunity
                  ? "bg-blue-600 rounded-2xl"
                  : hoveredItem === 'home'
                    ? "bg-blue-600 rounded-2xl"
                    : isDarkMode
                      ? "bg-slate-700 hover:bg-blue-600 hover:rounded-2xl"
                      : "bg-gray-200 hover:bg-blue-600 hover:rounded-2xl text-gray-900 hover:text-white"
              }`}
            >
              <Home className={`w-6 h-6 ${isDarkMode || (currentView === "dashboard" && !selectedCommunity) || hoveredItem === 'home' ? 'text-white' : 'text-gray-900'}`} />
            </button>
            {hoveredItem === 'home' && (
              <div className={`absolute left-[72px] top-0 ml-2 px-3 py-2 text-sm font-semibold rounded-lg shadow-xl z-50 whitespace-nowrap ${
                isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-900 border border-gray-200'
              }`}>
                Home
              </div>
            )}
          </div>

          {/* Divider */}
          <div className={`h-0.5 w-8 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`} />

          {/* Friends Button */}
          <div
            className="relative w-full flex justify-center"
            onMouseEnter={() => setHoveredItem('friends')}
            onMouseLeave={() => setHoveredItem(null)}
          >
            {currentView === "friends" && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-white rounded-r-full" />
            )}
            <button
              onClick={() => onNavigate("friends")}
              className={`relative w-12 h-12 rounded-3xl flex items-center justify-center transition-all duration-200 ${
                currentView === "friends"
                  ? "bg-green-600 rounded-2xl"
                  : hoveredItem === 'friends'
                    ? "bg-green-600 rounded-2xl"
                    : isDarkMode
                      ? "bg-slate-700 hover:bg-green-600 hover:rounded-2xl"
                      : "bg-gray-200 hover:bg-green-600 hover:rounded-2xl text-gray-900 hover:text-white"
              }`}
            >
              <Users className={`w-6 h-6 ${isDarkMode || currentView === "friends" || hoveredItem === 'friends' ? 'text-white' : 'text-gray-900'}`} />
              {friendRequests.length > 0 && (
                <div className={`absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 ${
                  isDarkMode ? 'border-slate-900' : 'border-gray-100'
                }`}>
                  {friendRequests.length > 9 ? '9+' : friendRequests.length}
                </div>
              )}
            </button>
            {hoveredItem === 'friends' && (
              <div className={`absolute left-[72px] top-0 ml-2 px-3 py-2 text-sm font-semibold rounded-lg shadow-xl z-50 whitespace-nowrap ${
                isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-900 border border-gray-200'
              }`}>
                Friends
                {friendRequests.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-red-500 rounded text-xs">
                    {friendRequests.length}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className={`h-0.5 w-8 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`} />

          {/* Communities */}
          <div className="w-full flex flex-col items-center gap-2 overflow-y-auto flex-1 scrollbar-none">
            {communities.map((community, index) => {
              const communityId = community.id.toString();
              const color = getCommunityColor(index);
              const initials = community.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);

              return (
                <div
                  key={community.id}
                  className="relative w-full flex justify-center"
                  onMouseEnter={() => setHoveredItem(communityId)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  {selectedCommunity === communityId && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-white rounded-r-full" />
                  )}
                  <button
                    onClick={() => handleCommunityClick(communityId)}
                    className={`w-12 h-12 rounded-3xl flex items-center justify-center font-bold text-white text-sm transition-all duration-200 ${
                      selectedCommunity === communityId
                        ? `${color} rounded-2xl`
                        : hoveredItem === communityId
                          ? `${color} rounded-2xl`
                          : isDarkMode
                            ? `bg-slate-700 hover:${color} hover:rounded-2xl`
                            : `bg-gray-200 hover:${color} hover:rounded-2xl text-gray-900 hover:text-white`
                    }`}
                  >
                    {community.icon || initials}
                  </button>
                  {hoveredItem === communityId && (
                    <div className={`absolute left-[72px] top-0 ml-2 px-3 py-2 text-sm font-semibold rounded-lg shadow-xl z-50 whitespace-nowrap ${
                      isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-900 border border-gray-200'
                    }`}>
                      {community.name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Community */}
          <div
            className="relative w-full flex justify-center mt-2"
            onMouseEnter={() => setHoveredItem('add-community')}
            onMouseLeave={() => setHoveredItem(null)}
          >
            <button
              onClick={() => setShowCreateCommunityModal(true)}
              className={`w-12 h-12 rounded-3xl flex items-center justify-center transition-all duration-200 ${
                hoveredItem === 'add-community'
                  ? 'bg-green-600 rounded-2xl text-white'
                  : isDarkMode
                    ? 'bg-slate-700 hover:bg-green-600 hover:rounded-2xl text-green-500 hover:text-white'
                    : 'bg-gray-200 hover:bg-green-600 hover:rounded-2xl text-green-500 hover:text-white'
              }`}
              title="Create or join a community"
            >
              <Plus className="w-6 h-6" />
            </button>
            {hoveredItem === 'add-community' && (
              <div className={`absolute left-[72px] top-0 ml-2 px-3 py-2 text-sm font-semibold rounded-lg shadow-xl z-50 whitespace-nowrap ${
                isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-900 border border-gray-200'
              }`}>
                Add a Community
              </div>
            )}
          </div>

          {/* Bottom Section - User Profile */}
          <div className="flex flex-col items-center gap-2 pt-2 profile-menu-container">
            <div
              className="relative w-full flex justify-center"
              onMouseEnter={() => setHoveredItem('profile')}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <button 
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 overflow-visible ring-2 ${
                  showProfileMenu 
                    ? 'ring-blue-500 scale-105' 
                    : isDarkMode 
                      ? 'ring-slate-700 hover:ring-blue-500/50 hover:scale-105' 
                      : 'ring-gray-300 hover:ring-blue-500/50 hover:scale-105'
                }`}
              >
                <div className="w-full h-full rounded-full overflow-hidden">
                  {renderUserAvatar()}
                </div>
                <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 ${
                  isDarkMode ? 'border-slate-900' : 'border-gray-100'
                } ${statusColors[userStatus]}`} 
                style={{ transform: 'translate(25%, 25%)' }}
                />
              </button>

              {/* Professional Profile Menu */}
              {showProfileMenu && currentUser && (
                <div className={`absolute bottom-full left-full ml-2 mb-2 w-72 rounded-xl shadow-2xl border overflow-hidden z-[100] animate-in slide-in-from-bottom-2 duration-200 ${
                  isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
                }`}>
                  {/* User Info Header */}
                  <div className={`p-4 border-b ${isDarkMode ? 'bg-gradient-to-br from-slate-900/80 to-slate-800/80 border-slate-700' : 'bg-gradient-to-br from-blue-50/50 to-white border-gray-200'}`}>
                    <div className="flex items-center gap-3">
                      <div className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-blue-500 shadow-lg">
                        {renderUserAvatar()}
                        <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-3 ${
                          isDarkMode ? 'border-slate-900' : 'border-blue-50'
                        } ${statusColors[userStatus]}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-semibold text-base truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {currentUser.display_name || currentUser.username}
                        </div>
                        <div className={`text-sm truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          @{currentUser.username}
                        </div>
                        <div className={`flex items-center gap-1.5 mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          <div className={`w-2 h-2 rounded-full ${statusColors[userStatus]}`} />
                          <span className="capitalize">{userStatus}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Status Selector */}
                  <div className={`p-3 border-b ${isDarkMode ? 'border-slate-700/50' : 'border-gray-200'}`}>
                    <div className={`text-xs font-semibold mb-2 tracking-wide ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      SET STATUS
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(['online', 'idle', 'dnd', 'offline'] as const).map((status) => (
                        <button
                          key={status}
                          onClick={() => handleStatusChange(status)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            userStatus === status
                              ? isDarkMode 
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' 
                                : 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                              : isDarkMode 
                                ? 'bg-slate-700/50 hover:bg-slate-700 text-gray-300' 
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          <div className={`w-2.5 h-2.5 rounded-full ${userStatus === status ? 'bg-white' : statusColors[status]}`} />
                          <span className="capitalize">{status === 'dnd' ? 'DND' : status}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Menu Options */}
                  <div className="p-2 max-h-80 overflow-y-auto scrollbar-thin">
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onNavigate("profile");
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isDarkMode ? 'hover:bg-slate-700 text-white hover:translate-x-0.5' : 'hover:bg-gray-100 text-gray-900 hover:translate-x-0.5'
                      }`}
                    >
                      <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-slate-900' : 'bg-gray-200'}`}>
                        <User className="w-4 h-4" />
                      </div>
                      <span>My Profile</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onNavigate("settings");
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isDarkMode ? 'hover:bg-slate-700 text-white hover:translate-x-0.5' : 'hover:bg-gray-100 text-gray-900 hover:translate-x-0.5'
                      }`}
                    >
                      <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-slate-900' : 'bg-gray-200'}`}>
                        <Settings className="w-4 h-4" />
                      </div>
                      <span>Settings</span>
                    </button>

                    <button
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isDarkMode ? 'hover:bg-slate-700 text-white hover:translate-x-0.5' : 'hover:bg-gray-100 text-gray-900 hover:translate-x-0.5'
                      }`}
                    >
                      <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-slate-900' : 'bg-gray-200'}`}>
                        <Bell className="w-4 h-4" />
                      </div>
                      <span>Notifications</span>
                    </button>

                    <button
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isDarkMode ? 'hover:bg-slate-700 text-white hover:translate-x-0.5' : 'hover:bg-gray-100 text-gray-900 hover:translate-x-0.5'
                      }`}
                    >
                      <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-slate-900' : 'bg-gray-200'}`}>
                        <Shield className="w-4 h-4" />
                      </div>
                      <span>Privacy & Safety</span>
                    </button>

                    <div className={`my-2 h-px ${isDarkMode ? 'bg-slate-700/50' : 'bg-gray-200'}`} />

                    <button
                      onClick={toggleTheme}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-100 text-gray-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-slate-900' : 'bg-gray-200'}`}>
                          <Palette className="w-4 h-4" />
                        </div>
                        <span>Appearance</span>
                      </div>
                      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold ${
                        isDarkMode ? 'bg-slate-900 text-blue-400' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {isDarkMode ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
                        <span>{isDarkMode ? 'Dark' : 'Light'}</span>
                      </div>
                    </button>

                    <button
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isDarkMode ? 'hover:bg-slate-700 text-white hover:translate-x-0.5' : 'hover:bg-gray-100 text-gray-900 hover:translate-x-0.5'
                      }`}
                    >
                      <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-slate-900' : 'bg-gray-200'}`}>
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <span>Feedback</span>
                    </button>

                    <button
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isDarkMode ? 'hover:bg-slate-700 text-white hover:translate-x-0.5' : 'hover:bg-gray-100 text-gray-900 hover:translate-x-0.5'
                      }`}
                    >
                      <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-slate-900' : 'bg-gray-200'}`}>
                        <HelpCircle className="w-4 h-4" />
                      </div>
                      <span>Help & Support</span>
                    </button>

                    <div className={`my-2 h-px ${isDarkMode ? 'bg-slate-700/50' : 'bg-gray-200'}`} />

                    <button
                      onClick={handleLogout}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                        isDarkMode ? 'hover:bg-red-900/30 text-red-400 hover:translate-x-0.5' : 'hover:bg-red-50 text-red-600 hover:translate-x-0.5'
                      }`}
                    >
                      <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-red-900/20' : 'bg-red-100'}`}>
                        <LogOut className="w-4 h-4" />
                      </div>
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              )}

              {hoveredItem === 'profile' && !showProfileMenu && (
                <div className={`absolute left-[72px] top-0 ml-2 px-3 py-2 text-sm font-semibold rounded-lg shadow-xl z-50 whitespace-nowrap ${
                  isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-900 border border-gray-200'
                }`}>
                  {currentUser?.display_name || currentUser?.username || 'Your Profile'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Collapsed State - Expand Button */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          className={`absolute left-0 top-3 w-6 h-6 rounded-r-lg flex items-center justify-center transition-colors shadow-lg z-10 ${
            isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-l-0 border-slate-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border border-l-0 border-gray-200'
          }`}
          title="Expand sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Create Community Modal */}
      <CreateCommunityModal
        isOpen={showCreateCommunityModal}
        onClose={() => setShowCreateCommunityModal(false)}
        onCreateCommunity={handleCreateCommunity}
      />
    </div>
  );
}