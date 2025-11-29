// services/socketService.ts - FIXED: Proper token passing
import { io, Socket } from 'socket.io-client';
import type { Message } from '@/types';

interface UserStatus {
  username: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
}

interface TypingIndicator {
  username: string;
  channel_id: number;
  is_typing: boolean;
}

type MessageHandler = (message: Message) => void;
type StatusHandler = (status: UserStatus) => void;
type TypingHandler = (data: TypingIndicator) => void;
type ErrorHandler = (error: { msg: string }) => void;
type CommunityHandler = (data: any) => void;

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
  private currentChannel: number | null = null;
  private typingTimeout: NodeJS.Timeout | null = null;

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
  }

  // Join a channel room
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