import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Users, Compass, Gamepad2, Music, Film, FlaskConical, GraduationCap,
  Sparkles, TrendingUp, Loader2, Plus, ChevronRight, Home, Verified,
  ArrowLeft, Hash, MessageSquare, Bot, Brain, Shield, Heart, BookOpen,
  Focus, Activity, Zap, Eye, Settings, ChevronDown, CheckCircle, Power
} from 'lucide-react';
import { channelService } from '@/services/channelService';
import { getAvatarUrl } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { useRealtime } from '@/hooks/useRealtime';
import { useAIAgents } from '@/contexts/AIAgentContext';
import type { Community } from '@/types';
import { API_SERVER } from '@/config/api';

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
  { id: 'servers', label: 'Servers', icon: Hash, active: false },
  { id: 'agents', label: 'AI Agents', icon: Bot, active: false },
];

export default function DiscoverCommunities({ onClose, onJoinCommunity }: DiscoverCommunitiesProps) {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const { currentCommunity } = useRealtime();
  const { agentStatus } = useAIAgents();
  const [activeSection, setActiveSection] = useState<'servers' | 'agents'>('servers');
  const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(true);
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
    return `${API_SERVER}${community.logo_url}`;
  };

  const getCommunityBannerUrl = (community: Community) => {
    if (!community.banner_url) return null;
    return `${API_SERVER}${community.banner_url}`;
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
      {/* Left Sidebar - Hidden on mobile */}
      <div className="hidden md:flex w-60 flex-shrink-0 border-r border-[hsl(var(--theme-border-default)/0.3)] flex-col bg-[hsl(var(--theme-bg-secondary)/0.3)]">
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
              onClick={() => setActiveSection(item.id as 'servers' | 'agents')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeSection === item.id
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
        {activeSection === 'agents' ? (
          /* AI Agents Section — full page matching Servers layout */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Sticky Navigation Bar */}
            <div className={`sticky top-0 z-30 transition-all duration-300 ${
              isScrolled
                ? 'bg-[hsl(var(--theme-bg-primary))] shadow-lg border-b border-[hsl(var(--theme-border-default)/0.3)]'
                : !isDarkMode
                  ? 'bg-[hsl(var(--theme-bg-primary)/0.85)] backdrop-blur-sm shadow-sm'
                  : 'bg-transparent'
            }`}>
              <div className={`h-12 flex items-center justify-center border-b transition-colors duration-300 ${
                isScrolled
                  ? 'border-[hsl(var(--theme-border-default)/0.3)]'
                  : !isDarkMode
                    ? 'border-[hsl(var(--theme-border-default)/0.2)]'
                    : 'border-white/5'
              }`}>
                <div className="flex items-center gap-2">
                  <Bot className={`w-5 h-5 transition-colors duration-300 ${
                    isScrolled
                      ? 'text-[hsl(var(--theme-text-secondary))]'
                      : !isDarkMode
                        ? 'text-[hsl(var(--theme-text-primary))]'
                        : 'text-white/80'
                  }`} />
                  <span className={`text-sm font-semibold ${
                    isScrolled
                      ? 'text-[hsl(var(--theme-text-primary))]'
                      : !isDarkMode
                        ? 'text-[hsl(var(--theme-text-primary))]'
                        : 'text-white'
                  }`}>AI Agents</span>
                </div>
              </div>
            </div>

            {/* Scrollable Content */}
            <div
              className="flex-1 overflow-y-auto"
              style={{ background: 'hsl(var(--theme-bg-primary))', scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--theme-bg-tertiary)) transparent' }}
              onScroll={(e) => {
                const scrollTop = (e.target as HTMLDivElement).scrollTop;
                setIsScrolled(scrollTop > 10);
              }}
            >
              {/* Hero Section */}
              <div className="relative">
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(140deg, #1a1a2e 0%, #16213e 20%, #0f3460 45%, #533483 70%, #7b2d8e 85%, #e94560 100%)',
                  }}
                />
                <div className="absolute inset-0 overflow-hidden">
                  <div className="absolute right-0 top-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px]" />
                  <div className="absolute -left-20 bottom-0 w-[400px] h-[400px] bg-blue-600/15 rounded-full blur-[80px]" />
                  {/* Subtle grid pattern */}
                  <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                </div>

                <div className="relative z-10 px-4 sm:px-8 pt-6 sm:pt-8 pb-8 sm:pb-12">
                  <h1
                    className="text-2xl sm:text-4xl lg:text-[48px] font-extrabold text-white mb-3 leading-[1.1] tracking-tight"
                    style={{
                      fontFamily: "'Ginto', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                      fontStyle: 'italic',
                      fontWeight: 900,
                      letterSpacing: '-0.5px',
                    }}
                  >
                    BUILT-IN INTELLIGENCE<br />FOR YOUR COMMUNITY
                  </h1>
                  <p className="text-white/70 text-[15px] max-w-lg">
                    Seven specialized agents that work behind the scenes — moderating, summarizing, and keeping your community healthy.
                  </p>
                </div>
              </div>

              {/* Content Below Hero */}
              <div style={{ background: 'hsl(var(--theme-bg-primary))' }}>
                <div className="p-6">

                  {/* Overview Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
                    {[
                      { label: 'Total Agents', value: '7', icon: Bot, accent: 'text-violet-400' },
                      { label: 'Categories', value: '4', icon: Activity, accent: 'text-blue-400' },
                      { label: 'Always On', value: '24/7', icon: Zap, accent: 'text-amber-400' },
                      { label: 'Zero Config', value: 'Ready', icon: CheckCircle, accent: 'text-emerald-400' },
                    ].map((stat, i) => (
                      <div key={i} className="p-4 rounded-xl border bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default)/0.5)]">
                        <stat.icon className={`w-5 h-5 mb-2 ${stat.accent}`} />
                        <p className="text-xl font-bold text-[hsl(var(--theme-text-primary))]">{stat.value}</p>
                        <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Core Agents Section */}
                  <div className="mb-10">
                    <h2 className="text-base font-semibold text-[hsl(var(--theme-text-primary))] mb-4 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[hsl(var(--theme-accent-primary))]" />
                      Core Agents
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Summarizer */}
                      <div
                        onClick={() => navigate('/agent/summarizer')}
                        className="group relative rounded-xl overflow-hidden border border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-bg-secondary)/0.5)] hover:border-blue-500/40 transition-all duration-300 hover:shadow-lg cursor-pointer"
                      >
                        <div className="relative h-28 overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 60%, #3b82f6 100%)' }}>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-[0.06]">
                            <Brain className="w-32 h-32" />
                          </div>
                        </div>
                        <div className="absolute left-4 top-20 w-14 h-14 rounded-xl overflow-hidden ring-4 ring-[hsl(var(--theme-bg-secondary))] shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                          <Brain className="w-7 h-7 text-white" />
                        </div>
                        <div className="pt-8 pb-4 px-4">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-sm text-[hsl(var(--theme-text-primary))]">Summarizer</h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Core</span>
                          </div>
                          <p className="text-xs text-[hsl(var(--theme-text-secondary))] line-clamp-2 mb-3 min-h-[32px]">
                            Condenses long conversations into clear, actionable recaps. Never miss what happened while you were away.
                          </p>
                          <div className="flex items-center gap-3 text-xs text-[hsl(var(--theme-text-muted))]">
                            <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-400" /> Auto-runs</span>
                            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Per-channel</span>
                          </div>
                        </div>
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                          <button className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center gap-2">
                            <Eye className="w-4 h-4" /> View Details
                          </button>
                        </div>
                      </div>

                      {/* Mood Tracker */}
                      <div
                        onClick={() => navigate('/agent/mood')}
                        className="group relative rounded-xl overflow-hidden border border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-bg-secondary)/0.5)] hover:border-pink-500/40 transition-all duration-300 hover:shadow-lg cursor-pointer"
                      >
                        <div className="relative h-28 overflow-hidden" style={{ background: 'linear-gradient(135deg, #831843 0%, #ec4899 60%, #f472b6 100%)' }}>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-[0.06]">
                            <Heart className="w-32 h-32" />
                          </div>
                        </div>
                        <div className="absolute left-4 top-20 w-14 h-14 rounded-xl overflow-hidden ring-4 ring-[hsl(var(--theme-bg-secondary))] shadow-lg bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center">
                          <Heart className="w-7 h-7 text-white" />
                        </div>
                        <div className="pt-8 pb-4 px-4">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-sm text-[hsl(var(--theme-text-primary))]">Mood Tracker</h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-pink-500/10 text-pink-400 border border-pink-500/20">Core</span>
                          </div>
                          <p className="text-xs text-[hsl(var(--theme-text-secondary))] line-clamp-2 mb-3 min-h-[32px]">
                            Reads the room in real time. Tracks sentiment shifts across conversations so you can stay ahead of issues.
                          </p>
                          <div className="flex items-center gap-3 text-xs text-[hsl(var(--theme-text-muted))]">
                            <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-400" /> Real-time</span>
                            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Sentiment</span>
                          </div>
                        </div>
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                          <button className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-pink-500 to-pink-600 hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center gap-2">
                            <Eye className="w-4 h-4" /> View Details
                          </button>
                        </div>
                      </div>

                      {/* Moderation */}
                      <div
                        onClick={() => navigate('/agent/moderation')}
                        className="group relative rounded-xl overflow-hidden border border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-bg-secondary)/0.5)] hover:border-red-500/40 transition-all duration-300 hover:shadow-lg cursor-pointer"
                      >
                        <div className="relative h-28 overflow-hidden" style={{ background: 'linear-gradient(135deg, #7f1d1d 0%, #ef4444 60%, #f87171 100%)' }}>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-[0.06]">
                            <Shield className="w-32 h-32" />
                          </div>
                        </div>
                        <div className="absolute left-4 top-20 w-14 h-14 rounded-xl overflow-hidden ring-4 ring-[hsl(var(--theme-bg-secondary))] shadow-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
                          <Shield className="w-7 h-7 text-white" />
                        </div>
                        <div className="pt-8 pb-4 px-4">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-sm text-[hsl(var(--theme-text-primary))]">Moderation</h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-500/10 text-red-400 border border-red-500/20">Safety</span>
                          </div>
                          <p className="text-xs text-[hsl(var(--theme-text-secondary))] line-clamp-2 mb-3 min-h-[32px]">
                            Filters harmful content, detects spam, and enforces community guidelines automatically. Owner-only controls.
                          </p>
                          <div className="flex items-center gap-3 text-xs text-[hsl(var(--theme-text-muted))]">
                            <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-red-400" /> Auto-filter</span>
                            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Logs</span>
                          </div>
                        </div>
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                          <button className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-red-500 to-red-600 hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center gap-2">
                            <Eye className="w-4 h-4" /> View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Insight & Growth Agents */}
                  <div className="mb-10">
                    <h2 className="text-xl font-bold text-[hsl(var(--theme-text-primary))] mb-5 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-[hsl(var(--theme-accent-primary))]" />
                      Insight & Growth
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {/* Engagement */}
                      <div
                        onClick={() => navigate('/agent/engagement')}
                        className="group relative rounded-xl overflow-hidden border border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-bg-secondary)/0.5)] hover:border-emerald-500/40 transition-all duration-300 hover:shadow-lg cursor-pointer"
                      >
                        <div className="relative h-28 overflow-hidden" style={{ background: 'linear-gradient(135deg, #064e3b 0%, #10b981 60%, #34d399 100%)' }}>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-[0.06]">
                            <TrendingUp className="w-32 h-32" />
                          </div>
                        </div>
                        <div className="absolute left-4 top-20 w-14 h-14 rounded-xl overflow-hidden ring-4 ring-[hsl(var(--theme-bg-secondary))] shadow-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                          <TrendingUp className="w-7 h-7 text-white" />
                        </div>
                        <div className="pt-8 pb-4 px-4">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-sm text-[hsl(var(--theme-text-primary))]">Engagement</h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Growth</span>
                          </div>
                          <p className="text-xs text-[hsl(var(--theme-text-secondary))] line-clamp-2 mb-3 min-h-[32px]">
                            Surfaces activity trends, peak hours, and top contributors. Know what drives your community forward.
                          </p>
                          <div className="flex items-center gap-3 text-xs text-[hsl(var(--theme-text-muted))]">
                            <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-emerald-400" /> Analytics</span>
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Leaderboard</span>
                          </div>
                        </div>
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                          <button className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center gap-2">
                            <Eye className="w-4 h-4" /> View Details
                          </button>
                        </div>
                      </div>

                      {/* Wellness */}
                      <div
                        onClick={() => navigate('/agent/wellness')}
                        className="group relative rounded-xl overflow-hidden border border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-bg-secondary)/0.5)] hover:border-purple-500/40 transition-all duration-300 hover:shadow-lg cursor-pointer"
                      >
                        <div className="relative h-28 overflow-hidden" style={{ background: 'linear-gradient(135deg, #4c1d95 0%, #8b5cf6 60%, #a78bfa 100%)' }}>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-[0.06]">
                            <Heart className="w-32 h-32" />
                          </div>
                        </div>
                        <div className="absolute left-4 top-20 w-14 h-14 rounded-xl overflow-hidden ring-4 ring-[hsl(var(--theme-bg-secondary))] shadow-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                          <Heart className="w-7 h-7 text-white" />
                        </div>
                        <div className="pt-8 pb-4 px-4">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-sm text-[hsl(var(--theme-text-primary))]">Wellness</h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">Wellbeing</span>
                          </div>
                          <p className="text-xs text-[hsl(var(--theme-text-secondary))] line-clamp-2 mb-3 min-h-[32px]">
                            Tracks community wellbeing and surfaces patterns that may need attention. Proactive, not reactive.
                          </p>
                          <div className="flex items-center gap-3 text-xs text-[hsl(var(--theme-text-muted))]">
                            <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-purple-400" /> Wellness</span>
                            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Trends</span>
                          </div>
                        </div>
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                          <button className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-purple-500 to-purple-600 hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center gap-2">
                            <Eye className="w-4 h-4" /> View Details
                          </button>
                        </div>
                      </div>

                      {/* Knowledge Builder */}
                      <div
                        onClick={() => navigate('/agent/knowledge')}
                        className="group relative rounded-xl overflow-hidden border border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-bg-secondary)/0.5)] hover:border-indigo-500/40 transition-all duration-300 hover:shadow-lg cursor-pointer"
                      >
                        <div className="relative h-28 overflow-hidden" style={{ background: 'linear-gradient(135deg, #312e81 0%, #6366f1 60%, #818cf8 100%)' }}>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-[0.06]">
                            <BookOpen className="w-32 h-32" />
                          </div>
                        </div>
                        <div className="absolute left-4 top-20 w-14 h-14 rounded-xl overflow-hidden ring-4 ring-[hsl(var(--theme-bg-secondary))] shadow-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center">
                          <BookOpen className="w-7 h-7 text-white" />
                        </div>
                        <div className="pt-8 pb-4 px-4">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-sm text-[hsl(var(--theme-text-primary))]">Knowledge Builder</h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Learn</span>
                          </div>
                          <p className="text-xs text-[hsl(var(--theme-text-secondary))] line-clamp-2 mb-3 min-h-[32px]">
                            Extracts Q&A pairs and builds a searchable knowledge base from your conversations over time.
                          </p>
                          <div className="flex items-center gap-3 text-xs text-[hsl(var(--theme-text-muted))]">
                            <span className="flex items-center gap-1"><BookOpen className="w-3 h-3 text-indigo-400" /> Q&A</span>
                            <span className="flex items-center gap-1"><Search className="w-3 h-3" /> Searchable</span>
                          </div>
                        </div>
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                          <button className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-indigo-500 to-indigo-600 hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center gap-2">
                            <Eye className="w-4 h-4" /> View Details
                          </button>
                        </div>
                      </div>

                      {/* Focus */}
                      <div
                        onClick={() => navigate('/agent/focus')}
                        className="group relative rounded-xl overflow-hidden border border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-bg-secondary)/0.5)] hover:border-orange-500/40 transition-all duration-300 hover:shadow-lg cursor-pointer"
                      >
                        <div className="relative h-28 overflow-hidden" style={{ background: 'linear-gradient(135deg, #7c2d12 0%, #f97316 60%, #fb923c 100%)' }}>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-[0.06]">
                            <Focus className="w-32 h-32" />
                          </div>
                        </div>
                        <div className="absolute left-4 top-20 w-14 h-14 rounded-xl overflow-hidden ring-4 ring-[hsl(var(--theme-bg-secondary))] shadow-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                          <Focus className="w-7 h-7 text-white" />
                        </div>
                        <div className="pt-8 pb-4 px-4">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-sm text-[hsl(var(--theme-text-primary))]">Focus</h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">Productivity</span>
                          </div>
                          <p className="text-xs text-[hsl(var(--theme-text-secondary))] line-clamp-2 mb-3 min-h-[32px]">
                            Helps members stay on track with productivity insights. Tracks focus sessions and distraction patterns.
                          </p>
                          <div className="flex items-center gap-3 text-xs text-[hsl(var(--theme-text-muted))]">
                            <span className="flex items-center gap-1"><Focus className="w-3 h-3 text-orange-400" /> Sessions</span>
                            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Tracking</span>
                          </div>
                        </div>
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                          <button className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center gap-2">
                            <Eye className="w-4 h-4" /> View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* How It Works Section */}
                  <div className="mb-10">
                    <h2 className="text-xl font-bold text-[hsl(var(--theme-text-primary))] mb-5 flex items-center gap-2">
                      <Settings className="w-5 h-5 text-[hsl(var(--theme-text-muted))]" />
                      How It Works
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-5 rounded-xl border bg-[hsl(var(--theme-bg-secondary)/0.3)] border-[hsl(var(--theme-border-default)/0.4)]">
                        <div className="w-8 h-8 rounded-lg bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-accent-primary))] flex items-center justify-center font-bold text-sm mb-3">1</div>
                        <h3 className="font-semibold text-sm text-[hsl(var(--theme-text-primary))] mb-1">Select a Community</h3>
                        <p className="text-xs text-[hsl(var(--theme-text-muted))] leading-relaxed">
                          Pick any community you own or admin from the sidebar. Agents are scoped per community.
                        </p>
                      </div>
                      <div className="p-5 rounded-xl border bg-[hsl(var(--theme-bg-secondary)/0.3)] border-[hsl(var(--theme-border-default)/0.4)]">
                        <div className="w-8 h-8 rounded-lg bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-accent-primary))] flex items-center justify-center font-bold text-sm mb-3">2</div>
                        <h3 className="font-semibold text-sm text-[hsl(var(--theme-text-primary))] mb-1">Enable & Configure</h3>
                        <p className="text-xs text-[hsl(var(--theme-text-muted))] leading-relaxed">
                          Toggle agents on or off, adjust sensitivity thresholds, and set notification preferences.
                        </p>
                      </div>
                      <div className="p-5 rounded-xl border bg-[hsl(var(--theme-bg-secondary)/0.3)] border-[hsl(var(--theme-border-default)/0.4)]">
                        <div className="w-8 h-8 rounded-lg bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-accent-primary))] flex items-center justify-center font-bold text-sm mb-3">3</div>
                        <h3 className="font-semibold text-sm text-[hsl(var(--theme-text-primary))] mb-1">Sit Back & Monitor</h3>
                        <p className="text-xs text-[hsl(var(--theme-text-muted))] leading-relaxed">
                          Agents run automatically. Check dashboards for insights, summaries, and moderation logs anytime.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* CTA - Select Community */}
                  {!currentCommunity && (
                    <div className="mb-8 p-6 rounded-2xl border bg-[hsl(var(--theme-bg-secondary)/0.4)] border-[hsl(var(--theme-border-default)/0.5)] text-center">
                      <Bot className="w-10 h-10 mx-auto mb-3 text-[hsl(var(--theme-accent-primary))]" />
                      <h3 className="font-bold text-[hsl(var(--theme-text-primary))] mb-1">Ready to get started?</h3>
                      <p className="text-sm text-[hsl(var(--theme-text-secondary))] mb-4 max-w-md mx-auto">
                        Select a community from the sidebar to activate and configure agents for your channels.
                      </p>
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>
        ) : (
        <>
        {/* Sticky Navigation Bar */}
        <div 
          className={`sticky top-0 z-30 transition-all duration-300 ${
            isScrolled 
              ? 'bg-[hsl(var(--theme-bg-primary))] shadow-lg border-b border-[hsl(var(--theme-border-default)/0.3)]' 
              : !isDarkMode 
                ? 'bg-[hsl(var(--theme-bg-primary)/0.85)] backdrop-blur-sm shadow-sm' 
                : 'bg-transparent'
          }`}
        >
          {/* Top Header */}
          <div className={`h-12 flex items-center justify-center border-b transition-colors duration-300 ${
            isScrolled 
              ? 'border-[hsl(var(--theme-border-default)/0.3)]' 
              : !isDarkMode 
                ? 'border-[hsl(var(--theme-border-default)/0.2)]' 
                : 'border-white/5'
          }`}>
            <div className="flex items-center gap-2">
              <Compass className={`w-5 h-5 transition-colors duration-300 ${
                isScrolled 
                  ? 'text-[hsl(var(--theme-text-secondary))]' 
                  : !isDarkMode 
                    ? 'text-[hsl(var(--theme-text-primary))]' 
                    : 'text-white/80'
              }`} />
              <span className={`text-sm font-semibold ${
                isScrolled 
                  ? 'text-[hsl(var(--theme-text-primary))]' 
                  : !isDarkMode 
                    ? 'text-[hsl(var(--theme-text-primary))]' 
                    : 'text-white'
              }`}>Discover</span>
            </div>
          </div>

          {/* Category Navigation */}
          <div className="px-3 sm:px-6 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none flex-1 min-w-0">
              <Home className={`w-5 h-5 mr-2 sm:mr-3 flex-shrink-0 transition-colors duration-300 ${
                isScrolled 
                  ? 'text-[hsl(var(--theme-text-secondary))]' 
                  : !isDarkMode 
                    ? 'text-[hsl(var(--theme-text-secondary))]' 
                    : 'text-white/90'
              }`} />
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex-shrink-0 px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 ${
                    selectedCategory === cat.id
                      ? isScrolled 
                        ? 'bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-accent-primary))]' 
                        : !isDarkMode
                          ? 'bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-accent-primary))]'
                          : 'bg-white/15 text-white'
                      : isScrolled 
                        ? 'text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]' 
                        : !isDarkMode
                          ? 'text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-36 sm:w-48 flex-shrink-0">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-300 ${
                isScrolled 
                  ? 'text-[hsl(var(--theme-text-muted))]' 
                  : !isDarkMode 
                    ? 'text-[hsl(var(--theme-text-muted))]' 
                    : 'text-white/40'
              }`} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search"
                className={`w-full pl-9 pr-3 py-1.5 rounded text-sm border-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] transition-all ${
                  isScrolled || !isDarkMode
                    ? 'bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))]' 
                    : 'bg-[#1e1f22]/60 text-white placeholder-white/40'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto" 
          style={{ background: 'hsl(var(--theme-bg-primary))', scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--theme-bg-tertiary)) transparent' }}
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
            <div className="relative z-10 px-4 sm:px-8 pt-6 sm:pt-8 pb-8 sm:pb-12">
              <h1 
                className="text-2xl sm:text-4xl lg:text-[48px] font-extrabold text-white mb-3 leading-[1.1] tracking-tight"
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
                      const bannerUrl = getCommunityBannerUrl(community);
                      return (
                        <div
                          key={community.id}
                          className="group relative rounded-lg overflow-hidden bg-[hsl(var(--theme-bg-secondary))] hover:shadow-xl transition-all duration-300 cursor-pointer"
                          onClick={() => handleJoin(community.id)}
                        >
                          {/* Banner Image/Gradient */}
                          <div className="relative h-36 overflow-hidden">
                            {bannerUrl ? (
                              <img 
                                src={bannerUrl} 
                                alt={`${community.name} banner`}
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                            ) : (
                              <div 
                                className="absolute inset-0"
                                style={{
                                  background: `linear-gradient(135deg, ${community.color || '#5865f2'} 0%, #eb459f 50%, #fee75c 100%)`,
                                }}
                              />
                            )}
                            {/* Overlay gradient for text readability */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                            {/* Decorative shapes (only when no banner) */}
                            {!bannerUrl && (
                              <div className="absolute inset-0 opacity-30">
                                <div className="absolute right-0 top-0 w-32 h-32 bg-white/20 rounded-full -translate-y-1/2 translate-x-1/2" />
                                <div className="absolute left-1/4 bottom-0 w-24 h-24 bg-black/10 rounded-full translate-y-1/2" />
                              </div>
                            )}
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
                      const bannerUrl = getCommunityBannerUrl(community);
                      return (
                        <div
                          key={community.id}
                          className="group relative rounded-xl overflow-hidden border border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-bg-secondary)/0.5)] hover:border-[hsl(var(--theme-accent-primary)/0.5)] transition-all duration-300 hover:shadow-lg"
                        >
                          {/* Banner */}
                          <div className="relative h-28 overflow-hidden">
                            {bannerUrl ? (
                              <img 
                                src={bannerUrl} 
                                alt={`${community.name} banner`}
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                            ) : (
                              <div 
                                className="absolute inset-0"
                                style={{ 
                                  background: community.color 
                                    ? `linear-gradient(135deg, ${community.color}, ${community.color}88)` 
                                    : 'linear-gradient(135deg, hsl(var(--theme-accent-primary)), hsl(var(--theme-accent-secondary)))' 
                                }}
                              />
                            )}
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
        </>
        )}
      </div>
    </div>
  );
}
