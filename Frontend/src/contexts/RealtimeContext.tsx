// contexts/RealtimeContext.tsx - FIXED with proper dependencies
import React, { createContext, useEffect, useState, useCallback, useRef } from 'react';
import { socketService } from '@/services/socketService';
import { messageService } from '@/services/messageService';
import { channelService } from '@/services/channelService';
import { useAuth } from '@/contexts/AuthContext';
import type { Message, TypingUser, Community, Channel, Friend, User, SendMessageResponse } from '@/types';
import authService from '@/services/authService';

interface RealtimeContextType {
  isConnected: boolean;
  communities: Community[];
  currentCommunity: Community | null;
  channels: Channel[];
  currentChannel: Channel | null;
  selectCommunity: (communityId: number | null) => void;
  selectChannel: (channelId: number) => void;
  addChannel: (channel: Channel) => void;
  friends: Friend[];
  currentFriend: Friend | null;
  selectFriend: (friendId: number) => void;
  messages: Message[];
  sendMessage: (content: string, messageType?: 'text' | 'image' | 'file', replyTo?: number) => Promise<SendMessageResponse | undefined>;
  loadMoreMessages: () => Promise<void>;
  typingUsers: TypingUser[];
  sendTyping: () => void;
  userStatuses: Map<string, 'online' | 'idle' | 'dnd' | 'offline'>;
  isLoadingMessages: boolean;
  isLoadingCommunities: boolean;
  isLoadingFriends: boolean;
  currentUser: User | null;
  isLoadingCurrentUser: boolean;
  reloadCommunities: () => Promise<void>;
}

export const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
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
  const currentUserRef = useRef<User | null>(null);
  const currentCommunityRef = useRef<Community | null>(null);
  const currentChannelRef = useRef<Channel | null>(null);

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
      currentUserRef.current = user;
      console.log('[REALTIME] Current user loaded:', user);
    } catch (error) {
      console.error('[REALTIME] Failed to load current user:', error);
      setCurrentUser(null);
      currentUserRef.current = null;
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
      console.log('[REALTIME] Community roles:', data.map(c => ({ id: c.id, name: c.name, role: c.role })));
      setCommunities(data);
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
      
      // Debug: Check for blocked users
      const blockedMessages = data.filter(m => m.is_blocked);
      if (blockedMessages.length > 0) {
        console.log('[REALTIME] Messages from blocked users:', blockedMessages.map(m => ({
          id: m.id,
          author: m.author,
          is_blocked: m.is_blocked
        })));
      } else {
        console.log('[REALTIME] No blocked users found in messages');
      }

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

  // Socket connection setup - wait for auth to be ready
  useEffect(() => {
    if (!isAuthenticated || !user) {
      console.log('[REALTIME] User not authenticated, skipping socket connection');
      socketService.disconnect();
      setIsConnected(false);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      console.log('[REALTIME] No token found, skipping socket connection');
      return;
    }

    console.log('[REALTIME] Initializing socket connection for user:', user.username);
    socketService.connect(token);
    
    // Wait for connection to be established
    const checkConnection = setInterval(() => {
      const connected = socketService.isConnected();
      setIsConnected(connected);
      
      if (connected) {
        console.log('[REALTIME] Socket connected, ready to load data');
        clearInterval(checkConnection);
      }
    }, 100);

    // Setup event listeners
    const unsubscribeMessage = socketService.onMessage((incomingMessage: Message) => {
      console.log('[REALTIME] Received new message:', {
        id: incomingMessage.id,
        channel_id: incomingMessage.channel_id,
        currentChannel: currentChannelRef.current?.id,
        author: incomingMessage.author,
      });

      // Only add message if it's for the current channel
      if (currentChannelRef.current && incomingMessage.channel_id !== currentChannelRef.current.id) {
        console.log('[REALTIME] Message for different channel, ignoring');
        return;
      }

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
        // Check if typing is for the current channel
        const currentChannelId = currentChannelRef.current?.id;

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

    const unsubscribeCommunity = socketService.onCommunityCreated((communityData) => {
      console.log('[REALTIME] Community created event received:', communityData);
      setCommunities((prev) => {
        // Check if community already exists
        const exists = prev.some(c => c.id === communityData.id);
        if (exists) {
          return prev;
        }
        return [...prev, communityData];
      });
    });

    // Handle community deletion (owner deleted the community)
    const unsubscribeCommunityDeleted = socketService.onCommunityDeleted((data) => {
      console.log('[REALTIME] Community deleted:', data);
      
      const deletedCommunityId = data.community_id;
      
      // Remove community from list
      setCommunities((prev) => prev.filter(c => c.id !== deletedCommunityId));
      
      // If this was the current community, navigate to Home
      if (currentCommunity?.id === deletedCommunityId) {
        console.log('[REALTIME] Current community was deleted, navigating to Home');
        setCurrentCommunity(null);
        setCurrentChannel(null);
        setChannels([]);
        setMessages([]);
        messageIdsRef.current.clear();
        
        // Navigate to home page (empty communities = Home display)
        window.dispatchEvent(new CustomEvent('auraflow:navigate-home'));
      }
      
      // Leave all rooms for this community
      socketService.leaveCommunity(deletedCommunityId);
    });

    // Handle community left (current user left the community)
    const unsubscribeCommunityLeft = socketService.onCommunityLeft((data) => {
      console.log('[REALTIME] User left community:', data);
      
      // Only process if it's the current user who left
      if (currentUserRef.current && data.user_id === currentUserRef.current.id) {
        const leftCommunityId = data.community_id;
        
        // Remove community from list
        setCommunities((prev) => prev.filter(c => c.id !== leftCommunityId));
        
        // If this was the current community, navigate to Home
        if (currentCommunityRef.current?.id === leftCommunityId) {
          console.log('[REALTIME] Left current community, navigating to Home');
          setCurrentCommunity(null);
          setCurrentChannel(null);
          setChannels([]);
          setMessages([]);
          messageIdsRef.current.clear();
          
          // Navigate to home page
          window.dispatchEvent(new CustomEvent('auraflow:navigate-home'));
        }
        
        // Leave all rooms for this community
        socketService.leaveCommunity(leftCommunityId);
      }
    });

    // Handle community removal (user removed/blocked)
    const unsubscribeCommunityRemoved = socketService.onCommunityRemoved((data) => {
      console.log('[REALTIME] Removed from community:', data);
      
      // Create notification for removal
      if (data.notification) {
        // Create notification object
        const notificationPayload = {
          type: 'system' as const,
          title: 'Removed from Community',
          message: data.reason === 'blocked' 
            ? `You were blocked from ${data.notification.community_name} for repeated violations`
            : `You were removed from ${data.notification.community_name} due to a violation`,
          data: {
            community_id: data.community_id,
            community_name: data.notification.community_name,
            community_logo: data.notification.community_logo,
            community_color: data.notification.community_color,
            community_icon: data.notification.community_icon,
            reason: data.reason
          }
        };
        
        // Dispatch custom event for notification bell
        const event = new CustomEvent('community-removal-notification', { detail: notificationPayload });
        window.dispatchEvent(event);
      }
      
      // Remove community from list
      setCommunities((prev) => prev.filter(c => c.id !== data.community_id));
      
      // ALWAYS navigate to home if current community was removed, regardless of other communities
      if (currentCommunityRef.current?.id === data.community_id) {
        setCurrentCommunity(null);
        setCurrentChannel(null);
        setChannels([]);
        setMessages([]);
        messageIdsRef.current.clear();
        
        // Navigate to home page
        window.dispatchEvent(new CustomEvent('auraflow:navigate-home'));
      }
      
      // Leave all rooms for this community
      socketService.leaveCommunity(data.community_id);
    });

    // Channel operation event handler
    const unsubscribeChannel = socketService.onChannel((eventData) => {
      const { type, data } = eventData;
      console.log(`[REALTIME] Channel ${type} event received:`, data);

      if (type === 'created') {
        // Check if this is for the current community
        if (currentCommunityRef.current && data.community_id === currentCommunityRef.current.id) {
          setChannels((prev) => {
            const exists = prev.some(ch => ch.id === data.id);
            if (exists) return prev;
            return [...prev, data];
          });
        }
      } else if (type === 'updated') {
        // Update the channel in the list
        setChannels((prev) =>
          prev.map((ch) =>
            ch.id === data.id
              ? { ...ch, name: data.name, description: data.description, type: data.type }
              : ch
          )
        );
        // Update current channel if it's the one being edited
        if (currentChannel && currentChannel.id === data.id) {
          setCurrentChannel((prev) =>
            prev
              ? { ...prev, name: data.name, description: data.description, type: data.type }
              : null
          );
        }
      } else if (type === 'deleted') {
        // Remove the channel from the list
        setChannels((prev) => prev.filter((ch) => ch.id !== data.id));
        // If current channel was deleted, clear it
        if (currentChannel && currentChannel.id === data.id) {
          setCurrentChannel(null);
          setMessages([]);
          messageIdsRef.current.clear();
        }
      } else if (type === 'member_added') {
        // Optionally reload communities to update member lists
        console.log('[REALTIME] Member added to community:', data.community_id);
      }
    });

    // Listen for user blocking events to update message UI
    const unsubscribeUserBlocked = socketService.onUserBlocked((data) => {
      console.log('[REALTIME] User blocked from community:', data);
      
      // Update all messages from this user to show is_blocked: true
      setMessages((prevMessages) => 
        prevMessages.map((msg) => 
          msg.sender_id === data.user_id 
            ? { ...msg, is_blocked: true }
            : msg
        )
      );
    });

    // Listen for AI command results (e.g., /summarize)
    const unsubscribeCommandResult = socketService.onCommandResult((data) => {
      console.log('[REALTIME] ✅ AI Command result received from socket:', data);
      console.log('[REALTIME] ✅ Dispatching custom event ai_command_result');
      
      // Dispatch custom event for UI components to handle
      const event = new CustomEvent('ai_command_result', { detail: data });
      window.dispatchEvent(event);
      console.log('[REALTIME] ✅ Custom event dispatched');
    });

    return () => {
      console.log('[REALTIME] Cleaning up socket connection');
      clearInterval(checkConnection);
      unsubscribeMessage();
      unsubscribeStatus();
      unsubscribeTyping();
      unsubscribeError();
      unsubscribeCommunity();
      unsubscribeCommunityDeleted();
      unsubscribeCommunityLeft();
      unsubscribeCommunityRemoved();
      unsubscribeChannel();
      unsubscribeUserBlocked();
      unsubscribeCommandResult();

      typingTimeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      typingTimeoutRefs.current.clear();

      socketService.disconnect();
    };
  }, [isAuthenticated, user]); // Re-run when auth state changes

  // Connection status polling
  useEffect(() => {
    const interval = setInterval(() => {
      setIsConnected(socketService.isConnected());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Load initial data - only when socket is connected
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !isConnected) {
      console.log('[REALTIME] Skipping data load - no token or not connected');
      return;
    }

    console.log('[REALTIME] Loading initial data (user, communities, friends)');
    loadCurrentUser();
    loadCommunities();
    loadFriends();
  }, [isConnected, loadCurrentUser, loadCommunities, loadFriends]);

  // ALSO load communities immediately when token is available (faster initial load)
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }

    console.log('[REALTIME] Loading communities immediately after token detected');
    loadCommunities();
  }, [loadCommunities]);

  // Reload communities when user completes onboarding
  useEffect(() => {
    if (isAuthenticated && user && !user.is_first_login) {
      console.log('[REALTIME] User completed onboarding, reloading communities');
      loadCommunities();
    }
  }, [isAuthenticated, user?.is_first_login, loadCommunities]);

  // Load channels when community changes
  useEffect(() => {
    if (currentCommunity) {
      currentCommunityRef.current = currentCommunity;
      loadChannels(currentCommunity.id);
    } else {
      currentCommunityRef.current = null;
      setChannels([]);
      setCurrentChannel(null);
      currentChannelRef.current = null;
    }
  }, [currentCommunity, loadChannels]);

  // Handle channel changes
  useEffect(() => {
    if (currentChannel) {
      currentChannelRef.current = currentChannel;
      
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

  const selectCommunity = useCallback((communityId: number | null) => {
    if (communityId === null) {
      console.log('[REALTIME] Clearing community selection');
      setCurrentCommunity(null);
      currentCommunityRef.current = null;
      setCurrentChannel(null);
      currentChannelRef.current = null;
      setChannels([]);
      setMessages([]);
      setMessageOffset(0);
      messageIdsRef.current.clear();
      return;
    }
    const community = communities.find((c) => c.id === communityId);
    if (community) {
      console.log('[REALTIME] Selected community:', community.name);
      setCurrentCommunity(community);
      currentCommunityRef.current = community;
      setCurrentChannel(null);
      currentChannelRef.current = null;
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
      currentChannelRef.current = channel;
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

  const reloadCommunities = useCallback(async () => {
    console.log('[REALTIME] Reloading communities...');
    await loadCommunities();
  }, [loadCommunities]);

  const sendMessage = useCallback(async (content: string, messageType: 'text' | 'image' | 'file' = 'text', replyTo?: number) => {
    if (!currentChannel || !content.trim()) {
      console.warn('[REALTIME] Cannot send message: no channel or empty content');
      return;
    }

    try {
      console.log('[REALTIME] Sending message to channel:', currentChannel.id);

      const response = await messageService.sendChannelMessage({
        channel_id: currentChannel.id,
        content,
        message_type: messageType,
        ...(replyTo ? { reply_to: replyTo } : {}),
      });

      if (response?.message) {
        const messageId = String(response.message.id);
        if (!messageIdsRef.current.has(messageId)) {
          messageIdsRef.current.add(messageId);
          
          // Attach moderation data if it exists (for warning tags)
          const messageToAdd = {
            ...response.message,
            moderation: response.moderation || undefined
          } as Message;
          
          setMessages((prev) => [...prev, messageToAdd]);
        }
        // Server now broadcasts message_received; no client rebroadcast needed
        console.log('[REALTIME] Message sent successfully (server will broadcast):', response.message.id);
        if (response.moderation) {
          console.log('[REALTIME] Message has moderation data:', response.moderation);
        }
      } else if (response?.moderation) {
        console.warn('[REALTIME] Message moderated:', response.moderation);
      }

      return response;
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

  const addChannel = useCallback((channel: Channel) => {
    console.log('[REALTIME] Adding channel to list:', channel.name);
    setChannels((prev) => {
      const exists = prev.some(ch => ch.id === channel.id);
      if (exists) return prev;
      return [...prev, channel];
    });
  }, []);

  const value: RealtimeContextType = {
    isConnected,
    communities,
    currentCommunity,
    channels,
    currentChannel,
    selectCommunity,
    selectChannel,
    addChannel,
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
    reloadCommunities,
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}