// REWRITE: ~1.2k-line class with one handler array per event; replace with a typed event map.
// services/socketService.ts - FIXED: Proper token passing
import { io, Socket } from 'socket.io-client';
import type { Message, AgentRunEvent } from '@/types';
import type { AgentApproval, ApprovalResolvedEvent } from '@/types/agentBuilder';

interface UserStatus {
  username: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
}

interface TypingIndicator {
  username: string;
  channel_id: number;
  is_typing: boolean;
}

interface DirectMessageEvent {
  id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'ai' | 'voice' | 'video' | 'call';
  created_at: string;
  is_read: boolean;
  reply_to?: number | null;
  reply_to_preview?: {
    id: number;
    content: string;
    author: string;
    message_type: string;
  };
  attachment?: {
    file_name: string;
    file_url: string;
    file_size: number;
    mime_type: string;
  };
  sender?: any;
  receiver?: any;
  edited_at?: string;
}

interface FriendRequestEvent {
  id: number;
  sender_id: number;
  receiver_id: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  created_at: string;
  sender?: {
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}

type MessageHandler = (message: Message) => void;
type StatusHandler = (status: UserStatus) => void;
type TypingHandler = (data: TypingIndicator) => void;
type AgentRunHandler = (phase: 'started' | 'finished', data: AgentRunEvent) => void;
type AgentApprovalHandler = (phase: 'requested' | 'resolved', data: AgentApproval | ApprovalResolvedEvent) => void;
type ErrorHandler = (error: { msg: string }) => void;
type CommunityHandler = (data: any) => void;
type CommunityRemovedHandler = (data: { community_id: number; community_public_id?: string; user_id: number; reason: string; message?: string; notification?: { community_name: string; community_logo?: string; community_color: string; community_icon: string } }) => void;
type UserBlockedHandler = (data: { community_id: number; user_id: number; blocked_at: string }) => void;
type ChannelHandler = (data: any) => void;
type DirectMessageHandler = (message: DirectMessageEvent) => void;
type FriendRequestHandler = (request: FriendRequestEvent) => void;
type FriendStatusHandler = (data: { friend_id: number; status: string; request_id?: number }) => void;
type ModerationActionHandler = (data: { community_id: number; channel_id: number; action: string; severity: string; timestamp: string }) => void;
type ModerationInlineHandler = (data: { message_id: number; user_id: number; username: string; channel_id: number; warning_text?: string; flag_text?: string; reason?: string; violation_count: number; max_violations?: number; reasons: string[]; severity: string; timestamp: string; removed_by?: string }) => void;
type CommandResultHandler = (data: { type: string; success: boolean; summary?: string; key_points?: string[]; method?: string; error?: string }) => void;
type UnreadUpdateHandler = (data: { channel_id?: number; community_id?: string; channel_unread?: number; community_unread?: number; total_unread?: number }) => void;
type DMUnreadUpdateHandler = (data: { sender_id: number; unread_count: number; total_dm_unread: number; total_unread: number }) => void;
type InitialUnreadsHandler = (data: { channels: Record<string, number>; communities: Record<string, number>; dms: Record<string, number>; total_unread: number }) => void;
type PinEventHandler = (data: { channel_id?: number; message_id: number; pin_id?: number; type?: string; pinned_by?: string; expires_at?: string | null }) => void;
type FriendsBulkStatusHandler = (data: Record<number, string>) => void;
type ChannelActivityHandler = (data: { channel_id: number; community_id: string; sender_id: number; message_id: number }) => void;
type SummaryGeneratingHandler = (data: { channel_id: number; status: string }) => void;
type SummaryResultHandler = (data: { channel_id: number; content: string; method: string; message_count: number; created_at: string }) => void;
type KBGeneratingHandler = (data: { channel_id: number; status: string }) => void;
type KBResultHandler = (data: { channel_id: number; content: string; subtype: string; total_items: number; faqs: number; definitions: number; decisions: number; method: string; result_count?: number; created_at: string }) => void;

class SocketService {
  private socket: Socket | null = null;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private hasConnectedOnce = false;
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private typingHandlers: TypingHandler[] = [];
  private agentRunHandlers: AgentRunHandler[] = [];
  private agentApprovalHandlers: AgentApprovalHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private communityHandlers: CommunityHandler[] = [];
  private communityRemovedHandlers: CommunityRemovedHandler[] = [];
  private userBlockedHandlers: UserBlockedHandler[] = [];
  private communityDeletedHandlers: CommunityHandler[] = [];
  private communityLeftHandlers: CommunityHandler[] = [];
  private channelHandlers: ChannelHandler[] = [];
  private directMessageHandlers: DirectMessageHandler[] = [];
  private dmEditHandlers: ((data: any) => void)[] = [];
  private dmDeleteHandlers: ((data: any) => void)[] = [];
  private friendRequestHandlers: FriendRequestHandler[] = [];
  private friendStatusHandlers: FriendStatusHandler[] = [];
  private moderationActionHandlers: ModerationActionHandler[] = [];
  private moderationWarnInlineHandlers: ModerationInlineHandler[] = [];
  private moderationFlagInlineHandlers: ModerationInlineHandler[] = [];
  private moderationUserRemovedHandlers: ModerationInlineHandler[] = [];
  private moderationRetroactiveHandlers: ((data: { message_id: number; channel_id: number; user_id: number; username: string; action: string; severity: string; reasons: string[]; explanation: string; violation_count: number; banner_text: string; timestamp: string }) => void)[] = [];
  private moderationScanProgressHandlers: ((data: { community_id: number; channel_id: number; status: string; scanned: number; total: number; flagged: number; percent: number }) => void)[] = [];
  private commandResultHandlers: CommandResultHandler[] = [];
  private unreadUpdateHandlers: UnreadUpdateHandler[] = [];
  private dmUnreadUpdateHandlers: DMUnreadUpdateHandler[] = [];
  private initialUnreadsHandlers: InitialUnreadsHandler[] = [];
  private pinEventHandlers: PinEventHandler[] = [];
  private friendsBulkStatusHandlers: FriendsBulkStatusHandler[] = [];
  private channelActivityHandlers: ChannelActivityHandler[] = [];
  private summaryGeneratingHandlers: SummaryGeneratingHandler[] = [];
  private summaryResultHandlers: SummaryResultHandler[] = [];
  private kbGeneratingHandlers: KBGeneratingHandler[] = [];
  private kbResultHandlers: KBResultHandler[] = [];
  private pollVoteUpdateHandlers: ((data: { message_id: number; channel_id: number; tallies: number[]; total: number }) => void)[] = [];
  private dmTypingHandlers: ((data: { user_id: number; is_typing: boolean }) => void)[] = [];
  private currentChannel: number | null = null;
  private currentDMUser: number | null = null;
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  
  // Global DM listener tracker
  private dmListenerRegistered: boolean = false;
  // Dedup set for DM messages (receiver gets message from both DM room & personal room)
  private recentDMIds: Set<number> = new Set();
  // Track if socket event listeners have been set up (prevent duplicates)
  private listenersAttached: boolean = false;

  connect(token: string) {
    if (this.socket?.connected) {
      return;
    }

    this.token = token;
    
    // In dev, connect to same origin (Vite proxies /socket.io to backend).
    // In production, use VITE_BACKEND_URL env var.
    const isDev = import.meta.env.DEV;
    const sameOrigin = import.meta.env.VITE_SAME_ORIGIN === 'true';
    const serverUrl = isDev || sameOrigin
      ? ''
      : (import.meta.env.VITE_BACKEND_URL || `https://${window.location.hostname}`);
    
    
    // Use auth transport for secure token handshake
    this.socket = io(serverUrl, {
      auth: {
        token: `Bearer ${token}`,
      },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.setupEventListeners();
    
    // If socket is already connected (e.g., shared with socket.ts), trigger room joins immediately
    if (this.socket.connected) {
      this.socket.emit('join_friend_status');
      this.socket.emit('get_unreads');
    } else if (!this.socket.connected) {
      // Explicitly connect if not yet connected
      this.socket.connect();
    }
  }

  private setupEventListeners() {
    if (!this.socket) return;
    
    // Prevent duplicate listener registration if called multiple times on the same socket
    if (this.listenersAttached) {
      // Still ensure we're in the right rooms if already connected
      if (this.socket.connected) {
        this.socket.emit('join_friend_status');
        this.socket.emit('get_unreads');
      }
      return;
    }
    this.listenersAttached = true;

    // Connection events
    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      
      // Start heartbeat to track active status
      this.startHeartbeat();
      
      // Rejoin all active rooms after reconnect
      if (this.currentChannel) {
        this.socket?.emit('join_channel', { channel_id: this.currentChannel });
      }
      if (this.currentDMUser) {
        this.socket?.emit('join_dm', { user_id: this.currentDMUser });
      }
      // Always rejoin friend status room for presence tracking
      this.socket?.emit('join_friend_status');
      // Request fresh unread snapshot on every reconnect
      this.socket?.emit('get_unreads');

      // Notify listeners to refresh notifications only on actual reconnects
      if (this.hasConnectedOnce && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('socket-reconnected'));
      }
      this.hasConnectedOnce = true;
    });

    this.socket.on('disconnect', (reason) => {
      
      // Stop heartbeat when disconnected
      this.stopHeartbeat();
      
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, try to reconnect
        this.socket?.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('[SOCKET] Connection error:', error.message);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[SOCKET] Max reconnection attempts reached');
        this.disconnect();
      }
    });

    // User status updates
    this.socket.on('user_status', (data: UserStatus) => {
      this.statusHandlers.forEach(handler => handler(data));
    });

    // Message received - Normalized to Message type
    this.socket.on('message_received', (data: any) => {
      const chan = data?.channel_id ?? data?.channelId;
      const msgId = data?.id;
      
      // Normalize the message structure
      const message: Message = {
        id: typeof data.id === 'string' ? Number(data.id) : data.id,
        channel_id: data.channel_id,
        sender_id: data.sender_id,
        content: data.content,
        message_type: data.message_type || 'text',
        created_at: data.created_at || new Date().toISOString(),
        author: data.author,
        avatar_url: data.avatar || '',
        reply_to: data.reply_to || null,
        reply_to_preview: data.reply_to_preview || undefined,
        is_blocked: data.is_blocked || false,
        moderation: data.moderation || undefined,
        attachment: data.attachment || undefined,
        card: data.card || undefined,
      };
      
      
      
      this.messageHandlers.forEach(handler => handler(message));
    });

    // Engagement poll vote tally update
    this.socket.on('poll_vote_update', (data: any) => {
      this.pollVoteUpdateHandlers.forEach(handler => handler(data));
    });

    // Typing indicator
    this.socket.on('user_typing', (data: TypingIndicator) => {
      this.typingHandlers.forEach(handler => handler(data));
    });

    // Agent runs ("Aura is thinking…")
    this.socket.on('agent_run_started', (data: AgentRunEvent) => {
      this.agentRunHandlers.forEach(handler => handler('started', data));
    });
    this.socket.on('agent_run_finished', (data: AgentRunEvent) => {
      this.agentRunHandlers.forEach(handler => handler('finished', data));
    });

    // Agent write actions waiting for (or past) a person's approval
    this.socket.on('agent_approval_requested', (data: AgentApproval) => {
      this.agentApprovalHandlers.forEach(handler => handler('requested', data));
    });
    this.socket.on('agent_approval_resolved', (data: ApprovalResolvedEvent) => {
      this.agentApprovalHandlers.forEach(handler => handler('resolved', data));
    });

    // Status message
    this.socket.on('status', (data: { msg: string; username?: string; type?: string }) => {
    });

    // Error handling
    this.socket.on('error', (data: { msg: string }) => {
      console.error('[SOCKET] ❌ Error:', data.msg);
      this.errorHandlers.forEach(handler => handler(data));
    });

    // Community creation event
    this.socket.on('community_created', (data: any) => {
      this.communityHandlers.forEach(handler => handler(data));
    });

    // Community deleted event
    this.socket.on('community_deleted', (data: any) => {
      this.communityDeletedHandlers.forEach(handler => handler(data));
    });

    // Community left event (user left the community)
    this.socket.on('community_left', (data: any) => {
      this.communityLeftHandlers.forEach(handler => handler(data));
    });

    // Moderation action logged event (for owners to refresh logs)
    this.socket.on('moderation_action_logged', (data: { community_id: number; channel_id: number; action: string; severity: string; timestamp: string }) => {
      this.moderationActionHandlers.forEach(handler => handler(data));
    });

    // Moderation inline warning (Strike 1)
    this.socket.on('moderation_warn_inline', (data: any) => {
      this.moderationWarnInlineHandlers.forEach(handler => handler(data));
    });

    // Moderation inline flag (Strike 2)
    this.socket.on('moderation_flag_inline', (data: any) => {
      this.moderationFlagInlineHandlers.forEach(handler => handler(data));
    });

    // Moderation user removed (Strike 3)
    this.socket.on('moderation_user_removed', (data: any) => {
      this.moderationUserRemovedHandlers.forEach(handler => handler(data));
    });

    // Moderation retroactive (async Gemini review flagged a message after broadcast)
    this.socket.on('moderation_retroactive', (data: any) => {
      this.moderationRetroactiveHandlers.forEach(handler => handler(data));
    });

    // Retroactive scan progress
    this.socket.on('moderation_scan_progress', (data: any) => {
      this.moderationScanProgressHandlers.forEach(handler => handler(data));
    });

    // AI command result event (for chat commands like /summarize)
    this.socket.on('command_result', (data: { type: string; success: boolean; summary?: string; key_points?: string[]; method?: string; error?: string }) => {
      this.commandResultHandlers.forEach(handler => handler(data));
    });

    // Channel operation events
    this.socket.on('channel_created', (data: any) => {
      this.channelHandlers.forEach(handler => handler({ type: 'created', data }));
    });

    this.socket.on('channel_updated', (data: any) => {
      this.channelHandlers.forEach(handler => handler({ type: 'updated', data }));
    });

    this.socket.on('channel_deleted', (data: any) => {
      this.channelHandlers.forEach(handler => handler({ type: 'deleted', data }));
    });

    this.socket.on('community_member_added', (data: any) => {
      this.channelHandlers.forEach(handler => handler({ type: 'member_added', data }));
    });

    // Community removed event - user removed/blocked from community
    this.socket.on('community:removed', (data: { community_id: number; user_id: number; reason: string; message?: string; notification?: { community_name: string; community_logo?: string; community_color: string; community_icon: string } }) => {
      this.communityRemovedHandlers.forEach(handler => handler(data));
    });

    // User blocked from community - notify all members to update their UI
    this.socket.on('user_blocked_from_community', (data: { community_id: number; user_id: number; blocked_at: string }) => {
      this.userBlockedHandlers.forEach(handler => handler(data));
    });

    // Direct message events
    this.socket.on('receive_direct_message', (data: DirectMessageEvent) => {
      // Deduplicate: receiver may be in both the DM room and their personal room
      if (this.recentDMIds.has(data.id)) {
        return;
      }
      this.recentDMIds.add(data.id);
      // Clean up old IDs after 10 seconds to prevent memory leak
      setTimeout(() => this.recentDMIds.delete(data.id), 10000);
      

      this.directMessageHandlers.forEach(handler => handler(data));
    });

    this.socket.on('dm_message_edited', (data: any) => {
      this.dmEditHandlers.forEach(handler => handler(data));
    });

    this.socket.on('dm_message_deleted', (data: any) => {
      this.dmDeleteHandlers.forEach(handler => handler(data));
    });

    this.socket.on('direct_message_read', (data: { message_id: number; read_by: number }) => {
      this.directMessageHandlers.forEach(handler => 
        handler({ ...data, id: data.message_id } as any)
      );
    });

    this.socket.on('user_typing_dm', (data: { user_id: number; is_typing: boolean }) => {
      this.typingHandlers.forEach(handler => handler({
        username: '',
        channel_id: 0,
        is_typing: data.is_typing
      }));
      this.dmTypingHandlers.forEach(handler => handler(data));
    });

    // Friend request events
    this.socket.on('friend_request_received', (data: FriendRequestEvent) => {
      this.friendRequestHandlers.forEach((handler, i) => {
        try {
          handler(data);
        } catch (error) {
          console.error('[SOCKET] Friend request handler error:', error);
        }
      });
    });

    this.socket.on('friend_request_accepted', (data: any) => {
      // Route to friendStatus handlers (not friendRequest handlers) so friends list refreshes
      this.friendStatusHandlers.forEach(handler => handler({ 
        friend_id: data.acceptor_id || data.sender_id, 
        status: 'accepted' 
      }));
      // Dispatch CustomEvent with full data for NotificationsContext
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('friendRequestAccepted', {
          detail: {
            // Carry request_id so NotificationsContext can dedup this real-time
            // event against the persisted `notification` (related_id == request_id).
            request_id: data.request_id,
            username: data.display_name || data.username || `User ${data.acceptor_id}`,
            from: {
              id: data.acceptor_id || data.sender_id,
              username: data.username || '',
              display_name: data.display_name,
              avatar_url: data.avatar_url,
            },
          }
        }));
      }
    });

    this.socket.on('friend_request_rejected', (data: any) => {
      // Notify friend status handlers to clean up sentRequests
      this.friendStatusHandlers.forEach(handler => handler({ 
        friend_id: data.rejector_id || data.receiver_id, 
        status: 'rejected',
        request_id: data.request_id,
      }));
    });

    this.socket.on('friend_request_cancelled', (data: any) => {
      // Notify friend status handlers to remove from pendingRequests
      this.friendStatusHandlers.forEach(handler => handler({ 
        friend_id: data.sender_id, 
        status: 'cancelled',
        request_id: data.request_id,
      }));
    });

    this.socket.on('friend_status_changed', (data: { friend_id: number; status: 'online' | 'offline' | 'idle' | 'dnd' }) => {
      this.friendStatusHandlers.forEach(handler => handler(data));
    });

    // Also listen for 'friend_status' (emitted by backend on accept/remove/block)
    this.socket.on('friend_status', (data: { friend_id: number; status: string }) => {
      this.friendStatusHandlers.forEach(handler => handler(data));
    });

    this.socket.on('friend_removed', (data: { friend_id: number }) => {
      this.friendStatusHandlers.forEach(handler => handler({ friend_id: data.friend_id, status: 'removed' }));
    });

    this.socket.on('user_blocked', (data: { blocked_user_id: number }) => {
      this.friendStatusHandlers.forEach(handler => handler({ friend_id: data.blocked_user_id, status: 'blocked' }));
    });

    this.socket.on('user_unblocked', (data: { unblocked_user_id: number }) => {
      this.friendStatusHandlers.forEach(handler => handler({ friend_id: data.unblocked_user_id, status: 'unblocked' }));
    });

    // ─── Unread & Presence Events ───────────────────────────────────────

    // Initial unread counts on connect/reconnect
    this.socket.on('initial_unreads', (data: any) => {
      this.initialUnreadsHandlers.forEach(handler => handler(data));
    });

    // Channel/community unread increment
    this.socket.on('unread_update', (data: any) => {
      this.unreadUpdateHandlers.forEach(handler => handler(data));
    });

    // Channel activity — lightweight event emitted to community room for instant unread
    this.socket.on('channel_activity', (data: any) => {
      this.channelActivityHandlers.forEach((handler, i) => {
        handler(data);
      });
    });

    // DM unread increment
    this.socket.on('dm_unread_update', (data: any) => {
      this.dmUnreadUpdateHandlers.forEach(handler => handler(data));
    });

    // Pin expired (timer ran out)
    this.socket.on('pin_expired', (data: any) => {
      this.pinEventHandlers.forEach(handler => handler({ ...data, type: 'expired' }));
    });

    // Channel pin events
    this.socket.on('message_pinned', (data: any) => {
      this.pinEventHandlers.forEach(handler => handler({ ...data, type: 'channel_pinned' }));
    });

    this.socket.on('message_unpinned', (data: any) => {
      this.pinEventHandlers.forEach(handler => handler({ ...data, type: 'channel_unpinned' }));
    });

    // DM pin events
    this.socket.on('dm_message_pinned', (data: any) => {
      this.pinEventHandlers.forEach(handler => handler({ ...data, type: 'dm_pinned' }));
    });

    this.socket.on('dm_message_unpinned', (data: any) => {
      this.pinEventHandlers.forEach(handler => handler({ ...data, type: 'dm_unpinned' }));
    });

    // Bulk friend presence snapshot
    this.socket.on('friends_status_bulk', (data: Record<number, string>) => {
      this.friendsBulkStatusHandlers.forEach(handler => handler(data));
    });

    // DM messages read acknowledgement
    this.socket.on('dm_messages_read', (data: { user_id: number }) => {
      this.dmUnreadUpdateHandlers.forEach(handler => handler({ sender_id: data.user_id, unread_count: 0, total_dm_unread: 0, total_unread: 0 }));
    });

    // Summary generation events (ephemeral, private to sender)
    this.socket.on('summary_generating', (data: { channel_id: number; status: string }) => {
      this.summaryGeneratingHandlers.forEach(handler => handler(data));
    });

    this.socket.on('summary_result', (data: { channel_id: number; content: string; method: string; message_count: number; created_at: string }) => {
      this.summaryResultHandlers.forEach(handler => handler(data));
    });

    // Knowledge Builder ephemeral events (private to sender)
    this.socket.on('kb_generating', (data: { channel_id: number; status: string }) => {
      this.kbGeneratingHandlers.forEach(handler => handler(data));
    });

    this.socket.on('kb_result', (data: { channel_id: number; content: string; subtype: string; total_items: number; faqs: number; definitions: number; decisions: number; method: string; result_count?: number; created_at: string }) => {
      this.kbResultHandlers.forEach(handler => handler(data));
    });

    // Server-pushed persistent notification (from notification_service)
    this.socket.on('notification', (data: any) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('server-notification', { detail: data }));
      }
    });
  }

  // Join a direct message conversation
  joinDMConversation(userId: number) {
    // Record first so the 'connect' handler can re-join after the
    // page-load race / a reconnect — mirrors joinChannel above.
    this.currentDMUser = userId;

    if (!this.socket?.connected) {
      console.warn(`[SOCKET] Not connected yet — DM room with user ${userId} will be joined on connect`);
      return;
    }

    this.socket.emit('join_dm', { user_id: userId });
  }

  // Leave DM conversation
  leaveDMConversation() {
    if (!this.socket?.connected || !this.currentDMUser) return;

    this.socket.emit('leave_dm', { user_id: this.currentDMUser });
    this.currentDMUser = null;
  }

  // Send typing indicator in DM
  sendDMTyping(userId: number, isTyping: boolean = true) {
    if (!this.socket?.connected) return;

    this.socket.emit('typing_dm', { 
      user_id: userId,
      is_typing: isTyping 
    });

    if (isTyping) {
      if (this.typingTimeout) clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.sendDMTyping(userId, false);
      }, 3000);
    } else {
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
        this.typingTimeout = null;
      }
    }
  }

  // Broadcast direct message
  broadcastDirectMessage(message: any) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast DM');
      return;
    }

    this.socket.emit('send_direct_message', message);
  }

  // Broadcast friend request sent
  broadcastFriendRequest(request: FriendRequestEvent) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast friend request');
      return;
    }

    this.socket.emit('friend_request_sent', request);
  }

  // Broadcast friend request acceptance
  broadcastFriendRequestAccepted(requestId: number, userId: number) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast acceptance');
      return;
    }

    this.socket.emit('friend_request_accepted_response', { request_id: requestId, user_id: userId });
  }

  // Join friend status room
  joinFriendStatusRoom() {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot join friend status room');
      return;
    }

    this.socket.emit('join_friend_status');
  }

  // Leave friend status room
  leaveFriendStatusRoom() {
    if (!this.socket?.connected) return;

    this.socket.emit('leave_friend_status');
  }

  // ─── Unread / Read Tracking Emitters ─────────────────────────────

  // Emit mark channel as read
  markChannelRead(channelId: number, messageId?: number) {
    if (!this.socket?.connected) return;
    this.socket.emit('mark_channel_read', { channel_id: channelId, message_id: messageId });
  }

  // Emit mark DM as read
  markDMRead(otherUserId: number) {
    if (!this.socket?.connected) return;
    this.socket.emit('mark_dm_read', { other_user_id: otherUserId });
  }

  // Request current unread snapshot
  requestUnreads() {
    if (!this.socket?.connected) return;
    this.socket.emit('get_unreads');
  }

  // Join a channel
  joinChannel(channelId: number) {
    // ALWAYS record the target channel first. If the socket isn't connected
    // yet (page-load race: the channel effect can fire before the handshake
    // completes) the 'connect' handler re-joins from this field. Dropping
    // the call without recording it left the client outside the channel_N
    // room — deaf to every broadcast — until a manual channel switch.
    const previousChannel = this.currentChannel;
    this.currentChannel = channelId;

    if (!this.socket?.connected) {
      console.warn(`[SOCKET] Not connected yet — channel ${channelId} will be joined on connect`);
      return;
    }

    // Leave previous channel if any
    if (previousChannel && previousChannel !== channelId) {
      this.socket.emit('leave_channel', { channel_id: previousChannel });
    }

    this.socket.emit('join_channel', { channel_id: channelId });
  }

  // Leave current channel
  leaveChannel() {
    if (!this.socket?.connected || !this.currentChannel) return;

    this.socket.emit('leave_channel', { channel_id: this.currentChannel });
    this.currentChannel = null;
  }

  // Leave all rooms for a community (called when removed/blocked)
  leaveCommunity(communityId: number) {
    if (!this.socket?.connected) return;

    this.socket.emit('leave_community', { community_id: communityId });
    
    // Clear current channel if it belongs to this community
    if (this.currentChannel) {
      this.currentChannel = null;
    }
  }

  // Send typing indicator - Auto-stop typing after 3 seconds
  sendTyping(channelId: number, isTyping: boolean = true) {
    if (!this.socket?.connected) return;

    this.socket.emit('typing', { 
      channel_id: channelId, 
      is_typing: isTyping 
    });

    // Auto-stop typing after 3 seconds if still typing
    if (isTyping) {
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
      }
      
      this.typingTimeout = setTimeout(() => {
        this.sendTyping(channelId, false);
      }, 3000);
    } else {
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
        this.typingTimeout = null;
      }
    }
  }

  // Broadcast new message - Only call after successful API save
  broadcastMessage(channelId: number, message: Message) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast message');
      return;
    }

    this.socket.emit('new_message', {
      channel_id: channelId,
      message: {
        id: message.id,
        sender_id: message.sender_id,
        content: message.content,
        message_type: message.message_type,
        created_at: message.created_at,
        author: message.author,
        avatar: message.avatar_url,
        is_blocked: message.is_blocked || false,
        moderation: message.moderation || undefined,
      },
    });
  }

  // Broadcast community creation
  broadcastCommunityCreated(community: any) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast community creation');
      return;
    }

    this.socket.emit('community_created', community);
  }

  // Broadcast community deletion
  broadcastCommunityDeleted(communityId: number) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast community deletion');
      return;
    }

    this.socket.emit('community_deleted', { community_id: communityId });
  }

  // Broadcast channel creation
  broadcastChannelCreated(channel: any) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast channel creation');
      return;
    }

    this.socket.emit('channel_created', channel);
  }

  // Broadcast channel update
  broadcastChannelUpdated(channel: any) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast channel update');
      return;
    }

    this.socket.emit('channel_updated', channel);
  }

  // Broadcast channel deletion
  broadcastChannelDeleted(channelId: number, communityId: number) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast channel deletion');
      return;
    }

    this.socket.emit('channel_deleted', { id: channelId, community_id: communityId });
  }

  // Broadcast community member added
  broadcastCommunityMemberAdded(communityId: number, memberId: number, memberUsername: string) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast member addition');
      return;
    }

    this.socket.emit('community_member_added', {
      community_id: communityId,
      member_id: memberId,
      member_username: memberUsername,
    });
  }

  // Event listeners
  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  onUserStatus(handler: StatusHandler) {
    this.statusHandlers.push(handler);
    return () => {
      this.statusHandlers = this.statusHandlers.filter(h => h !== handler);
    };
  }

  onPollVoteUpdate(handler: (data: { message_id: number; channel_id: number; tallies: number[]; total: number }) => void) {
    this.pollVoteUpdateHandlers.push(handler);
    return () => {
      this.pollVoteUpdateHandlers = this.pollVoteUpdateHandlers.filter(h => h !== handler);
    };
  }

  onAgentRun(handler: AgentRunHandler) {
    this.agentRunHandlers.push(handler);
    return () => {
      this.agentRunHandlers = this.agentRunHandlers.filter(h => h !== handler);
    };
  }

  onAgentApproval(handler: AgentApprovalHandler) {
    this.agentApprovalHandlers.push(handler);
    return () => {
      this.agentApprovalHandlers = this.agentApprovalHandlers.filter(h => h !== handler);
    };
  }

  onTyping(handler: TypingHandler) {
    this.typingHandlers.push(handler);
    return () => {
      this.typingHandlers = this.typingHandlers.filter(h => h !== handler);
    };
  }

  onDMTyping(handler: (data: { user_id: number; is_typing: boolean }) => void) {
    this.dmTypingHandlers.push(handler);
    return () => {
      this.dmTypingHandlers = this.dmTypingHandlers.filter(h => h !== handler);
    };
  }

  onError(handler: ErrorHandler) {
    this.errorHandlers.push(handler);
    return () => {
      this.errorHandlers = this.errorHandlers.filter(h => h !== handler);
    };
  }

  onCommunityCreated(handler: CommunityHandler) {
    this.communityHandlers.push(handler);
    return () => {
      this.communityHandlers = this.communityHandlers.filter(h => h !== handler);
    };
  }

  onCommunityRemoved(handler: CommunityRemovedHandler) {
    this.communityRemovedHandlers.push(handler);
    return () => {
      this.communityRemovedHandlers = this.communityRemovedHandlers.filter(h => h !== handler);
    };
  }

  onUserBlocked(handler: UserBlockedHandler) {
    this.userBlockedHandlers.push(handler);
    return () => {
      this.userBlockedHandlers = this.userBlockedHandlers.filter(h => h !== handler);
    };
  }

  onCommunityDeleted(handler: CommunityHandler) {
    this.communityDeletedHandlers.push(handler);
    return () => {
      this.communityDeletedHandlers = this.communityDeletedHandlers.filter(h => h !== handler);
    };
  }

  onCommunityLeft(handler: CommunityHandler) {
    this.communityLeftHandlers.push(handler);
    return () => {
      this.communityLeftHandlers = this.communityLeftHandlers.filter(h => h !== handler);
    };
  }

  onChannel(handler: ChannelHandler) {
    this.channelHandlers.push(handler);
    return () => {
      this.channelHandlers = this.channelHandlers.filter(h => h !== handler);
    };
  }

  onDirectMessage(handler: DirectMessageHandler) {
    this.directMessageHandlers.push(handler);
    return () => {
      this.directMessageHandlers = this.directMessageHandlers.filter(h => h !== handler);
    };
  }

  onDirectMessageEdited(handler: (data: any) => void) {
    this.dmEditHandlers.push(handler);
    return () => {
      this.dmEditHandlers = this.dmEditHandlers.filter(h => h !== handler);
    };
  }

  onDirectMessageDeleted(handler: (data: any) => void) {
    this.dmDeleteHandlers.push(handler);
    return () => {
      this.dmDeleteHandlers = this.dmDeleteHandlers.filter(h => h !== handler);
    };
  }

  onFriendRequest(handler: FriendRequestHandler) {
    this.friendRequestHandlers.push(handler);
    return () => {
      this.friendRequestHandlers = this.friendRequestHandlers.filter(h => h !== handler);
    };
  }

  onFriendStatus(handler: FriendStatusHandler) {
    this.friendStatusHandlers.push(handler);
    return () => {
      this.friendStatusHandlers = this.friendStatusHandlers.filter(h => h !== handler);
    };
  }

  onModerationAction(handler: ModerationActionHandler) {
    this.moderationActionHandlers.push(handler);
    return () => {
      this.moderationActionHandlers = this.moderationActionHandlers.filter(h => h !== handler);
    };
  }

  onModerationWarnInline(handler: ModerationInlineHandler) {
    this.moderationWarnInlineHandlers.push(handler);
    return () => {
      this.moderationWarnInlineHandlers = this.moderationWarnInlineHandlers.filter(h => h !== handler);
    };
  }

  onModerationFlagInline(handler: ModerationInlineHandler) {
    this.moderationFlagInlineHandlers.push(handler);
    return () => {
      this.moderationFlagInlineHandlers = this.moderationFlagInlineHandlers.filter(h => h !== handler);
    };
  }

  onModerationUserRemoved(handler: ModerationInlineHandler) {
    this.moderationUserRemovedHandlers.push(handler);
    return () => {
      this.moderationUserRemovedHandlers = this.moderationUserRemovedHandlers.filter(h => h !== handler);
    };
  }

  onModerationRetroactive(handler: (data: { message_id: number; channel_id: number; user_id: number; username: string; action: string; severity: string; reasons: string[]; explanation: string; violation_count: number; banner_text: string; timestamp: string }) => void) {
    this.moderationRetroactiveHandlers.push(handler);
    return () => {
      this.moderationRetroactiveHandlers = this.moderationRetroactiveHandlers.filter(h => h !== handler);
    };
  }

  onModerationScanProgress(handler: (data: { community_id: number; channel_id: number; status: string; scanned: number; total: number; flagged: number; percent: number }) => void) {
    this.moderationScanProgressHandlers.push(handler);
    return () => {
      this.moderationScanProgressHandlers = this.moderationScanProgressHandlers.filter(h => h !== handler);
    };
  }

  onCommandResult(handler: CommandResultHandler) {
    this.commandResultHandlers.push(handler);
    return () => {
      this.commandResultHandlers = this.commandResultHandlers.filter(h => h !== handler);
    };
  }

  onUnreadUpdate(handler: UnreadUpdateHandler) {
    this.unreadUpdateHandlers.push(handler);
    return () => {
      this.unreadUpdateHandlers = this.unreadUpdateHandlers.filter(h => h !== handler);
    };
  }

  onDMUnreadUpdate(handler: DMUnreadUpdateHandler) {
    this.dmUnreadUpdateHandlers.push(handler);
    return () => {
      this.dmUnreadUpdateHandlers = this.dmUnreadUpdateHandlers.filter(h => h !== handler);
    };
  }

  onInitialUnreads(handler: InitialUnreadsHandler) {
    this.initialUnreadsHandlers.push(handler);
    return () => {
      this.initialUnreadsHandlers = this.initialUnreadsHandlers.filter(h => h !== handler);
    };
  }

  onPinEvent(handler: PinEventHandler) {
    this.pinEventHandlers.push(handler);
    return () => {
      this.pinEventHandlers = this.pinEventHandlers.filter(h => h !== handler);
    };
  }

  onFriendsBulkStatus(handler: FriendsBulkStatusHandler) {
    this.friendsBulkStatusHandlers.push(handler);
    return () => {
      this.friendsBulkStatusHandlers = this.friendsBulkStatusHandlers.filter(h => h !== handler);
    };
  }

  onChannelActivity(handler: ChannelActivityHandler) {
    this.channelActivityHandlers.push(handler);
    return () => {
      this.channelActivityHandlers = this.channelActivityHandlers.filter(h => h !== handler);
    };
  }

  onSummaryGenerating(handler: SummaryGeneratingHandler) {
    this.summaryGeneratingHandlers.push(handler);
    return () => {
      this.summaryGeneratingHandlers = this.summaryGeneratingHandlers.filter(h => h !== handler);
    };
  }

  onSummaryResult(handler: SummaryResultHandler) {
    this.summaryResultHandlers.push(handler);
    return () => {
      this.summaryResultHandlers = this.summaryResultHandlers.filter(h => h !== handler);
    };
  }

  onKBGenerating(handler: KBGeneratingHandler) {
    this.kbGeneratingHandlers.push(handler);
    return () => {
      this.kbGeneratingHandlers = this.kbGeneratingHandlers.filter(h => h !== handler);
    };
  }

  onKBResult(handler: KBResultHandler) {
    this.kbResultHandlers.push(handler);
    return () => {
      this.kbResultHandlers = this.kbResultHandlers.filter(h => h !== handler);
    };
  }

  disconnect() {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    
    // Stop heartbeat
    this.stopHeartbeat();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentChannel = null;
      this.listenersAttached = false;
      this.hasConnectedOnce = false;
    }
  }

  private startHeartbeat() {
    // Stop existing heartbeat if any
    this.stopHeartbeat();
    
    // Send heartbeat every 30 seconds to track active users
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('heartbeat');
      }
    }, 30000); // 30 seconds
    
    // Send immediate heartbeat on start
    if (this.socket?.connected) {
      this.socket.emit('heartbeat');
    }
    
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  getCurrentChannel(): number | null {
    return this.currentChannel;
  }
}

export const socketService = new SocketService();

// ─── Reconnect socketService when token refreshes ────────────────────
window.addEventListener('auth:token-refreshed', () => {
  const token = localStorage.getItem('token');
  if (token && socketService.isConnected()) {
    socketService.disconnect();
    setTimeout(() => socketService.connect(token), 300);
  }
});