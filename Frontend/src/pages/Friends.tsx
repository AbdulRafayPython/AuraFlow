import { useState, useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useFriends } from "@/contexts/FriendsContext";
import type { Friend, FriendRequest } from "@/types";
import { useDirectMessages } from "@/contexts/DirectMessagesContext";
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
  const { isDarkMode } = useTheme();
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
      className={`flex items-center justify-between p-4 rounded-lg border transition-all hover:shadow-md ${
        isDarkMode
          ? "bg-slate-800 border-slate-700 hover:bg-slate-750"
          : "bg-white border-gray-200 hover:bg-gray-50"
      }`}
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
            src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.username}`}
            alt={friend.display_name}
            className="w-12 h-12 rounded-full object-cover"
          />
          <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 ${
            isDarkMode ? "border-slate-800" : "border-white"
          } ${statusColors[friend.status]} shadow-lg`} title={statusLabels[friend.status]} />
        </div>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={`font-semibold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              {friend.display_name}
            </h3>
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${
              friend.status === "online"
                ? isDarkMode
                  ? "bg-green-500/20 text-green-400"
                  : "bg-green-100 text-green-700"
                : friend.status === "idle"
                ? isDarkMode
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-yellow-100 text-yellow-700"
                : friend.status === "dnd"
                ? isDarkMode
                  ? "bg-red-500/20 text-red-400"
                  : "bg-red-100 text-red-700"
                : isDarkMode
                ? "bg-gray-700 text-gray-400"
                : "bg-gray-100 text-gray-600"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${statusColors[friend.status]}`} />
              {statusLabels[friend.status]}
            </span>
          </div>
          <div className={`text-sm flex items-center gap-2 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            <span className="truncate">
              {friend.custom_status || `@${friend.username}`}
            </span>
            {friend.status !== "online" && friend.last_seen && (
              <span className={`text-xs flex-shrink-0 ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>
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
          className={`p-2 rounded-lg transition-colors ${
            isDarkMode ? "hover:bg-slate-700 text-gray-400" : "hover:bg-gray-100 text-gray-600"
          }`}
          title="Send message"
        >
          <MessageCircle className="w-5 h-5" />
        </button>
        <button className={`p-2 rounded-lg transition-colors ${
          isDarkMode ? "hover:bg-slate-700 text-gray-400" : "hover:bg-gray-100 text-gray-600"
        }`}>
          <Phone className="w-5 h-5" />
        </button>
        <button className={`p-2 rounded-lg transition-colors ${
          isDarkMode ? "hover:bg-slate-700 text-gray-400" : "hover:bg-gray-100 text-gray-600"
        }`}>
          <Video className="w-5 h-5" />
        </button>
        
        {/* More Menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(showMenu === friend.id ? null : friend.id)}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? "hover:bg-slate-700 text-gray-400" : "hover:bg-gray-100 text-gray-600"
            }`}
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {showMenu === friend.id && (
            <div className={`absolute right-0 top-full mt-1 w-48 rounded-lg shadow-xl border z-50 ${
              isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
            }`}>
              <button
                onClick={() => {
                  removeFriend(friend.id);
                  setShowMenu(null);
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-red-500/10 text-red-500 flex items-center gap-2`}
              >
                <UserMinus className="w-4 h-4" />
                Remove Friend
              </button>
              <button
                onClick={() => {
                  blockUser(friend.id);
                  setShowMenu(null);
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-red-500/10 text-red-500 flex items-center gap-2`}
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
      className={`flex items-center justify-between p-4 rounded-lg border ${
        isDarkMode
          ? "bg-slate-800 border-slate-700"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-center gap-4 flex-1">
        <img
          src={request.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${request.username}`}
          alt={request.display_name || request.username}
          className="w-12 h-12 rounded-full object-cover"
        />
        <div>
          <h3 className={`font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {request.display_name || request.username}
          </h3>
          <p className={`text-sm flex items-center gap-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            <Clock className="w-3 h-3" />
            Incoming Friend Request
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => acceptFriendRequest(request.id)}
          className="p-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
          title="Accept request"
        >
          <Check className="w-5 h-5" />
        </button>
        <button
          onClick={() => rejectFriendRequest(request.id)}
          className={`p-2 rounded-lg transition-colors ${
            isDarkMode ? "hover:bg-slate-700 text-gray-400" : "hover:bg-gray-100 text-gray-600"
          }`}
          title="Reject request"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  const SentRequestCard = ({ request }: { request: FriendRequest }) => (
    <div
      className={`flex items-center justify-between p-4 rounded-lg border ${
        isDarkMode
          ? "bg-slate-800 border-slate-700"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-center gap-4 flex-1">
        <img
          src={request.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${request.username}`}
          alt={request.display_name || request.username}
          className="w-12 h-12 rounded-full object-cover"
        />
        <div>
          <h3 className={`font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {request.display_name || request.username}
          </h3>
          <p className={`text-sm flex items-center gap-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            <Send className="w-3 h-3" />
            Outgoing Friend Request
          </p>
        </div>
      </div>

      <button
        onClick={() => cancelFriendRequest(request.id)}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          isDarkMode
            ? "bg-slate-700 hover:bg-slate-600 text-white"
            : "bg-gray-200 hover:bg-gray-300 text-gray-900"
        }`}
      >
        Cancel
      </button>
    </div>
  );

  return (
    <div className={`flex flex-col h-full ${isDarkMode ? "bg-slate-700" : "bg-gray-50"}`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${isDarkMode ? "bg-slate-800 border-slate-900" : "bg-white border-gray-200"}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className={`w-6 h-6 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`} />
            <h1 className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              Friends
            </h1>
          </div>
          {activeTab !== "add" && (
            <div className="relative">
              <Search className={`absolute left-3 top-2.5 w-4 h-4 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`} />
              <input
                type="text"
                placeholder="Search friends..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`pl-10 pr-4 py-2 rounded-lg text-sm w-64 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isDarkMode
                    ? "bg-slate-700 border-slate-600 text-white placeholder-gray-500"
                    : "bg-gray-100 border-gray-300 text-gray-900 placeholder-gray-500"
                }`}
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
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? isDarkMode
                      ? "bg-slate-700 text-white"
                      : "bg-gray-200 text-gray-900"
                    : isDarkMode
                    ? "text-gray-400 hover:bg-slate-700 hover:text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    activeTab === tab.id
                      ? "bg-blue-600 text-white"
                      : isDarkMode
                      ? "bg-slate-600 text-gray-300"
                      : "bg-gray-300 text-gray-700"
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
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "requests" ? (
          <div className="max-w-4xl mx-auto">
            {/* Request Tabs */}
            <div className="flex gap-4 mb-6 border-b border-slate-700">
              <button
                onClick={() => setRequestsTab("incoming")}
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-all ${
                  requestsTab === "incoming"
                    ? isDarkMode
                      ? "border-blue-500 text-blue-400"
                      : "border-blue-600 text-blue-600"
                    : isDarkMode
                    ? "border-transparent text-gray-400 hover:text-gray-300"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                Incoming
                {pendingRequests && pendingRequests.length > 0 && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                    isDarkMode ? "bg-slate-700 text-gray-300" : "bg-gray-200 text-gray-700"
                  }`}>
                    {pendingRequests.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setRequestsTab("outgoing")}
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-all ${
                  requestsTab === "outgoing"
                    ? isDarkMode
                      ? "border-blue-500 text-blue-400"
                      : "border-blue-600 text-blue-600"
                    : isDarkMode
                    ? "border-transparent text-gray-400 hover:text-gray-300"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                Outgoing
                {sentRequests && sentRequests.length > 0 && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                    isDarkMode ? "bg-slate-700 text-gray-300" : "bg-gray-200 text-gray-700"
                  }`}>
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
                    <Inbox className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`} />
                    <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                      No incoming requests
                    </h3>
                    <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
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
                    <Send className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`} />
                    <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                      No outgoing requests
                    </h3>
                    <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
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
                <Users className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`} />
                <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  {searchQuery ? "No friends found" : "No friends yet"}
                </h3>
                <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
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