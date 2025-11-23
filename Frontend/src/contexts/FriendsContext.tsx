import React, { createContext, useContext, useState, useEffect } from "react";

export type FriendStatus = "online" | "idle" | "dnd" | "offline";
export type FriendRequestStatus = "pending" | "accepted" | "blocked";

export interface Friend {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  status: FriendStatus;
  customStatus?: string;
  since: string;
}

export interface FriendRequest {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  type: "incoming" | "outgoing";
  timestamp: string;
}

export interface BlockedUser {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  blockedAt: string;
}

interface FriendsContextType {
  friends: Friend[];
  friendRequests: FriendRequest[];
  blockedUsers: BlockedUser[];
  addFriend: (username: string) => Promise<void>;
  acceptFriendRequest: (id: string) => void;
  declineFriendRequest: (id: string) => void;
  removeFriend: (id: string) => void;
  blockUser: (id: string) => void;
  unblockUser: (id: string) => void;
  cancelFriendRequest: (id: string) => void;
}

const FriendsContext = createContext<FriendsContextType | undefined>(undefined);

// Mock data for demo
const mockFriends: Friend[] = [
  {
    id: "1",
    username: "techguru",
    displayName: "Tech Guru",
    status: "online",
    customStatus: "Building the future 🚀",
    since: "2024-01-15",
  },
  {
    id: "2",
    username: "designpro",
    displayName: "Design Pro",
    status: "idle",
    customStatus: "Coffee break ☕",
    since: "2024-02-20",
  },
  {
    id: "3",
    username: "codemaster",
    displayName: "Code Master",
    status: "dnd",
    customStatus: "Focus mode - Do not disturb",
    since: "2024-03-10",
  },
  {
    id: "4",
    username: "aienthusiast",
    displayName: "AI Enthusiast",
    status: "offline",
    since: "2024-01-05",
  },
  {
    id: "5",
    username: "datawhiz",
    displayName: "Data Whiz",
    status: "online",
    customStatus: "Analyzing data 📊",
    since: "2024-02-28",
  },
];

const mockRequests: FriendRequest[] = [
  {
    id: "r1",
    username: "newuser123",
    displayName: "New User",
    type: "incoming",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "r2",
    username: "awaiting_accept",
    displayName: "Pending User",
    type: "outgoing",
    timestamp: new Date(Date.now() - 7200000).toISOString(),
  },
];

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const [friends, setFriends] = useState<Friend[]>(() => {
    const saved = localStorage.getItem("auraflow_friends");
    return saved ? JSON.parse(saved) : mockFriends;
  });

  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>(() => {
    const saved = localStorage.getItem("auraflow_friend_requests");
    return saved ? JSON.parse(saved) : mockRequests;
  });

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>(() => {
    const saved = localStorage.getItem("auraflow_blocked_users");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem("auraflow_friends", JSON.stringify(friends));
  }, [friends]);

  useEffect(() => {
    localStorage.setItem("auraflow_friend_requests", JSON.stringify(friendRequests));
  }, [friendRequests]);

  useEffect(() => {
    localStorage.setItem("auraflow_blocked_users", JSON.stringify(blockedUsers));
  }, [blockedUsers]);

  const addFriend = async (username: string) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));

    const newRequest: FriendRequest = {
      id: `r${Date.now()}`,
      username: username.toLowerCase(),
      displayName: username,
      type: "outgoing",
      timestamp: new Date().toISOString(),
    };

    setFriendRequests([...friendRequests, newRequest]);
  };

  const acceptFriendRequest = (id: string) => {
    const request = friendRequests.find(r => r.id === id && r.type === "incoming");
    if (request) {
      const newFriend: Friend = {
        id: request.id,
        username: request.username,
        displayName: request.displayName,
        avatar: request.avatar,
        status: "online",
        since: new Date().toISOString(),
      };

      setFriends([...friends, newFriend]);
      setFriendRequests(friendRequests.filter(r => r.id !== id));
    }
  };

  const declineFriendRequest = (id: string) => {
    setFriendRequests(friendRequests.filter(r => r.id !== id));
  };

  const cancelFriendRequest = (id: string) => {
    setFriendRequests(friendRequests.filter(r => r.id !== id));
  };

  const removeFriend = (id: string) => {
    setFriends(friends.filter(f => f.id !== id));
  };

  const blockUser = (id: string) => {
    const friend = friends.find(f => f.id === id);
    if (friend) {
      const blockedUser: BlockedUser = {
        id: friend.id,
        username: friend.username,
        displayName: friend.displayName,
        avatar: friend.avatar,
        blockedAt: new Date().toISOString(),
      };

      setBlockedUsers([...blockedUsers, blockedUser]);
      setFriends(friends.filter(f => f.id !== id));
    }
  };

  const unblockUser = (id: string) => {
    setBlockedUsers(blockedUsers.filter(u => u.id !== id));
  };

  return (
    <FriendsContext.Provider value={{
      friends,
      friendRequests,
      blockedUsers,
      addFriend,
      acceptFriendRequest,
      declineFriendRequest,
      removeFriend,
      blockUser,
      unblockUser,
      cancelFriendRequest,
    }}>
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