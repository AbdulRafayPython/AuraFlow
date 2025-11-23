// services/socketService.ts
import { io, Socket } from 'socket.io-client';

interface Message {
  id: string;
  channel_id: number;
  sender_id: number;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'system' | 'ai';
  created_at: string;
  author: string;
  avatar: string;
}

interface UserStatus {
  username: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
}

interface TypingIndicator {
  username: string;
  channel_id: number;
}

class SocketService {
  private socket: Socket | null = null;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private messageHandlers: ((message: Message) => void)[] = [];
  private statusHandlers: ((status: UserStatus) => void)[] = [];
  private typingHandlers: ((data: TypingIndicator) => void)[] = [];

  connect(token: string) {
    if (this.socket?.connected) {
      console.log('[SOCKET] Already connected');
      return;
    }

    this.token = token;
    
    this.socket = io('http://localhost:5000', {
      auth: {
        token: `Bearer ${token}`,
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
      console.log('[SOCKET] Connected successfully');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[SOCKET] Disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[SOCKET] Connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[SOCKET] Max reconnection attempts reached');
        this.disconnect();
      }
    });

    // User status updates
    this.socket.on('user_status', (data: UserStatus) => {
      console.log('[SOCKET] User status update:', data);
      this.statusHandlers.forEach(handler => handler(data));
    });

    // Message received
    this.socket.on('message_received', (data: Message) => {
      console.log('[SOCKET] New message received:', data);
      this.messageHandlers.forEach(handler => handler(data));
    });

    // Typing indicator
    this.socket.on('user_typing', (data: TypingIndicator) => {
      console.log('[SOCKET] User typing:', data);
      this.typingHandlers.forEach(handler => handler(data));
    });

    // Status message
    this.socket.on('status', (data: { msg: string }) => {
      console.log('[SOCKET] Status:', data.msg);
    });
  }

  // Join a channel room
  joinChannel(channelId: number) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot join channel');
      return;
    }

    this.socket.emit('join_channel', { channel_id: channelId });
    console.log(`[SOCKET] Joined channel ${channelId}`);
  }

  // Send typing indicator
  sendTyping(channelId: number) {
    if (!this.socket?.connected) return;
    this.socket.emit('typing', { channel_id: channelId });
  }

  // Send new message
  sendMessage(channelId: number, message: Partial<Message>) {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot send message');
      return;
    }

    this.socket.emit('new_message', {
      channel_id: channelId,
      ...message,
    });
  }

  // Event listeners
  onMessage(handler: (message: Message) => void) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  onUserStatus(handler: (status: UserStatus) => void) {
    this.statusHandlers.push(handler);
    return () => {
      this.statusHandlers = this.statusHandlers.filter(h => h !== handler);
    };
  }

  onTyping(handler: (data: TypingIndicator) => void) {
    this.typingHandlers.push(handler);
    return () => {
      this.typingHandlers = this.typingHandlers.filter(h => h !== handler);
    };
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      console.log('[SOCKET] Disconnected manually');
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketService = new SocketService();







