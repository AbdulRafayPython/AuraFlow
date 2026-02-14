import React, { useState, useCallback, useEffect } from 'react';
import { 
  Plus, Search, AlertCircle, Compass, MessageSquare, Users, 
  Bot, Shield, Sparkles, ArrowRight, Zap, Globe
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

  const handleCreateCommunity = useCallback(
    async (data: CommunityFormData): Promise<Community> => {
      try {
        setApiError(null);
        const newCommunity = await channelService.createCommunity(data);
        toast({
          title: '✅ Community created',
          description: `Proceed to branding and uploads.`,
        });
        return newCommunity;
      } catch (error: any) {
        const errorMsg = error.message || 'Failed to create community';
        setApiError(errorMsg);
        toast({
          title: '❌ Error',
          description: errorMsg,
          variant: 'destructive',
        });
        throw error;
      }
    },
    [toast]
  );

  const handleDiscoverCommunities = useCallback(
    async (search: string, limit: number, offset: number): Promise<Community[]> => {
      try {
        setApiError(null);
        const communities = await channelService.discoverCommunities(search, limit, offset);
        return communities;
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
        toast({
          title: '✅ Success',
          description: 'You have joined the community!',
        });
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
        toast({
          title: '❌ Error',
          description: errorMsg,
          variant: 'destructive',
        });
      }
    },
    [toast, reloadCommunities]
  );

  const displayName = user?.display_name || user?.username || 'there';

  const features = [
    {
      icon: <MessageSquare className="w-5 h-5" />,
      title: 'Real-time Chat',
      desc: 'Instant messaging with channels, threads, and direct messages.',
      color: 'from-blue-500 to-cyan-500',
      colorLight: 'bg-blue-50 text-blue-600 border-blue-200',
      colorDark: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    },
    {
      icon: <Bot className="w-5 h-5" />,
      title: 'AI Agents',
      desc: 'Smart assistants that summarize, moderate, and track engagement.',
      color: 'from-violet-500 to-purple-500',
      colorLight: 'bg-violet-50 text-violet-600 border-violet-200',
      colorDark: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    },
    {
      icon: <Shield className="w-5 h-5" />,
      title: 'Auto Moderation',
      desc: 'Content safety powered by AI to keep conversations healthy.',
      color: 'from-emerald-500 to-teal-500',
      colorLight: 'bg-emerald-50 text-emerald-600 border-emerald-200',
      colorDark: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: 'Mood & Wellness',
      desc: 'Sentiment analysis and wellness insights for your community.',
      color: 'from-amber-500 to-orange-500',
      colorLight: 'bg-amber-50 text-amber-600 border-amber-200',
      colorDark: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    },
  ];

  return (
    <div 
      className="flex-1 flex flex-col overflow-y-auto"
      style={{ 
        background: 'var(--theme-bg-gradient, hsl(var(--theme-bg-primary)))'
      }}
    >
      {/* Error Banner */}
      {apiError && (
        <div className="mx-4 sm:mx-8 mt-4">
          <div className="p-3 sm:p-4 rounded-xl border flex items-start gap-3 bg-red-500/10 border-red-500/20 text-red-400">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm">Unable to complete action</p>
              <p className="text-xs mt-0.5 opacity-80">{apiError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background decorations */}
        {!isBasicTheme && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-[0.07]"
              style={{ background: 'radial-gradient(circle, hsl(var(--theme-accent-primary)), transparent 70%)' }} />
            <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full opacity-[0.05]"
              style={{ background: 'radial-gradient(circle, hsl(var(--theme-accent-secondary)), transparent 70%)' }} />
          </div>
        )}

        <div className="relative px-5 sm:px-8 lg:px-12 pt-8 sm:pt-14 pb-6 sm:pb-10">
          {/* Greeting */}
          <div className="max-w-3xl">
            <p className="text-sm font-medium mb-2 text-[hsl(var(--theme-accent-primary))]">
              Welcome back
            </p>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[hsl(var(--theme-text-primary))]">
              Hey, {displayName}
            </h1>
            <p className="mt-2 sm:mt-3 text-sm sm:text-base leading-relaxed max-w-xl text-[hsl(var(--theme-text-secondary))]">
              {communities.length > 0 
                ? `You're part of ${communities.length} ${communities.length === 1 ? 'community' : 'communities'}. Jump back in or discover something new.`
                : 'Get started by creating your own space or finding one that fits you.'
              }
            </p>
          </div>

          {/* Quick Actions */}
          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <button
              onClick={() => setShowCreateModal(true)}
              className={`group flex items-center gap-3 px-5 py-3 sm:py-3.5 ${isBasicTheme ? 'rounded-lg' : 'rounded-2xl'} font-semibold text-sm transition-all duration-200 text-white bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] hover:shadow-lg hover:shadow-[hsl(var(--theme-accent-primary)/0.25)] hover:scale-[1.02] active:scale-[0.98]`}
            >
              <Plus className="w-4.5 h-4.5" />
              Create Community
              <ArrowRight className="w-4 h-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200" />
            </button>

            <button
              onClick={() => navigate('/discover')}
              className={`group flex items-center gap-3 px-5 py-3 sm:py-3.5 ${isBasicTheme ? 'rounded-lg' : 'rounded-2xl'} font-semibold text-sm transition-all duration-200 border bg-[hsl(var(--theme-bg-secondary)/0.6)] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:border-[hsl(var(--theme-border-hover))] hover:scale-[1.02] active:scale-[0.98]`}
            >
              <Compass className="w-4.5 h-4.5" />
              Explore Communities
              <ArrowRight className="w-4 h-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200" />
            </button>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 sm:mx-8 lg:mx-12">
        <div className="h-px bg-[hsl(var(--theme-border-default)/0.5)]" />
      </div>

      {/* Features Grid */}
      <div className="px-5 sm:px-8 lg:px-12 py-6 sm:py-10">
        <div className="flex items-center gap-2 mb-5 sm:mb-6">
          <Sparkles className="w-4 h-4 text-[hsl(var(--theme-accent-primary))]" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-[hsl(var(--theme-text-muted))]">
            What you can do
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {features.map((feat, i) => (
            <div
              key={i}
              className={`group p-4 sm:p-5 ${isBasicTheme ? 'rounded-lg' : 'rounded-2xl'} border transition-all duration-200 bg-[hsl(var(--theme-bg-secondary)/0.4)] border-[hsl(var(--theme-border-default)/0.5)] hover:bg-[hsl(var(--theme-bg-secondary)/0.7)] hover:border-[hsl(var(--theme-border-default))]`}
            >
              <div className="flex items-start gap-3.5">
                <div className={`flex-shrink-0 p-2.5 ${isBasicTheme ? 'rounded-lg' : 'rounded-xl'} border ${isDarkMode ? feat.colorDark : feat.colorLight} transition-colors`}>
                  {feat.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm text-[hsl(var(--theme-text-primary))]">{feat.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--theme-text-muted))]">{feat.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 sm:mx-8 lg:mx-12">
        <div className="h-px bg-[hsl(var(--theme-border-default)/0.5)]" />
      </div>

      {/* Quick Tips */}
      <div className="px-5 sm:px-8 lg:px-12 py-6 sm:py-10 pb-24 md:pb-10">
        <div className="flex items-center gap-2 mb-5 sm:mb-6">
          <Globe className="w-4 h-4 text-[hsl(var(--theme-accent-primary))]" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-[hsl(var(--theme-text-muted))]">
            Quick tips
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className={`p-4 ${isBasicTheme ? 'rounded-lg' : 'rounded-xl'} border bg-[hsl(var(--theme-bg-secondary)/0.3)] border-[hsl(var(--theme-border-default)/0.4)]`}>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-3.5 h-3.5 text-[hsl(var(--theme-accent-primary))]" />
              <span className="text-xs font-semibold text-[hsl(var(--theme-text-primary))]">Friends</span>
            </div>
            <p className="text-xs leading-relaxed text-[hsl(var(--theme-text-muted))]">
              Use the sidebar to add friends and start private conversations anytime.
            </p>
          </div>

          <div className={`p-4 ${isBasicTheme ? 'rounded-lg' : 'rounded-xl'} border bg-[hsl(var(--theme-bg-secondary)/0.3)] border-[hsl(var(--theme-border-default)/0.4)]`}>
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-3.5 h-3.5 text-[hsl(var(--theme-accent-primary))]" />
              <span className="text-xs font-semibold text-[hsl(var(--theme-text-primary))]">Channels</span>
            </div>
            <p className="text-xs leading-relaxed text-[hsl(var(--theme-text-muted))]">
              Communities have text and voice channels — pick one and start chatting.
            </p>
          </div>

          <div className={`p-4 ${isBasicTheme ? 'rounded-lg' : 'rounded-xl'} border bg-[hsl(var(--theme-bg-secondary)/0.3)] border-[hsl(var(--theme-border-default)/0.4)]`}>
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-3.5 h-3.5 text-[hsl(var(--theme-accent-primary))]" />
              <span className="text-xs font-semibold text-[hsl(var(--theme-text-primary))]">AI Agents</span>
            </div>
            <p className="text-xs leading-relaxed text-[hsl(var(--theme-text-muted))]">
              Visit Explore to manage agents like summarizer, mood tracker, and moderation.
            </p>
          </div>
        </div>
      </div>

      {/* Modals */}
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
