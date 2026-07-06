// F5 — Explore by Outcome.
// Two outcome lanes ("For my community" / "For me") replace the static agent
// grid that was demolished in F1. Outcome cards explain the problem each
// autonomous agent solves with a miniature simulation, control owner, and
// visibility scope. Community discovery cards advertise intelligence-profile
// badges derived locally — no new backend field. Per
// docs/AUTONOMOUS_AGENT_FRONTEND_REDESIGN.md §9 / §16/F5.
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Users, Compass, Gamepad2, Music, Film, FlaskConical, GraduationCap,
  TrendingUp, Loader2, Plus, Home, Verified, Hash,
  Shield, HandHeart, BookOpen, Crosshair, FileText, Languages,
  Sparkles, Heart, Smile, MessageSquare,
} from 'lucide-react';
import { channelService } from '@/services/channelService';
import { useTheme } from '@/contexts/ThemeContext';
import { useRealtime } from '@/hooks/useRealtime';
import type { Community } from '@/types';
import { API_SERVER } from '@/config/api';
import VisibilityChip, { AgentVisibility } from '@/components/ai-agents/VisibilityChip';
import { accentFor, accentSoftFor, shortCode, agentLabel, AgentName } from '@/components/ai-agents/AgentAccent';

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
];

// --- F5 outcome-lane data ------------------------------------------------
//
// Outcome cards never call the backend. Each one names the agent that
// powers it (drives the accent + short code), describes the problem in
// plain user language, gives one to three mock chat lines, and pins
// control + visibility.
//
// Keep the simulations short and concrete. They are read at a glance.

type SimLine =
  | { kind: 'user';  who: string; text: string }
  | { kind: 'agent'; agent: AgentName; text: string };

interface OutcomeCard {
  id: string;
  /** Who acts on this outcome. */
  scope: 'community' | 'personal';
  /** Drives accent + short code in the sim strip. */
  agent: AgentName;
  /** Lane heading icon. */
  Icon: typeof Shield;
  /** The promise. Imperative, 2–4 words. */
  title: string;
  /** One sentence describing the problem this solves. */
  problem: string;
  /** Where users will see the effect. */
  surface: string;
  /** Two-line miniature simulation. */
  sim: SimLine[];
  /** Owner of the control. */
  controller: 'Admin' | 'You';
  /** Visibility scope of the action this outcome produces. */
  visibility: AgentVisibility;
}

const COMMUNITY_OUTCOMES: OutcomeCard[] = [
  {
    id: 'protect',
    scope: 'community',
    agent: 'moderation',
    Icon: Shield,
    title: 'Protect discussions',
    problem: 'Heated threads escalate before a human moderator notices.',
    surface: 'Inline composer hint + admin Safety tab',
    sim: [
      { kind: 'user',  who: 'alex',       text: 'this is honestly the dumbest take I\'ve ever read' },
      { kind: 'agent', agent: 'moderation', text: 'Softened "dumbest take" — reason: personal attack. Author can override.' },
    ],
    controller: 'Admin',
    visibility: 'admins-only',
  },
  {
    id: 'welcome',
    scope: 'community',
    agent: 'auto_message',
    Icon: HandHeart,
    title: 'Help newcomers settle in',
    problem: 'New joiners drop off before they post their first message.',
    surface: '#welcome channel + DM nudge',
    sim: [
      { kind: 'agent', agent: 'auto_message', text: 'Hi @priya — start in #intro, pinned post explains how recaps work.' },
    ],
    controller: 'Admin',
    visibility: 'private-dm',
  },
  {
    id: 'answer',
    scope: 'community',
    agent: 'support',
    Icon: BookOpen,
    title: 'Answer repeated questions',
    problem: 'The same setup questions get asked every week.',
    surface: 'Inline support chip beneath the question',
    sim: [
      { kind: 'user',  who: 'mira',    text: 'how do I export my notes?' },
      { kind: 'agent', agent: 'support', text: 'Likely answer from pinned FAQ — Settings → Export. Helpful?' },
    ],
    controller: 'Admin',
    visibility: 'public-in-channel',
  },
  {
    id: 'focus',
    scope: 'community',
    agent: 'focus',
    Icon: Crosshair,
    title: 'Keep channels focused',
    problem: 'Side-quests bury the original question in long threads.',
    surface: 'Focus drift card inline + Focus rail tab',
    sim: [
      { kind: 'agent', agent: 'focus', text: 'Thread drifted from "deployment errors" → "weekend plans". Spin up a side thread?' },
    ],
    controller: 'Admin',
    visibility: 'public-in-channel',
  },
  {
    id: 'recap',
    scope: 'community',
    agent: 'summarizer',
    Icon: FileText,
    title: 'Catch people up quickly',
    problem: 'Returning members scroll hundreds of messages to catch up.',
    surface: 'Summary checkpoints + Recap rail tab',
    sim: [
      { kind: 'agent', agent: 'summarizer', text: 'Since you were last here: 3 decisions, 2 open questions, 1 vote closing today.' },
    ],
    controller: 'Admin',
    visibility: 'public-in-channel',
  },
  {
    id: 'multilingual',
    scope: 'community',
    agent: 'translator',
    Icon: Languages,
    title: 'Support multilingual communities',
    problem: 'Members miss replies posted in a language they don\'t read.',
    surface: 'Per-viewer translation footer on each message',
    sim: [
      { kind: 'user',  who: 'lucia',      text: '¿alguien probó la nueva versión?' },
      { kind: 'agent', agent: 'translator', text: 'Translation for you: "Has anyone tried the new version?"' },
    ],
    controller: 'Admin',
    visibility: 'you-only',
  },
];

const PERSONAL_OUTCOMES: OutcomeCard[] = [
  {
    id: 'assistant',
    scope: 'personal',
    agent: 'assistant',
    Icon: Sparkles,
    title: 'My Assistant',
    problem: 'You need help drafting, recalling, or planning without leaving chat.',
    surface: 'Assistant panel + composer slash commands',
    sim: [
      { kind: 'user',  who: 'you',         text: '/assistant draft a status update for the kickoff' },
      { kind: 'agent', agent: 'assistant', text: 'Draft ready. Tone: concise. Tap to edit before sending.' },
    ],
    controller: 'You',
    visibility: 'you-only',
  },
  {
    id: 'personal-summaries',
    scope: 'personal',
    agent: 'summarizer',
    Icon: FileText,
    title: 'Personal summaries',
    problem: 'You want one recap of everything that happened while you were away.',
    surface: 'Daily digest in your DMs',
    sim: [
      { kind: 'agent', agent: 'summarizer', text: 'Overnight: 4 channels active, 2 mentions for you, 1 thread you started got 6 replies.' },
    ],
    controller: 'You',
    visibility: 'private-dm',
  },
  {
    id: 'mood',
    scope: 'personal',
    agent: 'mood_tracker',
    Icon: Smile,
    title: 'Mood tracking',
    problem: 'You want a private read on how the week is going without journaling.',
    surface: 'Personal Automations · Mood module',
    sim: [
      { kind: 'agent', agent: 'mood_tracker', text: 'This week reads steadier than last. No one else sees this.' },
    ],
    controller: 'You',
    visibility: 'you-only',
  },
  {
    id: 'wellness',
    scope: 'personal',
    agent: 'wellness',
    Icon: Heart,
    title: 'Wellness support',
    problem: 'You\'d like a gentle nudge when the day looks rough — never in public.',
    surface: 'DM only — never in channel',
    sim: [
      { kind: 'agent', agent: 'wellness', text: 'Three late nights in a row — want a 10-minute wind-down playlist?' },
    ],
    controller: 'You',
    visibility: 'private-dm',
  },
  {
    id: 'translator',
    scope: 'personal',
    agent: 'translator',
    Icon: MessageSquare,
    title: 'Translator',
    problem: 'You want messages in your preferred language without asking the author.',
    surface: 'Per-viewer footer beneath each message',
    sim: [
      { kind: 'agent', agent: 'translator', text: 'Showing English under each non-English message. Only you see this.' },
    ],
    controller: 'You',
    visibility: 'you-only',
  },
];

// Intelligence-profile badges shown on community discovery cards.
// Backed by `communities.intelligence_profile` (G1c): a JSON array admins can
// override, falling back to a heuristic over installed-and-enabled community
// agents (moderation→safe, summarizer→recaps, translator→multilingual).
// Admin override UI lives elsewhere — this surface is read-only.
const INTEL_BADGES = [
  { id: 'safe',         label: 'Safe Space',    agent: 'moderation' as AgentName, Icon: Shield },
  { id: 'recaps',       label: 'Daily Recaps',  agent: 'summarizer' as AgentName, Icon: FileText },
  { id: 'multilingual', label: 'Multilingual',  agent: 'translator' as AgentName, Icon: Languages },
];

function badgesFromProfile(profile?: string[]): typeof INTEL_BADGES {
  if (!profile || profile.length === 0) return [];
  const byId = new Map(INTEL_BADGES.map(b => [b.id, b]));
  return profile
    .map(id => byId.get(id))
    .filter((b): b is (typeof INTEL_BADGES)[number] => !!b);
}

// --- F5 outcome card -----------------------------------------------------

function OutcomeCardView({ card }: { card: OutcomeCard }) {
  const accent = accentFor(card.agent);
  const { Icon } = card;
  return (
    <article
      className="
        group relative flex flex-col rounded-md overflow-hidden
        border border-[hsl(var(--theme-border-default))]
        bg-[hsl(var(--theme-bg-elevated,var(--theme-bg-secondary)))]
        hover:border-[hsl(var(--theme-border-default))]
        transition-colors
      "
    >
      {/* 2px left accent rail — one accent per surface, never panel fill. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ background: accent }}
      />

      {/* Header: icon + title + control owner */}
      <header className="flex items-start gap-3 px-4 pt-4 pb-2">
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-[hsl(var(--theme-border-default))]"
          style={{ color: accent }}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-[13px] font-semibold leading-5 text-[hsl(var(--theme-text-primary))]">
            {card.title}
          </h4>
          <p className="text-[11px] uppercase tracking-wide text-[hsl(var(--theme-text-muted))] mt-0.5">
            {card.controller} controls · {agentLabel(card.agent)}
          </p>
        </div>
      </header>

      {/* Problem statement */}
      <p className="px-4 text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))]">
        {card.problem}
      </p>

      {/* Simulation strip — 1 to 3 lines */}
      <div className="mt-3 mx-4 rounded border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-primary))]">
        <div className="px-3 py-2 border-b border-[hsl(var(--theme-border-default))]">
          <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--theme-text-muted))]">
            What it looks like
          </span>
        </div>
        <ul className="px-3 py-2 space-y-1.5">
          {card.sim.map((line, i) =>
            line.kind === 'user' ? (
              <li
                key={i}
                className="flex gap-2 text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))]"
              >
                <span className="text-[hsl(var(--theme-text-muted))] font-medium">@{line.who}</span>
                <span className="min-w-0 flex-1 truncate">{line.text}</span>
              </li>
            ) : (
              <li
                key={i}
                className="flex items-start gap-2 text-[12px] leading-5"
              >
                <span
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium flex-shrink-0"
                  style={{
                    color: accentFor(line.agent),
                    background: accentSoftFor(line.agent, 0.10),
                  }}
                  title={`${agentLabel(line.agent)} (${shortCode(line.agent)})`}
                >
                  {agentLabel(line.agent)}
                </span>
                <span className="min-w-0 flex-1 text-[hsl(var(--theme-text-primary))]">{line.text}</span>
              </li>
            ),
          )}
        </ul>
      </div>

      {/* Footer: surface + visibility */}
      <footer className="mt-3 px-4 pb-4 flex items-center justify-between gap-2">
        <span className="text-[11px] text-[hsl(var(--theme-text-muted))] truncate">
          {card.surface}
        </span>
        <VisibilityChip visibility={card.visibility} />
      </footer>
    </article>
  );
}

function OutcomeLane({
  title,
  subtitle,
  cards,
  Icon,
}: {
  title: string;
  subtitle: string;
  cards: OutcomeCard[];
  Icon: typeof Compass;
}) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[hsl(var(--theme-text-primary))]">
            <Icon className="h-5 w-5 text-[hsl(var(--theme-text-secondary))]" />
            {title}
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))]">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map(card => (
          <OutcomeCardView key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}

function IntelBadgeRow({ profile }: { profile?: string[] }) {
  const badges = badgesFromProfile(profile);
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2">
      {badges.map(b => {
        const accent = accentFor(b.agent);
        return (
          <span
            key={b.id}
            title={b.label}
            className="
              inline-flex items-center gap-1 rounded border
              border-[hsl(var(--theme-border-default))]
              bg-[hsl(var(--theme-bg-primary)/0.6)]
              px-1.5 py-0.5 text-[10px] font-medium
            "
            style={{ color: accent }}
          >
            <b.Icon className="h-3 w-3" aria-hidden />
            {b.label}
          </span>
        );
      })}
    </div>
  );
}

export default function DiscoverCommunities({ onClose, onJoinCommunity }: DiscoverCommunitiesProps) {
  const { isDarkMode } = useTheme();
  const { currentCommunity } = useRealtime();
  const [activeSection, setActiveSection] = useState<'servers'>('servers');
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
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
              onClick={() => setActiveSection(item.id as 'servers')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeSection === item.id
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
              className={`sticky top-0 z-30 transition-all duration-300 ${isScrolled
                  ? 'bg-[hsl(var(--theme-bg-primary))] shadow-lg border-b border-[hsl(var(--theme-border-default)/0.3)]'
                  : !isDarkMode
                    ? 'bg-[hsl(var(--theme-bg-primary)/0.85)] backdrop-blur-sm shadow-sm'
                    : 'bg-transparent'
                }`}
            >
              {/* Top Header */}
              <div className={`h-12 flex items-center justify-center border-b transition-colors duration-300 ${isScrolled
                  ? 'border-[hsl(var(--theme-border-default)/0.3)]'
                  : !isDarkMode
                    ? 'border-[hsl(var(--theme-border-default)/0.2)]'
                    : 'border-white/5'
                }`}>
                <div className="flex items-center gap-2">
                  <Compass className={`w-5 h-5 transition-colors duration-300 ${isScrolled
                      ? 'text-[hsl(var(--theme-text-secondary))]'
                      : !isDarkMode
                        ? 'text-[hsl(var(--theme-text-primary))]'
                        : 'text-white/80'
                    }`} />
                  <span className={`text-sm font-semibold ${isScrolled
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
                  <Home className={`w-5 h-5 mr-2 sm:mr-3 flex-shrink-0 transition-colors duration-300 ${isScrolled
                      ? 'text-[hsl(var(--theme-text-secondary))]'
                      : !isDarkMode
                        ? 'text-[hsl(var(--theme-text-secondary))]'
                        : 'text-white/90'
                    }`} />
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`flex-shrink-0 px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 ${selectedCategory === cat.id
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
                  <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-300 ${isScrolled
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
                    className={`w-full pl-9 pr-3 py-1.5 rounded text-sm border-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] transition-all ${isScrolled || !isDarkMode
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
                    {/* Explore AI by Outcome (F5) — only on Home, no search */}
                    {selectedCategory === 'home' && !searchTerm && (
                      <>
                        <OutcomeLane
                          title="For my community"
                          subtitle="What autonomous intelligence can do once a community admin turns it on."
                          cards={COMMUNITY_OUTCOMES}
                          Icon={Compass}
                        />
                        <OutcomeLane
                          title="For me"
                          subtitle="Private automations no one else in your communities can see."
                          cards={PERSONAL_OUTCOMES}
                          Icon={Sparkles}
                        />
                      </>
                    )}

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

                                  {/* F5 — intelligence-profile badges */}
                                  <IntelBadgeRow profile={community.intelligence_profile} />

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
                            {searchTerm ? 'No communities match that search.' : 'No communities exist on AuraFlow yet.'}
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

                                  {/* F5 — intelligence-profile badges */}
                                  <IntelBadgeRow profile={community.intelligence_profile} />

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
      </div>
    </div>
  );
}
