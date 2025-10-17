import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';

// Types
export interface User {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  typing?: { channelId: string; timestamp: number };
}

export interface Message {
  id: string;
  content: string;
  timestamp: Date;
  channelId: string;
  user: {
    id: string;
    name: string;
    avatar?: string;
  };
  type?: 'text' | 'system' | 'agent';
  mood?: 'positive' | 'neutral' | 'negative';
}

interface ChatState {
  socket: Socket | null;
  connected: boolean;
  messages: Record<string, Message[]>;
  users: Record<string, User>;
  activeChannel: string | null;
  currentUser: User | null;
  
  // Actions
  connect: (userId: string, userName: string) => void;
  disconnect: () => void;
  sendMessage: (channelId: string, content: string) => void;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  setTyping: (channelId: string, isTyping: boolean) => void;
}

// Create the store
export const useChatStore = create<ChatState>((set, get) => ({
  socket: null,
  connected: false,
  messages: {},
  users: {},
  activeChannel: null,
  currentUser: null,

  connect: (userId: string, userName: string) => {
    const socket = io('http://localhost:3000', {
      auth: { userId, userName },
    });

    // Set up socket event listeners
    socket.on('connect', () => {
      set({ connected: true });
      console.log('Connected to chat server');
    });

    socket.on('disconnect', () => {
      set({ connected: false });
      console.log('Disconnected from chat server');
    });

    socket.on('users', (users: User[]) => {
      const usersMap = users.reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {} as Record<string, User>);
      set({ users: usersMap });
    });

    socket.on('user_connected', (user: User) => {
      set((state) => ({
        users: { ...state.users, [user.id]: user },
      }));
    });

    socket.on('user_disconnected', (userId: string) => {
      set((state) => {
        const newUsers = { ...state.users };
        delete newUsers[userId];
        return { users: newUsers };
      });
    });

    socket.on('message', (message: Message) => {
      set((state) => ({
        messages: {
          ...state.messages,
          [message.channelId]: [
            ...(state.messages[message.channelId] || []),
            message,
          ],
        },
      }));
    });

    socket.on('typing', ({ userId, channelId, isTyping }: { userId: string; channelId: string; isTyping: boolean }) => {
      set((state) => ({
        users: {
          ...state.users,
          [userId]: {
            ...state.users[userId],
            typing: isTyping ? { channelId, timestamp: Date.now() } : undefined,
          },
        },
      }));
    });

    set({
      socket,
      currentUser: { id: userId, name: userName, status: 'online' },
    });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false, currentUser: null });
    }
  },

  sendMessage: (channelId: string, content: string) => {
    const { socket, currentUser } = get();
    if (socket && currentUser) {
      const message: Omit<Message, 'id'> = {
        content,
        timestamp: new Date(),
        channelId,
        user: {
          id: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar,
        },
        type: 'text',
      };
      socket.emit('message', message);
    }
  },

  joinChannel: (channelId: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('join_channel', channelId);
      set({ activeChannel: channelId });
    }
  },

  leaveChannel: (channelId: string) => {
    const { socket, activeChannel } = get();
    if (socket) {
      socket.emit('leave_channel', channelId);
      if (activeChannel === channelId) {
        set({ activeChannel: null });
      }
    }
  },

  setTyping: (channelId: string, isTyping: boolean) => {
    const { socket } = get();
    if (socket) {
      socket.emit('typing', { channelId, isTyping });
    }
  },
}));