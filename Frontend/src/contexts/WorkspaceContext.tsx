import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { channelService } from "@/services/channelService";
import { messageService } from "@/services/messageService";
import { friendService } from "@/services/friendService";
import type { 
  Community, 
  Channel, 
  Friend, 
  FriendRequest, 
  Message,
  User,
  CommunityMember,
  CreateCommunityPayload 
} from "@/types";

interface WorkspaceContextType {
  // Workspace state
  currentWorkspace: Community | null;
  workspaces: Community[];
  
  // Channel management
  channels: Channel[];
  currentChannel: Channel | null;
  selectWorkspace: (workspaceId: number) => Promise<void>;
  selectChannel: (channelId: number) => Promise<void>;
  createWorkspace: (payload: CreateCommunityPayload) => Promise<Community>;
  createChannel: (communityId: number, name: string, type?: 'text' | 'voice', description?: string) => Promise<Channel>;
  joinChannel: (channelId: number) => Promise<void>;
  leaveChannel: (channelId: number) => Promise<void>;
  deleteChannel: (channelId: number) => Promise<void>;
  
  // Friend management
  friends: Friend[];
  friendRequests: FriendRequest[];
  currentFriend: Friend | null;
  selectFriend: (friendId: number) => void;
  sendFriendRequest: (username: string) => Promise<FriendRequest>;
  acceptFriendRequest: (requestId: number) => Promise<void>;
  rejectFriendRequest: (requestId: number) => Promise<void>;
  removeFriend: (friendId: number) => Promise<void>;
  blockUser: (userId: number) => Promise<void>;
  unblockUser: (userId: number) => Promise<void>;
  getPendingRequests: () => Promise<void>;
  
  // Message management
  messages: Message[];
  currentMessages: Message[];
  sendMessage: (channelId: number, content: string, messageType?: 'text' | 'image' | 'file') => Promise<Message>;
  loadChannelMessages: (channelId: number, limit?: number, offset?: number) => Promise<void>;
  loadMoreMessages: (channelId: number, limit?: number, offset?: number) => Promise<void>;
  sendDirectMessage: (receiverId: number, content: string, messageType?: 'text') => Promise<void>;
  deleteMessage: (messageId: number) => Promise<void>;
  editMessage: (messageId: number, content: string) => Promise<Message>;
  markAsRead: (messageIds: number[]) => Promise<void>;
  
  // Community member management
  communityMembers: CommunityMember[];
  searchUsers: (query: string) => Promise<User[]>;
  getCommunityMembers: (communityId: number) => Promise<void>;
  addCommunityMember: (communityId: number, userId: number) => Promise<void>;
  
  // Loading states
  isLoadingWorkspaces: boolean;
  isLoadingChannels: boolean;
  isLoadingMessages: boolean;
  isLoadingFriends: boolean;
  isLoadingRequests: boolean;
  
  // Error handling
  error: string | null;
  clearError: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  // Workspace state
  const [workspaces, setWorkspaces] = useState<Community[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Community | null>(null);
  
  // Channel state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  
  // Friend state
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [currentFriend, setCurrentFriend] = useState<Friend | null>(null);
  
  // Message state
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessages, setCurrentMessages] = useState<Message[]>([]);
  
  // Community members state
  const [communityMembers, setCommunityMembers] = useState<CommunityMember[]>([]);
  
  // Loading states
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  
  // Error handling
  const [error, setError] = useState<string | null>(null);

  // Initialize workspaces on mount
  useEffect(() => {
    loadWorkspaces();
    getPendingRequests();
  }, []);

  const loadWorkspaces = useCallback(async () => {
    setIsLoadingWorkspaces(true);
    try {
      const data = await channelService.getCommunities();
      setWorkspaces(data);
      if (data.length > 0 && !currentWorkspace) {
        setCurrentWorkspace(data[0]);
      }
      setError(null);
    } catch (err: any) {
      console.error('[WorkspaceContext] Failed to load workspaces:', err);
      setError(err.message || 'Failed to load workspaces');
    } finally {
      setIsLoadingWorkspaces(false);
    }
  }, [currentWorkspace]);

  const selectWorkspace = useCallback(async (workspaceId: number) => {
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (workspace) {
      setCurrentWorkspace(workspace);
      setCurrentChannel(null);
      setChannels([]);
      setCurrentMessages([]);
      
      // Load channels for the new workspace
      await loadChannelsForWorkspace(workspaceId);
      setError(null);
    }
  }, [workspaces]);

  const loadChannelsForWorkspace = useCallback(async (communityId: number) => {
    setIsLoadingChannels(true);
    try {
      const data = await channelService.getCommunityChannels(communityId);
      setChannels(data);
      if (data.length > 0) {
        setCurrentChannel(data[0]);
        // Load messages for the first channel
        await loadChannelMessages(data[0].id);
      }
      setError(null);
    } catch (err: any) {
      console.error('[WorkspaceContext] Failed to load channels:', err);
      setError(err.message || 'Failed to load channels');
    } finally {
      setIsLoadingChannels(false);
    }
  }, []);

  const selectChannel = useCallback(async (channelId: number) => {
    const channel = channels.find(c => c.id === channelId);
    if (channel) {
      setCurrentChannel(channel);
      setCurrentMessages([]);
      await loadChannelMessages(channelId);
      setError(null);
    }
  }, [channels]);

  const createWorkspace = useCallback(async (payload: CreateCommunityPayload) => {
    try {
      const newWorkspace = await channelService.createCommunity(payload);
      setWorkspaces([...workspaces, newWorkspace]);
      setCurrentWorkspace(newWorkspace);
      setError(null);
      return newWorkspace;
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to create workspace';
      setError(errorMsg);
      throw err;
    }
  }, [workspaces]);

  const createChannel = useCallback(async (communityId: number, name: string, type: 'text' | 'voice' = 'text', description?: string) => {
    try {
      const newChannel = await channelService.createChannel(communityId, name, type, description);
      setChannels([...channels, newChannel]);
      setError(null);
      return newChannel;
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to create channel';
      setError(errorMsg);
      throw err;
    }
  }, [channels]);

  const joinChannel = useCallback(async (channelId: number) => {
    try {
      await channelService.joinChannel(channelId);
      setError(null);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to join channel';
      setError(errorMsg);
      throw err;
    }
  }, []);

  const leaveChannel = useCallback(async (channelId: number) => {
    try {
      await channelService.leaveChannel(channelId);
      const updatedChannels = channels.filter(c => c.id !== channelId);
      setChannels(updatedChannels);
      if (currentChannel?.id === channelId) {
        setCurrentChannel(updatedChannels[0] || null);
        setCurrentMessages([]);
      }
      setError(null);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to leave channel';
      setError(errorMsg);
      throw err;
    }
  }, [channels, currentChannel]);

  const deleteChannel = useCallback(async (channelId: number) => {
    try {
      await channelService.deleteChannel(channelId);
      const updatedChannels = channels.filter(c => c.id !== channelId);
      setChannels(updatedChannels);
      if (currentChannel?.id === channelId) {
        setCurrentChannel(updatedChannels[0] || null);
        setCurrentMessages([]);
      }
      setError(null);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to delete channel';
      setError(errorMsg);
      throw err;
    }
  }, [channels, currentChannel]);

  // Message functions
  const loadChannelMessages = useCallback(async (channelId: number, limit = 50, offset = 0) => {
    setIsLoadingMessages(true);
    try {
      const data = await messageService.getChannelMessages(channelId, limit, offset);
      if (offset === 0) {
        setCurrentMessages(data);
      } else {
        setCurrentMessages(prev => [...prev, ...data]);
      }
      setMessages(data);
      setError(null);
    } catch (err: any) {
      console.error('[WorkspaceContext] Failed to load messages:', err);
      setError(err.message || 'Failed to load messages');
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  const loadMoreMessages = useCallback(async (channelId: number, limit = 50, offset = 50) => {
    try {
      const data = await messageService.getChannelMessages(channelId, limit, offset);
      setCurrentMessages(prev => [...data, ...prev]);
      setError(null);
    } catch (err: any) {
      console.error('[WorkspaceContext] Failed to load more messages:', err);
      setError(err.message || 'Failed to load more messages');
    }
  }, []);

  const sendMessage = useCallback(async (channelId: number, content: string, messageType: 'text' | 'image' | 'file' = 'text') => {
    try {
      const message = await messageService.sendChannelMessage({
        channel_id: channelId,
        content,
        message_type: messageType,
      });
      setCurrentMessages(prev => [...prev, message]);
      setError(null);
      return message;
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to send message';
      setError(errorMsg);
      throw err;
    }
  }, []);

  const sendDirectMessage = useCallback(async (receiverId: number, content: string, messageType = 'text') => {
    try {
      await messageService.sendDirectMessage(receiverId, content, messageType);
      setError(null);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to send direct message';
      setError(errorMsg);
      throw err;
    }
  }, []);

  const deleteMessage = useCallback(async (messageId: number) => {
    try {
      await messageService.deleteMessage(messageId);
      setCurrentMessages(prev => prev.filter(m => m.id !== messageId));
      setError(null);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to delete message';
      setError(errorMsg);
      throw err;
    }
  }, []);

  const editMessage = useCallback(async (messageId: number, content: string) => {
    try {
      const updated = await messageService.editMessage(messageId, content);
      setCurrentMessages(prev =>
        prev.map(m => m.id === messageId ? updated : m)
      );
      setError(null);
      return updated;
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to edit message';
      setError(errorMsg);
      throw err;
    }
  }, []);

  const markAsRead = useCallback(async (messageIds: number[]) => {
    try {
      await messageService.markAsRead(messageIds);
      setError(null);
    } catch (err: any) {
      console.error('[WorkspaceContext] Failed to mark messages as read:', err);
    }
  }, []);

  // Friend functions
  const loadFriends = useCallback(async () => {
    setIsLoadingFriends(true);
    try {
      const data = await channelService.getFriends();
      setFriends(data);
      setError(null);
    } catch (err: any) {
      console.error('[WorkspaceContext] Failed to load friends:', err);
      setError(err.message || 'Failed to load friends');
    } finally {
      setIsLoadingFriends(false);
    }
  }, []);

  const selectFriend = useCallback((friendId: number) => {
    const friend = friends.find(f => f.id === friendId);
    if (friend) {
      setCurrentFriend(friend);
    }
  }, [friends]);

  const sendFriendRequest = useCallback(async (username: string) => {
    try {
      const request = await friendService.sendFriendRequest(username);
      setError(null);
      return request;
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to send friend request';
      setError(errorMsg);
      throw err;
    }
  }, []);

  const getPendingRequests = useCallback(async () => {
    setIsLoadingRequests(true);
    try {
      const data = await friendService.getPendingRequests();
      setFriendRequests(data);
      setError(null);
    } catch (err: any) {
      console.error('[WorkspaceContext] Failed to load friend requests:', err);
      setError(err.message || 'Failed to load friend requests');
    } finally {
      setIsLoadingRequests(false);
    }
  }, []);

  const acceptFriendRequest = useCallback(async (requestId: number) => {
    try {
      await friendService.acceptFriendRequest(requestId);
      setFriendRequests(prev => prev.filter(r => r.id !== requestId));
      await loadFriends();
      setError(null);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to accept friend request';
      setError(errorMsg);
      throw err;
    }
  }, []);

  const rejectFriendRequest = useCallback(async (requestId: number) => {
    try {
      await friendService.rejectFriendRequest(requestId);
      setFriendRequests(prev => prev.filter(r => r.id !== requestId));
      setError(null);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to reject friend request';
      setError(errorMsg);
      throw err;
    }
  }, []);

  const removeFriend = useCallback(async (friendId: number) => {
    try {
      await friendService.removeFriend(friendId);
      setFriends(prev => prev.filter(f => f.id !== friendId));
      if (currentFriend?.id === friendId) {
        setCurrentFriend(null);
      }
      setError(null);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to remove friend';
      setError(errorMsg);
      throw err;
    }
  }, [currentFriend]);

  const blockUser = useCallback(async (userId: number) => {
    try {
      await friendService.blockUser(userId);
      setFriends(prev => prev.filter(f => f.id !== userId));
      setError(null);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to block user';
      setError(errorMsg);
      throw err;
    }
  }, []);

  const unblockUser = useCallback(async (userId: number) => {
    try {
      await friendService.unblockUser(userId);
      setError(null);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to unblock user';
      setError(errorMsg);
      throw err;
    }
  }, []);

  // Community member functions
  const searchUsers = useCallback(async (query: string) => {
    try {
      const results = await channelService.searchUsers(query);
      setError(null);
      return results;
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to search users';
      setError(errorMsg);
      return [];
    }
  }, []);

  const getCommunityMembers = useCallback(async (communityId: number) => {
    try {
      const members = await channelService.getCommunityMembers(communityId);
      setCommunityMembers(members);
      setError(null);
    } catch (err: any) {
      console.error('[WorkspaceContext] Failed to load community members:', err);
      setError(err.message || 'Failed to load community members');
    }
  }, []);

  const addCommunityMember = useCallback(async (communityId: number, userId: number) => {
    try {
      await channelService.addCommunityMember(communityId, userId);
      await getCommunityMembers(communityId);
      setError(null);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to add community member';
      setError(errorMsg);
      throw err;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: WorkspaceContextType = {
    // Workspace
    currentWorkspace,
    workspaces,
    selectWorkspace,
    selectChannel,
    createWorkspace,
    createChannel,
    joinChannel,
    leaveChannel,
    deleteChannel,
    
    // Channels
    channels,
    currentChannel,
    
    // Friends
    friends,
    friendRequests,
    currentFriend,
    selectFriend,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    blockUser,
    unblockUser,
    getPendingRequests,
    
    // Messages
    messages,
    currentMessages,
    sendMessage,
    loadChannelMessages,
    loadMoreMessages,
    sendDirectMessage,
    deleteMessage,
    editMessage,
    markAsRead,
    
    // Community members
    communityMembers,
    searchUsers,
    getCommunityMembers,
    addCommunityMember,
    
    // Loading states
    isLoadingWorkspaces,
    isLoadingChannels,
    isLoadingMessages,
    isLoadingFriends,
    isLoadingRequests,
    
    // Error handling
    error,
    clearError,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return context;
}