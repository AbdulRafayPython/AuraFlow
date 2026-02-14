// components/modals/AddFriendModal.tsx
import { useState, useRef, useCallback, useEffect } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { getAvatarUrl } from "@/lib/utils";
import { X, Search, User, UserPlus, Loader, CheckCircle } from "lucide-react";
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      {/* Premium Modal Container */}
      <div
        className="w-full max-w-[480px] rounded-2xl shadow-2xl border max-h-[85vh] overflow-hidden flex flex-col bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-subtle))] animate-in zoom-in-95 slide-in-from-bottom-2 duration-300"
        style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.05) inset' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[hsl(var(--theme-border-subtle))]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] rounded-xl flex items-center justify-center shadow-md">
                <UserPlus className="w-[18px] h-[18px] text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[hsl(var(--theme-text-primary))]">
                  Add Friend
                </h2>
                <p className="text-[11px] text-[hsl(var(--theme-text-muted))] mt-0.5">
                  Search and connect with people
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-all duration-150 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-secondary))] active:scale-95"
              aria-label="Close modal"
            >
              <X className="w-[18px] h-[18px]" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative mt-4">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--theme-text-muted))]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by username or email..."
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition-all duration-150 bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted)/0.7)] focus:border-[hsl(var(--theme-accent-primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))]/15 hover:border-[hsl(var(--theme-border-hover))]"
            />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto modal-scrollbar">
          {/* Error Message */}
          {error && (
            <div className="m-4 p-3 bg-red-500/8 border border-red-500/20 rounded-xl flex items-start gap-2.5">
              <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-red-400 text-[10px] font-bold">!</span>
              </div>
              <p className="text-red-400 text-[13px] leading-relaxed">{error}</p>
            </div>
          )}

          {/* Search Results */}
          {searchResults.length > 0 ? (
            <div className="p-3 space-y-2">
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  className="p-3 rounded-xl border transition-all duration-150 flex items-center justify-between bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-subtle))] hover:bg-[hsl(var(--theme-bg-secondary))] hover:border-[hsl(var(--theme-border-hover))]"
                >
                  {/* User Info */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Avatar */}
                    {user.avatar_url ? (
                      <img
                        src={getAvatarUrl(user.avatar_url, user.username)}
                        alt={user.display_name}
                        className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-sm text-white flex-shrink-0 bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))]">
                        {user.display_name?.[0]?.toUpperCase() || user.username[0].toUpperCase()}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="text-[13px] font-medium truncate text-[hsl(var(--theme-text-primary))]">
                        {user.display_name || user.username}
                      </h3>
                      <p className="text-[11px] text-[hsl(var(--theme-text-muted))]">
                        @{user.username}
                      </p>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => handleSendRequest(user)}
                    disabled={sendingId === user.id || user.sent_request}
                    className={`ml-3 flex-shrink-0 py-2 px-3.5 rounded-lg text-[12px] font-medium transition-all duration-150 flex items-center gap-1.5 ${
                      user.sent_request
                        ? "bg-green-500/15 text-green-400 cursor-default border border-green-500/20"
                        : "text-white bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] shadow-sm hover:shadow-md hover:shadow-[hsl(var(--theme-accent-primary))/0.25] disabled:opacity-50 active:scale-[0.98]"
                    }`}
                  >
                    {sendingId === user.id ? (
                      <>
                        <Loader className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending</span>
                      </>
                    ) : user.sent_request ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Sent</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : isSearching ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[hsl(var(--theme-accent-primary))/0.3] border-t-[hsl(var(--theme-accent-primary))] rounded-full animate-spin" />
              <p className="text-[12px] text-[hsl(var(--theme-text-muted))] mt-3">Searching...</p>
            </div>
          ) : searchTerm ? (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="w-12 h-12 rounded-xl bg-[hsl(var(--theme-bg-secondary))] flex items-center justify-center mb-3">
                <User className="w-6 h-6 text-[hsl(var(--theme-text-muted))]" />
              </div>
              <p className="text-[13px] text-center text-[hsl(var(--theme-text-secondary))]">
                No users found
              </p>
              <p className="text-[11px] text-center mt-1 text-[hsl(var(--theme-text-muted))]">
                Try a different username or email
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="w-12 h-12 rounded-xl bg-[hsl(var(--theme-bg-secondary))] flex items-center justify-center mb-3">
                <Search className="w-6 h-6 text-[hsl(var(--theme-text-muted))]" />
              </div>
              <p className="text-[13px] text-center text-[hsl(var(--theme-text-secondary))]">
                Search for people
              </p>
              <p className="text-[11px] text-center mt-1 text-[hsl(var(--theme-text-muted))]">
                Enter a username or email to find friends
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
