import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useFriends, Friend, FriendRequest } from "@/contexts/FriendsContext";
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
} from "lucide-react";

type Tab = "all" | "online" | "pending" | "blocked" | "add";

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

export default function Friends() {
  const { isDarkMode } = useTheme();
  const { friends, friendRequests, blockedUsers, addFriend, acceptFriendRequest, declineFriendRequest, removeFriend, blockUser, unblockUser, cancelFriendRequest } = useFriends();
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [addFriendInput, setAddFriendInput] = useState("");
  const [showMenu, setShowMenu] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const tabs = [
    { id: "all" as Tab, label: "All Friends", icon: Users, count: friends.length },
    { id: "online" as Tab, label: "Online", icon: Users, count: friends.filter(f => f.status === "online").length },
    { id: "pending" as Tab, label: "Pending", icon: Inbox, count: friendRequests.length },
    { id: "blocked" as Tab, label: "Blocked", icon: Ban, count: blockedUsers.length },
    { id: "add" as Tab, label: "Add Friend", icon: UserPlus, count: 0 },
  ];

  const filteredFriends = friends.filter(friend => {
    const matchesSearch = friend.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         friend.username.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "all" || (activeTab === "online" && friend.status === "online");
    return matchesSearch && matchesTab;
  });

  const handleAddFriend = async () => {
    if (!addFriendInput.trim()) return;
    
    setIsAdding(true);
    try {
      await addFriend(addFriendInput);
      setAddFriendInput("");
    } catch (error) {
      console.error("Failed to add friend:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const FriendCard = ({ friend }: { friend: Friend }) => (
    <div
      className={`flex items-center justify-between p-4 rounded-lg border transition-all hover:shadow-md ${
        isDarkMode
          ? "bg-slate-800 border-slate-700 hover:bg-slate-750"
          : "bg-white border-gray-200 hover:bg-gray-50"
      }`}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {/* Avatar with Status */}
        <div className="relative flex-shrink-0">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold text-lg ${
            isDarkMode ? "bg-slate-700 text-slate-300" : "bg-gray-200 text-gray-700"
          }`}>
            {friend.displayName.charAt(0).toUpperCase()}
          </div>
          <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 ${
            isDarkMode ? "border-slate-800" : "border-white"
          } ${statusColors[friend.status]}`} />
        </div>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              {friend.displayName}
            </h3>
            <span className={`text-xs px-2 py-0.5 rounded ${
              isDarkMode ? "bg-slate-700 text-slate-400" : "bg-gray-100 text-gray-600"
            }`}>
              {statusLabels[friend.status]}
            </span>
          </div>
          <p className={`text-sm truncate ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            {friend.customStatus || `@${friend.username}`}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button className={`p-2 rounded-lg transition-colors ${
          isDarkMode ? "hover:bg-slate-700 text-gray-400" : "hover:bg-gray-100 text-gray-600"
        }`}>
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

  const PendingRequestCard = ({ request }: { request: FriendRequest }) => (
    <div
      className={`flex items-center justify-between p-4 rounded-lg border ${
        isDarkMode
          ? "bg-slate-800 border-slate-700"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-center gap-4 flex-1">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold text-lg ${
          isDarkMode ? "bg-slate-700 text-slate-300" : "bg-gray-200 text-gray-700"
        }`}>
          {request.displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <h3 className={`font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {request.displayName}
          </h3>
          <p className={`text-sm flex items-center gap-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            {request.type === "incoming" ? (
              <>
                <Clock className="w-3 h-3" />
                Incoming Friend Request
              </>
            ) : (
              <>
                <Clock className="w-3 h-3" />
                Outgoing Friend Request
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {request.type === "incoming" ? (
          <>
            <button
              onClick={() => acceptFriendRequest(request.id)}
              className="p-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
            >
              <Check className="w-5 h-5" />
            </button>
            <button
              onClick={() => declineFriendRequest(request.id)}
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode ? "hover:bg-slate-700 text-gray-400" : "hover:bg-gray-100 text-gray-600"
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </>
        ) : (
          <button
            onClick={() => cancelFriendRequest(request.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isDarkMode
                ? "bg-slate-700 hover:bg-slate-600 text-white"
                : "bg-gray-200 hover:bg-gray-300 text-gray-900"
            }`}
          >
            Cancel Request
          </button>
        )}
      </div>
    </div>
  );

  const BlockedUserCard = ({ user }: { user: typeof blockedUsers[0] }) => (
    <div
      className={`flex items-center justify-between p-4 rounded-lg border ${
        isDarkMode
          ? "bg-slate-800 border-slate-700"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold text-lg relative ${
          isDarkMode ? "bg-slate-700 text-slate-300" : "bg-gray-200 text-gray-700"
        }`}>
          {user.displayName.charAt(0).toUpperCase()}
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
            <Ban className="w-6 h-6 text-red-500" />
          </div>
        </div>
        <div>
          <h3 className={`font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {user.displayName}
          </h3>
          <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            @{user.username}
          </p>
        </div>
      </div>

      <button
        onClick={() => unblockUser(user.id)}
        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
      >
        Unblock
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
                onClick={() => setActiveTab(tab.id)}
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
        {activeTab === "add" ? (
          <div className="max-w-2xl mx-auto">
            <div className={`p-8 rounded-xl border ${
              isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
            }`}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                  <UserPlus className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                    Add Friend
                  </h2>
                  <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                    You can add friends with their username
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                    Username
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={addFriendInput}
                      onChange={(e) => setAddFriendInput(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleAddFriend()}
                      placeholder="Enter username..."
                      className={`flex-1 px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDarkMode
                          ? "bg-slate-700 border-slate-600 text-white placeholder-gray-500"
                          : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"
                      }`}
                    />
                    <button
                      onClick={handleAddFriend}
                      disabled={isAdding || !addFriendInput.trim()}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAdding ? "Sending..." : "Send Request"}
                    </button>
                  </div>
                </div>

                <div className={`p-4 rounded-lg ${isDarkMode ? "bg-blue-900/20" : "bg-blue-50"}`}>
                  <p className={`text-sm ${isDarkMode ? "text-blue-400" : "text-blue-600"}`}>
                    💡 <strong>Tip:</strong> Username must match exactly. Friend requests are sent instantly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === "pending" ? (
          <div className="max-w-4xl mx-auto space-y-3">
            {friendRequests.length === 0 ? (
              <div className="text-center py-16">
                <Inbox className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`} />
                <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  No pending requests
                </h3>
                <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                  You don't have any pending friend requests.
                </p>
              </div>
            ) : (
              friendRequests.map((request) => (
                <PendingRequestCard key={request.id} request={request} />
              ))
            )}
          </div>
        ) : activeTab === "blocked" ? (
          <div className="max-w-4xl mx-auto space-y-3">
            {blockedUsers.length === 0 ? (
              <div className="text-center py-16">
                <Shield className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`} />
                <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  No blocked users
                </h3>
                <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                  You haven't blocked anyone yet.
                </p>
              </div>
            ) : (
              blockedUsers.map((user) => (
                <BlockedUserCard key={user.id} user={user} />
              ))
            )}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-3">
            {filteredFriends.length === 0 ? (
              <div className="text-center py-16">
                <Users className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`} />
                <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  {searchQuery ? "No friends found" : activeTab === "online" ? "No friends online" : "No friends yet"}
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
    </div>
  );
}