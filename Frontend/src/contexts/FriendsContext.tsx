import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Friend, FriendRequest, BlockedUser } from "@/types";
import { friendService } from "@/services/friendService";
import { socketService } from "@/services/socketService";

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
      setSentRequests([...sentRequests, request]);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to send friend request");
      throw err;
    }
  }, [sentRequests]);

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
    setPendingRequests(prev => {
      if (prev.some(r => r.id === request.id)) return prev;
      return [...prev, request];
    });
  }, []);

  const removePendingRequest = useCallback((requestId: number) => {
    setPendingRequests(prev => prev.filter(r => r.id !== requestId));
  }, []);

  // Setup socket listeners
  useEffect(() => {
    // Friend request received
    const unsubscribeFriendRequest = socketService.onFriendRequest((request) => {
      addPendingRequest(request);
    });

    // Friend status changed
    const unsubscribeFriendStatus = socketService.onFriendStatus((data) => {
      if (data.status !== "removed" && data.status !== "blocked" && data.status !== "unblocked") {
        updateFriendStatus(data.friend_id, data.status);
      } else if (data.status === "removed") {
        removeFriendLocal(data.friend_id);
      }
    });

    // Join friend status room for live updates
    socketService.joinFriendStatusRoom();

    return () => {
      unsubscribeFriendRequest();
      unsubscribeFriendStatus();
      socketService.leaveFriendStatusRoom();
    };
  }, [addPendingRequest, updateFriendStatus, removeFriendLocal]);

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