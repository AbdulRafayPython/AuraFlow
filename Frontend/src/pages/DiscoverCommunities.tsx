import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Users, Compass, Gamepad2, Music, Film, FlaskConical, GraduationCap,
  Sparkles, TrendingUp, Loader2, Plus, ChevronRight, Home, Verified,
  ArrowLeft, Hash, MessageSquare
} from 'lucide-react';
import { channelService } from '@/services/channelService';
import { getAvatarUrl } from '@/lib/utils';
import type { Community } from '@/types';

interface DiscoverCommunitiesProps {
  onClose?: () => void;
  onJoinCommunity?: (communityId: number) => Promise<void>;
}

const CATEGORIES = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'gaming', label: 'Gaming', icon: Gamepad2 },
  { id: 'music', label: 'Music', icon: Music },
  { id: 'entertainment', label: 'Entertainment', icon: Film },
  { id: 'science', label: 'Science & Tech', icon: FlaskConical },
  { id: 'education', label: 'Education', icon: GraduationCap },
];

const SIDEBAR_ITEMS = [
  { id: 'servers', label: 'Servers', icon: Hash, active: true },
];

export default function DiscoverCommunities({ onClose, onJoinCommunity }: DiscoverCommunitiesProps) {
  const navigate = useNavigate();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [featuredCommunities, setFeaturedCommunities] = useState<Community[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('home');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  // Fetch communities
  const fetchCommunities = useCallback(async (search: string = '', reset: boolean = false) => {
    if (reset) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const currentOffset = reset ? 0 : offset;
      const results = await channelService.discoverCommunities(search, 12, currentOffset);

      if (reset) {
        setCommunities(results);
        // Set featured as first 3 with most members
        const sorted = [...results].sort((a, b) => (b.member_count || 0) - (a.member_count || 0));
        setFeaturedCommunities(sorted.slice(0, 3));
        setOffset(12);
      } else {
        setCommunities(prev => [...prev, ...results]);
        setOffset(prev => prev + 12);
      }

      setHasMore(results.length === 12);
    } catch (error) {
      console.error('Error fetching communities:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [offset]);

  // Initial load
  useEffect(() => {
    fetchCommunities('', true);
  }, []);

  // Handle search with debounce
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setOffset(0);
      fetchCommunities(value, true);
    }, 300);
  };

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && !isLoadingMore) {
          fetchCommunities(searchTerm);
        }
      },
      { threshold: 0.1 }
    );

    const current = observerTarget.current;
    if (current) observer.observe(current);
    return () => { if (current) observer.unobserve(current); };
  }, [hasMore, isLoading, isLoadingMore, searchTerm, fetchCommunities]);

  // Handle join community
  const handleJoin = async (communityId: number) => {
    setJoiningId(communityId);
    try {
      if (onJoinCommunity) {
        await onJoinCommunity(communityId);
      } else {
        await channelService.joinCommunity(communityId);
      }
      setCommunities(prev => prev.filter(c => c.id !== communityId));
      setFeaturedCommunities(prev => prev.filter(c => c.id !== communityId));
    } catch (error) {
      console.error('Error joining community:', error);
    } finally {
      setJoiningId(null);
    }
  };

  const getCommunityLogoUrl = (community: Community) => {
    if (!community.logo_url) return null;
    return `${import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000'}${community.logo_url}`;
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatMemberCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
    return count.toString();
  };

  return (
    <div className="h-full flex" style={{ background: 'var(--theme-bg-gradient)' }}>
      {/* Left Sidebar */}
      <div className="w-60 flex-shrink-0 border-r border-[hsl(var(--theme-border-default)/0.3)] flex flex-col bg-[hsl(var(--theme-bg-secondary)/0.3)]">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-[hsl(var(--theme-border-default)/0.3)]">
          <h2 className="text-xl font-bold text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
            <Compass className="w-6 h-6 text-[hsl(var(--theme-accent-primary))]" />
            Discover
          </h2>
        </div>

        {/* Sidebar Items */}
        <div className="flex-1 p-3 space-y-1">
          {SIDEBAR_ITEMS.map(item => (
            <button
              key={item.id}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                item.active
                  ? 'bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-primary))]'
                  : 'text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))]'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'hsl(var(--theme-bg-primary))' }}>
        {/* Sticky Navigation Bar */}
        <div 
          className={`sticky top-0 z-30 transition-all duration-300 ${
            isScrolled 
              ? 'bg-[#111214] shadow-lg' 
              : 'bg-transparent'
          }`}
        >
          {/* Top Header */}
          <div className={`h-12 flex items-center justify-center border-b transition-colors duration-300 ${
            isScrolled ? 'border-[#1e1f22]' : 'border-white/5'
          }`}>
            <div className="flex items-center gap-2">
              <Compass className={`w-5 h-5 transition-colors duration-300 ${isScrolled ? 'text-white/70' : 'text-white/80'}`} />
              <span className="text-sm font-semibold text-white">Discover</span>
            </div>
          </div>

          {/* Category Navigation */}
          <div className="px-6 py-2 flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              <Home className={`w-5 h-5 mr-3 transition-colors duration-300 ${isScrolled ? 'text-white/70' : 'text-white/90'}`} />
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                    selectedCategory === cat.id
                      ? isScrolled ? 'bg-white/10 text-white' : 'bg-white/15 text-white'
                      : isScrolled ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-48">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-300 ${isScrolled ? 'text-white/30' : 'text-white/40'}`} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search"
                className={`w-full pl-9 pr-3 py-1.5 rounded text-sm border-none text-white placeholder-white/40 focus:outline-none transition-all ${
                  isScrolled ? 'bg-[#1e1f22]' : 'bg-[#1e1f22]/60'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto" 
          style={{ background: 'hsl(var(--theme-bg-primary))' }}
          onScroll={(e) => {
            const scrollTop = (e.target as HTMLDivElement).scrollTop;
            setIsScrolled(scrollTop > 10);
          }}
        >
          {/* Hero Section - Now scrollable */}
          <div className="relative">
            {/* Hero Background - Blue/Purple gradient like Discord */}
            <div 
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(140deg, #5865f2 0%, #7289da 15%, #5865f2 30%, #4752c4 50%, #3c45a5 70%, #2d3494 85%, #1e2371 100%)',
              }}
            />
            
            {/* Decorative blur elements */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute right-0 top-0 w-[500px] h-[500px] bg-[#eb459e]/15 rounded-full blur-[100px]" />
              <div className="absolute -left-20 bottom-0 w-[400px] h-[400px] bg-[#5865f2]/40 rounded-full blur-[80px]" />
            </div>

            {/* Hero Content - Reduced height */}
            <div className="relative z-10 px-8 pt-8 pb-12">
              <h1 
                className="text-[48px] font-extrabold text-white mb-3 leading-[1.1] tracking-tight"
                style={{ 
                  fontFamily: "'Ginto', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                  fontStyle: 'italic',
                  fontWeight: 900,
                  letterSpacing: '-0.5px',
                }}
              >
                FIND YOUR COMMUNITY<br />ON AURAFLOW
              </h1>
              <p className="text-white/70 text-[15px] max-w-lg">
                From gaming, to music, to learning, there's a place for you.
              </p>
            </div>
          </div>

          {/* Content Below Hero */}
          <div style={{ background: 'hsl(var(--theme-bg-primary))' }}>
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--theme-accent-primary))]" />
              </div>
            ) : (
              <div className="p-6">
                {/* Featured Communities */}
                {selectedCategory === 'home' && !searchTerm && featuredCommunities.length > 0 && (
                <div className="mb-10">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-[hsl(var(--theme-text-primary))]">
                      Featured Servers
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {featuredCommunities.map((community) => {
                      const logoUrl = getCommunityLogoUrl(community);
                      return (
                        <div
                          key={community.id}
                          className="group relative rounded-lg overflow-hidden bg-[hsl(var(--theme-bg-secondary))] hover:shadow-xl transition-all duration-300 cursor-pointer"
                          onClick={() => handleJoin(community.id)}
                        >
                          {/* Banner Image/Gradient */}
                          <div className="relative h-36 overflow-hidden">
                            <div 
                              className="absolute inset-0"
                              style={{
                                background: `linear-gradient(135deg, ${community.color || '#5865f2'} 0%, #eb459f 50%, #fee75c 100%)`,
                              }}
                            />
                            {/* Decorative shapes */}
                            <div className="absolute inset-0 opacity-30">
                              <div className="absolute right-0 top-0 w-32 h-32 bg-white/20 rounded-full -translate-y-1/2 translate-x-1/2" />
                              <div className="absolute left-1/4 bottom-0 w-24 h-24 bg-black/10 rounded-full translate-y-1/2" />
                            </div>
                          </div>

                          {/* Community Icon */}
                          <div className="absolute left-4 top-[108px] w-12 h-12 rounded-2xl overflow-hidden ring-4 ring-[hsl(var(--theme-bg-secondary))] shadow-lg">
                            {logoUrl ? (
                              <img src={logoUrl} alt={community.name} className="w-full h-full object-cover" />
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center text-white font-bold text-sm"
                                style={{ backgroundColor: community.color || '#5865f2' }}
                              >
                                {community.icon || getInitials(community.name)}
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="pt-8 pb-4 px-4">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Verified className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                              <h3 className="font-semibold text-[hsl(var(--theme-text-primary))] truncate text-sm">
                                {community.name}
                              </h3>
                            </div>

                            <p className="text-xs text-[hsl(var(--theme-text-secondary))] line-clamp-2 mb-3 min-h-[32px]">
                              {community.description || 'A great community to join!'}
                            </p>

                            <div className="flex items-center gap-3 text-xs text-[hsl(var(--theme-text-muted))]">
                              <div className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span>{formatMemberCount(Math.floor((community.member_count || 1) * 0.3))} Online</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                <span>{formatMemberCount(community.member_count || 0)} Members</span>
                              </div>
                            </div>
                          </div>

                          {/* Loading overlay when joining */}
                          {joiningId === community.id && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                              <Loader2 className="w-6 h-6 animate-spin text-white" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}

                {/* All Communities */}
                <div>
                <h2 className="text-xl font-bold text-[hsl(var(--theme-text-primary))] mb-5 flex items-center gap-2">
                  {searchTerm ? (
                    <>
                      <Search className="w-5 h-5 text-[hsl(var(--theme-text-muted))]" />
                      Search Results
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-5 h-5 text-[hsl(var(--theme-accent-primary))]" />
                      Popular Communities
                    </>
                  )}
                </h2>

                {communities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Compass className="w-16 h-16 text-[hsl(var(--theme-text-muted))] mb-4" />
                    <p className="text-lg font-medium text-[hsl(var(--theme-text-secondary))]">
                      {searchTerm ? 'No communities found' : 'No communities available yet'}
                    </p>
                    <p className="text-sm text-[hsl(var(--theme-text-muted))] mt-1">
                      {searchTerm ? 'Try a different search term' : 'Be the first to create one!'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {communities.map((community) => {
                      const logoUrl = getCommunityLogoUrl(community);
                      return (
                        <div
                          key={community.id}
                          className="group relative rounded-xl overflow-hidden border border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-bg-secondary)/0.5)] hover:border-[hsl(var(--theme-accent-primary)/0.5)] transition-all duration-300 hover:shadow-lg"
                        >
                          {/* Banner */}
                          <div 
                            className="relative h-28 overflow-hidden"
                            style={{ 
                              background: community.color 
                                ? `linear-gradient(135deg, ${community.color}, ${community.color}88)` 
                                : 'linear-gradient(135deg, hsl(var(--theme-accent-primary)), hsl(var(--theme-accent-secondary)))' 
                            }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                          </div>

                          {/* Community Icon */}
                          <div className="absolute left-4 top-20 w-14 h-14 rounded-xl overflow-hidden ring-4 ring-[hsl(var(--theme-bg-secondary))] shadow-lg">
                            {logoUrl ? (
                              <img src={logoUrl} alt={community.name} className="w-full h-full object-cover" />
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center text-white font-bold"
                                style={{ backgroundColor: community.color || '#5865f2' }}
                              >
                                {community.icon || getInitials(community.name)}
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="pt-8 pb-4 px-4">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-[hsl(var(--theme-text-primary))] truncate text-sm">
                                {community.name}
                              </h3>
                              {(community.member_count || 0) >= 100 && (
                                <Verified className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                              )}
                            </div>

                            <p className="text-xs text-[hsl(var(--theme-text-secondary))] line-clamp-2 mb-3 min-h-[32px]">
                              {community.description || 'A community on AuraFlow'}
                            </p>

                            <div className="flex items-center gap-3 text-xs text-[hsl(var(--theme-text-muted))]">
                              <div className="flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>Online</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                <span>{formatMemberCount(community.member_count || 0)} Members</span>
                              </div>
                            </div>
                          </div>

                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                            <button
                              onClick={() => handleJoin(community.id)}
                              disabled={joiningId === community.id}
                              className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-60 flex items-center gap-2"
                            >
                              {joiningId === community.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Joining...
                                </>
                              ) : (
                                <>
                                  <Plus className="w-4 h-4" />
                                  Join
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Load more */}
                {hasMore && communities.length > 0 && (
                  <div ref={observerTarget} className="py-8 flex justify-center">
                    {isLoadingMore && (
                      <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--theme-accent-primary))]" />
                    )}
                  </div>
                )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
