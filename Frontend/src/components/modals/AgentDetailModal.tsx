import React, { useState, useEffect, useCallback } from 'react';
import {
  X, CheckCircle, Plus, Settings, Shield, TrendingUp, BookOpen,
  Brain, Heart, Focus, Loader2, ChevronDown, Zap, Eye, Info
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useRealtime } from '@/hooks/useRealtime';
import { useNotifications } from '@/hooks/useNotifications';
import { aiAgentService, AgentCatalogEntry } from '@/services/aiAgentService';
import type { Community } from '@/types';

interface AgentDetailModalProps {
  open: boolean;
  onClose: () => void;
  agentType: string;
  mode?: 'discover' | 'manage';
  onSuccess?: () => void;
}

// ─── Agent Meta Lookup ───────────────────────────────────────────────
const AGENT_META: Record<string, {
  icon: React.ReactNode;
  emoji: string;
  gradient: string;
  headerGradient: string;
  color: string;
  badgeLabel: string;
  displayName: string;
  description: string;
  category: 'community' | 'personal';
  features: string[];
}> = {
  moderation: {
    icon: <Shield className="w-8 h-8" />,
    emoji: '🛡️',
    gradient: 'from-red-500 to-rose-500',
    headerGradient: 'linear-gradient(135deg, #7f1d1d 0%, #ef4444 60%, #f87171 100%)',
    color: 'red',
    badgeLabel: 'Community · Safety',
    displayName: 'Moderation Agent',
    description: 'Auto-moderate toxic content, spam, and hate speech with Roman Urdu language support. Configurable severity and auto-enforcement actions.',
    category: 'community',
    features: ['Auto-detect toxic content', 'Roman Urdu profanity detection', 'Hate speech filtering', 'Configurable sensitivity levels', 'Auto-moderation actions', 'Violation logging & reports'],
  },
  engagement: {
    icon: <TrendingUp className="w-8 h-8" />,
    emoji: '🎯',
    gradient: 'from-emerald-500 to-green-500',
    headerGradient: 'linear-gradient(135deg, #064e3b 0%, #10b981 60%, #34d399 100%)',
    color: 'emerald',
    badgeLabel: 'Community · Growth',
    displayName: 'Engagement Agent',
    description: 'Surfaces activity trends, peak hours, and top contributors. Know what drives your community forward with smart analytics.',
    category: 'community',
    features: ['Smart activity suggestions', 'Conversation starters', 'Polls & challenges', 'Activity trend detection', 'Engagement analytics', 'Inactivity alerts'],
  },
  knowledge_builder: {
    icon: <BookOpen className="w-8 h-8" />,
    emoji: '📚',
    gradient: 'from-indigo-500 to-purple-500',
    headerGradient: 'linear-gradient(135deg, #312e81 0%, #6366f1 60%, #818cf8 100%)',
    color: 'indigo',
    badgeLabel: 'Community · Learning',
    displayName: 'Knowledge Builder',
    description: 'Extracts Q&A pairs and builds a searchable knowledge base from your conversations over time. Auto-categorization included.',
    category: 'community',
    features: ['Extract Q&A pairs', 'Auto-categorization', 'FAQ generation', 'Searchable knowledge', 'Decision logging', 'Topic tagging'],
  },
  knowledge: {
    icon: <BookOpen className="w-8 h-8" />,
    emoji: '📚',
    gradient: 'from-indigo-500 to-purple-500',
    headerGradient: 'linear-gradient(135deg, #312e81 0%, #6366f1 60%, #818cf8 100%)',
    color: 'indigo',
    badgeLabel: 'Community · Learning',
    displayName: 'Knowledge Builder',
    description: 'Extracts Q&A pairs and builds a searchable knowledge base from your conversations over time.',
    category: 'community',
    features: ['Extract Q&A pairs', 'Auto-categorization', 'FAQ generation', 'Searchable knowledge', 'Decision logging', 'Topic tagging'],
  },
  focus: {
    icon: <Focus className="w-8 h-8" />,
    emoji: '🎯',
    gradient: 'from-orange-500 to-red-500',
    headerGradient: 'linear-gradient(135deg, #7c2d12 0%, #f97316 60%, #fb923c 100%)',
    color: 'orange',
    badgeLabel: 'Community · Productivity',
    displayName: 'Focus Agent',
    description: 'Monitors conversation focus, detects topic drift, and keeps channel discussions on track across the community.',
    category: 'community',
    features: ['Topic tracking', 'Drift detection', 'Focus scoring', 'Productivity insights', 'Goal support', 'Weekly reports'],
  },
  summarizer: {
    icon: <Brain className="w-8 h-8" />,
    emoji: '📝',
    gradient: 'from-blue-500 to-cyan-500',
    headerGradient: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 60%, #3b82f6 100%)',
    color: 'blue',
    badgeLabel: 'Personal · AI',
    displayName: 'Summarizer Agent',
    description: 'Condenses long conversations into clear, actionable recaps. Use /summarize in any channel to catch up instantly.',
    category: 'personal',
    features: ['Message summaries', 'Multiple output styles', 'Custom length control', 'Command: /summarize', 'Roman Urdu support', 'Decision extraction'],
  },
  mood_tracker: {
    icon: <Heart className="w-8 h-8" />,
    emoji: '😊',
    gradient: 'from-pink-500 to-rose-500',
    headerGradient: 'linear-gradient(135deg, #831843 0%, #ec4899 60%, #f472b6 100%)',
    color: 'pink',
    badgeLabel: 'Personal · Wellness',
    displayName: 'Mood Tracker',
    description: 'Real-time sentiment analysis across your conversations. Supports Roman Urdu, emoji detection, and trend tracking.',
    category: 'personal',
    features: ['Sentiment analysis', 'Roman Urdu support', 'Emoji detection', 'Mood history', 'Trend analysis', 'Wellness insights'],
  },
  mood: {
    icon: <Heart className="w-8 h-8" />,
    emoji: '😊',
    gradient: 'from-pink-500 to-rose-500',
    headerGradient: 'linear-gradient(135deg, #831843 0%, #ec4899 60%, #f472b6 100%)',
    color: 'pink',
    badgeLabel: 'Personal · Wellness',
    displayName: 'Mood Tracker',
    description: 'Real-time sentiment analysis across your conversations with trend tracking.',
    category: 'personal',
    features: ['Sentiment analysis', 'Roman Urdu support', 'Emoji detection', 'Mood history', 'Trend analysis', 'Wellness insights'],
  },
  wellness: {
    icon: <Heart className="w-8 h-8" />,
    emoji: '🧘',
    gradient: 'from-purple-500 to-pink-500',
    headerGradient: 'linear-gradient(135deg, #4c1d95 0%, #8b5cf6 60%, #a78bfa 100%)',
    color: 'purple',
    badgeLabel: 'Personal · Wellbeing',
    displayName: 'Wellness Agent',
    description: 'Monitors communication health, detects burnout risk, and surfaces patterns that may need attention proactively.',
    category: 'personal',
    features: ['Break reminders', 'Activity monitoring', 'Stress detection', 'Health suggestions', 'Pattern analysis', 'Weekly reports'],
  },
};

const COLOR_CLASSES: Record<string, { bg: string; text: string; border: string; ring: string }> = {
  red:     { bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30',     ring: 'ring-red-500/30' },
  emerald: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', ring: 'ring-emerald-500/30' },
  indigo:  { bg: 'bg-indigo-500/15',  text: 'text-indigo-400',  border: 'border-indigo-500/30',  ring: 'ring-indigo-500/30' },
  orange:  { bg: 'bg-orange-500/15',  text: 'text-orange-400',  border: 'border-orange-500/30',  ring: 'ring-orange-500/30' },
  blue:    { bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30',    ring: 'ring-blue-500/30' },
  pink:    { bg: 'bg-pink-500/15',    text: 'text-pink-400',    border: 'border-pink-500/30',    ring: 'ring-pink-500/30' },
  purple:  { bg: 'bg-purple-500/15',  text: 'text-purple-400',  border: 'border-purple-500/30',  ring: 'ring-purple-500/30' },
};

export const AgentDetailModal: React.FC<AgentDetailModalProps> = ({
  open,
  onClose,
  agentType,
  mode = 'discover',
  onSuccess,
}) => {
  const { currentTheme } = useTheme();
  const { communities } = useRealtime();
  const { showSuccess, showError } = useNotifications();
  const isBasicTheme = currentTheme === 'basic';

  const [loading, setLoading] = useState(true);
  const [catalogData, setCatalogData] = useState<AgentCatalogEntry | null>(null);
  const [installing, setInstalling] = useState(false);
  const [selectedCommunityId, setSelectedCommunityId] = useState<number | null>(null);
  const [isActivated, setIsActivated] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const meta = AGENT_META[agentType] || AGENT_META.summarizer;
  const colors = COLOR_CLASSES[meta.color] || COLOR_CLASSES.blue;

  // Filter communities where user is owner/admin
  const adminCommunities = communities.filter(
    (c: Community) => c.role === 'owner' || c.role === 'admin'
  );

  useEffect(() => {
    if (open && agentType) {
      setLoading(true);
      setIsActivated(false);
      setSelectedCommunityId(null);
      setDropdownOpen(false);

      aiAgentService
        .getAgentCatalog()
        .then((catalog) => {
          const found = catalog.find((a) => a.agent_type === agentType);
          setCatalogData(found || null);
          if (found?.personal_status?.activated) setIsActivated(true);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, agentType]);

  const handleInstall = useCallback(async () => {
    if (installing) return;
    setInstalling(true);
    try {
      if (meta.category === 'community') {
        if (!selectedCommunityId) {
          showError({ title: 'Please select a community' });
          setInstalling(false);
          return;
        }
        await aiAgentService.installCommunityAgent(selectedCommunityId, agentType);
        showSuccess({ title: `${meta.displayName} installed successfully!` });
      } else {
        await aiAgentService.activatePersonalAgent(agentType);
        showSuccess({ title: `${meta.displayName} activated!` });
        setIsActivated(true);
      }
      onSuccess?.();
      onClose();
    } catch (error: any) {
      showError({ title: error.message || 'Installation failed' });
    } finally {
      setInstalling(false);
    }
  }, [installing, meta, selectedCommunityId, agentType, onSuccess, onClose, showSuccess, showError]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />

      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col
          ${isBasicTheme ? 'rounded-lg' : 'rounded-2xl'}
          bg-[hsl(var(--theme-bg-elevated))] border border-[hsl(var(--theme-border-default)/0.5)]
          shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300
        `}
      >
        {/* Header background */}
        <div className="relative h-32 overflow-hidden flex-shrink-0" style={{ background: meta.headerGradient }}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          {/* Background pattern icon */}
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.06]">
            <div className="w-40 h-40">{meta.icon}</div>
          </div>
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors z-10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Icon chip */}
        <div className="px-6 -mt-8 relative z-10 flex-shrink-0">
          <div className={`w-16 h-16 ${isBasicTheme ? 'rounded-lg' : 'rounded-2xl'} overflow-hidden
            ring-4 ring-[hsl(var(--theme-bg-elevated))] shadow-lg
            bg-gradient-to-br ${meta.gradient} flex items-center justify-center text-white`}
          >
            {meta.icon}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 pt-3 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--theme-accent-primary))]" />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Title + Badge */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <h2 className="text-xl font-bold text-[hsl(var(--theme-text-primary))]">
                    {catalogData?.display_name || meta.displayName}
                  </h2>
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium ${colors.bg} ${colors.text} border ${colors.border}`}>
                    {meta.badgeLabel}
                  </span>
                </div>
                <p className="text-sm text-[hsl(var(--theme-text-secondary))] leading-relaxed">
                  {catalogData?.description || meta.description}
                </p>
              </div>

              {/* Divider */}
              <div className="h-px bg-[hsl(var(--theme-border-default)/0.3)]" />

              {/* Features */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))] mb-3">
                  Features
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {(catalogData?.features || meta.features).map((feature, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-sm text-[hsl(var(--theme-text-secondary))]`}
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <CheckCircle className={`w-3.5 h-3.5 flex-shrink-0 ${colors.text}`} />
                      <span className="text-xs">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-[hsl(var(--theme-border-default)/0.3)]" />

              {/* Installation / Activation section */}
              {meta.category === 'community' ? (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))] mb-3">
                    Install to Community
                  </h3>

                  {catalogData?.community_status?.installed ? (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm text-emerald-400 font-medium">Already installed in selected community</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Community Dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => setDropdownOpen(!dropdownOpen)}
                          className={`w-full flex items-center justify-between px-4 py-3 ${isBasicTheme ? 'rounded-lg' : 'rounded-xl'}
                            bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))]
                            text-sm text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-colors`}
                        >
                          <span className={selectedCommunityId ? '' : 'text-[hsl(var(--theme-text-muted))]'}>
                            {selectedCommunityId
                              ? adminCommunities.find(c => c.id === selectedCommunityId)?.name || 'Unknown'
                              : 'Choose a community...'}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-[hsl(var(--theme-text-muted))] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {dropdownOpen && (
                          <div className={`absolute top-full left-0 right-0 mt-1 z-50 ${isBasicTheme ? 'rounded-lg' : 'rounded-xl'}
                            bg-[hsl(var(--theme-bg-elevated))] border border-[hsl(var(--theme-border-default))]
                            shadow-xl max-h-48 overflow-y-auto`}
                          >
                            {adminCommunities.length === 0 ? (
                              <div className="px-4 py-3 text-sm text-[hsl(var(--theme-text-muted))]">
                                No communities where you are admin
                              </div>
                            ) : (
                              adminCommunities.map((c) => (
                                <button
                                  key={c.id}
                                  onClick={() => {
                                    setSelectedCommunityId(c.id);
                                    setDropdownOpen(false);
                                  }}
                                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
                                    ${selectedCommunityId === c.id
                                      ? `${colors.bg} ${colors.text}`
                                      : 'text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]'
                                    }`}
                                >
                                  <div
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                                    style={{ backgroundColor: c.color || '#5865f2' }}
                                  >
                                    {c.icon || c.name.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="truncate">{c.name}</span>
                                  {selectedCommunityId === c.id && <CheckCircle className="w-4 h-4 ml-auto flex-shrink-0" />}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-start gap-2 text-xs text-[hsl(var(--theme-text-muted))]">
                        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>Only communities where you're an admin or owner are shown here.</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ─── Personal Agent Activation Flow ─── */
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))] mb-3">
                    Personal Activation
                  </h3>

                  {isActivated || catalogData?.personal_status?.activated ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm text-emerald-400 font-medium">Active on your account</span>
                      </div>
                      <div className={`p-3 rounded-xl bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default)/0.5)]`}>
                        <p className="text-xs text-[hsl(var(--theme-text-muted))] leading-relaxed">
                          This agent is running for you across all communities and DMs. You can manage it from your <strong className="text-[hsl(var(--theme-text-secondary))]">Personal Agents</strong> panel.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Activation info card */}
                      <div className={`p-4 rounded-xl border ${colors.border} ${colors.bg}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Zap className={`w-4 h-4 ${colors.text}`} />
                          <span className={`text-sm font-semibold ${colors.text}`}>One-click activation</span>
                        </div>
                        <p className="text-xs text-[hsl(var(--theme-text-secondary))] leading-relaxed">
                          Personal agents are activated just for you — no community or admin permissions needed. Once activated, it works across all your conversations.
                        </p>
                      </div>

                      {/* How it works */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { step: '1', label: 'Activate', desc: 'Click below' },
                          { step: '2', label: 'Auto-runs', desc: 'On your messages' },
                          { step: '3', label: 'Insights', desc: 'Personal dashboard' },
                        ].map((s) => (
                          <div key={s.step} className="p-2.5 rounded-lg bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default)/0.3)] text-center">
                            <div className={`text-xs font-bold ${colors.text} mb-0.5`}>Step {s.step}</div>
                            <div className="text-xs font-medium text-[hsl(var(--theme-text-primary))]">{s.label}</div>
                            <div className="text-[10px] text-[hsl(var(--theme-text-muted))]">{s.desc}</div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-start gap-2 text-xs text-[hsl(var(--theme-text-muted))]">
                        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>No admin permissions required. You can deactivate anytime from your Personal Agents panel.</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-[hsl(var(--theme-border-default)/0.3)] flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className={`px-5 py-2.5 ${isBasicTheme ? 'rounded-md' : 'rounded-xl'} text-sm font-medium
              bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-secondary))]
              border border-[hsl(var(--theme-border-default))]
              hover:bg-[hsl(var(--theme-bg-hover))] transition-all`}
          >
            Cancel
          </button>

          {!(meta.category === 'personal' && (isActivated || catalogData?.personal_status?.activated)) &&
           !(meta.category === 'community' && catalogData?.community_status?.installed) && (
            <button
              onClick={handleInstall}
              disabled={installing || (meta.category === 'community' && !selectedCommunityId)}
              className={`px-5 py-2.5 ${isBasicTheme ? 'rounded-md' : 'rounded-xl'} text-sm font-semibold text-white
                bg-gradient-to-r ${meta.gradient}
                hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]
                transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100
                flex items-center gap-2
                ${isBasicTheme ? '' : `shadow-lg hover:shadow-xl`}`}
            >
              {installing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {meta.category === 'community' ? 'Install Agent' : 'Activate Agent'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
