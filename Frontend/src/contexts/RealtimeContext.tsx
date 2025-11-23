// contexts/realtimeContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { socketService } from '@/services/socketService';
import { messageService, Message } from '@/services/messageService';
import { channelService, Community, Channel, Friend } from '@/services/channelService';

interface TypingUser {
  username: string;
  timestamp: number;
}

interface RealtimeContextType {
  isConnected: boolean;
  communities: Community[];
  currentCommunity: Community | null;
  channels: Channel[];
  currentChannel: Channel | null;
  selectCommunity: (communityId: number) => void;
  selectChannel: (channelId: number) => void;
  friends: Friend[];
  currentFriend: Friend | null;
  selectFriend: (friendId: number) => void;
  messages: Message[];
  sendMessage: (content: string, messageType?: 'text' | 'image' | 'file') => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  typingUsers: TypingUser[];
  sendTyping: () => void;
  userStatuses: Map<string, 'online' | 'idle' | 'dnd' | 'offline'>;
  isLoadingMessages: boolean;
  isLoadingCommunities: boolean;
  isLoadingFriends: boolean;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [currentCommunity, setCurrentCommunity] = useState<Community | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [currentFriend, setCurrentFriend] = useState<Friend | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [userStatuses, setUserStatuses] = useState<Map<string, 'online' | 'idle' | 'dnd' | 'offline'>>(new Map());
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(false);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [messageOffset, setMessageOffset] = useState(0);
  
  const typingTimeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const previousChannelRef = useRef<number | null>(null);

  // Initialize socket connection
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('[REALTIME] No token found');
      return;
    }

    console.log('[REALTIME] Initializing socket connection');
    socketService.connect(token);
    setIsConnected(socketService.isConnected());

    // Listen for new messages
    const unsubscribeMessage = socketService.onMessage((incomingMessage: any) => {
      console.log('[REALTIME] Received new message:', incomingMessage);
      // Normalize incoming message to the Message type expected by state (ensure id is a number)
      const message: Message = {
        ...incomingMessage,
        id: typeof incomingMessage.id === 'string' ? Number(incomingMessage.id) : incomingMessage.id,
      };
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some(m => String(m.id) === String(message.id))) {
          return prev;
        }
        return [...prev, message];
      });
    });

    // Listen for user status updates
    const unsubscribeStatus = socketService.onUserStatus((status) => {
      console.log('[REALTIME] User status update:', status);
      setUserStatuses((prev) => {
        const newMap = new Map(prev);
        newMap.set(status.username, status.status);
        return newMap;
      });

      // Update friends list status
      setFriends((prev) =>
        prev.map((friend) =>
          friend.username === status.username
            ? { ...friend, status: status.status }
            : friend
        )
      );
    });

    // Listen for typing indicators
    const unsubscribeTyping = socketService.onTyping((data) => {
      console.log('[REALTIME] Typing indicator:', data);
      if (currentChannel && data.channel_id === currentChannel.id) {
        setTypingUsers((prev) => {
          const existing = prev.find((u) => u.username === data.username);
          if (existing) return prev;
          
          const newUsers = [...prev, { username: data.username, timestamp: Date.now() }];

          // Clear existing timeout for this user
          const existingTimeout = typingTimeoutRefs.current.get(data.username);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }

          // Set new timeout
          const timeout = setTimeout(() => {
            setTypingUsers((current) =>
              current.filter((u) => u.username !== data.username)
            );
            typingTimeoutRefs.current.delete(data.username);
          }, 3000);

          typingTimeoutRefs.current.set(data.username, timeout);
          return newUsers;
        });
      }
    });

    return () => {
      console.log('[REALTIME] Cleaning up socket connection');
      unsubscribeMessage();
      unsubscribeStatus();
      unsubscribeTyping();
      
      // Clear all typing timeouts
      typingTimeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      typingTimeoutRefs.current.clear();
      
      socketService.disconnect();
    };
  }, []);

  // Update socket connection status
  useEffect(() => {
    const interval = setInterval(() => {
      setIsConnected(socketService.isConnected());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Load communities on mount
  useEffect(() => {
    loadCommunities();
    loadFriends();
  }, []);

  // Load channels when community changes
  useEffect(() => {
    if (currentCommunity) {
      loadChannels(currentCommunity.id);
    } else {
      setChannels([]);
      setCurrentChannel(null);
    }
  }, [currentCommunity]);

  // Load messages and join channel when channel changes
  useEffect(() => {
    if (currentChannel) {
      // Leave previous channel
      if (previousChannelRef.current && previousChannelRef.current !== currentChannel.id) {
        console.log(`[REALTIME] Leaving previous channel ${previousChannelRef.current}`);
      }

      console.log(`[REALTIME] Joining channel ${currentChannel.id}`);
      loadMessages(currentChannel.id, 0);
      socketService.joinChannel(currentChannel.id);
      
      previousChannelRef.current = currentChannel.id;
      
      // Clear typing users when switching channels
      setTypingUsers([]);
      typingTimeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      typingTimeoutRefs.current.clear();
    }
  }, [currentChannel]);

  const loadCommunities = async () => {
    setIsLoadingCommunities(true);
    try {
      const data = await channelService.getCommunities();
      console.log('[REALTIME] Loaded communities:', data);
      setCommunities(data);
      if (data.length > 0 && !currentCommunity) {
        setCurrentCommunity(data[0]);
      }
    } catch (error) {
      console.error('[REALTIME] Failed to load communities:', error);
    } finally {
      setIsLoadingCommunities(false);
    }
  };

  const loadChannels = async (communityId: number) => {
    try {
      const data = await channelService.getCommunityChannels(communityId);
      console.log('[REALTIME] Loaded channels:', data);
      setChannels(data);
      if (data.length > 0 && !currentChannel) {
        setCurrentChannel(data[0]);
      }
    } catch (error) {
      console.error('[REALTIME] Failed to load channels:', error);
    }
  };

  const loadFriends = async () => {
    setIsLoadingFriends(true);
    try {
      const data = await channelService.getFriends();
      console.log('[REALTIME] Loaded friends:', data);
      setFriends(data);
      
      // Initialize status map
      const statusMap = new Map<string, 'online' | 'idle' | 'dnd' | 'offline'>();
      data.forEach((friend) => {
        statusMap.set(friend.username, friend.status);
      });
      setUserStatuses(statusMap);
    } catch (error) {
      console.error('[REALTIME] Failed to load friends:', error);
    } finally {
      setIsLoadingFriends(false);
    }
  };

  const loadMessages = async (channelId: number, offset = 0) => {
    setIsLoadingMessages(true);
    try {
      const data = await messageService.getChannelMessages(channelId, 50, offset);
      console.log('[REALTIME] Loaded messages:', data.length);
      if (offset === 0) {
        setMessages(data.reverse());
        setMessageOffset(data.length);
      } else {
        setMessages((prev) => [...data.reverse(), ...prev]);
        setMessageOffset(offset + data.length);
      }
    } catch (error) {
      console.error('[REALTIME] Failed to load messages:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const loadMoreMessages = useCallback(async () => {
    if (currentChannel && !isLoadingMessages && messageOffset > 0) {
      console.log('[REALTIME] Loading more messages, offset:', messageOffset);
      await loadMessages(currentChannel.id, messageOffset);
    }
  }, [currentChannel, isLoadingMessages, messageOffset]);

  const selectCommunity = useCallback((communityId: number) => {
    const community = communities.find((c) => c.id === communityId);
    if (community) {
      console.log('[REALTIME] Selected community:', community.name);
      setCurrentCommunity(community);
      setCurrentChannel(null);
      setMessages([]);
      setMessageOffset(0);
    }
  }, [communities]);

  const selectChannel = useCallback((channelId: number) => {
    const channel = channels.find((c) => c.id === channelId);
    if (channel) {
      console.log('[REALTIME] Selected channel:', channel.name);
      setCurrentChannel(channel);
      setCurrentFriend(null);
      setMessages([]);
      setMessageOffset(0);
    }
  }, [channels]);

  const selectFriend = useCallback((friendId: number) => {
    const friend = friends.find((f) => f.id === friendId);
    if (friend) {
      console.log('[REALTIME] Selected friend:', friend.display_name);
      setCurrentFriend(friend);
      setCurrentChannel(null);
      setMessages([]);
      setMessageOffset(0);
      // TODO: Load direct messages
    }
  }, [friends]);

  const sendMessage = async (content: string, messageType: 'text' | 'image' | 'file' = 'text') => {
    if (!currentChannel || !content.trim()) {
      console.warn('[REALTIME] Cannot send message: no channel or empty content');
      return;
    }

    try {
      console.log('[REALTIME] Sending message to channel:', currentChannel.id);
      const message = await messageService.sendChannelMessage({
        channel_id: currentChannel.id,
        content,
        message_type: messageType,
      });

      // The message will be added via socket callback
      console.log('[REALTIME] Message sent successfully:', message.id);
    } catch (error) {
      console.error('[REALTIME] Failed to send message:', error);
      throw error;
    }
  };

  const sendTyping = useCallback(() => {
    if (currentChannel && isConnected) {
      socketService.sendTyping(currentChannel.id);
    }
  }, [currentChannel, isConnected]);

  const value: RealtimeContextType = {
    isConnected,
    communities,
    currentCommunity,
    channels,
    currentChannel,
    selectCommunity,
    selectChannel,
    friends,
    currentFriend,
    selectFriend,
    messages,
    sendMessage,
    loadMoreMessages,
    typingUsers,
    sendTyping,
    userStatuses,
    isLoadingMessages,
    isLoadingCommunities,
    isLoadingFriends,
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within RealtimeProvider');
  }
  return context;
}