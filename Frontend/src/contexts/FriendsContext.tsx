import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Friend, FriendRequest, BlockedUser } from "@/types";
import { friendService } from "@/services/friendService";
import { socketService } from "@/services/socketService";
import { useAuth } from "./AuthContext";

interface FriendsContextType {
  friends: Friend[];
  pendingRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  blockedUsers: BlockedUser[];
  loading: boolean;
  error: string | null;

  // Friend operations
  getFriends: () => Promise<void>;
  getPendingRequests: () => Promise<void>;
  getSentRequests: () => Promise<void>;
  getBlockedUsers: () => Promise<void>;
  searchUsers: (query: string) => Promise<any[]>;
  sendFriendRequest: (username: string) => Promise<void>;
  acceptFriendRequest: (requestId: number) => Promise<void>;
  rejectFriendRequest: (requestId: number) => Promise<void>;
  cancelFriendRequest: (requestId: number) => Promise<void>;
  removeFriend: (friendId: number) => Promise<void>;
  blockUser: (userId: number) => Promise<void>;
  unblockUser: (userId: number) => Promise<void>;

  // Local state updates
  addFriend: (friend: Friend) => void;
  removeFriendLocal: (friendId: number) => void;
  updateFriendStatus: (friendId: number, status: string) => void;
  addPendingRequest: (request: FriendRequest) => void;
  removePendingRequest: (requestId: number) => void;
}

const FriendsContext = createContext<FriendsContextType | undefined>(undefined);

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch friends
  const getFriends = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await friendService.getFriends();
      setFriends(data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to fetch friends");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch pending requests
  const getPendingRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await friendService.getPendingRequests();
      setPendingRequests(data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to fetch pending requests");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch sent requests
  const getSentRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await friendService.getSentRequests();
      setSentRequests(data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to fetch sent requests");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch blocked users
  const getBlockedUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await friendService.getBlockedUsers();
      setBlockedUsers(data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to fetch blocked users");
    } finally {
      setLoading(false);
    }
  }, []);

  // Search users
  const searchUsers = async (query: string) => {
    if (!query.trim()) return [];
    try {
      const data = await friendService.searchUsers(query);
      return data;
    } catch (err) {
      console.error("Error searching users:", err);
      return [];
    }
  };

  // Send friend request
  const sendFriendRequest = useCallback(async (username: string) => {
    setError(null);
    try {
      const request = await friendService.sendFriendRequest(username);
      // Use functional setState to avoid stale closure
      setSentRequests(prev => {
        if (prev.some(r => r.id === request.id)) return prev;
        return [...prev, request];
      });
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to send friend request");
      throw err;
    }
  }, []);

  // Accept friend request
  const acceptFriendRequest = useCallback(async (requestId: number) => {
    setError(null);
    try {
      await friendService.acceptFriendRequest(requestId);
      // Remove from pending
      setPendingRequests(pendingRequests.filter(r => r.id !== requestId));
      // Refresh friends list
      await getFriends();
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to accept friend request");
      throw err;
    }
  }, [pendingRequests, getFriends]);

  // Reject friend request
  const rejectFriendRequest = useCallback(async (requestId: number) => {
    setError(null);
    try {
      await friendService.rejectFriendRequest(requestId);
      setPendingRequests(pendingRequests.filter(r => r.id !== requestId));
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to reject friend request");
      throw err;
    }
  }, [pendingRequests]);

  // Cancel sent friend request
  const cancelFriendRequest = useCallback(async (requestId: number) => {
    setError(null);
    try {
      await friendService.cancelFriendRequest(requestId);
      setSentRequests(sentRequests.filter(r => r.id !== requestId));
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to cancel friend request");
      throw err;
    }
  }, [sentRequests]);

  // Remove friend
  const removeFriend = useCallback(async (friendId: number) => {
    setError(null);
    try {
      await friendService.removeFriend(friendId);
      setFriends(friends.filter(f => f.id !== friendId));
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to remove friend");
      throw err;
    }
  }, [friends]);

  // Block user
  const blockUser = useCallback(async (userId: number) => {
    setError(null);
    try {
      await friendService.blockUser(userId);
      // Remove from friends if they are a friend
      setFriends(friends.filter(f => f.id !== userId));
      await getBlockedUsers();
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to block user");
      throw err;
    }
  }, [friends, getBlockedUsers]);

  // Unblock user
  const unblockUser = useCallback(async (userId: number) => {
    setError(null);
    try {
      await friendService.unblockUser(userId);
      setBlockedUsers(blockedUsers.filter(b => b.blocked_user_id !== userId));
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to unblock user");
      throw err;
    }
  }, [blockedUsers]);

  // Local state updates
  const addFriend = useCallback((friend: Friend) => {
    setFriends(prev => {
      if (prev.some(f => f.id === friend.id)) return prev;
      return [...prev, friend];
    });
  }, []);

  const removeFriendLocal = useCallback((friendId: number) => {
    setFriends(prev => prev.filter(f => f.id !== friendId));
  }, []);

  const updateFriendStatus = useCallback((friendId: number, status: string) => {
    setFriends(prev =>
      prev.map(f =>
        f.id === friendId ? { ...f, status: status as any } : f
      )
    );
  }, []);

  const addPendingRequest = useCallback((request: FriendRequest) => {
    console.log('[FriendsContext] addPendingRequest called with:', request);
    setPendingRequests(prev => {
      if (prev.some(r => r.id === request.id)) {
        console.log('[FriendsContext] ⚠️ Request already exists, skipping:', request.id);
        return prev;
      }
      console.log('[FriendsContext] ✅ Adding new request to state:', request.id);
      return [...prev, request];
    });
  }, []);

  const removePendingRequest = useCallback((requestId: number) => {
    setPendingRequests(prev => prev.filter(r => r.id !== requestId));
  }, []);

  // Load initial data when authenticated
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !isAuthenticated) {
      console.warn('[FriendsContext] No token or not authenticated, skipping data load');
      return;
    }
    
    const loadInitialData = async () => {
      try {
        console.log('[FriendsContext] Loading initial data...');
        await Promise.all([
          getFriends(),
          getPendingRequests(),
          getSentRequests()
        ]);
        console.log('[FriendsContext] Initial data loaded successfully');
      } catch (error) {
        console.error('[FriendsContext] Error loading initial data:', error);
      }
    };
    
    loadInitialData();
  }, [isAuthenticated, getFriends, getPendingRequests, getSentRequests]);

  // Setup socket listeners - register handlers immediately
  // (handlers are just array pushes that work regardless of connection state)
  useEffect(() => {
    // Friend request received (receiver side)
    const unsubscribeFriendRequest = socketService.onFriendRequest((request) => {
      console.log('[FriendsContext] Friend request received:', request.id);
      
      setPendingRequests(prev => {
        const isDuplicate = prev.some(r => r.id === request.id);
        if (isDuplicate) return prev;
        
        const friendRequest: FriendRequest = {
          id: request.id,
          sender_id: request.sender_id,
          receiver_id: request.receiver_id,
          status: request.status,
          created_at: request.created_at,
          username: request.sender?.username || '',
          display_name: request.sender?.display_name || '',
          avatar_url: request.sender?.avatar_url,
          sender: request.sender,
        };
        
        // Show notification
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('friendRequestReceived', {
            detail: friendRequest
          }));
        }
        
        return [...prev, friendRequest];
      });
    });

    // Friend status changed (online/offline/accepted/rejected/removed/blocked)
    const unsubscribeFriendStatus = socketService.onFriendStatus((data) => {
      console.log('[FriendsContext] Friend status changed:', data);
      if (data.status === "online" || data.status === "offline" || data.status === "idle" || data.status === "dnd") {
        setFriends(prev => prev.map(f => 
          f.id === data.friend_id ? { ...f, status: data.status as any } : f
        ));
      } else if (data.status === "removed") {
        setFriends(prev => prev.filter(f => f.id !== data.friend_id));
      } else if (data.status === "blocked") {
        setFriends(prev => prev.filter(f => f.id !== data.friend_id));
        getBlockedUsers();
      } else if (data.status === "unblocked") {
        getBlockedUsers();
      } else if (data.status === "accepted") {
        console.log('[FriendsContext] Friend request accepted, reloading friends & sentRequests');
        getFriends();
        getSentRequests();
        setPendingRequests(prev => prev.filter(r => r.sender_id !== data.friend_id));
      } else if (data.status === "rejected") {
        console.log('[FriendsContext] Friend request rejected, refreshing sentRequests');
        getSentRequests();
      }
    });

    // Join friend status room when socket is ready
    if (socketService.isConnected()) {
      socketService.joinFriendStatusRoom();
    }
    // The reconnect handler in socketService already emits join_friend_status on every connect
    
    return () => {
      unsubscribeFriendRequest();
      unsubscribeFriendStatus();
      socketService.leaveFriendStatusRoom();
    };
  }, [getFriends, getSentRequests, getBlockedUsers]);

  const value: FriendsContextType = {
    friends,
    pendingRequests,
    sentRequests,
    blockedUsers,
    loading,
    error,
    getFriends,
    getPendingRequests,
    getSentRequests,
    getBlockedUsers,
    searchUsers,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    removeFriend,
    blockUser,
    unblockUser,
    addFriend,
    removeFriendLocal,
    updateFriendStatus,
    addPendingRequest,
    removePendingRequest,
  };

  return (
    <FriendsContext.Provider value={value}>
      {children}
    </FriendsContext.Provider>
  );
}

export function useFriends() {
  const context = useContext(FriendsContext);
  if (!context) {
    throw new Error("useFriends must be used within FriendsProvider");
  }
  return context;
}