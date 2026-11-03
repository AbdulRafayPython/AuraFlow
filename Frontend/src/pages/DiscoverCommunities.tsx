// Discover communities, laid out like Discord's server discovery: categories
// in the left column, a hero with the search box, then featured and more
// communities as banner cards. Agents have their own page (/agents), so this
// page is only about communities.
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Users, Compass, Gamepad2, Music, Film, FlaskConical, GraduationCap,
  Loader2, Plus, Home, X,
} from "lucide-react";
import { cn, readableTextOn } from "@/lib/utils";
import { channelService } from "@/services/channelService";
import { useRealtime } from "@/hooks/useRealtime";
import type { Community } from "@/types";
import { API_SERVER } from "@/config/api";
import { matchesCategory, type CategoryId } from "@/lib/communityCategory";

interface DiscoverCommunitiesProps {
  onClose?: () => void;
  onJoinCommunity?: (communityId: string) => Promise<void>;
}

const CATEGORIES: { id: CategoryId; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "education", label: "Education", icon: GraduationCap },
  { id: "science", label: "Science & Tech", icon: FlaskConical },
  { id: "gaming", label: "Gaming", icon: Gamepad2 },
  { id: "music", label: "Music", icon: Music },
  { id: "entertainment", label: "Entertainment", icon: Film },
];

const PAGE_SIZE = 12;
const FEATURED_COUNT = 3;

const assetUrl = (path?: string | null) => (!path ? null : /^https?:\/\//.test(path) ? path : `${API_SERVER}${path}`);

const initialsOf = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

const formatCount = (count: number) => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return count.toString();
};

function CommunityCard({ community, joining, onJoin }: { community: Community; joining: boolean; onJoin: () => void }) {
  const banner = assetUrl(community.banner_url);
  const logo = assetUrl(community.logo_url);
  const color = community.color || "#5865f2";
  const members = community.member_count || 0;
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border bg-[hsl(var(--theme-bg-secondary))] transition-colors duration-150 hover:border-[hsl(var(--theme-border-hover))] hover:bg-[hsl(var(--theme-bg-tertiary))]">
      <div className="relative h-32 shrink-0 overflow-hidden" style={banner ? undefined : { backgroundColor: color }}>
        {banner && (
          <img
            src={banner}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none"
          />
        )}
      </div>
      <div className="relative flex flex-1 flex-col px-4 pb-4 pt-9">
        <span className="absolute -top-7 left-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border-4 border-[hsl(var(--theme-bg-secondary))] text-sm font-bold transition-colors duration-150 group-hover:border-[hsl(var(--theme-bg-tertiary))]"
          style={logo ? undefined : { backgroundColor: color, color: readableTextOn(color) }}
        >
          {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : community.icon || initialsOf(community.name)}
        </span>
        <h3 className="truncate text-base font-semibold text-foreground">{community.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
          {community.description || "A community on AuraFlow."}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-muted-foreground" aria-hidden />
            {formatCount(members)} {members === 1 ? "Member" : "Members"}
          </span>
          <button
            type="button"
            onClick={onJoin}
            disabled={joining}
            aria-label={`Join ${community.name}`}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {joining ? "Joining" : "Join"}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function DiscoverCommunities({ onJoinCommunity }: DiscoverCommunitiesProps) {
  const navigate = useNavigate();
  const { reloadCommunities } = useRealtime();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState<CategoryId>("home");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchCommunities = useCallback(async (search: string = "", reset: boolean = false) => {
    if (reset) setIsLoading(true);
    else setIsLoadingMore(true);
    try {
      const currentOffset = reset ? 0 : offset;
      const results = await channelService.discoverCommunities(search, PAGE_SIZE, currentOffset);
      setCommunities((prev) => (reset ? results : [...prev, ...results]));
      setOffset(currentOffset + PAGE_SIZE);
      setHasMore(results.length === PAGE_SIZE);
    } catch (error) {
      console.error("Error fetching communities:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [offset]);

  useEffect(() => {
    fetchCommunities("", true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => fetchCommunities(value.trim(), true), 300);
  };

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && !isLoadingMore) fetchCommunities(searchTerm.trim());
      },
      { threshold: 0.1 },
    );
    const current = observerTarget.current;
    if (current) observer.observe(current);
    return () => { if (current) observer.unobserve(current); };
  }, [hasMore, isLoading, isLoadingMore, searchTerm, fetchCommunities]);

  const handleJoin = async (communityId: string) => {
    setJoiningId(communityId);
    try {
      if (onJoinCommunity) await onJoinCommunity(communityId);
      else await channelService.joinCommunity(communityId);
      setCommunities((prev) => prev.filter((c) => c.id !== communityId));
      await reloadCommunities();
      navigate(`/community/${communityId}`);
    } catch (error) {
      console.error("Error joining community:", error);
    } finally {
      setJoiningId(null);
    }
  };

  const filtered = useMemo(() => communities.filter((c) => matchesCategory(c, category)), [communities, category]);
  const counts = useMemo(
    () => Object.fromEntries(CATEGORIES.map((c) => [c.id, communities.filter((x) => matchesCategory(x, c.id)).length])) as Record<CategoryId, number>,
    [communities],
  );
  // Home without a search: the biggest communities are featured, the rest listed below.
  const showFeatured = category === "home" && !searchTerm.trim() && filtered.length > 0;
  const featured = showFeatured
    ? [...filtered].sort((a, b) => (b.member_count || 0) - (a.member_count || 0)).slice(0, FEATURED_COUNT)
    : [];
  const rest = filtered.filter((c) => !featured.includes(c));
  const activeLabel = CATEGORIES.find((c) => c.id === category)?.label ?? "Home";

  const grid = (list: Community[]) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((c) => (
        <CommunityCard key={c.id} community={c} joining={joiningId === c.id} onJoin={() => handleJoin(c.id)} />
      ))}
    </div>
  );

  return (
    <div className="flex h-full bg-[hsl(var(--theme-bg-primary))]">
      {/* Categories (Discord's discovery sidebar) */}
      <aside
        aria-label="Discover categories"
        className="hidden w-sidebar shrink-0 flex-col border-r border-border md:flex"
        style={{ background: "var(--theme-sidebar-gradient)" }}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <Compass className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">Discover</h2>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors duration-150",
                  active
                    ? "bg-[hsl(var(--theme-bg-active))] text-foreground"
                    : "text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground",
                )}
              >
                <cat.icon className="h-5 w-5 shrink-0" />
                <span className="flex-1 truncate">{cat.label}</span>
                {!isLoading && cat.id !== "home" && (
                  <span className="text-xs text-muted-foreground">{counts[cat.id]}</span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1200px] px-4 pb-10 pt-4 sm:px-6">
          {/* Hero */}
          <section className="group relative isolate overflow-hidden rounded-xl" aria-label="Find your community">
            <img
              src="/discover/hero.webp"
              alt=""
              className="absolute inset-0 -z-10 h-full w-full object-cover object-right transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
            />
            <div aria-hidden className="absolute inset-0 -z-10 bg-black/30 sm:bg-transparent" />
            <div className="flex min-h-[240px] max-w-lg flex-col justify-center px-6 py-8 sm:min-h-[280px] sm:px-10">
              <h1 className="text-2xl font-bold leading-tight text-white sm:text-[28px]">Find your community on AuraFlow</h1>
              <p className="mt-2 text-base text-white/80">
                From study groups to tech talks, there is a place for you.
              </p>
              <div className="relative mt-5">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#5c5e66]" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Explore communities"
                  aria-label="Search communities"
                  className="h-11 w-full rounded-lg bg-white pl-11 pr-10 text-base text-[#111] shadow-popover outline-none placeholder:text-[#5c5e66] focus:ring-2 focus:ring-primary [&::-webkit-search-cancel-button]:hidden"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => handleSearch("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#5c5e66] hover:bg-black/5"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Categories on small screens (the sidebar is hidden there) */}
          <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-none md:hidden">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                aria-pressed={category === cat.id}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                  category === cat.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))]",
                )}
              >
                <cat.icon className="h-4 w-4" />
                {cat.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Compass className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-base font-medium text-foreground">
                {searchTerm.trim()
                  ? `No communities match "${searchTerm.trim()}"${category !== "home" ? ` in ${activeLabel}` : ""}.`
                  : category === "home"
                    ? "No communities to discover yet."
                    : `No ${activeLabel} communities yet.`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {searchTerm.trim() ? "Try a different search or category." : "Create one with the + in the left rail."}
              </p>
              {(searchTerm || category !== "home") && (
                <button
                  type="button"
                  onClick={() => { setCategory("home"); if (searchTerm) handleSearch(""); }}
                  className="mt-4 h-8 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-[hsl(var(--theme-bg-hover))]"
                >
                  Show all communities
                </button>
              )}
            </div>
          ) : (
            <>
              {featured.length > 0 && (
                <section className="mt-8" aria-labelledby="featured-heading">
                  <h2 id="featured-heading" className="mb-4 text-lg font-semibold text-foreground">Featured communities</h2>
                  {grid(featured)}
                </section>
              )}
              {rest.length > 0 && (
                <section className="mt-8" aria-labelledby="list-heading">
                  <h2 id="list-heading" className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                    {searchTerm.trim() ? (
                      <>Results for "{searchTerm.trim()}"</>
                    ) : featured.length > 0 ? (
                      "More communities"
                    ) : (
                      activeLabel
                    )}
                    <span className="text-sm font-normal text-muted-foreground">{rest.length}</span>
                  </h2>
                  {grid(rest)}
                </section>
              )}
            </>
          )}

          {hasMore && communities.length > 0 && (
            <div ref={observerTarget} className="flex justify-center py-8">
              {isLoadingMore && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
            </div>
          )}

          <p className="mt-10 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Joining adds the community to your rail.
          </p>
        </div>
      </main>
    </div>
  );
}
