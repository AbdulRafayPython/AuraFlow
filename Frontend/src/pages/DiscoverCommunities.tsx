// Discover communities, laid out like Discord's server discovery: a tab bar
// of categories with search on the right, a hero, then featured and more
// communities as banner cards. A card opens the join procedure (preview →
// rules → join); nothing joins on a single click. Agents have their own
// page (/agents), so this page is only about communities.
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Users, Compass, Gamepad2, Music, Film, FlaskConical, GraduationCap,
  Loader2, Home, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn, readableTextOn } from "@/lib/utils";
import { channelService } from "@/services/channelService";
import { useRealtime } from "@/hooks/useRealtime";
import type { Community } from "@/types";
import { API_SERVER } from "@/config/api";
import { matchesCategory, type CategoryId } from "@/lib/communityCategory";
import { JoinCommunityDialog } from "@/components/community/JoinCommunityDialog";

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

function CommunityCard({ community, onOpen }: { community: Community; onOpen: () => void }) {
  const banner = assetUrl(community.banner_url);
  const logo = assetUrl(community.logo_url);
  const color = community.color || "#5865f2";
  const members = community.member_count || 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${community.name}`}
      className="card-sheen group flex flex-col overflow-hidden rounded-lg border border-border bg-[hsl(var(--theme-bg-secondary))] text-left transition-colors duration-150 hover:border-[hsl(var(--theme-border-hover))] hover:bg-[hsl(var(--theme-bg-tertiary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="relative h-32 w-full shrink-0 overflow-hidden" style={banner ? undefined : { backgroundColor: color }}>
        {banner && (
          <img
            src={banner}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="relative flex w-full flex-1 flex-col px-4 pb-4 pt-9">
        <span
          className="absolute -top-7 left-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border-4 border-[hsl(var(--theme-bg-secondary))] text-sm font-bold transition-colors duration-150 group-hover:border-[hsl(var(--theme-bg-tertiary))]"
          style={logo ? undefined : { backgroundColor: color, color: readableTextOn(color) }}
        >
          {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : community.icon || initialsOf(community.name)}
        </span>
        <h3 className="truncate text-base font-semibold text-foreground">{community.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
          {community.description || "A community on AuraFlow."}
        </p>
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
            {formatCount(community.online_count || 0)} Online
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-muted-foreground" aria-hidden />
            {formatCount(members)} {members === 1 ? "Member" : "Members"}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function DiscoverCommunities() {
  const navigate = useNavigate();
  const { reloadCommunities } = useRealtime();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState<CategoryId>("home");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Community | null>(null);
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
      setLoadError(false);
    } catch (error) {
      console.error("Error fetching communities:", error);
      if (reset) setLoadError(true);
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

  const handleJoined = async (community: Community) => {
    setSelected(null);
    setCommunities((prev) => prev.filter((c) => c.id !== community.id));
    toast.success(`Welcome to ${community.name}`);
    await reloadCommunities();
    navigate(`/community/${community.id}`);
  };

  const filtered = useMemo(() => communities.filter((c) => matchesCategory(c, category)), [communities, category]);
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
        <CommunityCard key={c.id} community={c} onOpen={() => setSelected(c)} />
      ))}
    </div>
  );

  return (
    <div className="flex h-full bg-[hsl(var(--theme-bg-primary))]">
      {/* Discover sections (Discord: Apps / Servers). Agents live on their own page. */}
      <aside
        aria-label="Discover"
        className="hidden w-sidebar shrink-0 flex-col border-r border-border md:flex"
        style={{ background: "var(--theme-sidebar-gradient)" }}
      >
        <div className="flex h-12 shrink-0 items-center px-4">
          <h2 className="text-lg font-semibold text-foreground">Discover</h2>
        </div>
        <nav className="space-y-0.5 px-2">
          <span
            aria-current="page"
            className="flex h-10 items-center gap-3 rounded-md bg-[hsl(var(--theme-bg-active))] px-3 text-sm font-medium text-foreground"
          >
            <Users className="h-5 w-5" /> Communities
          </span>
        </nav>
        {/* Room for the floating user dock. */}
        <div aria-hidden className="mt-auto h-[72px] shrink-0" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Category tabs + search (Discord's discovery header) */}
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-4">
          <Compass className="hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" />
          <nav aria-label="Categories" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
            {CATEGORIES.map((cat) => {
              const active = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-12 shrink-0 items-center px-3 text-sm font-medium transition-colors duration-150",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {cat.label}
                  {active && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-foreground" />}
                </button>
              );
            })}
          </nav>
          <div className="relative w-36 shrink-0 sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search"
              aria-label="Search communities"
              className="h-8 w-full rounded-md bg-[hsl(var(--theme-input-bg))] pl-8 pr-8 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary [&::-webkit-search-cancel-button]:hidden"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => handleSearch("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1200px] px-4 pb-10 pt-4 sm:px-6">
            {/* Hero */}
            {category === "home" && !searchTerm.trim() && (
              <section className="relative isolate overflow-hidden rounded-lg" aria-label="Find your community">
                <img
                  src="/discover/hero.webp"
                  alt=""
                  className="absolute inset-0 -z-10 h-full w-full object-cover object-right"
                />
                <div aria-hidden className="absolute inset-0 -z-10 bg-black/30 sm:bg-transparent" />
                <div className="flex min-h-[220px] max-w-lg flex-col justify-center px-6 py-8 sm:min-h-[260px] sm:px-10">
                  <h1 className="font-display text-5xl uppercase leading-[0.95] tracking-wide text-white sm:text-6xl">Find your<br />people</h1>
                  <p className="mt-3 text-base text-white/85">From study groups to tech talks, there is a place for you.</p>
                </div>
              </section>
            )}

            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-base font-medium text-foreground">Couldn't load communities.</p>
                <button
                  type="button"
                  onClick={() => fetchCommunities(searchTerm.trim(), true)}
                  className="mt-4 h-8 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-[hsl(var(--theme-bg-hover))]"
                >
                  Try again
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Compass className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-base font-medium text-foreground">
                  {searchTerm.trim()
                    ? `No communities match "${searchTerm.trim()}"${category !== "home" ? ` in ${activeLabel}` : ""}.`
                    : category === "home"
                      ? "You've joined every public community."
                      : `No ${activeLabel} communities to join yet.`}
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
                      {searchTerm.trim() ? `Results for "${searchTerm.trim()}"` : featured.length > 0 ? "More communities" : activeLabel}
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
          </div>
        </main>
      </div>

      <JoinCommunityDialog community={selected} onOpenChange={(open) => !open && setSelected(null)} onJoined={handleJoined} />
    </div>
  );
}
