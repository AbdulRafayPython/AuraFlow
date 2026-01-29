import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Brain, Shield, Heart, TrendingUp, BookOpen, Focus,
  Activity, Settings, FileText, TestTube2, AlertTriangle, CheckCircle,
  ChevronDown, ChevronUp, Save, X, Power
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAIAgents } from '@/contexts/AIAgentContext';
import SummarizerAgent from '@/components/ai-agents/SummarizerAgent';
import MoodTrackerAgent from '@/components/ai-agents/MoodTrackerAgent';
import ModerationAgent from '@/components/ai-agents/ModerationAgent';
import EngagementAgent from '@/components/ai-agents/EngagementAgent';
import WellnessAgent from '@/components/ai-agents/WellnessAgent';
import KnowledgeBuilderAgent from '@/components/ai-agents/KnowledgeBuilderAgent';
import { FocusAgent } from '@/components/ai-agents/FocusAgent';

type SectionName = 'overview' | 'capabilities' | 'settings' | 'logs' | 'testing';

export default function AgentDetails() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const { agentStatus } = useAIAgents();
  
  const [expandedSections, setExpandedSections] = useState<Set<SectionName>>(
    new Set(['overview', 'capabilities'])
  );
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const getAgentConfig = () => {
    switch (agentId) {
      case 'summarizer':
        return {
          name: 'Conversation Summarizer',
          description: 'Generates intelligent summaries of channel conversations',
          icon: <Brain className="w-6 h-6" />,
          color: 'blue',
          status: agentStatus.summarizer || 'active'
        };
      case 'mood':
        return {
          name: 'Mood Tracker',
          description: 'Analyzes sentiment and emotional patterns in conversations',
          icon: <Heart className="w-6 h-6" />,
          color: 'pink',
          status: agentStatus.mood_tracker || 'active'
        };
      case 'moderation':
        return {
          name: 'Smart Moderation',
          description: 'Monitors content for policy violations and safety',
          icon: <Shield className="w-6 h-6" />,
          color: 'red',
          status: agentStatus.moderation || 'active'
        };
      case 'engagement':
        return {
          name: 'Engagement Analytics',
          description: 'Tracks channel activity and user engagement metrics',
          icon: <TrendingUp className="w-6 h-6" />,
          color: 'green',
          status: agentStatus.engagement || 'active'
        };
      case 'wellness':
        return {
          name: 'Wellness Monitor',
          description: 'Provides insights on user wellness and communication health',
          icon: <Heart className="w-6 h-6" />,
          color: 'purple',
          status: agentStatus.wellness || 'active'
        };
      case 'knowledge':
        return {
          name: 'Knowledge Builder',
          description: 'Extracts and organizes Q&A from conversations',
          icon: <BookOpen className="w-6 h-6" />,
          color: 'indigo',
          status: agentStatus.knowledge_builder || 'active'
        };
      case 'focus':
        return {
          name: 'Focus Assistant',
          description: 'Helps track productivity and focus time',
          icon: <Focus className="w-6 h-6" />,
          color: 'orange',
          status: agentStatus.focus || 'active'
        };
      default:
        return null;
    }
  };

  const agent = getAgentConfig();

  if (!agent) {
    return (
      <div 
        className="h-screen flex items-center justify-center"
        style={{ background: 'var(--theme-bg-gradient)' }}
      >
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-500" />
          <h2 className="text-2xl font-bold mb-2 text-[hsl(var(--theme-text-primary))]">Agent Not Found</h2>
          <p className="text-[hsl(var(--theme-text-muted))] mb-4">The requested AI agent does not exist.</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-[hsl(var(--theme-accent-primary))] text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const toggleSection = (section: SectionName) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const handleSave = () => {
    // TODO: Implement save logic
    setHasUnsavedChanges(false);
  };

  const handleDiscard = () => {
    if (confirm('Discard unsaved changes?')) {
      setHasUnsavedChanges(false);
    }
  };

  const renderAgentInterface = () => {
    switch (agentId) {
      case 'summarizer':
        return <SummarizerAgent />;
      case 'mood':
        return <MoodTrackerAgent />;
      case 'moderation':
        return <ModerationAgent />;
      case 'engagement':
        return <EngagementAgent />;
      case 'wellness':
        return <WellnessAgent />;
      case 'knowledge':
        return <KnowledgeBuilderAgent />;
      case 'focus':
        return <FocusAgent />;
      default:
        return null;
    }
  };

  return (
    <div 
      className="h-screen flex flex-col"
      style={{ background: 'var(--theme-bg-gradient)' }}
    >
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-[hsl(var(--theme-bg-secondary)/0.8)] border-[hsl(var(--theme-border-default))] backdrop-blur-xl shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-text-primary))]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back</span>
            </button>

            {/* Save/Discard Controls */}
            {hasUnsavedChanges && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDiscard}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))]"
                >
                  <X className="w-4 h-4 inline mr-1" />
                  Discard
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  <Save className="w-4 h-4 inline mr-1" />
                  Save Changes
                </button>
              </div>
            )}
          </div>

          {/* Agent Header */}
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl bg-${agent.color}-500/20`}>
              <div className={`text-${agent.color}-400`}>
                {agent.icon}
              </div>
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))]">
                  {agent.name}
                </h1>
                
                {/* Status Badge */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  agent.status === 'active'
                    ? 'bg-green-500/20 text-green-400'
                    : agent.status === 'error'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {agent.status === 'active' && <CheckCircle className="w-3.5 h-3.5" />}
                  {agent.status === 'error' && <AlertTriangle className="w-3.5 h-3.5" />}
                  <span className="capitalize">{agent.status}</span>
                </div>

                {/* Enable/Disable Toggle */}
                <button
                  onClick={() => setAgentEnabled(!agentEnabled)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    agentEnabled
                      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {agentEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
              
              <p className="text-sm text-[hsl(var(--theme-text-secondary))]">
                {agent.description}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 px-6 border-t border-[hsl(var(--theme-border-default))]">
          {[
            { id: 'overview', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
            { id: 'capabilities', label: 'Capabilities', icon: <CheckCircle className="w-4 h-4" /> },
            { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
            { id: 'logs', label: 'Logs', icon: <FileText className="w-4 h-4" /> },
            { id: 'testing', label: 'Testing', icon: <TestTube2 className="w-4 h-4" /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => toggleSection(tab.id as SectionName)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
                expandedSections.has(tab.id as SectionName)
                  ? 'text-[hsl(var(--theme-accent-primary))]'
                  : 'text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-text-primary))]'
              }`}
            >
              {tab.icon}
              {tab.label}
              {expandedSections.has(tab.id as SectionName) && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--theme-accent-primary))]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          {/* Overview Section */}
          {expandedSections.has('overview') && (
            <section className="rounded-xl border bg-[hsl(var(--theme-bg-secondary)/0.6)] backdrop-blur-sm border-[hsl(var(--theme-border-default))] shadow-sm overflow-hidden">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4 text-[hsl(var(--theme-text-primary))]">
                  Agent Interface
                </h2>
                
                {/* Agent Component */}
                <div className="rounded-lg border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-tertiary)/0.5)]">
                  {renderAgentInterface()}
                </div>
              </div>
            </section>
          )}

          {/* Capabilities Section */}
          {expandedSections.has('capabilities') && (
            <section className="rounded-xl border bg-[hsl(var(--theme-bg-secondary)/0.6)] backdrop-blur-sm border-[hsl(var(--theme-border-default))] shadow-sm">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4 text-[hsl(var(--theme-text-primary))]">
                  Capabilities
                </h2>
                <div className="space-y-3 text-[hsl(var(--theme-text-secondary))]">
                  <p className="text-sm">
                    This section will display the agent's capabilities, enabled features, and supported actions.
                  </p>
                  {/* TODO: Add specific capabilities based on agent type */}
                </div>
              </div>
            </section>
          )}

          {/* Settings Section */}
          {expandedSections.has('settings') && (
            <section className="rounded-xl border bg-[hsl(var(--theme-bg-secondary)/0.6)] backdrop-blur-sm border-[hsl(var(--theme-border-default))] shadow-sm">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4 text-[hsl(var(--theme-text-primary))]">
                  Settings
                </h2>
                <div className="space-y-3 text-[hsl(var(--theme-text-secondary))]">
                  <p className="text-sm">
                    Configure thresholds, prompts, rules, and other agent-specific settings here.
                  </p>
                  {/* TODO: Add settings form based on agent type */}
                </div>
              </div>
            </section>
          )}

          {/* Logs Section */}
          {expandedSections.has('logs') && (
            <section className="rounded-xl border bg-[hsl(var(--theme-bg-secondary)/0.6)] backdrop-blur-sm border-[hsl(var(--theme-border-default))] shadow-sm">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4 text-[hsl(var(--theme-text-primary))]">
                  Activity Logs
                </h2>
                <div className="space-y-3 text-[hsl(var(--theme-text-secondary))]">
                  <p className="text-sm">
                    View recent agent actions, errors, and events.
                  </p>
                  {/* TODO: Add logs display based on agent type */}
                </div>
              </div>
            </section>
          )}

          {/* Testing Section */}
          {expandedSections.has('testing') && (
            <section className="rounded-xl border bg-[hsl(var(--theme-bg-secondary)/0.6)] backdrop-blur-sm border-[hsl(var(--theme-border-default))] shadow-sm">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4 text-[hsl(var(--theme-text-primary))]">
                  Testing & Simulation
                </h2>
                <div className="space-y-3 text-[hsl(var(--theme-text-secondary))]">
                  <p className="text-sm">
                    Test the agent with sample inputs and view expected outputs.
                  </p>
                  {/* TODO: Add testing interface based on agent type */}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
