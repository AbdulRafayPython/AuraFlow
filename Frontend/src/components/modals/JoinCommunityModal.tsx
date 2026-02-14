// components/modals/JoinCommunityModal.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { getAvatarUrl } from "@/lib/utils";
import { X, Search, Users, Plus, Loader, AlertCircle } from "lucide-react";
import type { Community } from "@/types";
import { API_SERVER } from "@/config/api";

interface JoinCommunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinCommunity: (communityId: number) => Promise<void>;
  onDiscoverCommunities: (search: string, limit: number, offset: number) => Promise<Community[]>;
}

export default function JoinCommunityModal({
  isOpen,
  onClose,
  onJoinCommunity,
  onDiscoverCommunities,
}: JoinCommunityModalProps) {
  const { isDarkMode } = useTheme();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const observerTarget = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  // Fetch communities
  const fetchCommunities = useCallback(
    async (search: string = "", reset: boolean = false) => {
      setIsLoading(true);
      setError("");
      try {
        const currentOffset = reset ? 0 : offset;
        const results = await onDiscoverCommunities(search, 15, currentOffset);

        if (reset) {
          setCommunities(results);
          setOffset(15);
        } else {
          setCommunities((prev) => [...prev, ...results]);
          setOffset((prev) => prev + 15);
        }

        setHasMore(results.length === 15);
      } catch (err: any) {
        setError(err.message || "Failed to load communities");
      } finally {
        setIsLoading(false);
      }
    },
    [offset, onDiscoverCommunities]
  );

  // Initial load
  useEffect(() => {
    if (isOpen) {
      fetchCommunities("", true);
    }
  }, [isOpen]);

  // Handle search with debounce
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setOffset(0);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      fetchCommunities(value, true);
    }, 300);
  };

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          fetchCommunities(searchTerm);
        }
      },
      { threshold: 0.1 }
    );

    const current = observerTarget.current;
    if (current) {
      observer.observe(current);
    }

    return () => {
      if (current) {
        observer.unobserve(current);
      }
    };
  }, [hasMore, isLoading, searchTerm, fetchCommunities]);

  // Handle join community
  const handleJoinCommunity = async (communityId: number) => {
    setJoiningId(communityId);
    setError("");
    try {
      await onJoinCommunity(communityId);
      setCommunities((prev) =>
        prev.filter((c) => c.id !== communityId)
      );
    } catch (err: any) {
      setError(err.message || "Failed to join community");
    } finally {
      setJoiningId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      {/* Premium Modal Container */}
      <div
        className="w-full max-w-2xl rounded-3xl shadow-2xl border max-h-[85vh] overflow-y-auto flex flex-col bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))] backdrop-blur-xl"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "hsl(var(--theme-text-muted)) transparent",
        }}
      >
        {/* Webkit-specific scrollbar styling */}
        <style>{`
          .join-modal-container::-webkit-scrollbar {
            width: 10px;
          }
          .join-modal-container::-webkit-scrollbar-track {
            background: transparent;
            border-radius: 12px;
          }
          .join-modal-container::-webkit-scrollbar-thumb {
            background-color: hsl(var(--theme-text-muted));
            border-radius: 12px;
            border: 3px solid hsl(var(--theme-bg-elevated));
            background-clip: padding-box;
          }
          .join-modal-container:hover::-webkit-scrollbar-thumb {
            background-color: hsl(var(--theme-text-secondary));
          }
        `}</style>

        {/* Sticky Header */}
        <div className="sticky top-0 z-10 p-5 border-b backdrop-blur-xl bg-[hsl(var(--theme-bg-elevated))]/80 border-[hsl(var(--theme-border-default))]">
          {/* Header Title */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] rounded-2xl flex items-center justify-center shadow-lg">
                <Users className="w-5 h-5 text-white drop-shadow-sm" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-[hsl(var(--theme-text-primary))]">
                Discover Communities
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
              placeholder="Search communities..."
              className="w-full pl-10 pr-4 py-3 rounded-2xl border text-sm transition-all duration-200 bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))] focus:border-[hsl(var(--theme-accent-primary))] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--theme-accent-primary))]/20"
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

          {/* Communities Grid */}
          {communities.length > 0 ? (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {communities.map((community) => {
                const logoUrl = community.logo_url 
                  ? `${API_SERVER}${community.logo_url}` 
                  : null;
                
                return (
                <div
                  key={community.id}
                  className="p-4 rounded-2xl border transition-all duration-200 group bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:bg-[hsl(var(--theme-bg-hover))] hover:border-[hsl(var(--theme-border-subtle))]"
                >
                  {/* Community Icon & Header */}
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-white shadow-lg flex-shrink-0 overflow-hidden"
                      style={{
                        backgroundColor: !logoUrl ? (community.color || "#8B5CF6") : undefined,
                      }}
                    >
                      {logoUrl ? (
                        <img src={logoUrl} alt={community.name} className="w-full h-full object-cover" />
                      ) : (
                        community.icon || community.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base truncate text-[hsl(var(--theme-text-primary))]">
                        {community.name}
                      </h3>
                      <p className="text-xs flex items-center gap-1 mt-1 text-[hsl(var(--theme-text-muted))]">
                        <Users className="w-3.5 h-3.5" />
                        {community.member_count || 0} members
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  {community.description && (
                    <p className="text-sm mb-3 line-clamp-2 text-[hsl(var(--theme-text-secondary))]">
                      {community.description}
                    </p>
                  )}

                  {/* Creator Info */}
                  {community.creator && (
                    <div className="text-xs mb-3 py-2 px-2 rounded-lg flex items-center gap-2 bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))]">
                      {community.creator.avatar_url && (
                        <img
                          src={getAvatarUrl(community.creator.avatar_url, community.creator.username)}
                          alt={community.creator.display_name}
                          className="w-6 h-6 rounded-full"
                        />
                      )}
                      <span>Created by {community.creator.display_name || community.creator.username}</span>
                    </div>
                  )}

                  {/* Join Button */}
                  <button
                    onClick={() => handleJoinCommunity(community.id)}
                    disabled={joiningId === community.id}
                    className="w-full py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] hover:shadow-[var(--theme-glow-primary)] shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-60 active:scale-98 flex items-center justify-center gap-2"
                  >
                    {joiningId === community.id ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Joining...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Join Community
                      </>
                    )}
                  </button>
                </div>
              );
              })}
            </div>
          ) : isLoading && communities.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-[hsl(var(--theme-accent-primary))]" />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <Users className="w-12 h-12 mb-3 text-[hsl(var(--theme-text-muted))]" />
              <p className="text-center text-[hsl(var(--theme-text-secondary))]">
                {searchTerm ? "No communities found" : "No communities available"}
              </p>
            </div>
          )}

          {/* Load more observer */}
          {hasMore && communities.length > 0 && (
            <div ref={observerTarget} className="py-4 flex justify-center">
              {isLoading && <Loader className="w-6 h-6 animate-spin text-[hsl(var(--theme-accent-primary))]" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
