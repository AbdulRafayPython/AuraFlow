import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { getAvatarUrl } from "@/lib/utils";
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
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 bg-[hsl(var(--theme-bg-elevated))]">
        {/* Header with Gradient Background */}
        <div className="relative h-32 bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))]">
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
              <img
                src={getAvatarUrl(friend.avatar_url, friend.username)}
                alt={friend.display_name}
                className="w-28 h-28 rounded-full border-4 shadow-lg object-cover border-[hsl(var(--theme-bg-elevated))]"
              />
              <div className={`absolute bottom-2 right-2 w-6 h-6 rounded-full border-3 border-[hsl(var(--theme-bg-elevated))] ${statusColors[friend.status]} shadow-lg`} title={statusLabels[friend.status]} />
            </div>
          </div>

          {/* User Info */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-1 text-[hsl(var(--theme-text-primary))]">
              {friend.display_name}
            </h2>
            <p className="text-sm mb-3 text-[hsl(var(--theme-text-muted))]">
              @{friend.username}
            </p>
            <div className="flex items-center justify-center gap-2">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                friend.status === "online"
                  ? "bg-green-500/20 text-green-400"
                  : friend.status === "idle"
                  ? "bg-yellow-500/20 text-yellow-400"
                  : friend.status === "dnd"
                  ? "bg-red-500/20 text-red-400"
                  : "bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))]"
              }`}>
                <div className={`w-2 h-2 rounded-full ${statusColors[friend.status]}`} />
                {statusLabels[friend.status]}
              </div>
            </div>

            {/* Last Seen */}
            {getLastSeenText(friend.last_seen) && (
              <p className="text-xs mt-2 text-[hsl(var(--theme-text-muted))]">
                Last seen {getLastSeenText(friend.last_seen)}
              </p>
            )}
          </div>

          {/* Custom Status */}
          {friend.custom_status && (
            <div className="mb-6 p-3 rounded-lg text-center bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))]">
              <p className="text-sm italic text-[hsl(var(--theme-text-secondary))]">
                "{friend.custom_status}"
              </p>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6 py-4 border-y border-[hsl(var(--theme-border-default))]">
            <div className="text-center">
              <div className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">
                0
              </div>
              <div className="text-xs text-[hsl(var(--theme-text-muted))]">
                Mutual Friends
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">
                0
              </div>
              <div className="text-xs text-[hsl(var(--theme-text-muted))]">
                Communities
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">
                —
              </div>
              <div className="text-xs text-[hsl(var(--theme-text-muted))]">
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
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] text-white font-medium transition-all hover:shadow-[var(--theme-glow-primary)]"
            >
              <MessageCircle className="w-4 h-4" />
              Message
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-primary))] font-medium transition-colors">
              <Phone className="w-4 h-4" />
              Call
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-primary))] font-medium transition-colors">
              <Video className="w-4 h-4" />
              Video
            </button>
          </div>

          {/* More Options */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-full py-2 rounded-lg text-sm font-medium transition-colors bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))]"
            >
              More Options
            </button>

            {showMenu && (
              <div className="absolute top-full mt-2 left-0 right-0 rounded-lg shadow-xl border overflow-hidden z-50 bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))]">
                <button
                  onClick={() => {
                    setShowRemoveConfirm(true);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-red-500/10 text-red-500 transition-colors"
                >
                  <UserMinus className="w-4 h-4" />
                  Remove Friend
                </button>
                <button
                  onClick={() => {
                    setShowBlockConfirm(true);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-red-500/10 text-red-500 transition-colors"
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
