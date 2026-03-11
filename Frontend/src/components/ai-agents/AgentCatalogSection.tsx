import React from 'react';
import {
  Shield, TrendingUp, BookOpen, Brain, Heart, Focus, Eye, Activity,
  Users, User, CheckCircle, Sparkles,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

/* ═══════════════════════════════════════════════════════════════
   AgentCatalogSection
   ───────────────────────────────────────────────────────────────
   A reusable component that renders a categorized section of
   agents (Community or Personal) with rich visual cards.
   Used in the Explore → AI Agents tab for agent discovery.
   ═══════════════════════════════════════════════════════════════ */

export interface AgentCatalogItem {
  type: string;
  name: string;
  description: string;
  category: 'community' | 'personal';
  tags: string[];
  trigger: string;
  triggerLabel: string;
}

interface AgentCatalogSectionProps {
  title: string;
  subtitle: string;
  category: 'community' | 'personal';
  agents: AgentCatalogItem[];
  onAgentClick: (agentType: string) => void;
  columns?: 2 | 3;
}

// Agent visual configuration
const AGENT_VISUALS: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  hoverBorder: string;
  color: string;
  tagBg: string;
  tagText: string;
  tagBorder: string;
}> = {
  moderation: {
    icon: Shield,
    gradient: 'linear-gradient(135deg, #7f1d1d 0%, #dc2626 60%, #ef4444 100%)',
    hoverBorder: 'hover:border-red-500/40',
    color: 'red',
    tagBg: 'bg-red-500/10', tagText: 'text-red-400', tagBorder: 'border-red-500/20',
  },
  engagement: {
    icon: TrendingUp,
    gradient: 'linear-gradient(135deg, #064e3b 0%, #10b981 60%, #34d399 100%)',
    hoverBorder: 'hover:border-emerald-500/40',
    color: 'emerald',
    tagBg: 'bg-emerald-500/10', tagText: 'text-emerald-400', tagBorder: 'border-emerald-500/20',
  },
  knowledge_builder: {
    icon: BookOpen,
    gradient: 'linear-gradient(135deg, #312e81 0%, #6366f1 60%, #818cf8 100%)',
    hoverBorder: 'hover:border-indigo-500/40',
    color: 'indigo',
    tagBg: 'bg-indigo-500/10', tagText: 'text-indigo-400', tagBorder: 'border-indigo-500/20',
  },
  knowledge: {
    icon: BookOpen,
    gradient: 'linear-gradient(135deg, #312e81 0%, #6366f1 60%, #818cf8 100%)',
    hoverBorder: 'hover:border-indigo-500/40',
    color: 'indigo',
    tagBg: 'bg-indigo-500/10', tagText: 'text-indigo-400', tagBorder: 'border-indigo-500/20',
  },
  focus: {
    icon: Focus,
    gradient: 'linear-gradient(135deg, #7c2d12 0%, #f97316 60%, #fb923c 100%)',
    hoverBorder: 'hover:border-orange-500/40',
    color: 'orange',
    tagBg: 'bg-orange-500/10', tagText: 'text-orange-400', tagBorder: 'border-orange-500/20',
  },
  summarizer: {
    icon: Brain,
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 60%, #3b82f6 100%)',
    hoverBorder: 'hover:border-blue-500/40',
    color: 'blue',
    tagBg: 'bg-blue-500/10', tagText: 'text-blue-400', tagBorder: 'border-blue-500/20',
  },
  mood_tracker: {
    icon: Heart,
    gradient: 'linear-gradient(135deg, #831843 0%, #ec4899 60%, #f472b6 100%)',
    hoverBorder: 'hover:border-pink-500/40',
    color: 'pink',
    tagBg: 'bg-pink-500/10', tagText: 'text-pink-400', tagBorder: 'border-pink-500/20',
  },
  mood: {
    icon: Heart,
    gradient: 'linear-gradient(135deg, #831843 0%, #ec4899 60%, #f472b6 100%)',
    hoverBorder: 'hover:border-pink-500/40',
    color: 'pink',
    tagBg: 'bg-pink-500/10', tagText: 'text-pink-400', tagBorder: 'border-pink-500/20',
  },
  wellness: {
    icon: Heart,
    gradient: 'linear-gradient(135deg, #4c1d95 0%, #8b5cf6 60%, #a78bfa 100%)',
    hoverBorder: 'hover:border-purple-500/40',
    color: 'purple',
    tagBg: 'bg-purple-500/10', tagText: 'text-purple-400', tagBorder: 'border-purple-500/20',
  },
};

// Default catalog data
export const COMMUNITY_AGENTS: AgentCatalogItem[] = [
  {
    type: 'moderation', name: 'Moderation', category: 'community',
    description: 'Catches toxic messages, hate speech, and spam in real time with Roman Urdu support.',
    tags: ['Safety'], trigger: 'Every message', triggerLabel: 'Auto',
  },
  {
    type: 'engagement', name: 'Engagement', category: 'community',
    description: 'Detects low activity periods and suggests polls, icebreakers, and community challenges.',
    tags: ['Activity'], trigger: 'On inactivity', triggerLabel: 'Auto',
  },
  {
    type: 'knowledge_builder', name: 'Knowledge Builder', category: 'community',
    description: 'Extracts Q&A pairs and builds a searchable knowledge base from your conversations over time.',
    tags: ['Learn'], trigger: 'Every 2 hrs', triggerLabel: 'Q&A',
  },
  {
    type: 'focus', name: 'Focus', category: 'community',
    description: 'Monitors conversation focus, detects topic drift, and keeps channel discussions on track.',
    tags: ['Productivity'], trigger: 'Every 50 msgs', triggerLabel: 'Topic drift',
  },
];

export const PERSONAL_AGENTS: AgentCatalogItem[] = [
  {
    type: 'summarizer', name: 'Summarizer', category: 'personal',
    description: 'Condenses long conversations into clear, actionable recaps. Use /summarize to catch up instantly.',
    tags: ['AI'], trigger: 'On-demand', triggerLabel: '/summarize',
  },
  {
    type: 'mood_tracker', name: 'Mood Tracker', category: 'personal',
    description: 'Tracks your emotional tone in real time with Roman Urdu support and sentiment visualization.',
    tags: ['Sentiment'], trigger: 'Every message', triggerLabel: 'Auto-track',
  },
  {
    type: 'wellness', name: 'Wellness', category: 'personal',
    description: 'Monitors your activity patterns and provides personalized wellness suggestions and break reminders.',
    tags: ['Wellbeing'], trigger: 'Hourly check', triggerLabel: 'Wellness',
  },
];

export default function AgentCatalogSection({
  title,
  subtitle,
  category,
  agents,
  onAgentClick,
  columns = category === 'community' ? 2 : 3,
}: AgentCatalogSectionProps) {
  const { currentTheme } = useTheme();
  const isBasicTheme = currentTheme === 'basic';
  const categoryBadge = category === 'community'
    ? { label: 'Admin', bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' }
    : { label: 'User', bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' };

  const CategoryIcon = category === 'community' ? Users : User;
  const accentColor = category === 'community' ? 'text-blue-400' : 'text-violet-400';

  return (
    <div className="mb-10">
      {/* Section Header */}
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-xl font-bold text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
          <CategoryIcon className={`w-5 h-5 ${accentColor}`} />
          {title}
        </h2>
        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${categoryBadge.bg} ${categoryBadge.text} border ${categoryBadge.border} uppercase tracking-wider`}>
          {categoryBadge.label}
        </span>
      </div>
      <p className="text-xs text-[hsl(var(--theme-text-muted))] mb-5 ml-7">
        {subtitle}
      </p>

      {/* Agent Cards Grid */}
      <div className={`grid grid-cols-1 ${columns === 3 ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
        {agents.map((agent) => {
          const visual = AGENT_VISUALS[agent.type] || AGENT_VISUALS.summarizer;
          const IconComponent = visual.icon;
          const gradientFrom = `from-${visual.color}-500`;
          const gradientTo = `to-${visual.color}-600`;

          return (
            <div
              key={agent.type}
              onClick={() => onAgentClick(agent.type)}
              className={`group relative ${isBasicTheme ? 'rounded-lg' : 'rounded-xl'} overflow-hidden border border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-bg-secondary)/0.5)] ${visual.hoverBorder} transition-all duration-300 hover:shadow-lg cursor-pointer`}
            >
              {/* Gradient Header */}
              <div className="relative h-28 overflow-hidden" style={{ background: visual.gradient }}>
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center opacity-[0.06]">
                  <IconComponent className="w-32 h-32" />
                </div>
              </div>

              {/* Floating Icon */}
              <div className={`absolute left-4 top-20 w-14 h-14 ${isBasicTheme ? 'rounded-lg' : 'rounded-xl'} overflow-hidden ring-4 ring-[hsl(var(--theme-bg-secondary))] shadow-lg bg-gradient-to-br ${gradientFrom} ${gradientTo} flex items-center justify-center`}>
                <IconComponent className="w-7 h-7 text-white" />
              </div>

              {/* Content */}
              <div className="pt-8 pb-4 px-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-bold text-sm text-[hsl(var(--theme-text-primary))]">{agent.name}</h3>
                  {agent.tags.map((tag) => (
                    <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${visual.tagBg} ${visual.tagText} border ${visual.tagBorder}`}>
                      {tag}
                    </span>
                  ))}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${categoryBadge.bg} ${categoryBadge.text} border ${categoryBadge.border}`}>
                    {category === 'community' ? 'Community' : 'Personal'}
                  </span>
                </div>
                <p className="text-xs text-[hsl(var(--theme-text-secondary))] line-clamp-2 mb-3 min-h-[32px]">
                  {agent.description}
                </p>
                <div className="flex items-center gap-3 text-xs text-[hsl(var(--theme-text-muted))]">
                  <span className="flex items-center gap-1">
                    {agent.triggerLabel.startsWith('/') ? (
                      <CheckCircle className={`w-3 h-3 text-emerald-400`} />
                    ) : (
                      <IconComponent className={`w-3 h-3 ${visual.tagText}`} />
                    )}
                    {agent.triggerLabel}
                  </span>
                  <span className="flex items-center gap-1">
                    <Activity className="w-3 h-3" /> {agent.trigger}
                  </span>
                </div>
              </div>

              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                <button className={`px-5 py-2.5 ${isBasicTheme ? 'rounded-lg' : 'rounded-xl'} font-semibold text-sm text-white bg-gradient-to-r ${gradientFrom} ${gradientTo} hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center gap-2`}>
                  <Eye className="w-4 h-4" /> View Details
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
