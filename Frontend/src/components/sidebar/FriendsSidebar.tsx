import { useState } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { useFriends } from "../../contexts/FriendsContext";
import { useAuth } from "../../contexts/AuthContext";
import { useRealtime } from "../../contexts/RealtimeContext";
import { Users, Plus, Home, Settings, ChevronLeft, ChevronRight, MessageCircle, Phone, Video, LogOut, Moon, Sun } from "lucide-react";
import CreateCommunityModal, { CommunityFormData } from "../modals/CreateCommunityModal";
import { channelService } from "../../services/channelService";

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
    selectCommunity, 
    friends: realtimeFriends, 
    userStatuses,
    selectFriend 
  } = useRealtime();
  
  const [hoveredFriend, setHoveredFriend] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [showQuickActions, setShowQuickActions] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showCreateCommunityModal, setShowCreateCommunityModal] = useState(false);

  // Get online friends with real-time status
  const onlineFriends = realtimeFriends.filter(f => {
    const status = userStatuses.get(f.username) || f.status;
    return status === "online";
  });
  const displayFriends = onlineFriends.slice(0, 10);

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      logout();
    }
  };

  const handleCommunityClick = (communityId: string) => {
    const community = communities.find(c => c.id.toString() === communityId);
    if (community) {
      selectCommunity(community.id);
      onNavigate("dashboard", communityId);
    }
  };

  const handleFriendMessageClick = (friendId: number) => {
    selectFriend(friendId);
    onNavigate("dashboard");
    setShowQuickActions(null);
  };

  const handleCreateCommunity = async (data: CommunityFormData) => {
    try {
      const newCommunity = await channelService.createCommunity(data);
      // Refresh communities list
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

          {/* Communities - From Real-time Context */}
          <div className="w-full flex flex-col items-center gap-2">
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
            className="relative w-full flex justify-center"
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

          {/* Online Friends Section - From Real-time Context */}
          {displayFriends.length > 0 && (
            <>
              <div className={`h-0.5 w-8 rounded-full mt-2 ${isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`} />
              <div className="flex-1 overflow-y-auto w-full flex flex-col items-center gap-2 py-2 scrollbar-none">
                {displayFriends.map((friend) => {
                  const status = userStatuses.get(friend.username) || friend.status;
                  
                  return (
                    <div
                      key={friend.id}
                      className="relative w-full flex justify-center"
                      onMouseEnter={() => setHoveredFriend(friend.id.toString())}
                      onMouseLeave={() => {
                        setHoveredFriend(null);
                        setShowQuickActions(null);
                      }}
                    >
                      <button
                        onClick={() => handleFriendMessageClick(friend.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setShowQuickActions(showQuickActions === friend.id.toString() ? null : friend.id.toString());
                        }}
                        className={`relative w-12 h-12 rounded-3xl flex items-center justify-center font-bold text-lg transition-all duration-200 ${
                          hoveredFriend === friend.id.toString() ? "rounded-2xl" : ""
                        } ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-900'}`}
                      >
                        {friend.avatar_url ? (
                          <img src={friend.avatar_url} alt={friend.display_name} className="w-full h-full rounded-3xl object-cover" />
                        ) : (
                          getAvatarInitials(friend.display_name)
                        )}
                        <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-4 ${
                          isDarkMode ? 'border-slate-900' : 'border-gray-100'
                        } ${statusColors[status]}`} />
                      </button>
                      {showQuickActions === friend.id.toString() && (
                        <div className={`absolute left-[72px] top-0 ml-2 w-44 rounded-lg shadow-2xl border z-50 ${
                          isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
                        }`}>
                          <div className="p-2 space-y-1">
                            <button 
                              onClick={() => handleFriendMessageClick(friend.id)}
                              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                                isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-100 text-gray-900'
                              }`}
                            >
                              <MessageCircle className="w-4 h-4" />
                              Message
                            </button>
                            <button className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                              isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-100 text-gray-900'
                            }`}>
                              <Phone className="w-4 h-4" />
                              Call
                            </button>
                            <button className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                              isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-100 text-gray-900'
                            }`}>
                              <Video className="w-4 h-4" />
                              Video
                            </button>
                          </div>
                        </div>
                      )}
                      {hoveredFriend === friend.id.toString() && (
                        <div className={`absolute left-[72px] top-0 ml-2 px-3 py-2 text-sm font-semibold rounded-lg shadow-xl z-50 whitespace-nowrap ${
                          isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-900 border border-gray-200'
                        }`}>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
                            {friend.display_name}
                          </div>
                          {friend.custom_status && (
                            <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{friend.custom_status}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Bottom Section */}
          <div className="flex flex-col items-center gap-2 mt-auto pt-2">
            {/* Settings */}
            <div
              className="relative w-full flex justify-center"
              onMouseEnter={() => setHoveredItem('settings')}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`w-12 h-12 rounded-3xl flex items-center justify-center transition-all duration-200 ${
                  isDarkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                <Settings className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
              </button>
              {showSettings && (
                <div className={`absolute bottom-full left-full ml-2 mb-2 w-48 rounded-lg shadow-2xl border z-[100] ${
                  isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
                }`}>
                  <div className="p-2 space-y-1">
                    <button
                      onClick={toggleTheme}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded text-sm transition-colors ${
                        isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-100 text-gray-900'
                      }`}
                    >
                      <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
                      {isDarkMode ? <Sun className="w-4 h-4 text-yellow-500" /> : <Moon className="w-4 h-4 text-blue-500" />}
                    </button>
                    <button
                      onClick={handleLogout}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded text-sm transition-colors ${
                        isDarkMode ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-100 text-red-600'
                      }`}
                    >
                      <span>Logout</span>
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
              {hoveredItem === 'settings' && !showSettings && (
                <div className={`absolute left-[72px] top-0 ml-2 px-3 py-2 text-sm font-semibold rounded-lg shadow-xl z-50 whitespace-nowrap ${
                  isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-900 border border-gray-200'
                }`}>
                  Settings
                </div>
              )}
            </div>

            {/* User Avatar */}
            <div
              className="relative w-full flex justify-center"
              onMouseEnter={() => setHoveredItem('profile')}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <button className={`w-12 h-12 rounded-3xl flex items-center justify-center font-bold text-lg transition-all duration-200 ${
                isDarkMode ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}>
                U
              </button>
              {hoveredItem === 'profile' && (
                <div className={`absolute left-[72px] top-0 ml-2 px-3 py-2 text-sm font-semibold rounded-lg shadow-xl z-50 whitespace-nowrap ${
                  isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-gray-900 border border-gray-200'
                }`}>
                  Your Profile
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