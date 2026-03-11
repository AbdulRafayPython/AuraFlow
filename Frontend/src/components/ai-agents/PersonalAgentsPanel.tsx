import { useState, useEffect, useCallback } from 'react';
import { 
  Bot, Heart, Focus as FocusIcon, Brain, Shield, TrendingUp, BookOpen,
  Power, Loader2, CheckCircle, Settings, ChevronDown, ChevronUp,
  Sparkles, RefreshCw, AlertCircle, Sliders, Terminal
} from 'lucide-react';
import { aiAgentService, InstalledAgent, AgentCatalogEntry } from '@/services/aiAgentService';
import { useNotifications } from '@/hooks/useNotifications';
import { AgentSettingsModal } from '@/components/modals/AgentSettingsModal';
import { AgentConfirmDialog } from '@/components/modals/AgentConfirmDialog';
import { AgentCommandModal } from '@/components/modals/AgentCommandModal';

const PERSONAL_AGENTS: { type: string; name: string; description: string; icon: React.ReactNode; color: string; gradient: string }[] = [
  { type: 'summarizer', name: 'Summarizer', description: 'Condenses long conversations into clear, actionable recaps via /summarize', icon: <Brain className="w-5 h-5" />, color: 'blue', gradient: 'from-blue-500 to-cyan-600' },
  { type: 'mood_tracker', name: 'Mood Tracker', description: 'Tracks your emotional patterns and sentiment across conversations', icon: <Heart className="w-5 h-5" />, color: 'pink', gradient: 'from-pink-500 to-rose-600' },
  { type: 'wellness', name: 'Wellness Monitor', description: 'Monitors your communication health and suggests breaks', icon: <Heart className="w-5 h-5" />, color: 'purple', gradient: 'from-purple-500 to-violet-600' },
];

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  blue: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  pink: { bg: 'bg-pink-500/15', text: 'text-pink-400', border: 'border-pink-500/30' },
  purple: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
};

export default function PersonalAgentsPanel() {
  const { showSuccess, showError } = useNotifications();
  const [activeAgents, setActiveAgents] = useState<InstalledAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // Modal state
  const [settingsAgent, setSettingsAgent] = useState<string | null>(null);
  const [commandAgent, setCommandAgent] = useState<string | null>(null);
  const [confirmAgent, setConfirmAgent] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const agents = await aiAgentService.getPersonalAgentStatus();
      setActiveAgents(agents);
    } catch (err) {
      console.error('Failed to fetch personal agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const isAgentActive = (type: string) => activeAgents.some(a => a.agent_type === type && a.enabled);
  const getAgent = (type: string) => activeAgents.find(a => a.agent_type === type);

  const handleToggle = async (agentType: string) => {
    const active = isAgentActive(agentType);
    setActionLoading(agentType);
    try {
      if (active) {
        await aiAgentService.deactivatePersonalAgent(agentType);
        showSuccess({ title: `${agentType.replace(/_/g, ' ')} deactivated` });
      } else {
        await aiAgentService.activatePersonalAgent(agentType);
        showSuccess({ title: `${agentType.replace(/_/g, ' ')} activated!` });
      }
      await fetchStatus();
    } catch (err: any) {
      showError({ title: err.message || `Failed to toggle ${agentType}` });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--theme-accent-primary))]" />
        <span className="ml-2 text-sm text-[hsl(var(--theme-text-muted))]">Loading agents...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[hsl(var(--theme-accent-primary))]" />
          <h3 className="text-base font-semibold text-[hsl(var(--theme-text-primary))]">
            Personal AI Agents
          </h3>
        </div>
        <button
          onClick={fetchStatus}
          className="p-2 rounded-lg hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-[hsl(var(--theme-text-muted))]">
        Activate personal agents to get individual insights about your mood, wellness, and productivity across all communities.
      </p>

      {/* Agent Cards */}
      <div className="space-y-3">
        {PERSONAL_AGENTS.map(agent => {
          const active = isAgentActive(agent.type);
          const agentData = getAgent(agent.type);
          const colors = COLOR_MAP[agent.color];
          const isExpanded = expandedAgent === agent.type;

          return (
            <div
              key={agent.type}
              className={`rounded-xl border transition-all ${
                active
                  ? `${colors.border} bg-[hsl(var(--theme-bg-secondary)/0.7)]`
                  : 'border-[hsl(var(--theme-border-default)/0.4)] bg-[hsl(var(--theme-bg-secondary)/0.3)]'
              }`}
            >
              <div className="flex items-center gap-3 p-4">
                <div className={`p-2.5 rounded-xl ${colors.bg} ${colors.text}`}>
                  {agent.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
                      {agent.name}
                    </h4>
                    {active && (
                      <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle className="w-2.5 h-2.5" /> Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5">{agent.description}</p>
                  {agentData && (
                    <p className="text-[10px] text-[hsl(var(--theme-text-muted))] mt-1">
                      {agentData.usage_count || 0} analyses performed
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(agent.type)}
                    disabled={actionLoading === agent.type}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      active ? 'bg-emerald-500' : 'bg-[hsl(var(--theme-bg-tertiary))]'
                    } ${actionLoading === agent.type ? 'opacity-50' : ''}`}
                  >
                    {actionLoading === agent.type ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-3 h-3 animate-spin text-white" />
                      </div>
                    ) : (
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${
                        active ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    )}
                  </button>

                  {/* Expand */}
                  <button
                    onClick={() => setExpandedAgent(isExpanded ? null : agent.type)}
                    className="p-1.5 rounded-lg hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))]"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded Info */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-[hsl(var(--theme-border-default)/0.3)]">
                  <div className="pt-3 space-y-2">
                    <p className="text-xs text-[hsl(var(--theme-text-secondary))]">
                      {agent.type === 'mood_tracker' && 'Analyzes sentiment in your messages using NLP and lexicon-based techniques. Tracks mood trends over time and surfaces emotional patterns.'}
                      {agent.type === 'wellness' && 'Monitors your communication frequency, active hours, and screen time patterns. Provides proactive wellbeing recommendations and burnout risk alerts.'}
                      {agent.type === 'focus' && 'Tracks focus sessions you start, analyzes distraction patterns, and provides productivity scores. Set goals and track your progress.'}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {agent.type === 'mood_tracker' && ['Sentiment Analysis', 'Emotion Detection', 'Roman Urdu', 'Trend Tracking'].map(f => (
                        <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] border border-[hsl(var(--theme-border-default)/0.3)]">{f}</span>
                      ))}
                      {agent.type === 'wellness' && ['Health Score', 'Break Alerts', 'Screen Time', 'Burnout Risk'].map(f => (
                        <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] border border-[hsl(var(--theme-border-default)/0.3)]">{f}</span>
                      ))}
                      {agent.type === 'focus' && ['Sessions', 'Productivity Score', 'Goals', 'Recommendations'].map(f => (
                        <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] border border-[hsl(var(--theme-border-default)/0.3)]">{f}</span>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => setCommandAgent(agent.type)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover))] transition-colors"
                      >
                        <Terminal className="w-3 h-3" />
                        Commands
                      </button>
                      {active && (
                        <button
                          onClick={() => setSettingsAgent(agent.type)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover))] transition-colors"
                        >
                          <Sliders className="w-3 h-3" />
                          Configure
                        </button>
                      )}
                      {active && (
                        <button
                          onClick={() => setConfirmAgent(agent.type)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[hsl(var(--theme-bg-tertiary)/0.3)] border border-[hsl(var(--theme-border-default)/0.3)]">
        <AlertCircle className="w-4 h-4 flex-shrink-0 text-[hsl(var(--theme-text-muted))] mt-0.5" />
        <p className="text-[11px] text-[hsl(var(--theme-text-muted))] leading-relaxed">
          Personal agents analyze your messages privately. Data is only visible to you and is never shared with community admins.
        </p>
      </div>

      {/* Modals */}
      {settingsAgent && (
        <AgentSettingsModal
          open={true}
          onClose={() => setSettingsAgent(null)}
          agentType={settingsAgent}
        />
      )}

      {commandAgent && (
        <AgentCommandModal
          open={true}
          onClose={() => setCommandAgent(null)}
          agentType={commandAgent}
          onOpenSettings={() => {
            const agent = commandAgent;
            setCommandAgent(null);
            setSettingsAgent(agent);
          }}
        />
      )}

      {confirmAgent && (
        <AgentConfirmDialog
          open={true}
          onClose={() => setConfirmAgent(null)}
          type="deactivate"
          agentName={confirmAgent}
          onConfirm={async () => {
            await handleToggle(confirmAgent);
            setConfirmAgent(null);
          }}
        />
      )}
    </div>
  );
}
