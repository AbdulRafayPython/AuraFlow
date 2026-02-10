import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../../contexts/ThemeContext";
import { useFriends } from "../../contexts/FriendsContext";
import { useAuth } from "../../contexts/AuthContext";
import { getAvatarUrl } from "@/lib/utils";
import { 
  Users, Plus, Home, ChevronLeft, ChevronRight, LogOut, Moon, Sun, Settings, 
  User, Bell, Shield, Palette, HelpCircle, MessageSquare, ChevronDown, 
  Search, Sparkles, Hash, Volume2, Compass
} from "lucide-react";
import CreateCommunityModal from "../modals/CreateCommunityModal";
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
  isMembersModalOpen?: boolean;
  isCommunityManagementModalOpen?: boolean;
}

const statusColors = {
  online: "bg-emerald-500",
  idle: "bg-amber-500",
  dnd: "bg-rose-500",
  offline: "bg-slate-500",
};

const statusGlow = {
  online: "shadow-[0_0_8px_rgba(16,185,129,0.6)]",
  idle: "shadow-[0_0_8px_rgba(245,158,11,0.6)]",
  dnd: "shadow-[0_0_8px_rgba(244,63,94,0.6)]",
  offline: "",
};

export default function FriendsSidebar({ onNavigate, currentView, selectedCommunity, isMembersModalOpen, isCommunityManagementModalOpen }: FriendsSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isDiscoverPage = location.pathname === '/discover';
  const { isDarkMode, toggleTheme, currentTheme } = useTheme();
  const isBasicTheme = currentTheme === 'basic';
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
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userStatus, setUserStatus] = useState<'online' | 'idle' | 'dnd' | 'offline'>('online');
  const [showFriendProfileModal, setShowFriendProfileModal] = useState(false);
  const [selectedFriendForModal, setSelectedFriendForModal] = useState<any>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    conversations: true,
    friends: true,
    communities: true,
  });
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
    setShowProfileMenu(false); // Close the menu first
    // Small delay to allow menu animation to complete before showing dialog
    setTimeout(() => {
      setShowLogoutDialog(true);
    }, 150);
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
      if (isDiscoverPage) {
        navigate('/');
      }
      onNavigate("dashboard", communityId);
    }
  };

  const handleCreateCommunity = async (data: CommunityFormData) => {
    try {
      const newCommunity = await channelService.createCommunity(data);
      return newCommunity;
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

  const getCommunityGradient = (index: number) => {
    const gradients = [
      "from-blue-500 to-cyan-500",
      "from-purple-500 to-pink-500",
      "from-emerald-500 to-teal-500",
      "from-orange-500 to-red-500",
      "from-indigo-500 to-purple-500",
      "from-rose-500 to-pink-500",
    ];
    return gradients[index % gradients.length];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-emerald-500';
      case 'idle': return 'bg-amber-500';
      case 'dnd': return 'bg-rose-500';
      case 'offline': return 'bg-slate-500';
      default: return 'bg-slate-500';
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
      <div className="w-full h-full rounded-full bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] flex items-center justify-center font-bold text-white text-lg">
        {getAvatarInitials(currentUser.display_name || currentUser.username)}
      </div>
    );
  };

  const handleStatusChange = (status: 'online' | 'idle' | 'dnd' | 'offline') => {
    setUserStatus(status);
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Filter friends and communities based on search
  const filteredFriends = friends.filter(f => 
    f.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredCommunities = communities.filter(c =>
    c.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredConversations = conversations.filter(conv => 
    conv.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.user?.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get community logo URL
  const getCommunityLogoUrl = (community: any) => {
    if (!community.logo_url) return null;
    return `${import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000'}${community.logo_url}`;
  };

  return (
    <>
    <div 
      className={`flex-shrink-0 h-full flex transition-all duration-300 relative ${showLogoutDialog || isMembersModalOpen || isCommunityManagementModalOpen ? 'blur-[2px] pointer-events-none' : ''}`}
      style={{ 
        overflow: 'visible',
        background: 'var(--theme-sidebar-gradient)'
      }}
    >
      {/* Gradient overlay for depth */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 20%, hsl(var(--theme-accent-primary) / 0.03) 0%, transparent 60%)',
        }}
      />
      {/* Top accent gradient line */}
      <div 
        className="absolute top-0 left-0 right-0 h-px z-50"
        style={{
          background: 'var(--theme-accent-gradient)',
          opacity: 0.6
        }}
      />
      {/* Icon Sidebar - Always visible */}
      <div className="flex flex-col items-center py-3 gap-2 flex-shrink-0 w-[72px] border-r border-[hsl(var(--theme-border-default)/0.3)] relative" style={{ overflow: 'visible' }}>
        {/* Toggle Button */}
        <div className="relative group">
          <button
            onClick={() => {
              const newCollapsed = !isCollapsed;
              setIsCollapsed(newCollapsed);
              if (newCollapsed) {
                setShowDetailPanel(false);
              } else {
                onNavigate("friends");
                setShowDetailPanel(true);
              }
            }}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:scale-105"
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5 transition-transform duration-300" />
            ) : (
              <ChevronLeft className="w-5 h-5 transition-transform duration-300" />
            )}
          </button>
          {isCollapsed && (
            <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-3 py-2 text-xs font-medium rounded-xl whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 z-[9999] bg-[hsl(var(--theme-bg-elevated))] text-[hsl(var(--theme-text-primary))] border border-[hsl(var(--theme-border-default))] shadow-xl backdrop-blur-xl">
              Expand
            </div>
          )}
        </div>

        <div className="h-0.5 w-8 rounded-full bg-gradient-to-r from-transparent via-[hsl(var(--theme-border-default))] to-transparent" />

        {/* Home Button */}
        <div className="relative group w-full flex justify-center transition-all duration-300">
          {currentView === "dashboard" && !selectedCommunity && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] rounded-r-full transition-all duration-300" />
          )}
          <button
            onClick={() => {
              if (isDiscoverPage) {
                navigate('/');
              }
              onNavigate("dashboard");
            }}
            onMouseEnter={() => setHoveredItem('home')}
            onMouseLeave={() => setHoveredItem(null)}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
              currentView === "dashboard" && !selectedCommunity && !isDiscoverPage
                ? "bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] text-white shadow-lg shadow-[hsl(var(--theme-accent-primary)/0.4)] scale-105" 
                : "bg-[hsl(var(--theme-bg-secondary))] hover:bg-gradient-to-br hover:from-[hsl(var(--theme-accent-primary))] hover:to-[hsl(var(--theme-accent-secondary))] text-[hsl(var(--theme-text-muted))] hover:text-white hover:scale-105 hover:shadow-lg"
            }`}
          >
            <Home className={`w-5 h-5 transition-all duration-300 ${hoveredItem === 'home' ? 'scale-110' : ''}`} />
          </button>
          {isCollapsed && (
            <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-3 py-2 text-xs font-medium rounded-xl whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 z-[9999] bg-[hsl(var(--theme-bg-elevated))] text-[hsl(var(--theme-text-primary))] border border-[hsl(var(--theme-border-default))] shadow-xl backdrop-blur-xl">
              Home
            </div>
          )}
        </div>

        {/* Friends Button */}
        <div className="relative group w-full flex justify-center transition-all duration-300">
          {currentView === "friends" && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-emerald-400 to-emerald-600 rounded-r-full transition-all duration-300" />
          )}
          <button
            onClick={() => onNavigate("friends")}
            onMouseEnter={() => setHoveredItem('friends')}
            onMouseLeave={() => setHoveredItem(null)}
            className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
              currentView === "friends" 
                ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/40 scale-105" 
                : "bg-[hsl(var(--theme-bg-secondary))] hover:bg-gradient-to-br hover:from-emerald-500 hover:to-teal-600 text-[hsl(var(--theme-text-muted))] hover:text-white hover:scale-105 hover:shadow-lg"
            }`}
          >
            <Users className={`w-5 h-5 transition-all duration-300 ${hoveredItem === 'friends' ? 'scale-110' : ''}`} />
            {pendingRequests.length > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2 border-[hsl(var(--theme-sidebar-bg))] animate-pulse">
                {pendingRequests.length > 9 ? '9+' : pendingRequests.length}
              </div>
            )}
          </button>
          {isCollapsed && (
            <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-3 py-2 text-xs font-medium rounded-xl whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 z-[9999] bg-[hsl(var(--theme-bg-elevated))] text-[hsl(var(--theme-text-primary))] border border-[hsl(var(--theme-border-default))] shadow-xl backdrop-blur-xl">
              Friends {pendingRequests.length > 0 && `(${pendingRequests.length})`}
            </div>
          )}
        </div>

        {/* Discover Communities */}
        <div className="relative group w-full flex justify-center">
          <button
            onClick={() => navigate('/discover')}
            onMouseEnter={() => setHoveredItem('discover')}
            onMouseLeave={() => setHoveredItem(null)}
            className="relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-[hsl(var(--theme-bg-secondary))] hover:bg-gradient-to-br hover:from-indigo-500 hover:to-purple-600 text-[hsl(var(--theme-text-muted))] hover:text-white hover:scale-105 hover:shadow-lg"
          >
            <Compass className={`w-5 h-5 transition-all duration-300 ${hoveredItem === 'discover' ? 'scale-110' : ''}`} />
          </button>
          {isCollapsed && (
            <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-3 py-2 text-xs font-medium rounded-xl whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 z-[9999] bg-[hsl(var(--theme-bg-elevated))] text-[hsl(var(--theme-text-primary))] border border-[hsl(var(--theme-border-default))] shadow-xl backdrop-blur-xl">
              Discover Communities
            </div>
          )}
        </div>

        <div className="h-0.5 w-8 rounded-full bg-gradient-to-r from-transparent via-[hsl(var(--theme-border-default))] to-transparent" />

        {/* Communities */}
        <div className="w-full flex flex-col items-center gap-2 flex-1 overflow-y-auto scrollbar-none py-1">
          {communities.map((community, index) => {
            const communityId = community.id.toString();
            const isSelected = selectedCommunity === communityId;
            const logoUrl = getCommunityLogoUrl(community);
            const initials = community.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

            return (
              <div key={community.id} className="relative group w-full flex justify-center transition-all duration-300">
                {isSelected && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full transition-all duration-300" />
                )}
                <button
                  onClick={() => handleCommunityClick(communityId)}
                  onMouseEnter={() => setHoveredItem(`community-${community.id}`)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-white text-sm transition-all duration-300 overflow-hidden ${
                    isSelected 
                      ? "shadow-lg scale-105 ring-2 ring-white/30" 
                      : "hover:scale-105 hover:shadow-lg hover:ring-2 hover:ring-white/20"
                  }`}
                  style={{ 
                    backgroundColor: !logoUrl ? (community.color || undefined) : undefined,
                    background: !logoUrl && !community.color ? `linear-gradient(135deg, var(--tw-gradient-stops))` : undefined
                  }}
                >
                  {logoUrl ? (
                    <img 
                      src={logoUrl} 
                      alt={community.name} 
                      className={`w-full h-full object-cover transition-all duration-300 ${
                        hoveredItem === `community-${community.id}` ? 'scale-110' : ''
                      }`} 
                    />
                  ) : (
                    <div className={`w-full h-full rounded-2xl bg-gradient-to-br ${getCommunityGradient(index)} flex items-center justify-center`}>
                      <span className={`transition-all duration-300 ${hoveredItem === `community-${community.id}` ? 'scale-110' : ''}`}>
                        {community.icon || initials}
                      </span>
                    </div>
                  )}
                </button>
                {isCollapsed && (
                  <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-3 py-2 text-xs font-medium rounded-xl whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 z-[9999] bg-[hsl(var(--theme-bg-elevated))] text-[hsl(var(--theme-text-primary))] border border-[hsl(var(--theme-border-default))] shadow-xl backdrop-blur-xl">
                    {community.name}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Community */}
        <div className="relative group w-full flex justify-center mt-auto">
          <button
            onClick={() => setShowCreateCommunityModal(true)}
            onMouseEnter={() => setHoveredItem('add')}
            onMouseLeave={() => setHoveredItem(null)}
            className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-[hsl(var(--theme-bg-secondary))] hover:bg-gradient-to-br hover:from-emerald-500 hover:to-teal-600 text-emerald-500 hover:text-white hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/30 border-2 border-dashed border-[hsl(var(--theme-border-default))] hover:border-transparent"
          >
            <Plus className={`w-5 h-5 transition-all duration-300 ${hoveredItem === 'add' ? 'rotate-90 scale-110' : ''}`} />
          </button>
          {isCollapsed ? (
            <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 rounded-xl shadow-2xl overflow-hidden border opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none group-hover:pointer-events-auto z-[9999] bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))] backdrop-blur-xl">
              <button
                onClick={() => setShowCreateCommunityModal(true)}
                className="w-full px-4 py-2.5 text-xs font-semibold text-left transition-all whitespace-nowrap text-emerald-400 hover:bg-[hsl(var(--theme-bg-hover))] flex items-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Create
              </button>
              <div className="h-px bg-[hsl(var(--theme-border-default))]" />
              <button
                onClick={() => navigate('/discover')}
                className="w-full px-4 py-2.5 text-xs font-semibold text-left transition-all whitespace-nowrap text-cyan-400 hover:bg-[hsl(var(--theme-bg-hover))] flex items-center gap-2"
              >
                <Compass className="w-3.5 h-3.5" />
                Discover
              </button>
            </div>
          ) : null}
        </div>

        {/* Profile */}
        <div className="flex flex-col items-center gap-2 mt-2 profile-menu-container relative z-[60]">
          <div className="relative group w-full flex justify-center">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 ring-2 relative ${
                showProfileMenu 
                  ? 'ring-[hsl(var(--theme-accent-primary))] scale-110 shadow-lg shadow-[hsl(var(--theme-accent-primary)/0.3)]' 
                  : 'ring-[hsl(var(--theme-border-default))] hover:ring-[hsl(var(--theme-accent-primary))] hover:scale-105'
              }`}
            >
              <div className="w-full h-full rounded-full overflow-hidden">
                {renderUserAvatar()}
              </div>
              <div 
                className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[hsl(var(--theme-sidebar-bg))] ${statusColors[userStatus]} ${isBasicTheme ? '' : statusGlow[userStatus]}`} 
              />
            </button>

            {/* Profile Menu */}
            {showProfileMenu && currentUser && (
              <div 
                className={`${isCollapsed ? 'absolute' : 'fixed'} w-80 ${isBasicTheme ? 'rounded-lg shadow-lg' : 'rounded-2xl shadow-2xl'} border overflow-hidden z-[9999] bg-[hsl(var(--theme-bg-elevated))/0.95] border-[hsl(var(--theme-border-default))] ${isBasicTheme ? '' : 'backdrop-blur-xl'} animate-in fade-in slide-in-from-bottom-2 duration-200`}
                style={isCollapsed 
                  ? { left: 'calc(100% + 12px)', bottom: '0', transform: 'translateY(0)' } 
                  : { left: '84px', bottom: '1rem', transform: 'translateY(0)' }
                }
              >
                {/* Profile Header */}
                <div className={`p-5 border-b ${isBasicTheme ? 'bg-[hsl(var(--theme-bg-secondary))]' : 'bg-gradient-to-br from-[hsl(var(--theme-accent-primary)/0.15)] to-[hsl(var(--theme-accent-secondary)/0.1)]'} border-[hsl(var(--theme-border-default))]`}>
                  <div className="flex items-center gap-4">
                    <div className="relative w-16 h-16">
                      {renderUserAvatar()}
                      {/* <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-[hsl(var(--theme-bg-elevated))] ${statusColors[userStatus]} ${statusGlow[userStatus]}`} /> */}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-lg truncate text-[hsl(var(--theme-text-primary))]">
                        {currentUser.display_name || currentUser.username}
                      </div>
                      <div className="text-sm truncate text-[hsl(var(--theme-text-muted))]">
                        @{currentUser.username}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className={`w-2 h-2 rounded-full ${statusColors[userStatus]} ${isBasicTheme ? '' : statusGlow[userStatus]}`} />
                        <span className="text-xs font-medium capitalize text-[hsl(var(--theme-text-secondary))]">{userStatus}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status Selection */}
                <div className="p-3 border-b border-[hsl(var(--theme-border-default))]">
                  <div className="text-[10px] font-bold mb-2 uppercase tracking-widest text-[hsl(var(--theme-text-muted))]">Set Status</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['online', 'idle', 'dnd', 'offline'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-300 ${
                          userStatus === status 
                            ? 'bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] text-white shadow-md' 
                            : 'bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))]'
                        }`}
                      >
                        <div className={`w-2.5 h-2.5 rounded-full ${userStatus === status ? 'bg-white' : statusColors[status]}`} />
                        <span className="capitalize">{status === 'dnd' ? 'Do Not Disturb' : status}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Menu Items */}
                <div className="p-2 max-h-72 overflow-y-auto scrollbar scrollbar-thumb-[hsl(var(--theme-border-default))] scrollbar-track-transparent">
                  <button 
                    onClick={() => { setShowProfileMenu(false); onNavigate("profile"); }} 
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-primary))] group"
                  >
                    <div className="p-2 rounded-lg bg-[hsl(var(--theme-bg-secondary))] group-hover:bg-[hsl(var(--theme-accent-primary)/0.2)] transition-colors">
                      <User className="w-4 h-4" />
                    </div>
                    <span>My Profile</span>
                  </button>
                  <button 
                    onClick={() => { setShowProfileMenu(false); onNavigate("settings"); }} 
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-primary))] group"
                  >
                    <div className="p-2 rounded-lg bg-[hsl(var(--theme-bg-secondary))] group-hover:bg-[hsl(var(--theme-accent-primary)/0.2)] transition-colors">
                      <Settings className="w-4 h-4" />
                    </div>
                    <span>Settings</span>
                  </button>
                  
                  <div className="my-2 h-px bg-[hsl(var(--theme-border-default))]" />
                  
                  <button 
                    onClick={toggleTheme} 
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-primary))] group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-[hsl(var(--theme-bg-secondary))] group-hover:bg-[hsl(var(--theme-accent-primary)/0.2)] transition-colors">
                        <Palette className="w-4 h-4" />
                      </div>
                      <span>Theme</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-accent-primary))]">
                      {isDarkMode ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                      <span>{isDarkMode ? 'Dark' : 'Light'}</span>
                    </div>
                  </button>
                  
                  <div className="my-2 h-px bg-[hsl(var(--theme-border-default))]" />
                  
                  <button 
                    onClick={handleLogout} 
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:bg-rose-500/10 text-rose-500 group"
                  >
                    <div className="p-2 rounded-lg bg-rose-500/10 group-hover:bg-rose-500/20 transition-colors">
                      <LogOut className="w-4 h-4" />
                    </div>
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      {showDetailPanel && (
        <div 
          className="flex-1 flex flex-col h-full border-l w-72 border-[hsl(var(--theme-border-default)/0.3)] backdrop-blur-sm animate-in slide-in-from-left-2 duration-300 relative"
          style={{ background: 'hsl(var(--theme-bg-secondary) / 0.3)' }}
        >
          {/* Right edge gradient that blends with next panel */}
          <div 
            className="absolute right-0 top-0 w-8 h-full pointer-events-none z-10"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, hsl(var(--theme-sidebar-bg) / 0.3) 100%)'
            }}
          />
          
          {/* Header */}
          <div className="px-4 py-4 border-b border-[hsl(var(--theme-border-default)/0.3)] relative z-[5]">
            <h2 className="text-lg font-bold text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[hsl(var(--theme-accent-primary))]" />
              Quick Access
            </h2>
            
            {/* Search */}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--theme-text-muted))]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full pl-9 pr-4 py-2 rounded-xl text-sm bg-[hsl(var(--theme-bg-tertiary)/0.5)] border border-[hsl(var(--theme-border-default)/0.5)] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] focus:border-transparent transition-all duration-200"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar scrollbar-thumb-[hsl(var(--theme-border-default))] scrollbar-track-transparent">
            {/* Conversations Section */}
            <div className="px-3 py-3">
              <button 
                onClick={() => toggleSection('conversations')}
                className="w-full flex items-center justify-between mb-2 px-2 py-1 rounded-lg hover:bg-[hsl(var(--theme-bg-hover))] transition-colors"
              >
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--theme-text-muted))]">
                  Recent Messages
                </h3>
                <ChevronDown className={`w-4 h-4 text-[hsl(var(--theme-text-muted))] transition-transform duration-200 ${expandedSections.conversations ? '' : '-rotate-90'}`} />
              </button>

              {expandedSections.conversations && (
                <div className="space-y-1">
                  {filteredConversations.filter(conv => conv.last_message).length === 0 ? (
                    <p className="text-xs text-[hsl(var(--theme-text-muted))] px-2 py-3 text-center">No conversations yet</p>
                  ) : (
                    [...filteredConversations]
                      .filter(conv => conv.last_message)
                      .sort((a, b) => {
                        const aTime = new Date(a.last_message_time || 0).getTime();
                        const bTime = new Date(b.last_message_time || 0).getTime();
                        return bTime - aTime;
                      })
                      .slice(0, 5)
                      .map((conv) => {
                        const status = userStatuses.get(conv.user.username) || 'offline';
                        const isActive = currentFriend?.id === conv.user_id;
                        return (
                          <button
                            key={conv.user_id}
                            onClick={() => {
                              selectFriend(conv.user_id);
                              onNavigate("direct-message", conv.user_id.toString());
                            }}
                            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-3 transition-all duration-200 group ${
                              isActive
                                ? 'bg-gradient-to-r from-[hsl(var(--theme-accent-primary)/0.2)] to-[hsl(var(--theme-accent-secondary)/0.1)] shadow-sm'
                                : 'hover:bg-[hsl(var(--theme-bg-hover))]'
                            }`}
                          >
                            <div className="relative flex-shrink-0">
                              {conv.user.avatar_url ? (
                                <img 
                                  src={getAvatarUrl(conv.user.avatar_url, conv.user.username)} 
                                  alt={conv.user.display_name} 
                                  className="w-10 h-10 rounded-xl object-cover ring-2 ring-[hsl(var(--theme-border-default)/0.5)] group-hover:ring-[hsl(var(--theme-accent-primary)/0.5)] transition-all" 
                                />
                              ) : (
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold bg-gradient-to-br ${
                                  status === 'online' ? 'from-emerald-500 to-teal-600' : 
                                  status === 'idle' ? 'from-amber-500 to-orange-600' : 
                                  status === 'dnd' ? 'from-rose-500 to-pink-600' : 
                                  'from-slate-500 to-slate-600'
                                }`}>
                                  {getAvatarInitials(conv.user.display_name || conv.user.username)}
                                </div>
                              )}
                              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[hsl(var(--theme-bg-secondary))] ${getStatusColor(status)} ${isBasicTheme ? '' : (statusGlow[status as keyof typeof statusGlow] || '')}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-semibold text-sm text-[hsl(var(--theme-text-primary))]">
                                {conv.user.display_name || conv.user.username}
                              </div>
                              {conv.last_message && (
                                <div className="text-xs truncate text-[hsl(var(--theme-text-muted))]">
                                  {conv.last_message.sender_id === currentUser?.id ? 'You: ' : ''}{conv.last_message.content}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })
                  )}
                </div>
              )}
            </div>

            <div className="h-px mx-4 bg-gradient-to-r from-transparent via-[hsl(var(--theme-border-default))] to-transparent" />

            {/* Friends Section */}
            <div className="px-3 py-3">
              <button 
                onClick={() => toggleSection('friends')}
                className="w-full flex items-center justify-between mb-2 px-2 py-1 rounded-lg hover:bg-[hsl(var(--theme-bg-hover))] transition-colors"
              >
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--theme-text-muted))]">
                  Friends ({filteredFriends.length})
                </h3>
                <ChevronDown className={`w-4 h-4 text-[hsl(var(--theme-text-muted))] transition-transform duration-200 ${expandedSections.friends ? '' : '-rotate-90'}`} />
              </button>

              {expandedSections.friends && (
                <div className="space-y-1">
                  {filteredFriends.length === 0 ? (
                    <p className="text-xs text-[hsl(var(--theme-text-muted))] px-2 py-3 text-center">
                      {searchQuery ? 'No friends found' : 'No friends yet'}
                    </p>
                  ) : (
                    filteredFriends.map((friend) => {
                      const status = userStatuses.get(friend.username) || friend.status;
                      return (
                        <button
                          key={friend.id}
                          onClick={() => {
                            setSelectedFriendForModal(friend);
                            setShowFriendProfileModal(true);
                          }}
                          className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-3 transition-all duration-200 hover:bg-[hsl(var(--theme-bg-hover))] group"
                        >
                          <div className="relative flex-shrink-0">
                            {friend.avatar_url ? (
                              <img 
                                src={getAvatarUrl(friend.avatar_url, friend.username)} 
                                alt={friend.display_name} 
                                className="w-10 h-10 rounded-xl object-cover ring-2 ring-[hsl(var(--theme-border-default)/0.5)] group-hover:ring-[hsl(var(--theme-accent-primary)/0.5)] transition-all" 
                              />
                            ) : (
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold bg-gradient-to-br ${
                                status === 'online' ? 'from-emerald-500 to-teal-600' : 
                                status === 'idle' ? 'from-amber-500 to-orange-600' : 
                                status === 'dnd' ? 'from-rose-500 to-pink-600' : 
                                'from-slate-500 to-slate-600'
                              }`}>
                                {getAvatarInitials(friend.display_name)}
                              </div>
                            )}
                            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[hsl(var(--theme-bg-secondary))] ${getStatusColor(status)} ${isBasicTheme ? '' : (statusGlow[status as keyof typeof statusGlow] || '')}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-semibold text-sm text-[hsl(var(--theme-text-primary))]">{friend.display_name}</div>
                            {friend.custom_status && (
                              <div className="text-xs truncate text-[hsl(var(--theme-text-muted))]">{friend.custom_status}</div>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="h-px mx-4 bg-gradient-to-r from-transparent via-[hsl(var(--theme-border-default))] to-transparent" />

            {/* Communities Section */}
            <div className="px-3 py-3">
              <button 
                onClick={() => toggleSection('communities')}
                className="w-full flex items-center justify-between mb-2 px-2 py-1 rounded-lg hover:bg-[hsl(var(--theme-bg-hover))] transition-colors"
              >
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--theme-text-muted))]">
                  Communities ({filteredCommunities.length})
                </h3>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={(e) => { e.stopPropagation(); navigate('/discover'); }} 
                    className="p-1 rounded-lg transition-colors hover:bg-[hsl(var(--theme-accent-primary)/0.2)] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-accent-primary))]"
                    title="Discover Communities"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <ChevronDown className={`w-4 h-4 text-[hsl(var(--theme-text-muted))] transition-transform duration-200 ${expandedSections.communities ? '' : '-rotate-90'}`} />
                </div>
              </button>

              {expandedSections.communities && (
                <div className="space-y-1">
                  {filteredCommunities.length === 0 ? (
                    <p className="text-xs text-[hsl(var(--theme-text-muted))] px-2 py-3 text-center">
                      {searchQuery ? 'No communities found' : 'No communities yet'}
                    </p>
                  ) : (
                    filteredCommunities.map((community, index) => {
                      const isSelected = selectedCommunity === community.id.toString();
                      const logoUrl = getCommunityLogoUrl(community);
                      return (
                        <button 
                          key={community.id} 
                          onClick={() => handleCommunityClick(community.id.toString())} 
                          className={`w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-3 transition-all duration-200 group ${
                            isSelected 
                              ? 'bg-gradient-to-r from-[hsl(var(--theme-accent-primary)/0.2)] to-[hsl(var(--theme-accent-secondary)/0.1)] shadow-sm' 
                              : 'hover:bg-[hsl(var(--theme-bg-hover))]'
                          }`}
                        >
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-xs flex-shrink-0 overflow-hidden ring-2 ring-[hsl(var(--theme-border-default)/0.5)] group-hover:ring-[hsl(var(--theme-accent-primary)/0.5)] transition-all">
                            {logoUrl ? (
                              <img 
                                src={logoUrl} 
                                alt={community.name} 
                                className="w-full h-full object-cover" 
                              />
                            ) : (
                              <div 
                                className={`w-full h-full bg-gradient-to-br ${getCommunityGradient(index)} flex items-center justify-center`}
                                style={community.color ? { background: community.color } : undefined}
                              >
                                {community.icon || community.name.substring(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-semibold text-sm text-[hsl(var(--theme-text-primary))]">{community.name}</div>
                            {community.member_count && (
                              <div className="text-xs text-[hsl(var(--theme-text-muted))] flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {community.member_count} members
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Modals - Outside of blurred container */}
      <CreateCommunityModal 
        isOpen={showCreateCommunityModal} 
        onClose={() => setShowCreateCommunityModal(false)} 
        onCreateCommunity={handleCreateCommunity} 
      />
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
      <ConfirmDialog 
        isOpen={showLogoutDialog} 
        title="Log Out" 
        description="Are you sure you want to log out? You'll need to sign in again to access your account." 
        cancelText="Cancel" 
        confirmText="Log Out" 
        isDangerous={true} 
        onConfirm={confirmLogout} 
        onCancel={() => setShowLogoutDialog(false)} 
      />
    </>
  );
}
