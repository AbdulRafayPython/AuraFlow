import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import type { Friend } from "@/types";
import { X, MessageCircle, Phone, Video, Ban, UserMinus } from "lucide-react";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";

interface FriendProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  friend: Friend | null;
  onMessage?: (friendId: number) => void;
  onRemove?: (friendId: number) => void;
  onBlock?: (friendId: number) => void;
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

export default function FriendProfileModal({
  isOpen,
  onClose,
  friend,
  onMessage,
  onRemove,
  onBlock,
}: FriendProfileModalProps) {
  const { isDarkMode } = useTheme();
  const [showMenu, setShowMenu] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  if (!isOpen || !friend) return null;

  const getLastSeenText = (lastSeen?: string) => {
    if (!lastSeen || friend.status === "online") return null;
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${
        isDarkMode ? "bg-slate-800" : "bg-white"
      }`}>
        {/* Header with Gradient Background */}
        <div className={`relative h-32 bg-gradient-to-br ${
          isDarkMode
            ? "from-blue-600 to-purple-600"
            : "from-blue-500 to-purple-500"
        }`}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg bg-black/20 hover:bg-black/40 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Section */}
        <div className="px-6 pb-6">
          {/* Avatar */}
          <div className="flex justify-center -mt-16 mb-4">
            <div className="relative">
              <div className={`w-28 h-28 rounded-full flex items-center justify-center font-bold text-3xl border-4 shadow-lg ${
                isDarkMode
                  ? "bg-slate-700 text-slate-300 border-slate-800"
                  : "bg-gray-200 text-gray-700 border-white"
              }`}>
                {friend.display_name.charAt(0).toUpperCase()}
              </div>
              <div className={`absolute bottom-2 right-2 w-6 h-6 rounded-full border-3 ${
                isDarkMode ? "border-slate-800" : "border-white"
              } ${statusColors[friend.status]} shadow-lg`} title={statusLabels[friend.status]} />
            </div>
          </div>

          {/* User Info */}
          <div className="text-center mb-6">
            <h2 className={`text-2xl font-bold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              {friend.display_name}
            </h2>
            <p className={`text-sm mb-3 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
              @{friend.username}
            </p>
            <div className="flex items-center justify-center gap-2">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
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
                <div className={`w-2 h-2 rounded-full ${statusColors[friend.status]}`} />
                {statusLabels[friend.status]}
              </div>
            </div>

            {/* Last Seen */}
            {getLastSeenText(friend.last_seen) && (
              <p className={`text-xs mt-2 ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>
                Last seen {getLastSeenText(friend.last_seen)}
              </p>
            )}
          </div>

          {/* Custom Status */}
          {friend.custom_status && (
            <div className={`mb-6 p-3 rounded-lg text-center ${
              isDarkMode
                ? "bg-slate-700/50 border border-slate-600"
                : "bg-gray-50 border border-gray-200"
            }`}>
              <p className={`text-sm italic ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                "{friend.custom_status}"
              </p>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6 py-4 border-y border-slate-700/50">
            <div className="text-center">
              <div className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                0
              </div>
              <div className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Mutual Friends
              </div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                0
              </div>
              <div className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Communities
              </div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                —
              </div>
              <div className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Joined
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => {
                if (onMessage) onMessage(friend.id);
                onClose();
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Message
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors">
              <Phone className="w-4 h-4" />
              Call
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors">
              <Video className="w-4 h-4" />
              Video
            </button>
          </div>

          {/* More Options */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                isDarkMode
                  ? "bg-slate-700/50 hover:bg-slate-700 text-gray-300"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              More Options
            </button>

            {showMenu && (
              <div className={`absolute top-full mt-2 left-0 right-0 rounded-lg shadow-xl border overflow-hidden z-50 ${
                isDarkMode
                  ? "bg-slate-700 border-slate-600"
                  : "bg-white border-gray-200"
              }`}>
                <button
                  onClick={() => {
                    setShowRemoveConfirm(true);
                    setShowMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-red-500/10 text-red-500 transition-colors`}
                >
                  <UserMinus className="w-4 h-4" />
                  Remove Friend
                </button>
                <button
                  onClick={() => {
                    setShowBlockConfirm(true);
                    setShowMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-red-500/10 text-red-500 transition-colors`}
                >
                  <Ban className="w-4 h-4" />
                  Block User
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Confirmation Dialogs */}
        <ConfirmDialog
          isOpen={showRemoveConfirm}
          title="Remove Friend?"
          description={`Are you sure you want to remove ${friend?.display_name} from your friends list? You can add them again later.`}
          cancelText="Cancel"
          confirmText="Remove"
          isDangerous
          onConfirm={() => {
            if (onRemove && friend) onRemove(friend.id);
            setShowRemoveConfirm(false);
            onClose();
          }}
          onCancel={() => setShowRemoveConfirm(false)}
        />
        <ConfirmDialog
          isOpen={showBlockConfirm}
          title="Block User?"
          description={`Are you sure you want to block ${friend?.display_name}? They won't be able to send you messages or friend requests.`}
          cancelText="Cancel"
          confirmText="Block"
          isDangerous
          onConfirm={() => {
            if (onBlock && friend) onBlock(friend.id);
            setShowBlockConfirm(false);
            onClose();
          }}
          onCancel={() => setShowBlockConfirm(false)}
        />
      </div>
    </div>
  );
}
