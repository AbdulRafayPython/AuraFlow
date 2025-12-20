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
        className={`
          w-full max-w-2xl rounded-3xl shadow-2xl border
          max-h-[85vh] overflow-y-auto flex flex-col
          ${isDarkMode
            ? "bg-slate-900/95 border-slate-700/50 backdrop-blur-xl"
            : "bg-white/95 border-gray-200/70 backdrop-blur-xl"
          }
        `}
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: isDarkMode
            ? "#64748b transparent"
            : "#94a3b8 transparent",
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
            background-color: ${isDarkMode ? "#64748b" : "#94a3b8"};
            border-radius: 12px;
            border: 3px solid ${isDarkMode ? "#1e293b" : "white"};
            background-clip: padding-box;
          }
          .add-friend-modal:hover::-webkit-scrollbar-thumb {
            background-color: ${isDarkMode ? "#94a3b8" : "#64748b"};
          }
        `}</style>

        {/* Sticky Header */}
        <div
          className={`sticky top-0 z-10 p-5 border-b backdrop-blur-xl
            ${isDarkMode ? "bg-slate-900/80 border-slate-700/70" : "bg-white/80 border-gray-200/70"}
          `}
        >
          {/* Header Title */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-rose-500 via-pink-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg">
                <UserPlus className="w-5 h-5 text-white drop-shadow-sm" />
              </div>
              <h2
                className={`text-xl font-bold tracking-tight ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                Add Friend
              </h2>
            </div>
            <button
              onClick={onClose}
              className={`p-2.5 rounded-xl transition-all duration-200 ${
                isDarkMode
                  ? "hover:bg-slate-800/80 text-gray-400"
                  : "hover:bg-gray-100 text-gray-600"
              } active:scale-95`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by username or email..."
              className={`w-full pl-10 pr-4 py-3 rounded-2xl border text-sm transition-all duration-200
                ${isDarkMode
                  ? "bg-slate-800/70 border-slate-600 text-white placeholder-gray-500 focus:border-rose-500"
                  : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-600 focus:border-rose-500"
                } focus:outline-none focus:ring-4 focus:ring-rose-500/20`}
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
                  className={`p-4 rounded-2xl border transition-all duration-200 flex items-center justify-between
                    ${isDarkMode
                      ? "bg-slate-800/50 border-slate-700/50 hover:bg-slate-800/70 hover:border-slate-600"
                      : "bg-gray-50/50 border-gray-200/50 hover:bg-gray-100/70 hover:border-gray-300"
                    }`}
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
                        className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 bg-gradient-to-br from-purple-500 to-pink-500`}
                      >
                        {user.display_name?.[0]?.toUpperCase() || user.username[0].toUpperCase()}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3
                        className={`font-semibold truncate ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {user.display_name || user.username}
                      </h3>
                      <p
                        className={`text-xs ${
                          isDarkMode ? "text-gray-400" : "text-gray-600"
                        }`}
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
                        ? isDarkMode
                          ? "bg-green-500/20 text-green-400 cursor-default"
                          : "bg-green-100 text-green-600 cursor-default"
                        : "text-white bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 shadow-lg hover:shadow-xl disabled:opacity-60 active:scale-98"
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
              <Loader className="w-8 h-8 animate-spin text-rose-500" />
            </div>
          ) : searchTerm ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <User className={`w-12 h-12 mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`} />
              <p
                className={`text-center ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                No users found matching "{searchTerm}"
              </p>
              <p
                className={`text-center text-xs mt-2 ${
                  isDarkMode ? "text-gray-500" : "text-gray-500"
                }`}
              >
                Try searching by username or email
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <User className={`w-12 h-12 mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`} />
              <p
                className={`text-center ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                Start typing to search for users
              </p>
              <p
                className={`text-center text-xs mt-2 ${
                  isDarkMode ? "text-gray-500" : "text-gray-500"
                }`}
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
