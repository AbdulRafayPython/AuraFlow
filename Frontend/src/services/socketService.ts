// services/socketService.ts - FIXED: Proper token passing
import { io, Socket } from 'socket.io-client';
import type { Message, DirectMessage } from '@/types';

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
  message_type: 'text' | 'image' | 'file' | 'ai';
  created_at: string;
  is_read: boolean;
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
type ErrorHandler = (error: { msg: string }) => void;
type CommunityHandler = (data: any) => void;
type ChannelHandler = (data: any) => void;
type DirectMessageHandler = (message: DirectMessageEvent) => void;
type FriendRequestHandler = (request: FriendRequestEvent) => void;
type FriendStatusHandler = (data: { friend_id: number; status: string }) => void;

class SocketService {
  private socket: Socket | null = null;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private typingHandlers: TypingHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private communityHandlers: CommunityHandler[] = [];
  private channelHandlers: ChannelHandler[] = [];
  private directMessageHandlers: DirectMessageHandler[] = [];
  private friendRequestHandlers: FriendRequestHandler[] = [];
  private friendStatusHandlers: FriendStatusHandler[] = [];
  private currentChannel: number | null = null;
  private currentDMUser: number | null = null;
  private typingTimeout: NodeJS.Timeout | null = null;
  
  // Global DM listener tracker
  private dmListenerRegistered: boolean = false;

  connect(token: string) {
    if (this.socket?.connected) {
      console.log('[SOCKET] Already connected');
      return;
    }

    this.token = token;
    
    // FIXED: Pass token in query string for Socket.IO handshake
    this.socket = io('http://localhost:5000', {
      query: {
        token: `Bearer ${token}`,  // Pass token in query for connection handshake
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('[SOCKET] ✅ Connected successfully');
      this.reconnectAttempts = 0;
      
      // Rejoin current channel if reconnecting
      if (this.currentChannel) {
        console.log(`[SOCKET] Rejoining channel ${this.currentChannel} after reconnect`);
        this.joinChannel(this.currentChannel);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[SOCKET] ⚠️ Disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, try to reconnect
        this.socket?.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('[SOCKET] ❌ Connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[SOCKET] Max reconnection attempts reached');
        this.disconnect();
      }
    });

    // User status updates
    this.socket.on('user_status', (data: UserStatus) => {
      console.log('[SOCKET] 👤 User status update:', data);
      this.statusHandlers.forEach(handler => handler(data));
    });

    // Message received - Normalized to Message type
    this.socket.on('message_received', (data: any) => {
      console.log('[SOCKET] 💬 New message received:', data);
      
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
      };
      
      this.messageHandlers.forEach(handler => handler(message));
    });

    // Typing indicator
    this.socket.on('user_typing', (data: TypingIndicator) => {
      console.log('[SOCKET] ⌨️ User typing:', data);
      this.typingHandlers.forEach(handler => handler(data));
    });

    // Status message
    this.socket.on('status', (data: { msg: string; username?: string; type?: string }) => {
      console.log('[SOCKET] 📢 Status:', data.msg);
    });

    // Error handling
    this.socket.on('error', (data: { msg: string }) => {
      console.error('[SOCKET] ❌ Error:', data.msg);
      this.errorHandlers.forEach(handler => handler(data));
    });

    // Community creation event
    this.socket.on('community_created', (data: any) => {
      console.log('[SOCKET] 🏘️ New community created:', data);
      this.communityHandlers.forEach(handler => handler(data));
    });

    // Channel operation events
    this.socket.on('channel_created', (data: any) => {
      console.log('[SOCKET] ✨ Channel created:', data);
      this.channelHandlers.forEach(handler => handler({ type: 'created', data }));
    });

    this.socket.on('channel_updated', (data: any) => {
      console.log('[SOCKET] ✏️ Channel updated:', data);
      this.channelHandlers.forEach(handler => handler({ type: 'updated', data }));
    });

    this.socket.on('channel_deleted', (data: any) => {
      console.log('[SOCKET] 🗑️ Channel deleted:', data);
      this.channelHandlers.forEach(handler => handler({ type: 'deleted', data }));
    });

    this.socket.on('community_member_added', (data: any) => {
      console.log('[SOCKET] 👥 Member added to community:', data);
      this.channelHandlers.forEach(handler => handler({ type: 'member_added', data }));
    });

    // Direct message events
    console.log('[SOCKET] 🔌 SETTING UP PERMANENT receive_direct_message LISTENER IN SETUPEVENTLISTENERS');
    this.socket.on('receive_direct_message', (data: DirectMessageEvent) => {
      console.log('[SOCKET] 📡📡📡 receive_direct_message EVENT FIRED IN SETUPEVENTLISTENERS');
      console.log('[SOCKET] 💬 Direct message received:', {
        id: data.id,
        sender_id: data.sender_id,
        receiver_id: data.receiver_id,
        content: data.content?.substring(0, 30)
      });
      console.log('[SOCKET] Calling all directMessageHandlers...');
      this.directMessageHandlers.forEach(handler => handler(data));
      console.log('[SOCKET] All handlers called');
    });

    this.socket.on('direct_message_read', (data: { message_id: number; read_by: number }) => {
      console.log('[SOCKET] ✓ Message marked as read:', data);
      this.directMessageHandlers.forEach(handler => 
        handler({ ...data, id: data.message_id } as any)
      );
    });

    this.socket.on('user_typing_dm', (data: { user_id: number; is_typing: boolean }) => {
      console.log('[SOCKET] ⌨️ User typing in DM:', data);
      this.typingHandlers.forEach(handler => handler({
        username: '',
        channel_id: 0,
        is_typing: data.is_typing
      }));
    });

    // Friend request events
    this.socket.on('friend_request_received', (data: FriendRequestEvent) => {
      console.log('[SOCKET] 👋 Friend request received:', data);
      this.friendRequestHandlers.forEach(handler => handler(data));
    });

    this.socket.on('friend_request_accepted', (data: FriendRequestEvent) => {
      console.log('[SOCKET] ✓ Friend request accepted:', data);
      this.friendRequestHandlers.forEach(handler => handler(data));
    });

    this.socket.on('friend_request_rejected', (data: FriendRequestEvent) => {
      console.log('[SOCKET] ✗ Friend request rejected:', data);
      this.friendRequestHandlers.forEach(handler => handler(data));
    });

    this.socket.on('friend_status_changed', (data: { friend_id: number; status: 'online' | 'offline' | 'idle' | 'dnd' }) => {
      console.log('[SOCKET] 👤 Friend status changed:', data);
      this.friendStatusHandlers.forEach(handler => handler(data));
    });

    this.socket.on('friend_removed', (data: { friend_id: number }) => {
      console.log('[SOCKET] 👋 Friend removed:', data);
      this.friendStatusHandlers.forEach(handler => handler({ friend_id: data.friend_id, status: 'removed' }));
    });

    this.socket.on('user_blocked', (data: { blocked_user_id: number }) => {
      console.log('[SOCKET] 🚫 User blocked:', data);
      this.friendStatusHandlers.forEach(handler => handler({ friend_id: data.blocked_user_id, status: 'blocked' }));
    });

    this.socket.on('user_unblocked', (data: { unblocked_user_id: number }) => {
      console.log('[SOCKET] ✓ User unblocked:', data);
      this.friendStatusHandlers.forEach(handler => handler({ friend_id: data.unblocked_user_id, status: 'unblocked' }));
    });
  }

  // Join a direct message conversation
  joinDMConversation(userId: number) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot join DM');
      return;
    }

    this.currentDMUser = userId;
    this.socket.emit('join_dm', { user_id: userId });
    console.log(`[SOCKET] 💬 Joined DM conversation with user ${userId}`);
  }

  // Leave DM conversation
  leaveDMConversation() {
    if (!this.socket?.connected || !this.currentDMUser) return;

    this.socket.emit('leave_dm', { user_id: this.currentDMUser });
    console.log(`[SOCKET] 💬 Left DM conversation with user ${this.currentDMUser}`);
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
  broadcastDirectMessage(message: DirectMessageEvent) {
    console.log('[SOCKET] 📤📤📤 broadcastDirectMessage called');
    console.log('[SOCKET] 📤 Socket connected?', this.socket?.connected);
    
    if (!this.socket?.connected) {
      console.warn('[SOCKET] ❌ Not connected, cannot broadcast DM');
      return;
    }

    // Emit the message to the backend with proper event name
    console.log('[SOCKET] 📤 Emitting send_direct_message event to backend');
    this.socket.emit('send_direct_message', message);
    console.log(`[SOCKET] 📤✅ Sent direct message to user ${message.receiver_id}:`, {
      id: message.id,
      sender_id: message.sender_id,
      receiver_id: message.receiver_id,
      content: message.content?.substring(0, 30)
    });
  }

  // Broadcast friend request sent
  broadcastFriendRequest(request: FriendRequestEvent) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast friend request');
      return;
    }

    this.socket.emit('friend_request_sent', request);
    console.log(`[SOCKET] 👋 Broadcasting friend request to user ${request.receiver_id}`);
  }

  // Broadcast friend request acceptance
  broadcastFriendRequestAccepted(requestId: number, userId: number) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast acceptance');
      return;
    }

    this.socket.emit('friend_request_accepted_response', { request_id: requestId, user_id: userId });
    console.log(`[SOCKET] ✓ Broadcasting friend request acceptance`);
  }

  // Join friend status room
  joinFriendStatusRoom() {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot join friend status room');
      return;
    }

    this.socket.emit('join_friend_status');
    console.log('[SOCKET] 👥 Joined friend status room');
  }

  // Leave friend status room
  leaveFriendStatusRoom() {
    if (!this.socket?.connected) return;

    this.socket.emit('leave_friend_status');
    console.log('[SOCKET] 👥 Left friend status room');
  }

  // Join a channel
  joinChannel(channelId: number) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot join channel');
      return;
    }

    // Leave previous channel if any
    if (this.currentChannel && this.currentChannel !== channelId) {
      this.socket.emit('leave_channel', { channel_id: this.currentChannel });
    }

    this.currentChannel = channelId;
    this.socket.emit('join_channel', { channel_id: channelId });
    console.log(`[SOCKET] 🚪 Joining channel ${channelId}`);
  }

  // Leave current channel
  leaveChannel() {
    if (!this.socket?.connected || !this.currentChannel) return;

    this.socket.emit('leave_channel', { channel_id: this.currentChannel });
    console.log(`[SOCKET] 🚪 Left channel ${this.currentChannel}`);
    this.currentChannel = null;
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
      },
    });
    console.log(`[SOCKET] 📤 Broadcasting message ${message.id} to channel ${channelId}`);
  }

  // Broadcast community creation
  broadcastCommunityCreated(community: any) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast community creation');
      return;
    }

    this.socket.emit('community_created', community);
    console.log(`[SOCKET] 🏘️ Broadcasting new community ${community.id} - ${community.name}`);
  }

  // Broadcast channel creation
  broadcastChannelCreated(channel: any) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast channel creation');
      return;
    }

    this.socket.emit('channel_created', channel);
    console.log(`[SOCKET] ✨ Broadcasting new channel ${channel.id} - ${channel.name}`);
  }

  // Broadcast channel update
  broadcastChannelUpdated(channel: any) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast channel update');
      return;
    }

    this.socket.emit('channel_updated', channel);
    console.log(`[SOCKET] ✏️ Broadcasting channel update ${channel.id}`);
  }

  // Broadcast channel deletion
  broadcastChannelDeleted(channelId: number, communityId: number) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot broadcast channel deletion');
      return;
    }

    this.socket.emit('channel_deleted', { id: channelId, community_id: communityId });
    console.log(`[SOCKET] 🗑️ Broadcasting channel deletion ${channelId}`);
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
    console.log(`[SOCKET] 👥 Broadcasting member addition to community ${communityId}`);
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

  onTyping(handler: TypingHandler) {
    this.typingHandlers.push(handler);
    return () => {
      this.typingHandlers = this.typingHandlers.filter(h => h !== handler);
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

  onChannel(handler: ChannelHandler) {
    this.channelHandlers.push(handler);
    return () => {
      this.channelHandlers = this.channelHandlers.filter(h => h !== handler);
    };
  }

  onDirectMessage(handler: DirectMessageHandler) {
    // SIMPLIFIED: Just add handler to the array
    // The listener is already registered in setupEventListeners
    console.log('[SOCKET] 📡 onDirectMessage called - adding handler to directMessageHandlers');
    this.directMessageHandlers.push(handler);
    console.log('[SOCKET] ✅ Handler added, total handlers:', this.directMessageHandlers.length);
    
    return () => {
      console.log('[SOCKET] 🗑️ Removing handler from directMessageHandlers');
      this.directMessageHandlers = this.directMessageHandlers.filter(h => h !== handler);
      console.log('[SOCKET] ✅ Handler removed, remaining handlers:', this.directMessageHandlers.length);
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

  disconnect() {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentChannel = null;
      console.log('[SOCKET] 🔌 Disconnected manually');
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getCurrentChannel(): number | null {
    return this.currentChannel;
  }
}

export const socketService = new SocketService();