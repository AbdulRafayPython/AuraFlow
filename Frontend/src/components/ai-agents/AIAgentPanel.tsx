import React, { useState, useEffect } from 'react';
import { 
  Bot, Brain, Shield, Heart, TrendingUp, BookOpen, Focus, X, Sparkles
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { useRealtime } from '@/hooks/useRealtime';
import AgentCard from './AgentCard';

interface AIAgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AIAgentPanel({ isOpen, onClose }: AIAgentPanelProps) {
  const { isDarkMode, currentTheme } = useTheme();
  const isBasicTheme = currentTheme === 'basic';
  const { agentStatus, moderationAlerts, getModerationStats } = useAIAgents();
  const { currentCommunity } = useRealtime();
  const navigate = useNavigate();
  const [agentStates, setAgentStates] = useState({
    summarizer: true,
    mood: true,
    moderation: true,
    engagement: true,
    wellness: true,
    knowledge: true,
    focus: true
  });
  const [moderationCount, setModerationCount] = useState(0);

  // Check if user is owner
  const isOwner = currentCommunity?.role === 'owner';

  // Fetch moderation stats when community changes
  useEffect(() => {
    const fetchModerationCount = async () => {
      if (currentCommunity?.id && isOwner) {
        try {
          const stats = await getModerationStats(currentCommunity.id, 7);
          const totalFlagged = (stats?.flagged_messages || 0) + 
                               (stats?.blocked_messages || 0) + 
                               (stats?.warnings_issued || 0);
          setModerationCount(totalFlagged);
        } catch (error) {
          console.error('Error fetching moderation stats:', error);
          setModerationCount(0);
        }
      }
    };

    fetchModerationCount();
  }, [currentCommunity?.id, isOwner, getModerationStats]);

  const agents = [
    {
      id: 'summarizer',
      name: 'Summarizer',
      description: 'Generate conversation summaries',
      icon: <Brain className="w-5 h-5" />,
      status: agentStatus.summarizer || 'active',
      color: 'blue',
      enabled: agentStates.summarizer
    },
    {
      id: 'mood',
      name: 'Mood Tracker',
      description: 'Analyze sentiment & emotions',
      icon: <Heart className="w-5 h-5" />,
      status: agentStatus.mood_tracker || 'active',
      color: 'pink',
      enabled: agentStates.mood
    },
    ...(isOwner ? [{
      id: 'moderation',
      name: 'Moderation',
      description: 'Content safety & filtering',
      icon: <Shield className="w-5 h-5" />,
      status: agentStatus.moderation || 'active',
      color: 'red',
      alerts: moderationCount + moderationAlerts.length,
      enabled: agentStates.moderation
    }] : []),
    {
      id: 'engagement',
      name: 'Engagement',
      description: 'Channel activity metrics',
      icon: <TrendingUp className="w-5 h-5" />,
      status: agentStatus.engagement || 'active',
      color: 'green',
      enabled: agentStates.engagement
    },
    {
      id: 'wellness',
      name: 'Wellness',
      description: 'User wellness insights',
      icon: <Heart className="w-5 h-5" />,
      status: agentStatus.wellness || 'active',
      color: 'purple',
      enabled: agentStates.wellness
    },
    {
      id: 'knowledge',
      name: 'Knowledge Builder',
      description: 'Extract & organize Q&A',
      icon: <BookOpen className="w-5 h-5" />,
      status: agentStatus.knowledge_builder || 'active',
      color: 'indigo',
      enabled: agentStates.knowledge
    },
    {
      id: 'focus',
      name: 'Focus',
      description: 'Productivity tracking',
      icon: <Focus className="w-5 h-5" />,
      status: agentStatus.focus || 'active',
      color: 'orange',
      enabled: agentStates.focus
    }
  ];

  const handleToggle = (agentId: string, enabled: boolean) => {
    setAgentStates(prev => ({
      ...prev,
      [agentId]: enabled
    }));
  };

  const handleConfigure = (agentId: string) => {
    navigate(`/agent/${agentId}`);
  };

  const activeCount = agents.filter(a => a.enabled).length;

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--theme-bg-primary))] transition-colors duration-300">
      {/* Header - Fixed h-12 to align with Dashboard header */}
      <div className="flex-shrink-0 h-12 px-4 flex items-center border-b border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-header-bg))] transition-colors duration-300 relative">
        {/* Top accent line - hidden in basic theme */}
        {!isBasicTheme && (
          <div 
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'var(--theme-accent-gradient)' }}
          />
        )}
        
        <div className="flex items-center gap-3">
          <div className="relative">
            {/* Glow effect - hidden in basic theme */}
            {!isBasicTheme && (
              <div className="absolute inset-0 rounded-lg blur-md opacity-40 bg-[hsl(var(--theme-accent-primary))]" />
            )}
            <div className={`relative p-1.5 ${isBasicTheme ? 'rounded-md bg-[hsl(var(--theme-accent-primary))]' : 'rounded-lg bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] shadow-md'}`}>
              <Bot className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
              AI Agents
              {!isBasicTheme && <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--theme-accent-primary))]" />}
              <span className="text-xs font-normal text-[hsl(var(--theme-text-muted))]">
                <span className="text-emerald-400 font-medium">{activeCount}</span>/{agents.length}
              </span>
            </h2>
          </div>
        </div>
      </div>

      {/* Scrollable Agent Cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--theme-bg-tertiary)) transparent' }}>
        {agents.map(agent => (
          <AgentCard
            key={agent.id}
            id={agent.id}
            name={agent.name}
            description={agent.description}
            icon={agent.icon}
            status={agent.status as 'active' | 'inactive' | 'pending' | 'error'}
            enabled={agent.enabled}
            color={agent.color}
            alerts={agent.alerts}
            onToggle={handleToggle}
            onConfigure={handleConfigure}
          />
        ))}
        
        {/* Bottom spacer for better scroll experience */}
        <div className="h-2" />
      </div>
    </div>
  );
}