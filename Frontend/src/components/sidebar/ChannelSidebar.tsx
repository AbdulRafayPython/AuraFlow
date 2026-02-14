// components/sidebar/ChannelSidebar.tsx - Real-time Version with Member Management
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ChevronDown, 
  ChevronRight, 
  Hash, 
  Volume2, 
  Users, 
  Plus, 
  Settings as SettingsIcon,
  Loader2,
  MoreVertical,
  Radio,
  PhoneCall
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useRealtime } from "@/hooks/useRealtime";
import { useVoice } from "@/contexts/VoiceContext";
import { channelService } from "@/services/channelService";
import { statusService } from "@/services/statusService";
import { voiceService } from "@/services/voiceService";
import { socketService } from "@/services/socketService";
import { getAvatarUrl } from "@/lib/utils";
import CommunityMembersAddModal from "@/components/modals/CommunityMembersAddModal";
import CreateChannelModal from "@/components/modals/CreateChannelModal";
import ChannelManagementModal from "@/components/modals/ChannelManagementModal";
import CommunityManagementModal from "@/components/modals/CommunityManagementModal";
import toast from "react-hot-toast";

interface ChannelSidebarProps {
  onNavigate?: (view: string) => void;
  onMembersModalChange?: (isOpen: boolean) => void;
  onCommunityManagementModalChange?: (isOpen: boolean) => void;
}

interface CommunityMember {
  id: number;
  username: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  role: "owner" | "admin" | "member";
}

export default function ChannelSidebar({ onNavigate, onMembersModalChange, onCommunityManagementModalChange }: ChannelSidebarProps) {
  const navigate = useNavigate();
  const { isDarkMode, currentTheme } = useTheme();
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
  
  // Use role directly from currentCommunity (comes from API)
  const userRoleInCommunity = currentCommunity?.role || 'member';

  // Filter channels by type (declared early so useEffects can reference them)
  const textChannels = channels.filter((ch) => ch.type === "text");
  const voiceChannels = channels.filter((ch) => ch.type === "voice");

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    text: true,
    voice: true,
    friends: true,
  });

  // Unread counts
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  
  // Voice participants for sidebar cards
  const [voiceParticipants, setVoiceParticipants] = useState<Record<string, { members: Array<{ id: number; username: string; display_name: string; avatar_url?: string }>; total: number }>>({});
  
  const { isInVoiceChannel, currentVoiceChannel, joinVoiceChannel, leaveVoiceChannel, voiceUsers, setVoiceRoomModalOpen } = useVoice();

  // Fetch unread counts when community changes
  useEffect(() => {
    if (!currentCommunity) return;
    statusService.getUnreadCounts().then(data => {
      const map: Record<number, number> = {};
      data.forEach((c: any) => { map[c.channel_id] = c.unread_count; });
      setUnreadCounts(map);
    }).catch(() => {});
  }, [currentCommunity?.id]);

  // Clear unread when a channel is selected
  useEffect(() => {
    if (currentChannel?.id) {
      setUnreadCounts(prev => ({ ...prev, [currentChannel.id]: 0 }));
    }
  }, [currentChannel?.id]);

  // Socket: increment unread on new message for non-active channels
  useEffect(() => {
    const handleNewMessage = (data: any) => {
      if (data.channel_id && data.channel_id !== currentChannel?.id) {
        setUnreadCounts(prev => ({
          ...prev,
          [data.channel_id]: (prev[data.channel_id] || 0) + 1,
        }));
      }
    };
    socketService.getSocket()?.on('new_message', handleNewMessage);
    return () => { socketService.getSocket()?.off('new_message', handleNewMessage); };
  }, [currentChannel?.id]);

  // Fetch voice participants for sidebar cards
  useEffect(() => {
    if (voiceChannels.length === 0) return;
    
    const fetchParticipants = () => {
      const ids = voiceChannels.map(ch => ch.id);
      voiceService.getVoiceParticipants(ids);
    };
    
    // Initial fetch
    fetchParticipants();
    
    // Poll every 10 seconds for live updates
    const interval = setInterval(fetchParticipants, 10000);
    
    // Listen for updates
    const handleUpdate = (data: any) => {
      setVoiceParticipants(data.channels || {});
    };
    voiceService.onVoiceParticipantsUpdate(handleUpdate);
    
    // Also refresh on user_joined_voice / user_left_voice
    const refreshOnChange = () => {
      setTimeout(fetchParticipants, 500);
    };
    socketService.getSocket()?.on('user_joined_voice', refreshOnChange);
    socketService.getSocket()?.on('user_left_voice', refreshOnChange);
    
    return () => {
      clearInterval(interval);
      socketService.getSocket()?.off('voice_participants_update', handleUpdate);
      socketService.getSocket()?.off('user_joined_voice', refreshOnChange);
      socketService.getSocket()?.off('user_left_voice', refreshOnChange);
    };
  }, [voiceChannels.length]);

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
    if (currentCommunity) {
      navigate(`/community/${currentCommunity.id}/channel/${channelId}`);
    }
  };

  const handleFriendClick = (friendId: number) => {
    selectFriend(friendId);
    navigate(`/dm/${friendId}`);
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
    onCommunityManagementModalChange?.(true);
  };

  const handleChannelCreated = (newChannel: any) => {
    // Close the modal
    setIsCreateChannelModalOpen(false);
    
    // Immediately add channel to the list (don't wait for socket)
    if (newChannel && newChannel.id) {
      addChannel(newChannel);
      
      // Automatically select the newly created channel
      setTimeout(() => {
        if (currentCommunity) {
          navigate(`/community/${currentCommunity.id}/channel/${newChannel.id}`);
        }
      }, 100); // Small delay to ensure state is updated
    }
  };

  const handleChannelDeleted = () => {
    setSelectedChannelForManagement(null);
  };

  const handleCommunityDeleted = async () => {
    setIsCommunityManagementOpen(false);
    onCommunityManagementModalChange?.(false);
    
    // Reload communities to update the list
    await reloadCommunities();
    
    // Navigate to home (empty communities = Home page)
    navigate('/');
  };

  const handleCommunityLeft = async () => {
    setIsCommunityManagementOpen(false);
    onCommunityManagementModalChange?.(false);
    
    // Reload communities to update the list
    await reloadCommunities();
    
    // Navigate to home (socket listener will handle state cleanup)
    navigate('/');
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
        } ${isMembersModalOpen ? "blur-[2px] pointer-events-none" : ""}`}
      >
        {/* Main Content */}
        {!isCollapsed && (
          <div
            className="flex flex-col h-full w-60 text-[hsl(var(--theme-text-primary))] transition-colors duration-300 relative"
            style={{ background: 'var(--theme-sidebar-gradient)' }}
          >
            {/* Gradient overlay for depth and blending - hidden for basic/onyx themes */}
            {currentTheme !== 'basic' && currentTheme !== 'onyx' && (
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse at 20% 30%, hsl(var(--theme-accent-primary) / 0.04) 0%, transparent 60%), radial-gradient(ellipse at 80% 70%, hsl(var(--theme-accent-secondary) / 0.03) 0%, transparent 50%)',
                }}
              />
            )}
            
            {/* Right edge gradient that blends with Dashboard - hidden for basic/onyx themes */}
            {currentTheme !== 'basic' && currentTheme !== 'onyx' && (
              <div 
                className="absolute right-0 top-0 w-12 h-full pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, hsl(var(--theme-bg-primary) / 0.3) 50%, hsl(var(--theme-bg-primary) / 0.5) 100%)'
                }}
              />
            )}
            {/* Top accent line - hidden for basic/onyx themes */}
            {currentTheme !== 'basic' && currentTheme !== 'onyx' && (
              <div 
                className="absolute top-0 left-0 right-0 h-px z-20"
                style={{
                  background: 'var(--theme-accent-gradient)',
                  opacity: 0.6
                }}
              />
            )}
            
            {/* Community Header */}
            <div
              className="px-4 h-12 flex items-center justify-between border-b shadow-sm backdrop-blur-sm border-[hsl(var(--theme-border-default)/0.3)] relative z-10"
              style={{ background: 'hsl(var(--theme-sidebar-bg) / 0.5)' }}
            >
              <h1 className="text-base font-bold truncate">
                {isLoadingCommunities ? "Loading..." : currentCommunity?.name || "Select Community"}
              </h1>
              <button
                onClick={handleCommunityManagementClick}
                className="p-1 rounded transition-colors hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))]"
                title="Community Settings"
              >
                <SettingsIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin scrollbar-thumb-slate-600 relative z-[5]">
              {/* Loading State */}
              {isLoadingCommunities && (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[hsl(var(--theme-accent-primary))]"></div>
                </div>
              )}

              {/* Text Channels */}
              {textChannels.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between w-full px-2 py-1 text-xs font-semibold uppercase tracking-wide rounded transition-colors">
                    <button
                      onClick={() => toggleSection("text")}
                      className="flex items-center gap-1 flex-1 text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover)/0.3)]"
                    >
                      {expandedSections.text ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      Text Channels
                    </button>
                    <div
                      className="p-0.5 rounded hover:bg-[hsl(var(--theme-bg-hover))] cursor-pointer text-[hsl(var(--theme-text-muted))]"
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
                              ? "bg-[hsl(var(--theme-bg-active))] text-[hsl(var(--theme-text-primary))]"
                              : "text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))]"
                          }`}
                        >
                          <Hash className="w-4 h-4 flex-shrink-0" />
                          <span className={`truncate flex-1 ${unreadCounts[channel.id] > 0 ? 'font-semibold text-[hsl(var(--theme-text-primary))]' : ''}`}>{channel.name}</span>
                          {unreadCounts[channel.id] > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1 bg-[hsl(var(--theme-accent-primary))] text-white">
                              {unreadCounts[channel.id] > 99 ? '99+' : unreadCounts[channel.id]}
                            </span>
                          )}
                          {channel.description && !unreadCounts[channel.id] && (
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

              {/* Voice Channels — Live Room Cards */}
              {voiceChannels.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between w-full px-2 py-1 text-xs font-semibold uppercase tracking-wide rounded transition-colors">
                    <button
                      onClick={() => toggleSection("voice")}
                      className="flex items-center gap-1 flex-1 text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover)/0.3)]"
                    >
                      {expandedSections.voice ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      Voice Channels
                    </button>
                    <div
                      className="p-0.5 rounded hover:bg-[hsl(var(--theme-bg-hover))] cursor-pointer text-[hsl(var(--theme-text-muted))]"
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
                    <div className="mt-1 space-y-1.5">
                      {voiceChannels.map((channel) => {
                        const participants = voiceParticipants[String(channel.id)];
                        const memberCount = participants?.total || 0;
                        const memberPreviews = participants?.members || [];
                        const isActive = memberCount > 0;
                        const isCurrentChannel = isInVoiceChannel && currentVoiceChannel === channel.id;

                        return (
                          <div
                            key={channel.id}
                            className={`rounded-lg transition-all duration-200 overflow-hidden ${
                              isCurrentChannel
                                ? "bg-[hsl(var(--theme-accent-primary)/0.12)] ring-1 ring-[hsl(var(--theme-accent-primary)/0.3)]"
                                : isActive
                                  ? "bg-[hsl(var(--theme-bg-tertiary)/0.5)]"
                                  : ""
                            }`}
                          >
                            {/* Channel header row */}
                            <button
                              onClick={() => {
                                if (isCurrentChannel) {
                                  setVoiceRoomModalOpen(true);
                                } else {
                                  joinVoiceChannel(channel.id, channel.name);
                                }
                              }}
                              onContextMenu={(e) => handleChannelContextMenu(e, channel.id)}
                              className={`w-full text-left px-2.5 py-2 text-sm flex items-center gap-2 transition-colors group ${
                                isCurrentChannel
                                  ? "text-[hsl(var(--theme-accent-primary))]"
                                  : "text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))]"
                              }`}
                            >
                              {/* Icon */}
                              <div className="relative flex-shrink-0">
                                {isActive ? (
                                  <Radio className={`w-4 h-4 ${isCurrentChannel ? 'text-[hsl(var(--theme-accent-primary))]' : 'text-green-400'}`} />
                                ) : (
                                  <Volume2 className="w-4 h-4" />
                                )}
                                {isActive && !isCurrentChannel && (
                                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500" />
                                )}
                              </div>

                              <span className="truncate flex-1 font-medium">{channel.name}</span>

                              {/* Participant count badge */}
                              {isActive && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  isCurrentChannel
                                    ? "bg-[hsl(var(--theme-accent-primary)/0.2)] text-[hsl(var(--theme-accent-primary))]"
                                    : "bg-green-500/15 text-green-400"
                                }`}>
                                  {memberCount}
                                </span>
                              )}

                              {/* Join hint on hover (only if not already in it) */}
                              {!isCurrentChannel && (
                                <PhoneCall className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
                              )}
                            </button>

                            {/* Live participant preview (stacked avatars) */}
                            {isActive && memberPreviews.length > 0 && (
                              <div className="px-2.5 pb-2 flex items-center gap-1.5">
                                <div className="flex -space-x-1.5">
                                  {memberPreviews.slice(0, 3).map((m) => (
                                    <div
                                      key={m.id}
                                      className="w-5 h-5 rounded-full overflow-hidden ring-1 ring-[hsl(var(--theme-bg-secondary))]"
                                      title={m.display_name}
                                    >
                                      {m.avatar_url ? (
                                        <img
                                          src={getAvatarUrl(m.avatar_url, m.username)}
                                          alt={m.display_name}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] text-white text-[7px] font-bold">
                                          {m.display_name?.[0]?.toUpperCase() || "?"}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <span className="text-[10px] text-[hsl(var(--theme-text-muted))]">
                                  {memberPreviews.slice(0, 3).map(m => m.display_name.split(' ')[0]).join(', ')}
                                  {memberCount > 3 && ` +${memberCount - 3}`}
                                </span>
                              </div>
                            )}
                          </div>
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
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-sm font-medium mb-1 text-[hsl(var(--theme-text-secondary))]">
                    No channels yet
                  </p>
                  <p className="text-xs text-[hsl(var(--theme-text-muted))]">
                    Create a channel to get started
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Section - Members Button with Count */}
            {currentCommunity && (
              <div
                className="px-4 py-3 border-t border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-bg-secondary)/0.5)]"
              >
                <button
                  onClick={() => {
                    setIsMembersModalOpen(true);
                    onMembersModalChange?.(true);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded text-sm transition-colors text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))]"
                >
                  <Users className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">Members</span>
                  <span className="ml-auto flex items-center gap-1">
                    {isLoadingMembers ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))]"
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
            className="absolute left-0 top-3 w-6 h-6 rounded-r-lg flex items-center justify-center transition-colors shadow-lg z-10 bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] border border-l-0 border-[hsl(var(--theme-border-default))]"
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
          onClose={() => {
            setIsMembersModalOpen(false);
            onMembersModalChange?.(false);
          }}
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
          currentChannelType={(currentChannel?.type as 'text' | 'voice') || 'text'}
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
          handleChannelCreated(updated);
        }}
        onChannelDeleted={handleChannelDeleted}
      />

      {/* Community Management Modal */}
      {currentCommunity && (
        <CommunityManagementModal
          isOpen={isCommunityManagementOpen}
          onClose={() => {
            setIsCommunityManagementOpen(false);
            onCommunityManagementModalChange?.(false);
          }}
          community={{
            ...currentCommunity,
            icon: currentCommunity.icon || "AF",
            color: currentCommunity.color || "#8B5CF6",
            role: userRoleInCommunity,
            member_count: communityMembers.length || currentCommunity.member_count,
            channel_count: channels.length || currentCommunity.channel_count,
          }}
          userRole={userRoleInCommunity}
          onCommunityDeleted={handleCommunityDeleted}
          onCommunityLeft={handleCommunityLeft}
          onCommunityUpdated={async () => {
            await reloadCommunities();
          }}
        />
      )}

      {/* Context Menu for Channels */}
      {contextMenu && (
        <div
          className="fixed rounded-lg shadow-lg z-50 border bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))]"
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
            className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-primary))]"
          >
            <SettingsIcon className="w-4 h-4" />
            Channel Settings
          </button>
        </div>
      )}
    </>
  );
}