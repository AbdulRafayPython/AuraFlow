// components/sidebar/ChannelSidebar.tsx - channels of the current community (real-time, member management)
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Hash,
  Volume2,
  Users,
  Plus,
  Settings as SettingsIcon,
  Loader2,
  Radio,
  PhoneCall,
} from "lucide-react";
import { toast } from "sonner";
import { cn, getAvatarUrl } from "@/lib/utils";
import { useRealtime } from "@/hooks/useRealtime";
import { useVoice } from "@/contexts/VoiceContext";
import { voiceService } from "@/services/voiceService";
import { socketService } from "@/services/socketService";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
import { Icon } from "@/components/app/Icon";
import { SidebarListSkeleton } from "@/components/chat/MessageListSkeleton";
import { useMentionableAgents } from "@/hooks/useMentionableAgents";
import { useCommunityMembers } from "@/hooks/useCommunityMembers";
import { useOpenAgent } from "@/components/ai-agents/AgentDetailPane";
import { AgentAvatar } from "@/components/ai-agents/AgentMessageShell";
import CommunityMembersAddModal from "@/components/modals/CommunityMembersAddModal";
import CreateChannelModal from "@/components/modals/CreateChannelModal";
import ChannelManagementModal from "@/components/modals/ChannelManagementModal";
import CommunityManagementModal from "@/components/modals/CommunityManagementModal";

interface ChannelSidebarProps {
  onNavigate?: (view: string) => void;
  onMembersModalChange?: (isOpen: boolean) => void;
  onCommunityManagementModalChange?: (isOpen: boolean) => void;
  /** Fill the container (mobile drawer) instead of the fixed 260px width. */
  fluid?: boolean;
}

export default function ChannelSidebar({ onNavigate, onMembersModalChange, onCommunityManagementModalChange, fluid = false }: ChannelSidebarProps) {
  const navigate = useNavigate();
  const {
    currentCommunity,
    channels,
    currentChannel,
    addChannel,
    friends,
    isLoadingCommunities,
    reloadCommunities,
  } = useRealtime();

  // Modal & Members State
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const { members: communityMembers, loading: isLoadingMembers, reload: loadMembers } = useCommunityMembers(currentCommunity?.id);
  const [isCreateChannelModalOpen, setIsCreateChannelModalOpen] = useState(false);
  const [selectedChannelForManagement, setSelectedChannelForManagement] = useState<any>(null);
  const [isCommunityManagementOpen, setIsCommunityManagementOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; channelId?: number } | null>(null);

  // Use role directly from currentCommunity (comes from API)
  const userRoleInCommunity = currentCommunity?.role || 'member';
  const canManageChannels = userRoleInCommunity === 'owner' || userRoleInCommunity === 'admin';

  // Filter channels by type (declared early so useEffects can reference them)
  const textChannels = channels.filter((ch) => ch.type === "text");
  const voiceChannels = channels.filter((ch) => ch.type === "voice");

  const [expandedSections, setExpandedSections] = useState({
    text: true,
    voice: true,
    agents: true,
  });
  // Live agents people can @mention here; Aura first.
  const agents = useMentionableAgents(currentCommunity?.id);
  const openAgent = useOpenAgent();

  // Unread counts — from centralised hook (driven by channel_activity + unread_update + initial_unreads)
  const { channels: unreadCounts, markChannelRead: markChRead } = useUnreadCounts();

  // Voice participants for sidebar cards
  const [voiceParticipants, setVoiceParticipants] = useState<Record<string, { members: Array<{ id: number; username: string; display_name: string; avatar_url?: string }>; total: number }>>({});

  const { isInVoiceChannel, currentVoiceChannel, joinVoiceChannel, setVoiceRoomModalOpen } = useVoice();

  // ── Mark channel as read when selected ──────────────────────────────
  useEffect(() => {
    if (currentChannel?.id && currentCommunity?.id) {
      markChRead(currentChannel.id, currentCommunity.id);
    }
  }, [currentChannel?.id, currentCommunity?.id, markChRead]);

  // Fetch voice participants for sidebar cards.
  // Gated: only poll when the voice section is expanded AND the tab is visible —
  // socket events (user_joined_voice / user_left_voice) cover the live updates,
  // so polling is just a safety-net refresh.
  useEffect(() => {
    if (voiceChannels.length === 0) return;
    if (!expandedSections.voice) return;

    const fetchParticipants = () => {
      if (document.hidden) return;
      const ids = voiceChannels.map(ch => ch.id);
      voiceService.getVoiceParticipants(ids);
    };

    fetchParticipants();

    // 30s safety-net poll (was 10s) — socket events handle the real-time path.
    const interval = setInterval(fetchParticipants, 30000);

    const handleUpdate = (data: any) => {
      setVoiceParticipants(data.channels || {});
    };
    voiceService.onVoiceParticipantsUpdate(handleUpdate);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceChannels.length, expandedSections.voice]);

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


  const handleChannelContextMenu = (e: React.MouseEvent, channelId: number) => {
    e.preventDefault();
    if (!canManageChannels) return;
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

  const sectionHeader = (label: string, section: keyof typeof expandedSections, createLabel: string) => (
    <div className="flex items-center justify-between px-1">
      <button
        type="button"
        onClick={() => toggleSection(section)}
        aria-expanded={expandedSections[section]}
        className="flex flex-1 items-center gap-1 rounded-md px-1 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground"
      >
        <Icon icon={ChevronDown} size="sm" className={cn("transition-transform duration-150", !expandedSections[section] && "-rotate-90")} />
        {label}
      </button>
      {canManageChannels && (
        <button
          type="button"
          onClick={() => setIsCreateChannelModalOpen(true)}
          aria-label={createLabel}
          title={createLabel}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground"
        >
          <Icon icon={Plus} size="md" />
        </button>
      )}
    </div>
  );

  return (
    <>
      <aside
        aria-label="Channels"
        className={cn(
          "relative flex h-full shrink-0 flex-col border-r border-border text-foreground",
          fluid ? "w-full" : "w-sidebar",
          isMembersModalOpen && "pointer-events-none",
        )}
        style={{ background: 'var(--theme-sidebar-gradient)' }}
      >
        {/* Community Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h1 className="truncate text-base font-semibold">
            {isLoadingCommunities ? "Loading..." : currentCommunity?.name || "Select Community"}
          </h1>
          <button
            type="button"
            onClick={handleCommunityManagementClick}
            aria-label="Community settings"
            title="Community settings"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground"
          >
            <Icon icon={SettingsIcon} size="md" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-2 py-3">
          {/* Loading State */}
          {isLoadingCommunities && (
            <SidebarListSkeleton />
          )}

          {/* Text Channels */}
          {textChannels.length > 0 && (
            <div className="mb-3">
              {sectionHeader("Channels", "text", "Create channel")}
              {expandedSections.text && (
                <div className="mt-0.5 space-y-0.5" role="list">
                  {textChannels.map((channel) => {
                    const unread = unreadCounts[channel.id] || 0;
                    const isCurrent = currentChannel?.id === channel.id;
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        role="listitem"
                        onClick={() => handleChannelClick(channel.id)}
                        onContextMenu={(e) => handleChannelContextMenu(e, channel.id)}
                        aria-current={isCurrent ? "page" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150",
                          isCurrent
                            ? "bg-[hsl(var(--theme-bg-active))] text-foreground"
                            : "text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground",
                        )}
                      >
                        <Icon icon={Hash} size="md" />
                        <span className={cn("flex-1 truncate", unread > 0 && "font-semibold text-foreground")}>{channel.name}</span>
                        {unread > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Voice Channels — live rooms */}
          {voiceChannels.length > 0 && (
            <div className="mb-3">
              {sectionHeader("Voice", "voice", "Create voice channel")}
              {expandedSections.voice && (
                <div className="mt-0.5 space-y-0.5">
                  {voiceChannels.map((channel) => {
                    const participants = voiceParticipants[String(channel.id)];
                    const memberCount = participants?.total || 0;
                    const memberPreviews = participants?.members || [];
                    const isActive = memberCount > 0;
                    const isCurrentChannel = isInVoiceChannel && currentVoiceChannel === channel.id;

                    return (
                      <div key={channel.id} className={cn("rounded-md", isCurrentChannel && "bg-[hsl(var(--theme-bg-active))]")}>
                        <button
                          type="button"
                          onClick={() => {
                            if (isCurrentChannel) {
                              setVoiceRoomModalOpen(true);
                            } else {
                              joinVoiceChannel(channel.id, channel.name);
                            }
                          }}
                          onContextMenu={(e) => handleChannelContextMenu(e, channel.id)}
                          className={cn(
                            "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150",
                            isCurrentChannel
                              ? "text-foreground"
                              : "text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground",
                          )}
                        >
                          <Icon icon={isActive ? Radio : Volume2} size="md" className={cn(isActive && "text-success")} />
                          <span className="flex-1 truncate">{channel.name}</span>
                          {isActive && (
                            <span className="rounded-full bg-[hsl(var(--theme-bg-tertiary))] px-1.5 text-xs text-muted-foreground">
                              {memberCount}
                            </span>
                          )}
                          {!isCurrentChannel && (
                            <Icon icon={PhoneCall} size="sm" className="opacity-0 transition-opacity group-hover:opacity-60" />
                          )}
                        </button>

                        {/* Live participant preview */}
                        {isActive && memberPreviews.length > 0 && (
                          <div className="flex items-center gap-2 px-2 pb-1.5">
                            <div className="flex -space-x-1.5">
                              {memberPreviews.slice(0, 3).map((m) => (
                                <div
                                  key={m.id}
                                  className="h-5 w-5 overflow-hidden rounded-full ring-1 ring-[hsl(var(--theme-sidebar-bg))]"
                                  title={m.display_name}
                                >
                                  {m.avatar_url ? (
                                    <img src={getAvatarUrl(m.avatar_url, m.username)} alt={m.display_name} className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-[hsl(var(--theme-bg-tertiary))] text-xs font-medium text-foreground">
                                      {m.display_name?.[0]?.toUpperCase() || "?"}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                            <span className="truncate text-xs text-muted-foreground">
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

          {/* Agents (like Slack "Apps"): avatar, name, live dot */}
          {agents.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => toggleSection("agents")}
                  aria-expanded={expandedSections.agents}
                  className="flex flex-1 items-center gap-1 rounded-md px-1 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground"
                >
                  <Icon icon={ChevronDown} size="sm" className={cn("transition-transform duration-150", !expandedSections.agents && "-rotate-90")} />
                  Agents
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/agents")}
                  aria-label="Open the agents hub"
                  title="Agents hub"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground"
                >
                  <Icon icon={Plus} size="md" />
                </button>
              </div>
              {expandedSections.agents && (
                <div className="mt-0.5 space-y-0.5" role="list">
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      role="listitem"
                      onClick={() => openAgent(agent)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[hsl(var(--theme-text-secondary))] transition-colors duration-150 hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground"
                    >
                      <AgentAvatar name={agent.name} username={agent.username} builtin={agent.builtin} size="sm" />
                      <span className="flex-1 truncate">{agent.name}</span>
                      <span className="h-2 w-2 shrink-0 rounded-full bg-success" aria-label="Live" title="Live" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {!isLoadingCommunities &&
           textChannels.length === 0 &&
           voiceChannels.length === 0 &&
           friends.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="mb-1 text-sm font-medium text-foreground">No channels yet</p>
              <p className="mb-3 text-sm text-muted-foreground">Create a channel to get started.</p>
              {canManageChannels && (
                <button
                  type="button"
                  onClick={() => setIsCreateChannelModalOpen(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Icon icon={Plus} size="md" />
                  New channel
                </button>
              )}
            </div>
          )}
        </div>

        {/* Members */}
        {currentCommunity && (
          <div className="shrink-0 border-t border-border p-2">
            <button
              type="button"
              onClick={() => {
                setIsMembersModalOpen(true);
                onMembersModalChange?.(true);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[hsl(var(--theme-text-secondary))] transition-colors hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground"
            >
              <Icon icon={Users} size="md" />
              <span className="truncate">Members</span>
              <span className="ml-auto flex items-center">
                {isLoadingMembers ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span className="rounded-full bg-[hsl(var(--theme-bg-tertiary))] px-2 text-xs text-[hsl(var(--theme-text-secondary))]">
                    {communityMembers.length}
                  </span>
                )}
              </span>
            </button>
          </div>
        )}
      </aside>

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
          role="menu"
          className="fixed z-50 rounded-lg border border-border bg-popover p-1 shadow-popover"
          style={{
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
          }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const channel = channels.find(c => c.id === contextMenu.channelId);
              if (channel) handleChannelSettingsClick(channel);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-foreground hover:bg-[hsl(var(--theme-bg-hover))]"
          >
            <Icon icon={SettingsIcon} size="md" />
            Channel settings
          </button>
        </div>
      )}
    </>
  );
}
