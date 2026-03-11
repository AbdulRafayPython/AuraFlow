import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Plus, AlertCircle, Globe, MessageSquare, Users,
  Bot, Shield, Sparkles, Zap, Heart,
  UserPlus, Tag, Lightbulb
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/hooks/useRealtime';
import CreateCommunityModal from '@/components/modals/CreateCommunityModal';
import JoinCommunityModal from '@/components/modals/JoinCommunityModal';
import { channelService } from '@/services/channelService';
import { useToast } from '@/hooks/use-toast';
import type { Community } from '@/types';

interface CommunityFormData {
  name: string;
  description: string;
  icon: string;
  color: string;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const { isDarkMode, currentTheme } = useTheme();
  const { user } = useAuth();
  const { reloadCommunities, communities } = useRealtime();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isBasicTheme = currentTheme === 'basic';

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[HOME] Component mounted. Current communities:', communities);
  }, [communities]);

  /* ── Handlers ── */
  const handleCreateCommunity = useCallback(
    async (data: CommunityFormData): Promise<Community> => {
      try {
        setApiError(null);
        const newCommunity = await channelService.createCommunity(data);
        toast({ title: '✅ Community created', description: 'Proceed to branding and uploads.' });
        return newCommunity;
      } catch (error: any) {
        const errorMsg = error.message || 'Failed to create community';
        setApiError(errorMsg);
        toast({ title: '❌ Error', description: errorMsg, variant: 'destructive' });
        throw error;
      }
    },
    [toast]
  );

  const handleDiscoverCommunities = useCallback(
    async (search: string, limit: number, offset: number): Promise<Community[]> => {
      try {
        setApiError(null);
        return await channelService.discoverCommunities(search, limit, offset);
      } catch (error: any) {
        const errorMsg = error.message || 'Failed to discover communities';
        console.error('[HOME] Discovery error:', errorMsg);
        setApiError(errorMsg);
        return [];
      }
    },
    []
  );

  const handleJoinCommunity = useCallback(
    async (communityId: number) => {
      try {
        setApiError(null);
        await channelService.joinCommunity(communityId);
        toast({ title: '✅ Success', description: 'You have joined the community!' });
        setShowJoinModal(false);
        await reloadCommunities();
      } catch (error: any) {
        const errorMsg = error.message || 'Failed to join community';
        if (errorMsg.includes('blocked')) {
          setApiError('You are blocked from this community. Please contact the community owner.');
        } else if (errorMsg.includes('already a member')) {
          setApiError('You are already a member of this community!');
        } else {
          setApiError(errorMsg);
        }
        toast({ title: '❌ Error', description: errorMsg, variant: 'destructive' });
      }
    },
    [toast, reloadCommunities]
  );

  const displayName = user?.display_name || user?.username || 'there';
  const greeting = useMemo(() => getGreeting(), []);

  /* ── Data ── */
  const stats = [
    {
      icon: <Users className="w-6 h-6" />,
      value: communities.length,
      label: 'Communities',
      accent: 'text-[hsl(var(--theme-accent-primary))]',
      bg: isDarkMode ? 'bg-[hsl(var(--theme-accent-primary)/0.1)]' : 'bg-blue-50',
    },
    {
      icon: <Sparkles className="w-6 h-6" />,
      value: 6,
      label: 'AI Agents',
      accent: 'text-violet-400',
      bg: isDarkMode ? 'bg-violet-500/10' : 'bg-violet-50',
    },
    {
      icon: <Heart className="w-6 h-6" />,
      value: 'Active',
      label: 'Wellness Tracking',
      accent: 'text-emerald-400',
      bg: isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-50',
    },
  ];

  const features = [
    {
      icon: <MessageSquare className="w-6 h-6" />,
      title: 'Real-time Chat',
      desc: 'Connect instantly with your community members across secure, encrypted channels.',
      accent: 'text-[hsl(var(--theme-accent-primary))]',
      bg: isDarkMode ? 'bg-[hsl(var(--theme-accent-primary)/0.1)]' : 'bg-blue-50',
      hoverBorder: 'hover:border-[hsl(var(--theme-accent-primary)/0.3)]',
    },
    {
      icon: <Bot className="w-6 h-6" />,
      title: 'AI Agents',
      desc: 'Deploy intelligent agents to handle tasks, summarize chats, and provide insights.',
      accent: 'text-violet-400',
      bg: isDarkMode ? 'bg-violet-500/10' : 'bg-violet-50',
      hoverBorder: 'hover:border-violet-400/30',
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: 'Auto Moderation',
      desc: 'Maintain a healthy environment with AI-powered moderation and spam protection.',
      accent: 'text-emerald-400',
      bg: isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-50',
      hoverBorder: 'hover:border-emerald-400/30',
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: 'Mood Wellness',
      desc: 'Monitor community sentiment and individual wellbeing with privacy-first tracking.',
      accent: 'text-orange-400',
      bg: isDarkMode ? 'bg-orange-400/10' : 'bg-orange-50',
      hoverBorder: 'hover:border-orange-400/30',
    },
  ];

  const quickLinks = [
    {
      icon: <UserPlus className="w-5 h-5" />,
      title: 'Find Friends',
      desc: 'Sync contacts to find members you know.',
    },
    {
      icon: <Tag className="w-5 h-5" />,
      title: 'Organize Channels',
      desc: 'Use drag-and-drop to group channels.',
    },
    {
      icon: <Lightbulb className="w-5 h-5" />,
      title: 'Agent Training',
      desc: 'Teach your agents by providing feedback.',
    },
  ];

  /* ── Shared styles ── */
  const cardCls = `bg-[hsl(var(--theme-bg-secondary)/0.5)] border border-[hsl(var(--theme-border-default)/0.5)] ${isBasicTheme ? 'rounded-lg' : 'rounded-2xl'}`;

  return (
    <div
      className="flex-1 flex flex-col overflow-y-auto custom-scrollbar"
      style={{ background: 'var(--theme-bg-gradient, hsl(var(--theme-bg-primary)))' }}
    >
      <main className="max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-8">

        {/* ── Error Banner ── */}
        {apiError && (
          <div className="animate-fade-in">
            <div className={`p-3.5 ${isBasicTheme ? 'rounded-md' : 'rounded-xl'} border flex items-start gap-3 bg-red-500/10 border-red-500/20 text-red-400`}>
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-sm">Unable to complete action</p>
                <p className="text-xs mt-0.5 opacity-80">{apiError}</p>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            HERO CARD
        ═══════════════════════════════════════════ */}
        <section
          className={`relative overflow-hidden ${isBasicTheme ? 'rounded-xl' : 'rounded-3xl'} border border-[hsl(var(--theme-border-default)/0.5)] p-8 sm:p-12`}
          style={{
            background: isDarkMode
              ? 'linear-gradient(135deg, hsl(var(--theme-bg-secondary)) 0%, hsl(var(--theme-bg-primary)) 100%)'
              : 'linear-gradient(135deg, hsl(var(--theme-bg-secondary)) 0%, hsl(var(--theme-bg-primary)) 100%)',
          }}
        >
          {/* Ambient glow */}
          {!isBasicTheme && (
            <div
              className="absolute -top-1/2 -right-[10%] w-[300px] h-[300px] pointer-events-none"
              style={{
                background: 'radial-gradient(circle, hsl(var(--theme-accent-primary) / 0.1) 0%, transparent 70%)',
              }}
            />
          )}

          {/* Greeting badge */}
          <div className="mb-5">
            <span className={`inline-block px-3 py-1 text-[10px] font-bold tracking-widest uppercase ${isBasicTheme ? 'rounded-md' : 'rounded-full'} bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-accent-primary))]`}>
              {greeting}
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[hsl(var(--theme-text-primary))] mb-4 tracking-tight">
            Welcome back, {displayName}
          </h1>

          {/* Subtitle */}
          <p className="text-[hsl(var(--theme-text-secondary))] text-base sm:text-lg mb-8 max-w-xl leading-relaxed">
            {communities.length > 0 ? (
              <>
                You're currently active in{' '}
                <span className="text-[hsl(var(--theme-text-primary))] font-semibold">
                  {communities.length} {communities.length === 1 ? 'community' : 'communities'}
                </span>
                {' '}and{' '}
                <span className="text-[hsl(var(--theme-text-primary))] font-semibold">6 AI agents</span>.
              </>
            ) : (
              'Create your first community or explore what others have built.'
            )}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <button
              onClick={() => setShowCreateModal(true)}
              className={`inline-flex items-center gap-2 px-6 py-3 ${isBasicTheme ? 'rounded-lg' : 'rounded-xl'} font-bold text-sm text-white transition-all duration-200 bg-[hsl(var(--theme-accent-primary))] hover:brightness-110 hover:shadow-lg active:scale-[0.98]`}
            >
              <Plus className="w-5 h-5" />
              Create Community
            </button>

            <button
              onClick={() => navigate('/discover')}
              className={`inline-flex items-center gap-2 px-6 py-3 ${isBasicTheme ? 'rounded-lg' : 'rounded-xl'} font-bold text-sm transition-all duration-200 border ${cardCls} text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))] active:scale-[0.98]`}
            >
              <Globe className="w-5 h-5" />
              Explore Communities
            </button>
          </div>
        </section>

        {/* ═══════════════════════════════════════════
            STATS GRID
        ═══════════════════════════════════════════ */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {stats.map((s, i) => (
            <div key={i} className={`${cardCls} p-6 flex justify-between items-center`}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))] mb-1">
                  {s.label}
                </p>
                <p className="text-3xl font-bold text-[hsl(var(--theme-text-primary))]">
                  {s.value}
                </p>
              </div>
              <div className={`w-10 h-10 ${isBasicTheme ? 'rounded-md' : 'rounded-lg'} flex items-center justify-center ${s.bg} ${s.accent}`}>
                {s.icon}
              </div>
            </div>
          ))}
        </section>

        {/* ═══════════════════════════════════════════
            FEATURE GRID
        ═══════════════════════════════════════════ */}
        <section>
          <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase text-[hsl(var(--theme-text-muted))] mb-6">
            What you can do
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8">
            {features.map((feat, i) => (
              <div
                key={i}
                className={`group ${cardCls} ${feat.hoverBorder} p-6 sm:p-8 ${isBasicTheme ? 'rounded-xl' : 'rounded-3xl'} cursor-pointer transition-colors duration-200`}
              >
                {/* Icon */}
                <div className={`w-10 h-10 ${isBasicTheme ? 'rounded-lg' : 'rounded-xl'} flex items-center justify-center ${feat.bg} ${feat.accent} mb-6`}>
                  {feat.icon}
                </div>

                {/* Title */}
                <h3 className={`text-xl sm:text-2xl font-bold text-[hsl(var(--theme-text-primary))] mb-3 group-hover:${feat.accent} transition-colors`}>
                  {feat.title}
                </h3>

                {/* Description */}
                <p className="text-[hsl(var(--theme-text-muted))] leading-relaxed max-w-sm text-sm">
                  {feat.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════
            QUICK LINKS
        ═══════════════════════════════════════════ */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 pb-12 md:pb-4">
          {quickLinks.map((link, i) => (
            <div
              key={i}
              className={`flex items-center gap-4 p-4 ${cardCls} ${isBasicTheme ? '' : 'bg-[hsl(var(--theme-bg-secondary)/0.3)]'} hover:bg-[hsl(var(--theme-bg-secondary)/0.6)] transition-colors cursor-pointer`}
            >
              <div className="text-[hsl(var(--theme-text-muted))] flex-shrink-0">
                {link.icon}
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-[hsl(var(--theme-text-primary))]">{link.title}</h4>
                <p className="text-xs text-[hsl(var(--theme-text-muted))]">{link.desc}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ── Footer ── */}
        <footer className="text-center pb-8 pt-4">
          <p className="text-[11px] uppercase tracking-widest text-[hsl(var(--theme-text-muted)/0.5)]">
            © 2026 AuraFlow Protocol &bull; Designed for Professionals
          </p>
        </footer>
      </main>

      {/* ── Modals ── */}
      <CreateCommunityModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateCommunity={handleCreateCommunity}
      />

      <JoinCommunityModal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onJoinCommunity={handleJoinCommunity}
        onDiscoverCommunities={handleDiscoverCommunities}
      />
    </div>
  );
}
