import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Brain, Shield, Heart, TrendingUp, BookOpen, Focus,
  Activity, Settings, FileText, TestTube2, AlertTriangle, CheckCircle,
  ChevronDown, ChevronUp, Save, X, Power, Loader2, Send, Zap,
  Clock, Hash, BarChart3, Lock, Bell, Sliders, RefreshCw, Copy, Check
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { aiAgentService, AgentLog } from '@/services/aiAgentService';
import SummarizerAgent from '@/components/ai-agents/SummarizerAgent';
import MoodTrackerAgent from '@/components/ai-agents/MoodTrackerAgent';
import ModerationAgent from '@/components/ai-agents/ModerationAgent';
import EngagementAgent from '@/components/ai-agents/EngagementAgent';
import WellnessAgent from '@/components/ai-agents/WellnessAgent';
import KnowledgeBuilderAgent from '@/components/ai-agents/KnowledgeBuilderAgent';
import { FocusAgent } from '@/components/ai-agents/FocusAgent';

type SectionName = 'overview' | 'capabilities' | 'settings' | 'logs' | 'testing';

// Agent capabilities data
const AGENT_CAPABILITIES: Record<string, { features: string[]; automations: string[]; metrics: string[] }> = {
  summarizer: {
    features: ['Channel conversation summaries', 'Key topics extraction', 'Action items detection', 'Multi-language support', 'Customizable summary length'],
    automations: ['Auto-summarize on schedule', 'Triggered after N messages', 'Daily digest generation'],
    metrics: ['Summaries generated', 'Avg processing time', 'Topics extracted', 'Languages detected'],
  },
  mood: {
    features: ['Real-time sentiment analysis', 'Emotion classification', 'Mood trend tracking', 'Roman Urdu support', 'Individual & group sentiment'],
    automations: ['Per-message mood tracking', 'Hourly mood snapshots', 'Alert on negative trends'],
    metrics: ['Messages analyzed', 'Mood distribution', 'Sentiment accuracy', 'Trend direction'],
  },
  moderation: {
    features: ['Profanity & toxicity detection', 'Spam filtering', 'Custom keyword rules', 'Severity classification', 'Auto-warn / auto-block'],
    automations: ['Real-time message scanning', 'User violation counting', 'Automatic enforcement actions'],
    metrics: ['Messages moderated', 'Violations caught', 'False positive rate', 'Actions taken'],
  },
  engagement: {
    features: ['Activity heatmaps', 'Top contributor rankings', 'Peak hour analysis', 'Channel comparison', 'Conversation thread depth'],
    automations: ['30-minute periodic scans', 'Engagement score calculation', 'Inactive user detection'],
    metrics: ['Active users', 'Messages/hour', 'Response time avg', 'Engagement score'],
  },
  wellness: {
    features: ['Communication health check', 'Burnout risk detection', 'Screen time insights', 'Positive interaction tracking', 'Wellbeing recommendations'],
    automations: ['Hourly wellness checks', 'Break reminders', 'Overuse alerts'],
    metrics: ['Wellness score', 'Active hours', 'Break compliance', 'Risk level'],
  },
  knowledge: {
    features: ['Q&A extraction from conversations', 'Searchable knowledge base', 'Topic categorization', 'Answer quality scoring', 'Export to docs'],
    automations: ['2-hour extraction cycles', 'Auto-categorization', 'Duplicate detection'],
    metrics: ['Entries extracted', 'Topics covered', 'Search queries', 'Quality score avg'],
  },
  focus: {
    features: ['Focus session tracking', 'Distraction pattern analysis', 'Productivity scoring', 'Goal setting & tracking', 'Break optimization'],
    automations: ['Auto analyze every 50 messages', 'Session reminders', 'Daily focus reports'],
    metrics: ['Focus sessions', 'Avg duration', 'Productivity score', 'Goals completed'],
  },
};

// Agent settings schema
const AGENT_SETTINGS: Record<string, { key: string; label: string; type: 'toggle' | 'slider' | 'select'; options?: string[]; min?: number; max?: number; default: any }[]> = {
  summarizer: [
    { key: 'auto_summarize', label: 'Auto-summarize on schedule', type: 'toggle', default: true },
    { key: 'summary_length', label: 'Summary length', type: 'select', options: ['brief', 'standard', 'detailed'], default: 'standard' },
    { key: 'message_threshold', label: 'Messages before auto-summary', type: 'slider', min: 20, max: 200, default: 100 },
    { key: 'include_topics', label: 'Include key topics', type: 'toggle', default: true },
    { key: 'include_action_items', label: 'Include action items', type: 'toggle', default: true },
  ],
  mood: [
    { key: 'track_per_message', label: 'Track mood per message', type: 'toggle', default: true },
    { key: 'alert_negative_trend', label: 'Alert on negative trends', type: 'toggle', default: true },
    { key: 'sensitivity', label: 'Detection sensitivity', type: 'slider', min: 1, max: 10, default: 7 },
    { key: 'language', label: 'Primary language', type: 'select', options: ['english', 'roman_urdu', 'auto'], default: 'auto' },
  ],
  moderation: [
    { key: 'auto_filter', label: 'Auto-filter harmful content', type: 'toggle', default: true },
    { key: 'severity_threshold', label: 'Action threshold', type: 'select', options: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    { key: 'notify_admins', label: 'Notify admins on violations', type: 'toggle', default: true },
    { key: 'max_warnings', label: 'Max warnings before block', type: 'slider', min: 1, max: 10, default: 3 },
    { key: 'scan_attachments', label: 'Scan message attachments', type: 'toggle', default: false },
  ],
  engagement: [
    { key: 'auto_analyze', label: 'Auto-analyze periodically', type: 'toggle', default: true },
    { key: 'analysis_interval', label: 'Analysis interval (min)', type: 'slider', min: 10, max: 120, default: 30 },
    { key: 'track_threads', label: 'Track conversation threads', type: 'toggle', default: true },
    { key: 'leaderboard', label: 'Enable contributor leaderboard', type: 'toggle', default: true },
  ],
  wellness: [
    { key: 'auto_check', label: 'Periodic wellness checks', type: 'toggle', default: true },
    { key: 'break_reminders', label: 'Break reminders', type: 'toggle', default: true },
    { key: 'check_interval_hours', label: 'Check interval (hours)', type: 'slider', min: 1, max: 8, default: 1 },
    { key: 'burnout_detection', label: 'Burnout risk detection', type: 'toggle', default: true },
  ],
  knowledge: [
    { key: 'auto_extract', label: 'Auto-extract knowledge', type: 'toggle', default: true },
    { key: 'extraction_interval_hours', label: 'Extraction interval (hours)', type: 'slider', min: 1, max: 12, default: 2 },
    { key: 'min_quality_score', label: 'Min quality score', type: 'slider', min: 1, max: 10, default: 5 },
    { key: 'auto_categorize', label: 'Auto-categorize entries', type: 'toggle', default: true },
  ],
  focus: [
    { key: 'auto_analyze', label: 'Auto-analyze focus patterns', type: 'toggle', default: true },
    { key: 'session_reminders', label: 'Session start reminders', type: 'toggle', default: true },
    { key: 'daily_report', label: 'Daily focus report', type: 'toggle', default: false },
    { key: 'default_session_minutes', label: 'Default session length (min)', type: 'slider', min: 15, max: 120, default: 25 },
  ],
};

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
  
  // Settings state
  const [settingsValues, setSettingsValues] = useState<Record<string, any>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  
  // Logs state
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [totalLogPages, setTotalLogPages] = useState(1);
  const [logFilter, setLogFilter] = useState<string>('all');
  
  // Testing state
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  
  // Initialize settings defaults
  useEffect(() => {
    if (agentId && AGENT_SETTINGS[agentId]) {
      const defaults: Record<string, any> = {};
      AGENT_SETTINGS[agentId].forEach(s => { defaults[s.key] = s.default; });
      setSettingsValues(defaults);
    }
  }, [agentId]);

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

  // Fetch logs
  const fetchLogs = useCallback(async (page = 1) => {
    if (!agentId) return;
    setLogsLoading(true);
    try {
      const result = await aiAgentService.getAgentLogs({
        agent_type: agentId === 'mood' ? 'mood_tracker' : agentId === 'knowledge' ? 'knowledge_builder' : agentId,
        status: logFilter === 'all' ? undefined : logFilter,
        page,
        limit: 10,
      });
      setLogs(result.logs || []);
      setTotalLogPages(result.pagination?.pages || 1);
      setLogsPage(page);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLogsLoading(false);
    }
  }, [agentId, logFilter]);

  // Load logs when section is expanded
  useEffect(() => {
    if (expandedSections.has('logs')) {
      fetchLogs(1);
    }
  }, [expandedSections, fetchLogs]);

  const handleSave = async () => {
    setSavingSettings(true);
    try {
      // Save via personal agent configuration
      await aiAgentService.configurePersonalAgent(
        agentId === 'mood' ? 'mood_tracker' : agentId === 'knowledge' ? 'knowledge_builder' : agentId!,
        settingsValues,
        agentEnabled
      );
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDiscard = () => {
    if (agentId && AGENT_SETTINGS[agentId]) {
      const defaults: Record<string, any> = {};
      AGENT_SETTINGS[agentId].forEach(s => { defaults[s.key] = s.default; });
      setSettingsValues(defaults);
    }
    setHasUnsavedChanges(false);
  };

  const updateSetting = (key: string, value: any) => {
    setSettingsValues(prev => ({ ...prev, [key]: value }));
    setHasUnsavedChanges(true);
  };

  // Test the agent
  const handleTest = async () => {
    if (!testInput.trim() || !agentId) return;
    setTesting(true);
    setTestResult(null);
    try {
      let result: any;
      switch (agentId) {
        case 'moderation':
          result = await aiAgentService.moderateMessage(testInput);
          break;
        case 'mood':
          result = await aiAgentService.analyzeMessage(testInput);
          break;
        case 'summarizer':
          result = { simulated: true, summary: `Summary of: "${testInput.slice(0, 50)}..."`, note: 'Live testing requires a channel with messages. Use the Overview tab for full functionality.' };
          break;
        default:
          result = { simulated: true, input: testInput, note: `${agentId} agent testing requires channel context. Use the Overview tab for full functionality.` };
      }
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ error: err.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const copyResult = () => {
    if (testResult) {
      navigator.clipboard.writeText(JSON.stringify(testResult, null, 2));
      setCopiedResult(true);
      setTimeout(() => setCopiedResult(false), 2000);
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
                  disabled={savingSettings}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
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
          {expandedSections.has('capabilities') && agentId && AGENT_CAPABILITIES[agentId] && (
            <section className="rounded-xl border bg-[hsl(var(--theme-bg-secondary)/0.6)] backdrop-blur-sm border-[hsl(var(--theme-border-default))] shadow-sm">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-5 text-[hsl(var(--theme-text-primary))]">
                  Capabilities
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Features */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">Features</h3>
                    </div>
                    {AGENT_CAPABILITIES[agentId].features.map((f, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[hsl(var(--theme-bg-tertiary)/0.4)]">
                        <CheckCircle className="w-3.5 h-3.5 mt-0.5 text-emerald-400 flex-shrink-0" />
                        <span className="text-xs text-[hsl(var(--theme-text-secondary))]">{f}</span>
                      </div>
                    ))}
                  </div>

                  {/* Automations */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-3">
                      <RefreshCw className="w-4 h-4 text-blue-400" />
                      <h3 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">Automations</h3>
                    </div>
                    {AGENT_CAPABILITIES[agentId].automations.map((a, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[hsl(var(--theme-bg-tertiary)/0.4)]">
                        <Activity className="w-3.5 h-3.5 mt-0.5 text-blue-400 flex-shrink-0" />
                        <span className="text-xs text-[hsl(var(--theme-text-secondary))]">{a}</span>
                      </div>
                    ))}
                  </div>

                  {/* Metrics */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="w-4 h-4 text-purple-400" />
                      <h3 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">Tracked Metrics</h3>
                    </div>
                    {AGENT_CAPABILITIES[agentId].metrics.map((m, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[hsl(var(--theme-bg-tertiary)/0.4)]">
                        <Hash className="w-3.5 h-3.5 mt-0.5 text-purple-400 flex-shrink-0" />
                        <span className="text-xs text-[hsl(var(--theme-text-secondary))]">{m}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Settings Section */}
          {expandedSections.has('settings') && agentId && AGENT_SETTINGS[agentId] && (
            <section className="rounded-xl border bg-[hsl(var(--theme-bg-secondary)/0.6)] backdrop-blur-sm border-[hsl(var(--theme-border-default))] shadow-sm">
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-semibold text-[hsl(var(--theme-text-primary))]">
                    Settings
                  </h2>
                  {hasUnsavedChanges && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDiscard}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover))]"
                      >
                        Reset
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={savingSettings}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[hsl(var(--theme-accent-primary))] text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
                      >
                        {savingSettings ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  {AGENT_SETTINGS[agentId].map(setting => (
                    <div key={setting.key} className="flex items-center justify-between p-3.5 rounded-xl bg-[hsl(var(--theme-bg-tertiary)/0.4)] border border-[hsl(var(--theme-border-default)/0.3)]">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[hsl(var(--theme-text-primary))]">{setting.label}</p>
                      </div>
                      
                      {setting.type === 'toggle' && (
                        <button
                          onClick={() => updateSetting(setting.key, !settingsValues[setting.key])}
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            settingsValues[setting.key] ? 'bg-emerald-500' : 'bg-[hsl(var(--theme-bg-tertiary))]'
                          }`}
                        >
                          <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${
                            settingsValues[setting.key] ? 'translate-x-5' : 'translate-x-0'
                          }`} />
                        </button>
                      )}
                      
                      {setting.type === 'slider' && (
                        <div className="flex items-center gap-3 w-48">
                          <input
                            type="range"
                            min={setting.min}
                            max={setting.max}
                            value={settingsValues[setting.key] || setting.default}
                            onChange={e => updateSetting(setting.key, Number(e.target.value))}
                            className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer bg-[hsl(var(--theme-bg-tertiary))] accent-[hsl(var(--theme-accent-primary))]"
                          />
                          <span className="text-xs font-mono text-[hsl(var(--theme-text-muted))] min-w-[2ch] text-right">
                            {settingsValues[setting.key] || setting.default}
                          </span>
                        </div>
                      )}
                      
                      {setting.type === 'select' && (
                        <select
                          value={settingsValues[setting.key] || setting.default}
                          onChange={e => updateSetting(setting.key, e.target.value)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))]"
                        >
                          {setting.options?.map(opt => (
                            <option key={opt} value={opt}>{opt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Logs Section */}
          {expandedSections.has('logs') && (
            <section className="rounded-xl border bg-[hsl(var(--theme-bg-secondary)/0.6)] backdrop-blur-sm border-[hsl(var(--theme-border-default))] shadow-sm">
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-semibold text-[hsl(var(--theme-text-primary))]">
                    Activity Logs
                  </h2>
                  <div className="flex items-center gap-2">
                    <select
                      value={logFilter}
                      onChange={e => setLogFilter(e.target.value)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[hsl(var(--theme-bg-tertiary))] border border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] focus:outline-none"
                    >
                      <option value="all">All</option>
                      <option value="success">Success</option>
                      <option value="error">Errors</option>
                      <option value="warning">Warnings</option>
                    </select>
                    <button
                      onClick={() => fetchLogs(logsPage)}
                      disabled={logsLoading}
                      className="p-2 rounded-lg hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))]"
                    >
                      <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>
                
                {logsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--theme-accent-primary))]" />
                  </div>
                ) : logs.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-10 h-10 mx-auto mb-3 text-[hsl(var(--theme-text-muted))] opacity-30" />
                    <p className="text-sm text-[hsl(var(--theme-text-muted))]">No activity logs yet</p>
                    <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-1">Logs will appear here as the agent processes data</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {logs.map((log, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-[hsl(var(--theme-bg-tertiary)/0.4)] border border-[hsl(var(--theme-border-default)/0.2)]">
                          <div className={`mt-0.5 p-1 rounded-full flex-shrink-0 ${
                            log.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                            log.status === 'error' ? 'bg-red-500/20 text-red-400' :
                            'bg-amber-500/20 text-amber-400'
                          }`}>
                            {log.status === 'success' ? <CheckCircle className="w-3 h-3" /> :
                             log.status === 'error' ? <AlertTriangle className="w-3 h-3" /> :
                             <AlertTriangle className="w-3 h-3" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium text-[hsl(var(--theme-text-primary))]">
                                {log.action_type || log.agent_name}
                              </span>
                              {log.community_id && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))]">
                                  Community #{log.community_id}
                                </span>
                              )}
                            </div>
                            {log.output_data && (
                              <p className="text-[11px] text-[hsl(var(--theme-text-muted))] line-clamp-2">
                                {log.output_data}
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] text-[hsl(var(--theme-text-muted))] flex-shrink-0 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {log.created_at ? new Date(log.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    {/* Pagination */}
                    {totalLogPages > 1 && (
                      <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-[hsl(var(--theme-border-default)/0.3)]">
                        <button
                          onClick={() => fetchLogs(logsPage - 1)}
                          disabled={logsPage <= 1 || logsLoading}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover))] disabled:opacity-30"
                        >
                          Previous
                        </button>
                        <span className="text-xs text-[hsl(var(--theme-text-muted))]">
                          Page {logsPage} of {totalLogPages}
                        </span>
                        <button
                          onClick={() => fetchLogs(logsPage + 1)}
                          disabled={logsPage >= totalLogPages || logsLoading}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover))] disabled:opacity-30"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          {/* Testing Section */}
          {expandedSections.has('testing') && (
            <section className="rounded-xl border bg-[hsl(var(--theme-bg-secondary)/0.6)] backdrop-blur-sm border-[hsl(var(--theme-border-default))] shadow-sm">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-2 text-[hsl(var(--theme-text-primary))]">
                  Testing & Simulation
                </h2>
                <p className="text-xs text-[hsl(var(--theme-text-muted))] mb-5">
                  {agentId === 'moderation' 
                    ? 'Test how the moderation agent evaluates a message for policy violations.'
                    : agentId === 'mood'
                    ? 'Test sentiment analysis on a sample message.'
                    : 'Enter sample text to test agent processing. Some agents require channel context for full testing.'
                  }
                </p>
                
                {/* Input Area */}
                <div className="relative mb-4">
                  <textarea
                    value={testInput}
                    onChange={e => setTestInput(e.target.value)}
                    placeholder={
                      agentId === 'moderation' 
                        ? 'Enter a message to test moderation...'
                        : agentId === 'mood'
                        ? 'Enter a message to analyze sentiment...'
                        : 'Enter sample text to test the agent...'
                    }
                    rows={3}
                    className="w-full px-4 py-3 pr-12 rounded-xl border transition-all focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] resize-none bg-[hsl(var(--theme-bg-tertiary)/0.5)] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))] text-sm"
                  />
                  <button
                    onClick={handleTest}
                    disabled={testing || !testInput.trim()}
                    className="absolute right-3 bottom-3 p-2 rounded-lg bg-[hsl(var(--theme-accent-primary))] text-white hover:opacity-90 disabled:opacity-30 transition-all"
                  >
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
                
                {/* Result Display */}
                {testResult && (
                  <div className="relative rounded-xl border bg-[hsl(var(--theme-bg-tertiary)/0.5)] border-[hsl(var(--theme-border-default))] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[hsl(var(--theme-border-default)/0.3)]">
                      <span className="text-xs font-medium text-[hsl(var(--theme-text-secondary))]">Result</span>
                      <button
                        onClick={copyResult}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover))]"
                      >
                        {copiedResult ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copiedResult ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="p-4 text-xs text-[hsl(var(--theme-text-secondary))] overflow-x-auto whitespace-pre-wrap max-h-64 custom-scrollbar font-mono leading-relaxed">
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
