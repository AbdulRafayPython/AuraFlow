import { useState, useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useFriends } from "@/contexts/FriendsContext";
import type { Friend, FriendRequest } from "@/types";
import { useDirectMessages } from "@/contexts/DirectMessagesContext";
import { getAvatarUrl } from "@/lib/utils";
import AddFriendModal from "@/components/modals/AddFriendModal";
import FriendProfileModal from "@/components/modals/FriendProfileModal";
import {
  Users,
  UserPlus,
  Inbox,
  Ban,
  Search,
  MoreVertical,
  MessageCircle,
  Phone,
  Video,
  UserMinus,
  Check,
  X,
  Clock,
  Shield,
  Send,
} from "lucide-react";

type Tab = "all" | "requests" | "add";

interface FriendsProps {
  onOpenDM?: (friendId: number) => void;
}

const statusColors = {
  online: "bg-green-500",
  idle: "bg-yellow-500",
  dnd: "bg-red-500",
  offline: "bg-gray-500",
};

const statusLabels = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  offline: "Offline",
};

export default function Friends({ onOpenDM }: FriendsProps) {
  const { isDarkMode, currentTheme } = useTheme();
  const isBasicTheme = currentTheme === 'basic';
  const { friends, pendingRequests = [], sentRequests = [], blockedUsers, addFriend, acceptFriendRequest, rejectFriendRequest, removeFriend, blockUser, unblockUser, cancelFriendRequest, sendFriendRequest } = useFriends();
  const { selectConversation } = useDirectMessages();
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [addFriendInput, setAddFriendInput] = useState("");
  const [showMenu, setShowMenu] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [requestsTab, setRequestsTab] = useState<"incoming" | "outgoing">("incoming");
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // Handle opening direct message with friend
  const handleMessageFriend = async (friendId: number) => {
    try {
      if (onOpenDM) {
        // Use the callback from MainLayout which handles navigation
        onOpenDM(friendId);
      } else {
        // Fallback if no callback provided
        await selectConversation(friendId);
      }
    } catch (error) {
      console.error("Failed to open conversation:", error);
    }
  };
  
  // Load pending and sent requests on mount
  useEffect(() => {
    // Initialize friend data from context
    const initializeFriends = async () => {
      try {
        // Ensure friends are loaded
        if (friends.length === 0) {
          // This is handled by FriendsContext on mount, so we don't need to call it here
          // But you can uncomment if needed for manual refresh
        }
      } catch (error) {
        console.error("Failed to load friends:", error);
      }
    };
    
    initializeFriends();
  }, []);

  const tabs = [
    { id: "all" as Tab, label: "All Friends", icon: Users, count: friends.length },
    { id: "requests" as Tab, label: "Requests", icon: Inbox, count: pendingRequests.length + sentRequests.length },
    { id: "add" as Tab, label: "Add Friend", icon: UserPlus, count: 0 },
  ];

  const filteredFriends = friends.filter(friend => {
    const matchesSearch = friend.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         friend.username.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const handleAddFriend = async () => {
    if (!addFriendInput.trim()) return;
    
    setIsAdding(true);
    try {
      await sendFriendRequest(addFriendInput);
      setAddFriendInput("");
    } catch (error) {
      console.error("Failed to add friend:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const FriendCard = ({ friend }: { friend: Friend }) => {
    const getLastSeenText = (lastSeen?: string) => {
      if (!lastSeen) return "No data";
      const date = new Date(lastSeen);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    };

    return (
    <div
      className={`flex items-center justify-between p-4 rounded-lg border transition-all hover:shadow-[var(--theme-glow-secondary)] backdrop-blur-sm bg-[hsl(var(--theme-bg-secondary)/0.6)] border-[hsl(var(--theme-border-default)/0.5)] hover:bg-[hsl(var(--theme-bg-tertiary)/0.7)] ${showMenu === friend.id ? 'relative z-50' : ''}`}
    >
      {/* Friend Info - Clickable to open profile */}
      <div 
        onClick={() => {
          setSelectedFriend(friend);
          setShowProfileModal(true);
        }}
        className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer"
      >
        {/* Avatar with Status */}
        <div className="relative flex-shrink-0">
          <img
            src={getAvatarUrl(friend.avatar_url, friend.username)}
            alt={friend.display_name}
            className="w-12 h-12 rounded-full object-cover ring-2 ring-[hsl(var(--theme-border-default)/0.3)]"
          />
          <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-[hsl(var(--theme-bg-secondary)/0.8)] ${statusColors[friend.status]} shadow-lg`} title={statusLabels[friend.status]} />
        </div>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold truncate text-[hsl(var(--theme-text-primary))]">
              {friend.display_name}
            </h3>
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${
              friend.status === "online"
                ? "bg-green-500/20 text-green-400"
                : friend.status === "idle"
                ? "bg-yellow-500/20 text-yellow-400"
                : friend.status === "dnd"
                ? "bg-red-500/20 text-red-400"
                : "bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))]"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${statusColors[friend.status]}`} />
              {statusLabels[friend.status]}
            </span>
          </div>
          <div className="text-sm flex items-center gap-2 text-[hsl(var(--theme-text-muted))]">
            <span className="truncate">
              {friend.custom_status || `@${friend.username}`}
            </span>
            {friend.status !== "online" && friend.last_seen && (
              <span className="text-xs flex-shrink-0 text-[hsl(var(--theme-text-muted))]">
                • {getLastSeenText(friend.last_seen)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            handleMessageFriend(friend.id);
          }}
          className="p-2 rounded-lg transition-colors hover:bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-accent-primary))]"
          title="Send message"
        >
          <MessageCircle className="w-5 h-5" />
        </button>
        <div className="relative group/call">
          <button 
            className="p-2 rounded-lg transition-colors bg-[hsl(var(--theme-bg-tertiary)/0.5)] text-[hsl(var(--theme-text-muted))] cursor-not-allowed opacity-60"
            disabled
            title="Coming in FYP 2"
          >
            <Phone className="w-5 h-5" />
          </button>
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-[hsl(var(--theme-bg-elevated))] text-[10px] text-[hsl(var(--theme-text-muted))] rounded whitespace-nowrap opacity-0 group-hover/call:opacity-100 transition-opacity border border-[hsl(var(--theme-border-default)/0.5)]">
            FYP 2
          </div>
        </div>
        <div className="relative group/video">
          <button 
            className="p-2 rounded-lg transition-colors bg-[hsl(var(--theme-bg-tertiary)/0.5)] text-[hsl(var(--theme-text-muted))] cursor-not-allowed opacity-60"
            disabled
            title="Coming in FYP 2"
          >
            <Video className="w-5 h-5" />
          </button>
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-[hsl(var(--theme-bg-elevated))] text-[10px] text-[hsl(var(--theme-text-muted))] rounded whitespace-nowrap opacity-0 group-hover/video:opacity-100 transition-opacity border border-[hsl(var(--theme-border-default)/0.5)]">
            FYP 2
          </div>
        </div>
        
        {/* More Menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(showMenu === friend.id ? null : friend.id)}
            className="p-2 rounded-lg transition-colors hover:bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))]"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {showMenu === friend.id && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-lg shadow-xl border z-50 backdrop-blur-xl bg-[hsl(var(--theme-bg-secondary)/0.95)] border-[hsl(var(--theme-border-default)/0.5)]">
              <button
                onClick={() => {
                  removeFriend(friend.id);
                  setShowMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-red-500/10 text-red-500 flex items-center gap-2"
              >
                <UserMinus className="w-4 h-4" />
                Remove Friend
              </button>
              <button
                onClick={() => {
                  blockUser(friend.id);
                  setShowMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-red-500/10 text-red-500 flex items-center gap-2"
              >
                <Ban className="w-4 h-4" />
                Block User
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    );
  };

  const PendingRequestCard = ({ request }: { request: FriendRequest }) => (
    <div
      className="flex items-center justify-between p-4 rounded-lg border backdrop-blur-sm bg-[hsl(var(--theme-bg-secondary)/0.6)] border-[hsl(var(--theme-border-default)/0.5)] transition-all hover:shadow-[var(--theme-glow-secondary)]"
    >
      <div className="flex items-center gap-4 flex-1">
        <img
          src={getAvatarUrl(request.avatar_url, request.username)}
          alt={request.display_name || request.username}
          className="w-12 h-12 rounded-full object-cover ring-2 ring-[hsl(var(--theme-border-default)/0.3)]"
        />
        <div>
          <h3 className="font-semibold text-[hsl(var(--theme-text-primary))]">
            {request.display_name || request.username}
          </h3>
          <p className="text-sm flex items-center gap-1 text-[hsl(var(--theme-text-muted))]">
            <Clock className="w-3 h-3" />
            Incoming Friend Request
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => acceptFriendRequest(request.id)}
          className={`p-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors ${isBasicTheme ? '' : 'hover:shadow-[0_0_15px_rgba(34,197,94,0.4)]'}`}
          title="Accept request"
        >
          <Check className="w-5 h-5" />
        </button>
        <button
          onClick={() => rejectFriendRequest(request.id)}
          className="p-2 rounded-lg transition-colors hover:bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))]"
          title="Reject request"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  const SentRequestCard = ({ request }: { request: FriendRequest }) => (
    <div
      className="flex items-center justify-between p-4 rounded-lg border backdrop-blur-sm bg-[hsl(var(--theme-bg-secondary)/0.6)] border-[hsl(var(--theme-border-default)/0.5)] transition-all hover:shadow-[var(--theme-glow-secondary)]"
    >
      <div className="flex items-center gap-4 flex-1">
        <img
          src={getAvatarUrl(request.avatar_url, request.username)}
          alt={request.display_name || request.username}
          className="w-12 h-12 rounded-full object-cover ring-2 ring-[hsl(var(--theme-border-default)/0.3)]"
        />
        <div>
          <h3 className="font-semibold text-[hsl(var(--theme-text-primary))]">
            {request.display_name || request.username}
          </h3>
          <p className="text-sm flex items-center gap-1 text-[hsl(var(--theme-text-muted))]">
            <Send className="w-3 h-3" />
            Outgoing Friend Request
          </p>
        </div>
      </div>

      <button
        onClick={() => cancelFriendRequest(request.id)}
        className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-[hsl(var(--theme-bg-tertiary)/0.8)] hover:bg-[hsl(var(--theme-accent-primary)/0.2)] text-[hsl(var(--theme-text-primary)]]"
      >
        Cancel
      </button>
    </div>
  );

  return (
    <div 
      className="flex flex-col h-full relative transition-colors duration-300"
      style={{ background: 'var(--theme-bg-gradient)' }}
    >
      {/* Gradient overlay for depth */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 20%, hsl(var(--theme-accent-primary) / 0.03) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, hsl(var(--theme-accent-secondary) / 0.03) 0%, transparent 50%)',
        }}
      />
      
      {/* Header */}
      <div 
        className="px-6 py-4 border-b backdrop-blur-md border-[hsl(var(--theme-border-default)/0.5)] relative z-10"
        style={{ background: 'hsl(var(--theme-bg-secondary) / 0.7)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-[hsl(var(--theme-accent-primary))]" />
            <h1 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))]">
              Friends
            </h1>
          </div>
          {activeTab !== "add" && (
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-[hsl(var(--theme-text-muted))]" />
              <input
                type="text"
                placeholder="Search friends..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 rounded-lg text-sm w-64 border focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] backdrop-blur-sm bg-[hsl(var(--theme-input-bg)/0.8)] border-[hsl(var(--theme-border-default)/0.5)] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))]"
              />
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === "add") {
                    setShowAddFriendModal(true);
                  } else {
                    setActiveTab(tab.id);
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] text-white shadow-[var(--theme-glow-primary)]"
                    : "text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-tertiary)/0.6)] hover:text-[hsl(var(--theme-text-primary))]"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    activeTab === tab.id
                      ? "bg-white/20 text-white"
                      : "bg-[hsl(var(--theme-bg-tertiary)/0.8)] text-[hsl(var(--theme-text-muted))]"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 relative z-[5]">
        {activeTab === "requests" ? (
          <div className="max-w-4xl mx-auto">
            {/* Request Tabs */}
            <div className="flex gap-4 mb-6 border-b border-[hsl(var(--theme-border-default)/0.5)]">
              <button
                onClick={() => setRequestsTab("incoming")}
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-all ${
                  requestsTab === "incoming"
                    ? "border-[hsl(var(--theme-accent-primary))] text-[hsl(var(--theme-accent-primary))]"
                    : "border-transparent text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]"
                }`}
              >
                Incoming
                {pendingRequests && pendingRequests.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-[hsl(var(--theme-bg-tertiary)/0.8)] text-[hsl(var(--theme-text-muted))]">
                    {pendingRequests.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setRequestsTab("outgoing")}
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-all ${
                  requestsTab === "outgoing"
                    ? "border-[hsl(var(--theme-accent-primary))] text-[hsl(var(--theme-accent-primary))]"
                    : "border-transparent text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]"
                }`}
              >
                Outgoing
                {sentRequests && sentRequests.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-[hsl(var(--theme-bg-tertiary)/0.8)] text-[hsl(var(--theme-text-muted))]">
                    {sentRequests.length}
                  </span>
                )}
              </button>
            </div>

            {/* Incoming Requests */}
            {requestsTab === "incoming" && (
              <div className="space-y-3">
                {!pendingRequests || pendingRequests.length === 0 ? (
                  <div className="text-center py-16">
                    <Inbox className="w-16 h-16 mx-auto mb-4 text-[hsl(var(--theme-text-muted))]" />
                    <h3 className="text-lg font-semibold mb-2 text-[hsl(var(--theme-text-primary))]">
                      No incoming requests
                    </h3>
                    <p className="text-sm text-[hsl(var(--theme-text-muted))]">
                      You don't have any incoming friend requests.
                    </p>
                  </div>
                ) : (
                  pendingRequests.map((request) => (
                    <PendingRequestCard key={request.id} request={request} />
                  ))
                )}
              </div>
            )}

            {/* Outgoing Requests */}
            {requestsTab === "outgoing" && (
              <div className="space-y-3">
                {!sentRequests || sentRequests.length === 0 ? (
                  <div className="text-center py-16">
                    <Send className="w-16 h-16 mx-auto mb-4 text-[hsl(var(--theme-text-muted))]" />
                    <h3 className="text-lg font-semibold mb-2 text-[hsl(var(--theme-text-primary))]">
                      No outgoing requests
                    </h3>
                    <p className="text-sm text-[hsl(var(--theme-text-muted))]">
                      You haven't sent any friend requests.
                    </p>
                  </div>
                ) : (
                  sentRequests.map((request) => (
                    <SentRequestCard key={request.id} request={request} />
                  ))
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-3">
            {filteredFriends.length === 0 ? (
              <div className="text-center py-16">
                <Users className="w-16 h-16 mx-auto mb-4 text-[hsl(var(--theme-text-muted))]" />
                <h3 className="text-lg font-semibold mb-2 text-[hsl(var(--theme-text-primary))]">
                  {searchQuery ? "No friends found" : "No friends yet"}
                </h3>
                <p className="text-sm text-[hsl(var(--theme-text-muted))]">
                  {searchQuery
                    ? "Try a different search term"
                    : "Add some friends to get started!"}
                </p>
              </div>
            ) : (
              filteredFriends.map((friend) => (
                <FriendCard key={friend.id} friend={friend} />
              ))
            )}
          </div>
        )}
      </div>

      {/* Add Friend Modal */}
      <AddFriendModal
        isOpen={showAddFriendModal}
        onClose={() => setShowAddFriendModal(false)}
        onSendRequest={sendFriendRequest}
      />

      {/* Friend Profile Modal */}
      <FriendProfileModal
        isOpen={showProfileModal}
        onClose={() => {
          setShowProfileModal(false);
          setSelectedFriend(null);
        }}
        friend={selectedFriend}
        onMessage={handleMessageFriend}
        onRemove={removeFriend}
        onBlock={blockUser}
      />
    </div>
  );
}