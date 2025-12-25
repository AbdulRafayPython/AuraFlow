import React, { useState, useEffect } from 'react';
import { 
  Bot, Brain, Shield, Heart, TrendingUp, BookOpen, Focus, X
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
  const { isDarkMode } = useTheme();
  const { agentStatus, moderationAlerts } = useAIAgents();
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

  // Check if user is owner
  const isOwner = currentCommunity?.role === 'owner';
  
  // Debug logging - comprehensive
  useEffect(() => {
    console.log('[AIAgentPanel] === DEBUG START ===');
    console.log('[AIAgentPanel] currentCommunity:', JSON.stringify(currentCommunity, null, 2));
    console.log('[AIAgentPanel] role value:', currentCommunity?.role);
    console.log('[AIAgentPanel] role type:', typeof currentCommunity?.role);
    console.log('[AIAgentPanel] isOwner:', isOwner);
    console.log('[AIAgentPanel] comparison result:', currentCommunity?.role === 'owner');
    console.log('[AIAgentPanel] === DEBUG END ===');
  }, [currentCommunity, isOwner]);

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
    // Only show moderation agent to owners
    ...(isOwner ? [{
      id: 'moderation',
      name: 'Moderation',
      description: 'Content safety & filtering',
      icon: <Shield className="w-5 h-5" />,
      status: agentStatus.moderation || 'active',
      color: 'red',
      alerts: moderationAlerts.length,
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
    // TODO: Persist to backend
  };

  const handleConfigure = (agentId: string) => {
    navigate(`/agent/${agentId}`);
  };

  if (!isOpen) return null;

  return (
    <div className={`h-full flex flex-col ${
      isDarkMode ? 'bg-slate-900' : 'bg-white'
    }`}>
      {/* Fixed Header */}
      <div className={`flex-shrink-0 flex items-center justify-between px-4 py-3 border-b ${
        isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'
      } shadow-sm`}>
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${
            isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50'
          }`}>
            <Bot className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
          <div>
            <h2 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              AI Agents
            </h2>
            <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-600'}`}>
              {agents.filter(a => a.enabled).length} of {agents.length} active
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className={`p-1.5 rounded-lg transition-colors ${
            isDarkMode ? 'hover:bg-slate-800 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
          }`}
          aria-label="Close AI Agents Panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Agent Cards */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
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
      </div>
    </div>
  );
}