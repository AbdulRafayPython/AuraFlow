// components/sidebar/ChannelSidebar.tsx - Real-time Version with Member Management
import React, { useState, useEffect } from "react";
import { 
  ChevronDown, 
  ChevronRight, 
  Hash, 
  Volume2, 
  Users, 
  Plus, 
  Settings as SettingsIcon,
  Loader2,
  MoreVertical
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useRealtime } from "@/hooks/useRealtime";
import { channelService } from "@/services/channelService";
import CommunityMembersAddModal from "@/components/modals/CommunityMembersAddModal";
import CreateChannelModal from "@/components/modals/CreateChannelModal";
import ChannelManagementModal from "@/components/modals/ChannelManagementModal";
import CommunityManagementModal from "@/components/modals/CommunityManagementModal";
import toast from "react-hot-toast";

interface ChannelSidebarProps {
  onNavigate?: (view: string) => void;
}

interface CommunityMember {
  id: number;
  username: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  role: "owner" | "admin" | "member";
}

export default function ChannelSidebar({ onNavigate }: ChannelSidebarProps) {
  const { isDarkMode } = useTheme();
  const {
    currentCommunity,
    channels,
    currentChannel,
    selectChannel,
    addChannel,
    friends,
    selectFriend,
    currentFriend,
    userStatuses,
    isLoadingCommunities,
    currentUser,
    reloadCommunities,
  } = useRealtime();

  // Modal & Members State
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [communityMembers, setCommunityMembers] = useState<CommunityMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isCreateChannelModalOpen, setIsCreateChannelModalOpen] = useState(false);
  const [selectedChannelForManagement, setSelectedChannelForManagement] = useState<any>(null);
  const [isCommunityManagementOpen, setIsCommunityManagementOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; channelId?: number } | null>(null);
  const [userRoleInCommunity, setUserRoleInCommunity] = useState<'owner' | 'admin' | 'member'>('member');

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    text: true,
    voice: true,
    friends: true,
  });

  // Fetch community members when current community changes
  useEffect(() => {
    if (currentCommunity?.id) {
      loadMembers();
    } else {
      setCommunityMembers([]);
    }
  }, [currentCommunity?.id]);

  const loadMembers = async () => {
    if (!currentCommunity?.id) return;
    setIsLoadingMembers(true);
    try {
      const members = await channelService.getCommunityMembers(currentCommunity.id);
      setCommunityMembers(members);
      
      // Fetch current user's role in the community
      if (currentUser?.id) {
        const userRole = await channelService.getUserRoleInCommunity(currentCommunity.id, currentUser.id);
        setUserRoleInCommunity(userRole);
      }
    } catch (err: any) {
      console.error("Failed to load members:", err);
      // Silent fail - don't show error toast for members loading
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleChannelClick = (channelId: number) => {
    selectChannel(channelId);
    onNavigate?.("dashboard");
  };

  const handleFriendClick = (friendId: number) => {
    selectFriend(friendId);
    onNavigate?.("dashboard");
  };

  const handleChannelContextMenu = (e: React.MouseEvent, channelId: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, channelId });
  };

  const handleChannelSettingsClick = (channel: any) => {
    setSelectedChannelForManagement(channel);
    setContextMenu(null);
  };

  const handleCommunityManagementClick = () => {
    setIsCommunityManagementOpen(true);
  };

  const handleChannelCreated = (newChannel: any) => {
    // Close the modal
    setIsCreateChannelModalOpen(false);
    
    // Immediately add channel to the list (don't wait for socket)
    if (newChannel && newChannel.id) {
      addChannel(newChannel);
      
      // Automatically select the newly created channel
      setTimeout(() => {
        selectChannel(newChannel.id);
      }, 100); // Small delay to ensure state is updated
    }
  };

  const handleChannelDeleted = () => {
    setSelectedChannelForManagement(null);
  };

  const handleCommunityDeleted = () => {
    setIsCommunityManagementOpen(false);
    // Navigate away from deleted community
    onNavigate?.("dashboard");
  };

  const handleCommunityLeft = async () => {
    setIsCommunityManagementOpen(false);
    // Reload communities to refresh the list after leaving
    await reloadCommunities();
    onNavigate?.("dashboard");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "bg-green-500";
      case "idle":
        return "bg-yellow-500";
      case "dnd":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "online":
        return "Online";
      case "idle":
        return "Idle";
      case "dnd":
        return "Do Not Disturb";
      default:
        return "Offline";
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

  // Filter channels by type
  const textChannels = channels.filter((ch) => ch.type === "text");
  const voiceChannels = channels.filter((ch) => ch.type === "voice");

  // Count online friends
  const onlineFriendsCount = friends.filter((f) => {
    const status = userStatuses.get(f.username) || f.status;
    return status === "online";
  }).length;

  return (
    <>
      <div
        className={`relative flex-shrink-0 h-full transition-all duration-200 ${
          isCollapsed ? "w-0" : "w-60"
        }`}
      >
        {/* Main Content */}
        {!isCollapsed && (
          <div
            className={`flex flex-col h-full w-60 ${
              isDarkMode ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-900"
            }`}
          >
            {/* Community Header */}
            <div
              className={`px-4 h-12 flex items-center justify-between border-b shadow-sm ${
                isDarkMode ? "border-slate-700/50" : "border-gray-200"
              }`}
            >
              <h1 className="text-base font-bold truncate">
                {isLoadingCommunities ? "Loading..." : currentCommunity?.name || "Select Community"}
              </h1>
              <button
                onClick={handleCommunityManagementClick}
                className={`p-1 rounded transition-colors ${
                  isDarkMode ? "hover:bg-slate-700 text-gray-400" : "hover:bg-gray-200 text-gray-600"
                }`}
                title="Community Settings"
              >
                <SettingsIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin scrollbar-thumb-slate-600">
              {/* Loading State */}
              {isLoadingCommunities && (
                <div className="flex justify-center py-8">
                  <div className={`animate-spin rounded-full h-6 w-6 border-b-2 ${
                    isDarkMode ? "border-blue-400" : "border-blue-600"
                  }`}></div>
                </div>
              )}

              {/* Text Channels */}
              {textChannels.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between w-full px-2 py-1 text-xs font-semibold uppercase tracking-wide rounded transition-colors">
                    <button
                      onClick={() => toggleSection("text")}
                      className={`flex items-center gap-1 flex-1 ${
                        isDarkMode
                          ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700/30"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                      }`}
                    >
                      {expandedSections.text ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      Text Channels
                    </button>
                    <div
                      className={`p-0.5 rounded hover:bg-slate-700/50 cursor-pointer`}
                      title="Create Channel"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsCreateChannelModalOpen(true);
                      }}
                    >
                      <Plus className="w-3 h-3" />
                    </div>
                  </div>
                  {expandedSections.text && (
                    <div className="mt-1 space-y-0.5">
                      {textChannels.map((channel) => (
                        <button
                          key={channel.id}
                          onClick={() => handleChannelClick(channel.id)}
                          onContextMenu={(e) => handleChannelContextMenu(e, channel.id)}
                          className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition-colors group ${
                            currentChannel?.id === channel.id
                              ? isDarkMode
                                ? "bg-slate-700/70 text-white"
                                : "bg-gray-200 text-gray-900"
                              : isDarkMode
                              ? "text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
                              : "text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                          }`}
                        >
                          <Hash className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate flex-1">{channel.name}</span>
                          {channel.description && (
                            <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                              ℹ️
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Voice Channels */}
              {voiceChannels.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between w-full px-2 py-1 text-xs font-semibold uppercase tracking-wide rounded transition-colors">
                    <button
                      onClick={() => toggleSection("voice")}
                      className={`flex items-center gap-1 flex-1 ${
                        isDarkMode
                          ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700/30"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                      }`}
                    >
                      {expandedSections.voice ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      Voice Channels
                    </button>
                    <div
                      className={`p-0.5 rounded hover:bg-slate-700/50 cursor-pointer`}
                      title="Create Voice Channel"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsCreateChannelModalOpen(true);
                      }}
                    >
                      <Plus className="w-3 h-3" />
                    </div>
                  </div>
                  {expandedSections.voice && (
                    <div className="mt-1 space-y-0.5">
                      {voiceChannels.map((channel) => (
                        <button
                          key={channel.id}
                          onClick={() => handleChannelClick(channel.id)}
                          onContextMenu={(e) => handleChannelContextMenu(e, channel.id)}
                          className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${
                            currentChannel?.id === channel.id
                              ? isDarkMode
                                ? "bg-slate-700/70 text-white"
                                : "bg-gray-200 text-gray-900"
                              : isDarkMode
                              ? "text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
                              : "text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                          }`}
                        >
                          <Volume2 className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{channel.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Direct Messages / Friends */}
              {friends.length > 0 && (
                <div className="mb-3">
                  <button
                    onClick={() => toggleSection("friends")}
                    className={`flex items-center justify-between w-full px-2 py-1 text-xs font-semibold uppercase tracking-wide rounded transition-colors ${
                      isDarkMode
                        ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700/30"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      {expandedSections.friends ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      Direct Messages
                    </div>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        isDarkMode ? "bg-slate-700 text-slate-300" : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      {onlineFriendsCount}
                    </span>
                  </button>
                  {expandedSections.friends && (
                    <div className="mt-1 space-y-0.5">
                      {friends.map((friend) => {
                        const status = userStatuses.get(friend.username) || friend.status;
                        const isOnline = status === "online";
                        
                        return (
                          <button
                            key={friend.id}
                            onClick={() => handleFriendClick(friend.id)}
                            className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition-colors group ${
                              currentFriend?.id === friend.id
                                ? isDarkMode
                                  ? "bg-slate-700/70 text-white"
                                  : "bg-gray-200 text-gray-900"
                                : isDarkMode
                                ? "text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
                                : "text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                            }`}
                            title={`${friend.display_name} - ${getStatusText(status)}`}
                          >
                            <div className="relative flex-shrink-0">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold ${
                                isOnline ? "bg-green-600" : "bg-gray-600"
                              }`}>
                                {getAvatarInitials(friend.display_name)}
                              </div>
                              <div
                                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${
                                  isDarkMode ? "border-slate-800" : "border-gray-100"
                                } ${getStatusColor(status)}`}
                              ></div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-medium text-xs">
                                {friend.display_name}
                              </div>
                              {friend.custom_status && (
                                <div className={`text-xs truncate ${
                                  isDarkMode ? "text-slate-500" : "text-gray-500"
                                }`}>
                                  {friend.custom_status}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Empty State */}
              {!isLoadingCommunities && 
               textChannels.length === 0 && 
               voiceChannels.length === 0 && 
               friends.length === 0 && (
                <div className="text-center py-12 px-4">
                  <div className={`text-4xl mb-3`}>📭</div>
                  <p className={`text-sm font-medium mb-1 ${
                    isDarkMode ? "text-gray-300" : "text-gray-700"
                  }`}>
                    No channels yet
                  </p>
                  <p className={`text-xs ${
                    isDarkMode ? "text-gray-500" : "text-gray-600"
                  }`}>
                    Create a channel to get started
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Section - Members Button with Count */}
            {currentCommunity && (
              <div
                className={`px-4 py-3 border-t ${
                  isDarkMode ? "border-slate-700/50 bg-slate-800/50" : "border-gray-200 bg-gray-50"
                }`}
              >
                <button
                  onClick={() => setIsMembersModalOpen(true)}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded text-sm transition-colors ${
                    isDarkMode
                      ? "text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
                      : "text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                  }`}
                >
                  <Users className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">Members</span>
                  <span className="ml-auto flex items-center gap-1">
                    {isLoadingMembers ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          isDarkMode ? "bg-slate-700 text-slate-300" : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        {communityMembers.length}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Collapsed State - Expand Button */}
        {isCollapsed && (
          <button
            onClick={() => setIsCollapsed(false)}
            className={`absolute left-0 top-3 w-6 h-6 rounded-r-lg flex items-center justify-center transition-colors shadow-lg z-10 ${
              isDarkMode
                ? "bg-slate-800 hover:bg-slate-700 text-slate-400 border border-l-0 border-slate-700"
                : "bg-gray-100 hover:bg-gray-200 text-gray-600 border border-l-0 border-gray-300"
            }`}
            title="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        <style>{`
          .scrollbar-thin::-webkit-scrollbar {
            width: 6px;
          }
          .scrollbar-thin::-webkit-scrollbar-track {
            background: transparent;
          }
          .scrollbar-thin::-webkit-scrollbar-thumb {
            background: rgba(100, 116, 139, 0.4);
            border-radius: 10px;
          }
          .scrollbar-thin::-webkit-scrollbar-thumb:hover {
            background: rgba(100, 116, 139, 0.6);
          }
        `}</style>
      </div>

      {/* Add Members Modal - Only render when community exists */}
      {currentCommunity && (
        <CommunityMembersAddModal
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          communityId={currentCommunity.id}
          existingMembers={communityMembers}
          onMemberAdded={() => {
            loadMembers(); // Refresh member list + count
            toast.success("Member added!");
          }}
        />
      )}

      {/* Create Channel Modal */}
      {currentCommunity && (
        <CreateChannelModal
          isOpen={isCreateChannelModalOpen}
          onClose={() => setIsCreateChannelModalOpen(false)}
          communityId={currentCommunity.id}
          currentChannelType={currentChannel?.type || 'text'}
          onChannelCreated={handleChannelCreated}
        />
      )}

      {/* Channel Management Modal */}
      <ChannelManagementModal
        isOpen={!!selectedChannelForManagement}
        onClose={() => setSelectedChannelForManagement(null)}
        channel={selectedChannelForManagement}
        communityId={currentCommunity?.id}
        userRole={currentCommunity ? "admin" : "member"} // TODO: Get actual user role from context
        onChannelUpdated={(updated) => {
          // Handle channel update
          handleChannelCreated();
        }}
        onChannelDeleted={handleChannelDeleted}
      />

      {/* Community Management Modal */}
      {currentCommunity && (
        <CommunityManagementModal
          isOpen={isCommunityManagementOpen}
          onClose={() => setIsCommunityManagementOpen(false)}
          community={{
            id: currentCommunity.id,
            name: currentCommunity.name,
            description: currentCommunity.description,
            icon: currentCommunity.icon || "AF",
            color: currentCommunity.color || "#8B5CF6",
          }}
          userRole={userRoleInCommunity}
          onCommunityDeleted={handleCommunityDeleted}
          onCommunityLeft={handleCommunityLeft}
        />
      )}

      {/* Context Menu for Channels */}
      {contextMenu && (
        <div
          className={`fixed bg-white rounded-lg shadow-lg z-50 border ${
            isDarkMode ? "bg-slate-800 border-slate-700" : "border-gray-200"
          }`}
          style={{
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
          }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button
            onClick={() => {
              const channel = channels.find(c => c.id === contextMenu.channelId);
              if (channel) handleChannelSettingsClick(channel);
            }}
            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${
              isDarkMode
                ? "hover:bg-slate-700 text-gray-200"
                : "hover:bg-gray-100 text-gray-900"
            }`}
          >
            <SettingsIcon className="w-4 h-4" />
            Channel Settings
          </button>
        </div>
      )}
    </>
  );
}