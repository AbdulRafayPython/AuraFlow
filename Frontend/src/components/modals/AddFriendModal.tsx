// components/modals/AddFriendModal.tsx
import { useState, useRef, useCallback, useEffect } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { getAvatarUrl } from "@/lib/utils";
import { X, Search, User, UserPlus, Loader, AlertCircle, CheckCircle } from "lucide-react";
import { channelService } from "@/services/channelService";
import type { User as UserType } from "@/types";

interface AddFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendRequest: (username: string) => Promise<void>;
}

interface SearchResult extends UserType {
  sent_request?: boolean;
}

export default function AddFriendModal({
  isOpen,
  onClose,
  onSendRequest,
}: AddFriendModalProps) {
  const { isDarkMode } = useTheme();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [sentRequests, setSentRequests] = useState<Set<number>>(new Set());
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  // Search users
  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
    setError("");

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!value.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await channelService.searchUsers(value);
        setSearchResults(
          results.map((user: any) => ({
            ...user,
            sent_request: sentRequests.has(user.id),
          }))
        );
      } catch (err: any) {
        setError(err.response?.data?.error || "Failed to search users");
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [sentRequests]);

  // Handle send friend request
  const handleSendRequest = async (user: SearchResult) => {
    setSendingId(user.id);
    setError("");
    try {
      await onSendRequest(user.username);
      setSentRequests((prev) => new Set([...prev, user.id]));
      setSearchResults((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, sent_request: true } : u
        )
      );
    } catch (err: any) {
      setError(err.message || "Failed to send friend request");
    } finally {
      setSendingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      {/* Premium Modal Container */}
      <div
        className="w-full max-w-2xl rounded-3xl shadow-2xl border max-h-[85vh] overflow-y-auto flex flex-col bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))] backdrop-blur-xl"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "hsl(var(--theme-border-default)) transparent",
        }}
      >
        {/* Webkit-specific scrollbar styling */}
        <style>{`
          .add-friend-modal::-webkit-scrollbar {
            width: 10px;
          }
          .add-friend-modal::-webkit-scrollbar-track {
            background: transparent;
            border-radius: 12px;
          }
          .add-friend-modal::-webkit-scrollbar-thumb {
            background-color: hsl(var(--theme-border-default));
            border-radius: 12px;
            border: 3px solid hsl(var(--theme-bg-elevated));
            background-clip: padding-box;
          }
          .add-friend-modal:hover::-webkit-scrollbar-thumb {
            background-color: hsl(var(--theme-accent-primary));
          }
        `}</style>

        {/* Sticky Header */}
        <div
          className="sticky top-0 z-10 p-5 border-b backdrop-blur-xl bg-[hsl(var(--theme-bg-elevated)/0.8)] border-[hsl(var(--theme-border-default))]"
        >
          {/* Header Title */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] rounded-2xl flex items-center justify-center shadow-lg shadow-[hsl(var(--theme-accent-primary)/0.3)]">
                <UserPlus className="w-5 h-5 text-white drop-shadow-sm" />
              </div>
              <h2
                className="text-xl font-bold tracking-tight text-[hsl(var(--theme-text-primary))]"
              >
                Add Friend
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl transition-all duration-200 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[hsl(var(--theme-text-muted))]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by username or email..."
              className="w-full pl-10 pr-4 py-3 rounded-2xl border text-sm transition-all duration-200 bg-[hsl(var(--theme-input-bg))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))] focus:border-[hsl(var(--theme-accent-primary))] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--theme-accent-primary)/0.2)]"
            />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Error Message */}
          {error && (
            <div className="m-4 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl backdrop-blur-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Search Results */}
          {searchResults.length > 0 ? (
            <div className="p-4 space-y-3">
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  className="p-4 rounded-2xl border transition-all duration-200 flex items-center justify-between bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:bg-[hsl(var(--theme-bg-hover))] hover:border-[hsl(var(--theme-accent-primary)/0.3)] hover:shadow-[var(--theme-glow-secondary)]"
                >
                  {/* User Info */}
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Avatar */}
                    {user.avatar_url ? (
                      <img
                        src={getAvatarUrl(user.avatar_url, user.username)}
                        alt={user.display_name}
                        className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))]"
                      >
                        {user.display_name?.[0]?.toUpperCase() || user.username[0].toUpperCase()}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3
                        className="font-semibold truncate text-[hsl(var(--theme-text-primary))]"
                      >
                        {user.display_name || user.username}
                      </h3>
                      <p
                        className="text-xs text-[hsl(var(--theme-text-muted))]"
                      >
                        @{user.username}
                      </p>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => handleSendRequest(user)}
                    disabled={sendingId === user.id || user.sent_request}
                    className={`ml-4 flex-shrink-0 py-2 px-4 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center gap-2 ${
                      user.sent_request
                        ? "bg-green-500/20 text-green-400 cursor-default"
                        : "text-white bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] hover:shadow-[var(--theme-glow-primary)] disabled:opacity-60 active:scale-98"
                    }`}
                  >
                    {sendingId === user.id ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Sending...
                      </>
                    ) : user.sent_request ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Sent
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        Add
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : isSearching ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-[hsl(var(--theme-accent-primary))]" />
            </div>
          ) : searchTerm ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <User className="w-12 h-12 mb-3 text-[hsl(var(--theme-text-muted))]" />
              <p
                className="text-center text-[hsl(var(--theme-text-muted))]"
              >
                No users found matching "{searchTerm}"
              </p>
              <p
                className="text-center text-xs mt-2 text-[hsl(var(--theme-text-muted))]"
              >
                Try searching by username or email
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <User className="w-12 h-12 mb-3 text-[hsl(var(--theme-text-muted))]" />
              <p
                className="text-center text-[hsl(var(--theme-text-muted))]"
              >
                Start typing to search for users
              </p>
              <p
                className="text-center text-xs mt-2 text-[hsl(var(--theme-text-muted))]"
              >
                Search by username or email (minimum 2 characters)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
