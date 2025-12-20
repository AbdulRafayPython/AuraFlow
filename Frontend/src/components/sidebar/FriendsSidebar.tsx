import { useState, useEffect } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { useFriends } from "../../contexts/FriendsContext";
import { useAuth } from "../../contexts/AuthContext";
import { getAvatarUrl } from "@/lib/utils";
import { Users, Plus, Home, ChevronLeft, ChevronRight, LogOut, Moon, Sun, Settings, User, Bell, Shield, Palette, HelpCircle, MessageSquare, ChevronDown } from "lucide-react";
import CreateCommunityModal from "../modals/CreateCommunityModal";
import JoinCommunityModal from "../modals/JoinCommunityModal";
import FriendProfileModal from "../modals/FriendProfileModal";
import { channelService } from "../../services/channelService";
import { socketService } from "../../services/socketService";
import { useRealtime } from "@/hooks/useRealtime";
import { useDirectMessages } from "@/contexts/DirectMessagesContext";
import authService from "@/services/authService";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";

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
  const { pendingRequests, friends = [] } = useFriends();
  const { logout } = useAuth();
  const {
    communities,
    selectCommunity,
    reloadCommunities,
    selectFriend,
    currentFriend,
    userStatuses,
  } = useRealtime();
  const { conversations } = useDirectMessages();

  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showCreateCommunityModal, setShowCreateCommunityModal] = useState(false);
  const [showJoinCommunityModal, setShowJoinCommunityModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userStatus, setUserStatus] = useState<'online' | 'idle' | 'dnd' | 'offline'>('online');
  const [showFriendProfileModal, setShowFriendProfileModal] = useState(false);
  const [selectedFriendForModal, setSelectedFriendForModal] = useState<any>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [expandedFriendsSection, setExpandedFriendsSection] = useState(true);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

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

  const handleLogout = async () => {
    setShowLogoutDialog(true);
  };

  const confirmLogout = async () => {
    await logout();
    setShowProfileMenu(false);
    setShowLogoutDialog(false);
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
      await reloadCommunities();
      await selectCommunity(newCommunity.id);

      if (socketService.isConnected()) {
        socketService.broadcastCommunityCreated(newCommunity);
      }

      onNavigate("dashboard", newCommunity.id.toString());
    } catch (error) {
      console.error("Failed to create community:", error);
      throw error;
    }
  };

  const handleJoinCommunity = async (communityId: number) => {
    try {
      await channelService.joinCommunity(communityId);
      await reloadCommunities();
      await selectCommunity(communityId);
      onNavigate("dashboard", communityId.toString());
    } catch (error) {
      console.error("Failed to join community:", error);
      throw error;
    }
  };

  const getAvatarInitials = (name: string) => {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getCommunityColor = (index: number) => {
    const colors = ["bg-blue-600", "bg-purple-600", "bg-green-600", "bg-red-600", "bg-yellow-600", "bg-pink-600"];
    return colors[index % colors.length];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'idle': return 'bg-yellow-500';
      case 'dnd': return 'bg-red-500';
      case 'offline': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const handleFriendClick = (friendId: number) => {
    const friend = friends.find(f => f.id === friendId);
    if (friend) {
      selectFriend(friend.id);
      onNavigate("dashboard");
    }
  };

  const renderUserAvatar = () => {
    if (!currentUser) return null;

    if (currentUser.avatar_url) {
      return (
        <img
          src={getAvatarUrl(currentUser.avatar_url, currentUser.username)}
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
  };

  return (
    <div className={`flex-shrink-0 h-full flex transition-all duration-200 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Icon Sidebar - Always visible */}
      <div className={`flex flex-col items-center py-3 gap-2 flex-shrink-0 w-20 ${isDarkMode ? 'border-r border-slate-700' : 'border-r border-gray-200'} relative z-50`}>
        {/* Toggle Button */}
        <div className="relative group">
          <button
            onClick={() => {
              const newCollapsed = !isCollapsed;
              setIsCollapsed(newCollapsed);
              // Close detail panel when collapsing, open when expanding
              if (newCollapsed) {
                setShowDetailPanel(false);
              } else {
                onNavigate("friends");
                setShowDetailPanel(true);
              }
            }}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isDarkMode ? 'hover:bg-slate-700 text-slate-400 hover:text-white' : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'}`}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5 transition-transform duration-300" /> : <ChevronLeft className="w-5 h-5 transition-transform duration-300" />}
          </button>
          {isCollapsed && (
            <div className={`absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-[100] ${isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-900 border border-gray-200 shadow-lg'}`}>
              {isCollapsed ? "Expand" : "Collapse"}
            </div>
          )}
        </div>

        <div className={`h-0.5 w-8 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`} />

        {/* Home Button */}
        <div className="relative group w-full flex justify-center transition-all duration-300">
          {currentView === "dashboard" && !selectedCommunity && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-blue-500 rounded-r-full transition-all duration-300" />
          )}
          <button
            onClick={() => onNavigate("dashboard")}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center ${currentView === "dashboard" && !selectedCommunity ? "bg-blue-600 text-white" : isDarkMode ? "bg-slate-700 hover:bg-blue-600 text-slate-400 hover:text-white" : "bg-gray-200 hover:bg-blue-600 text-gray-600 hover:text-white"}`}
          >
            <Home className="w-5 h-5 transition-all duration-300" />
          </button>
          {isCollapsed && (
            <div className={`absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-[100] ${isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-900 border border-gray-200 shadow-lg'}`}>
              Home
            </div>
          )}
        </div>

        {/* Friends Button */}
        <div className="relative group w-full flex justify-center transition-all duration-300">
          {currentView === "friends" && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-green-500 rounded-r-full transition-all duration-300" />
          )}
          <button
            onClick={() => {
              onNavigate("friends");
            }}
            className={`relative w-12 h-12 rounded-2xl flex items-center justify-center ${currentView === "friends" ? "bg-green-600 text-white" : isDarkMode ? "bg-slate-700 hover:bg-green-600 text-slate-400 hover:text-white" : "bg-gray-200 hover:bg-green-600 text-gray-600 hover:text-white"}`}
          >
            <Users className="w-5 h-5 transition-all duration-300" />
            {pendingRequests.length > 0 && (
              <div className={`absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 transition-all duration-300 ${isDarkMode ? 'border-slate-900' : 'border-gray-50'}`}>
                {pendingRequests.length > 9 ? '9+' : pendingRequests.length}
              </div>
            )}
          </button>
          {/* FIXED: Increased z-index to z-[100] */}
          {isCollapsed && (
            <div className={`absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-[100] ${isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-900 border border-gray-200 shadow-lg'}`}>
              Friends {pendingRequests.length > 0 && `(${pendingRequests.length})`}
            </div>
          )}
        </div>

        <div className={`h-0.5 w-8 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`} />

        {/* Communities */}
        <div className={`w-full flex flex-col items-center gap-2 transition-all duration-300`}>
          {communities.map((community, index) => {
            const communityId = community.id.toString();
            const color = getCommunityColor(index);
            const initials = community.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
            const logoUrl = community.logo_url ? `${import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000'}${community.logo_url}` : null;

              return (
              <div key={community.id} className="relative group w-full flex justify-center transition-all duration-300">
                {selectedCommunity === communityId && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-white rounded-r-full transition-all duration-300" />
                )}
                <button
                  onClick={() => handleCommunityClick(communityId)}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-white text-sm transition-all overflow-hidden ${selectedCommunity === communityId ? color : isDarkMode ? `bg-slate-700 hover:${color}` : `bg-gray-200 hover:${color}`}`}
                  style={!logoUrl ? { backgroundColor: community.color || undefined } : undefined}
                >
                  {logoUrl ? (
                    <img src={logoUrl} alt={community.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="transition-all duration-300">{community.icon || initials}</span>
                  )}
                </button>
                {isCollapsed && (
                  <div className={`absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 ${isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-900 border border-gray-200 shadow-lg'}`}>
                    {community.name}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Community */}
        <div className="relative group w-full flex justify-center">
          <button
            onClick={() => setShowCreateCommunityModal(true)}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${isDarkMode ? 'bg-slate-700 hover:bg-green-600 text-green-500 hover:text-white' : 'bg-gray-200 hover:bg-green-600 text-green-600 hover:text-white'}`}
          >
            <Plus className="w-5 h-5" />
          </button>
          {/* FIXED: Increased z-index to z-[100] */}
          {isCollapsed ? (
            <div className={`absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 rounded-lg shadow-2xl overflow-hidden border opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto z-[100] ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
              <button
                onClick={() => { setShowCreateCommunityModal(true); }}
                className={`px-3 py-2 text-xs font-semibold text-left transition-colors whitespace-nowrap ${isDarkMode ? 'text-green-400 hover:bg-slate-700' : 'text-green-600 hover:bg-gray-100'}`}
              >
                Create
              </button>
              <div className={`h-px ${isDarkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
              <button
                onClick={() => setShowJoinCommunityModal(true)}
                className={`px-3 py-2 text-xs font-semibold text-left transition-colors whitespace-nowrap ${isDarkMode ? 'text-cyan-400 hover:bg-slate-700' : 'text-cyan-600 hover:bg-gray-100'}`}
              >
                Join
              </button>
            </div>
          ) : null}
        </div>

        {/* Profile - FIXED: Increased z-index to z-[60] */}
        <div className="flex flex-col items-center gap-2 mt-auto profile-menu-container relative z-[60]">
          <div className="relative group w-full flex justify-center">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ring-2 relative z-[60] ${showProfileMenu ? 'ring-blue-500 scale-105' : isDarkMode ? 'ring-slate-700 hover:ring-blue-500/50 hover:scale-105' : 'ring-gray-300 hover:ring-blue-500/50 hover:scale-105'}`}
            >
              <div className="w-full h-full rounded-full overflow-hidden">
                {renderUserAvatar()}
              </div>
              <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 ${isDarkMode ? 'border-slate-900' : 'border-gray-50'} ${statusColors[userStatus]}`} style={{ transform: 'translate(25%, 25%)' }} />
            </button>

            {/* FIXED: Increased z-index to z-[100] for profile menu */}
            {showProfileMenu && currentUser && (
              <div className={`${isCollapsed ? 'absolute' : 'fixed'} w-72 rounded-xl shadow-2xl border overflow-hidden z-[100] ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`} style={isCollapsed ? { left: 'calc(100% + 8px)', bottom: '1.5rem', transform: 'translateY(0)' } : { left: '100px', bottom: '1.5rem', transform: 'translateY(0)' }}>                <div className={`p-4 border-b ${isDarkMode ? 'bg-gradient-to-br from-slate-900/80 to-slate-800/80 border-slate-700' : 'bg-gradient-to-br from-blue-50/50 to-white border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  <div className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-blue-500 shadow-lg">
                    {renderUserAvatar()}
                    <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-3 ${isDarkMode ? 'border-slate-900' : 'border-blue-50'} ${statusColors[userStatus]}`} />
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

                <div className={`p-3 border-b ${isDarkMode ? 'border-slate-700/50' : 'border-gray-200'}`}>
                  <div className={`text-xs font-semibold mb-2 tracking-wide ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>SET STATUS</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['online', 'idle', 'dnd', 'offline'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${userStatus === status ? (isDarkMode ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'bg-blue-500 text-white shadow-lg shadow-blue-500/30') : (isDarkMode ? 'bg-slate-700/50 hover:bg-slate-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700')}`}
                      >
                        <div className={`w-2.5 h-2.5 rounded-full ${userStatus === status ? 'bg-white' : statusColors[status]}`} />
                        <span className="capitalize">{status === 'dnd' ? 'DND' : status}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`p-2 max-h-80 overflow-y-auto scrollbar ${isDarkMode ? 'scrollbar-thumb-slate-600 scrollbar-track-slate-800/30' : 'scrollbar-thumb-gray-400 scrollbar-track-gray-100'}`}>
                  <button onClick={() => { setShowProfileMenu(false); onNavigate("profile"); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-100 text-gray-900'}`}>
                    <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-slate-900' : 'bg-gray-200'}`}><User className="w-4 h-4" /></div>
                    <span>My Profile</span>
                  </button>
                  <button onClick={() => { setShowProfileMenu(false); onNavigate("settings"); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-100 text-gray-900'}`}>
                    <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-slate-900' : 'bg-gray-200'}`}><Settings className="w-4 h-4" /></div>
                    <span>Settings</span>
                  </button>
                  <button className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-100 text-gray-900'}`}>
                    <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-slate-900' : 'bg-gray-200'}`}><Bell className="w-4 h-4" /></div>
                    <span>Notifications</span>
                  </button>
                  <button className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-100 text-gray-900'}`}>
                    <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-slate-900' : 'bg-gray-200'}`}><Shield className="w-4 h-4" /></div>
                    <span>Privacy & Safety</span>
                  </button>
                  <div className={`my-2 h-px ${isDarkMode ? 'bg-slate-700/50' : 'bg-gray-200'}`} />
                  <button onClick={toggleTheme} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-100 text-gray-900'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-slate-900' : 'bg-gray-200'}`}><Palette className="w-4 h-4" /></div>
                      <span>Appearance</span>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold ${isDarkMode ? 'bg-slate-900 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                      {isDarkMode ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
                      <span>{isDarkMode ? 'Dark' : 'Light'}</span>
                    </div>
                  </button>
                  <button className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-100 text-gray-900'}`}>
                    <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-slate-900' : 'bg-gray-200'}`}><MessageSquare className="w-4 h-4" /></div>
                    <span>Feedback</span>
                  </button>
                  <button className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-100 text-gray-900'}`}>
                    <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-slate-900' : 'bg-gray-200'}`}><HelpCircle className="w-4 h-4" /></div>
                    <span>Help & Support</span>
                  </button>
                  <div className={`my-2 h-px ${isDarkMode ? 'bg-slate-700/50' : 'bg-gray-200'}`} />
                  <button onClick={handleLogout} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${isDarkMode ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-50 text-red-600'}`}>
                    <div className={`p-1.5 rounded-md ${isDarkMode ? 'bg-red-900/20' : 'bg-red-100'}`}><LogOut className="w-4 h-4" /></div>
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            )}

            {/* FIXED: Increased z-index to z-[100] for profile tooltip */}
            {!showProfileMenu && hoveredItem === 'profile' && isCollapsed && (
              <div className={`absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap pointer-events-none z-[100] ${isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-900 border border-gray-200 shadow-lg'}`}>
                {currentUser?.display_name || currentUser?.username || 'Profile'}
              </div>
            )}
            {!showProfileMenu && isCollapsed && <div onMouseEnter={() => setHoveredItem('profile')} onMouseLeave={() => setHoveredItem(null)} className="absolute inset-0 z-[59]" />}
          </div>
        </div>
      </div>

      {/* Detail Panel - Shows when expanded or during direct message, independent of view */}
      {showDetailPanel && (
        <div className={`flex-1 flex flex-col h-full border-l w-64 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
          <div className={`px-4 py-3 border-b ${isDarkMode ? 'border-slate-700/50' : 'border-gray-200'}`}>
            <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Friends & Communities</h2>
          </div>

          <div className={`flex-1 overflow-y-auto scrollbar ${isDarkMode ? 'scrollbar-thumb-slate-600 scrollbar-track-slate-800/30' : 'scrollbar-thumb-gray-400 scrollbar-track-gray-100'}`}>
            <div className="px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>Conversations</h3>
              </div>

              <div className="space-y-2">
                {conversations.filter(conv => conv.last_message).length === 0 ? (
                  <p className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-gray-500'}`}>No conversations yet</p>
                ) : (
                  // Sort conversations by most recent message first
                  [...conversations]
                    .filter(conv => conv.last_message) // Only show friends with messages
                    .sort((a, b) => {
                      const aTime = new Date(a.last_message_time || 0).getTime();
                      const bTime = new Date(b.last_message_time || 0).getTime();
                      return bTime - aTime; // Most recent first
                    })
                    .map((conv) => {
                      const status = userStatuses.get(conv.user.username) || 'offline';
                      return (
                        <button
                          key={conv.user_id}
                          onClick={() => {
                            selectFriend(conv.user_id);
                            onNavigate("direct-message", conv.user_id.toString());
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                            currentFriend?.id === conv.user_id
                              ? (isDarkMode ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-900')
                              : (isDarkMode ? 'text-slate-300 hover:bg-slate-700/50' : 'text-gray-700 hover:bg-gray-50')
                          }`}
                        >
                          <div className="relative flex-shrink-0">
                            {conv.user.avatar_url ? (
                              <img src={getAvatarUrl(conv.user.avatar_url, conv.user.username)} alt={conv.user.display_name} className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${
                                status === 'online' ? 'bg-green-600' : status === 'idle' ? 'bg-yellow-600' : status === 'dnd' ? 'bg-red-600' : 'bg-gray-600'
                              }`}>
                                {getAvatarInitials(conv.user.display_name || conv.user.username)}
                              </div>
                            )}
                            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-slate-800 ${getStatusColor(status)}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium text-sm">{conv.user.display_name || conv.user.username}</div>
                            {conv.last_message && (
                              <div className={`text-xs truncate ${isDarkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                                {conv.last_message.sender_id === currentUser?.id ? 'You: ' : ''}{conv.last_message.content}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })
                )}
              </div>
            </div>

            <div className={`h-px mx-4 ${isDarkMode ? 'bg-slate-700/50' : 'bg-gray-200'}`} />

            <div className="px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>All Friends</h3>
                <button onClick={() => setExpandedFriendsSection(!expandedFriendsSection)} className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-100 text-gray-600'}`}>
                  {expandedFriendsSection ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>

              {expandedFriendsSection && (
                <div className="space-y-2">
                  {friends.length === 0 ? (
                    <p className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-gray-500'}`}>No friends yet</p>
                  ) : (
                    friends.map((friend) => {
                      const status = userStatuses.get(friend.username) || friend.status;
                      return (
                        <button
                          key={friend.id}
                          onClick={() => {
                            setSelectedFriendForModal(friend);
                            setShowFriendProfileModal(true);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-slate-700/50' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                          <div className="relative flex-shrink-0">
                            {friend.avatar_url ? (
                              <img src={getAvatarUrl(friend.avatar_url, friend.username)} alt={friend.display_name} className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${status === 'online' ? 'bg-green-600' : status === 'idle' ? 'bg-yellow-600' : status === 'dnd' ? 'bg-red-600' : 'bg-gray-600'}`}>
                                {getAvatarInitials(friend.display_name)}
                              </div>
                            )}
                            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-slate-800 ${getStatusColor(status)}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium text-sm">{friend.display_name}</div>
                            {friend.custom_status && <div className={`text-xs truncate ${isDarkMode ? 'text-slate-500' : 'text-gray-500'}`}>{friend.custom_status}</div>}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className={`h-px mx-4 ${isDarkMode ? 'bg-slate-700/50' : 'bg-gray-200'}`} />

            <div className="px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>Communities</h3>
                <button onClick={() => setShowJoinCommunityModal(true)} className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-400 hover:text-green-400' : 'hover:bg-gray-100 text-gray-600 hover:text-green-600'}`}><Plus className="w-4 h-4" /></button>
              </div>
              <div className="space-y-2">
                {communities.length === 0 ? (
                  <p className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-gray-500'}`}>No communities yet</p>
                ) : (
                  communities.map((community) => (
                    <button key={community.id} onClick={() => handleCommunityClick(community.id.toString())} className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${selectedCommunity === community.id.toString() ? (isDarkMode ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-900') : (isDarkMode ? 'text-slate-300 hover:bg-slate-700/50' : 'text-gray-700 hover:bg-gray-50')}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-white text-xs flex-shrink-0 ${getCommunityColor(communities.indexOf(community))}`}>
                        {community.icon || community.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0"><div className="truncate font-medium text-sm">{community.name}</div></div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <CreateCommunityModal isOpen={showCreateCommunityModal} onClose={() => setShowCreateCommunityModal(false)} onCreateCommunity={handleCreateCommunity} />
      <JoinCommunityModal isOpen={showJoinCommunityModal} onClose={() => setShowJoinCommunityModal(false)} onJoinCommunity={handleJoinCommunity} onDiscoverCommunities={channelService.discoverCommunities.bind(channelService)} />
      <FriendProfileModal
        isOpen={showFriendProfileModal}
        onClose={() => {
          setShowFriendProfileModal(false);
          setSelectedFriendForModal(null);
        }}
        friend={selectedFriendForModal}
        onMessage={(friendId) => {
          selectFriend(friendId);
          onNavigate("direct-message", friendId.toString());
          setShowFriendProfileModal(false);
        }}
      />
      <ConfirmDialog isOpen={showLogoutDialog} title="Logout" description="Are you sure you want to logout? You will need to log in again to access your account." cancelText="Cancel" confirmText="Logout" isDangerous={true} onConfirm={confirmLogout} onCancel={() => setShowLogoutDialog(false)} />
    </div>
  );
}