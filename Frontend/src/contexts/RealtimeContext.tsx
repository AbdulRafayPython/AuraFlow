// contexts/RealtimeContext.tsx - FIXED with proper dependencies
import React, { createContext, useEffect, useState, useCallback, useRef } from 'react';
import { socketService } from '@/services/socketService';
import { messageService } from '@/services/messageService';
import { channelService } from '@/services/channelService';
import type { Message, TypingUser, Community, Channel, Friend, User } from '@/types';
import authService from '@/services/authService';

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
  currentUser: User | null;
  isLoadingCurrentUser: boolean;
}

export const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoadingCurrentUser, setIsLoadingCurrentUser] = useState(true);

  const typingTimeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const previousChannelRef = useRef<number | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());

  const loadCurrentUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setIsLoadingCurrentUser(false);
      return;
    }

    setIsLoadingCurrentUser(true);
    try {
      const user = await authService.getMe();           // calls /api/me
      setCurrentUser(user);
      console.log('[REALTIME] Current user loaded:', user);
    } catch (error) {
      console.error('[REALTIME] Failed to load current user:', error);
      setCurrentUser(null);
    } finally {
      setIsLoadingCurrentUser(false);
    }
  }, []);

  // FIXED: Load functions wrapped in useCallback to prevent unnecessary re-runs
  const loadCommunities = useCallback(async () => {
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
  }, [currentCommunity]);

  const loadChannels = useCallback(async (communityId: number) => {
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
  }, [currentChannel]);

  const loadFriends = useCallback(async () => {
    setIsLoadingFriends(true);
    try {
      const data = await channelService.getFriends();
      console.log('[REALTIME] Loaded friends:', data);
      setFriends(data);

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
  }, []);

  const loadMessages = useCallback(async (channelId: number, offset = 0) => {
    setIsLoadingMessages(true);
    try {
      const data = await messageService.getChannelMessages(channelId, 50, offset);
      console.log('[REALTIME] Loaded messages:', data.length);

      if (offset === 0) {
        messageIdsRef.current.clear();
        data.forEach(msg => messageIdsRef.current.add(String(msg.id)));

        setMessages(data.reverse());
        setMessageOffset(data.length);
      } else {
        data.forEach(msg => messageIdsRef.current.add(String(msg.id)));

        setMessages((prev) => [...data.reverse(), ...prev]);
        setMessageOffset(offset + data.length);
      }
    } catch (error) {
      console.error('[REALTIME] Failed to load messages:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Socket connection setup
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('[REALTIME] No token found');
      return;
    }

    console.log('[REALTIME] Initializing socket connection');
    socketService.connect(token);
    setIsConnected(socketService.isConnected());

    const unsubscribeMessage = socketService.onMessage((incomingMessage: Message) => {
      console.log('[REALTIME] Received new message:', incomingMessage);

      const messageId = String(incomingMessage.id);

      if (messageIdsRef.current.has(messageId)) {
        console.log('[REALTIME] Duplicate message ignored:', messageId);
        return;
      }

      messageIdsRef.current.add(messageId);
      setMessages((prev) => [...prev, incomingMessage]);
    });

    const unsubscribeStatus = socketService.onUserStatus((status) => {
      console.log('[REALTIME] User status update:', status);
      setUserStatuses((prev) => {
        const newMap = new Map(prev);
        newMap.set(status.username, status.status);
        return newMap;
      });

      setFriends((prev) =>
        prev.map((friend) =>
          friend.username === status.username
            ? { ...friend, status: status.status }
            : friend
        )
      );
    });

    const unsubscribeTyping = socketService.onTyping((data) => {
      console.log('[REALTIME] Typing indicator:', data);

      // Use functional update to get current channel
      setTypingUsers((prev) => {
        // Access current channel through a ref would be better, but this works
        const currentChannelId = socketService.getCurrentChannel();

        if (!currentChannelId || data.channel_id !== currentChannelId) {
          return prev;
        }

        if (data.is_typing) {
          const existing = prev.find((u) => u.username === data.username);
          if (existing) return prev;

          const newUsers = [...prev, { username: data.username, timestamp: Date.now() }];

          const existingTimeout = typingTimeoutRefs.current.get(data.username);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }

          const timeout = setTimeout(() => {
            setTypingUsers((current) =>
              current.filter((u) => u.username !== data.username)
            );
            typingTimeoutRefs.current.delete(data.username);
          }, 5000);

          typingTimeoutRefs.current.set(data.username, timeout);
          return newUsers;
        } else {
          const timeout = typingTimeoutRefs.current.get(data.username);
          if (timeout) {
            clearTimeout(timeout);
            typingTimeoutRefs.current.delete(data.username);
          }
          return prev.filter((u) => u.username !== data.username);
        }
      });
    });

    const unsubscribeError = socketService.onError((error) => {
      console.error('[REALTIME] Socket error:', error.msg);
    });

    return () => {
      console.log('[REALTIME] Cleaning up socket connection');
      unsubscribeMessage();
      unsubscribeStatus();
      unsubscribeTyping();
      unsubscribeError();

      typingTimeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      typingTimeoutRefs.current.clear();

      socketService.disconnect();
    };
  }, []); // FIXED: Only run once on mount

  // Connection status polling
  useEffect(() => {
    const interval = setInterval(() => {
      setIsConnected(socketService.isConnected());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Load initial data
  useEffect(() => {
    loadCurrentUser();
    loadCommunities();
    loadFriends();
  }, [loadCommunities, loadFriends]);

  // Load channels when community changes
  useEffect(() => {
    if (currentCommunity) {
      loadChannels(currentCommunity.id);
    } else {
      setChannels([]);
      setCurrentChannel(null);
    }
  }, [currentCommunity, loadChannels]);

  // Handle channel changes
  useEffect(() => {
    if (currentChannel) {
      if (previousChannelRef.current && previousChannelRef.current !== currentChannel.id) {
        console.log(`[REALTIME] Leaving previous channel ${previousChannelRef.current}`);
        socketService.leaveChannel();
      }

      console.log(`[REALTIME] Joining channel ${currentChannel.id}`);

      messageIdsRef.current.clear();

      loadMessages(currentChannel.id, 0);
      socketService.joinChannel(currentChannel.id);

      previousChannelRef.current = currentChannel.id;

      setTypingUsers([]);
      typingTimeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      typingTimeoutRefs.current.clear();
    }

    return () => {
      if (currentChannel) {
        socketService.leaveChannel();
      }
    };
  }, [currentChannel, loadMessages]);

  const loadMoreMessages = useCallback(async () => {
    if (currentChannel && !isLoadingMessages && messageOffset > 0) {
      console.log('[REALTIME] Loading more messages, offset:', messageOffset);
      await loadMessages(currentChannel.id, messageOffset);
    }
  }, [currentChannel, isLoadingMessages, messageOffset, loadMessages]);

  const selectCommunity = useCallback((communityId: number) => {
    const community = communities.find((c) => c.id === communityId);
    if (community) {
      console.log('[REALTIME] Selected community:', community.name);
      setCurrentCommunity(community);
      setCurrentChannel(null);
      setMessages([]);
      setMessageOffset(0);
      messageIdsRef.current.clear();
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
      messageIdsRef.current.clear();
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
      messageIdsRef.current.clear();
    }
  }, [friends]);

  const sendMessage = useCallback(async (content: string, messageType: 'text' | 'image' | 'file' = 'text') => {
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

      const messageId = String(message.id);
      if (!messageIdsRef.current.has(messageId)) {
        messageIdsRef.current.add(messageId);
        setMessages((prev) => [...prev, message]);
      }

      socketService.broadcastMessage(currentChannel.id, message);

      console.log('[REALTIME] Message sent successfully:', message.id);
    } catch (error) {
      console.error('[REALTIME] Failed to send message:', error);
      throw error;
    }
  }, [currentChannel]);

  const sendTyping = useCallback(() => {
    if (currentChannel && isConnected) {
      socketService.sendTyping(currentChannel.id, true);
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
    currentUser,               
    isLoadingCurrentUser,
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}