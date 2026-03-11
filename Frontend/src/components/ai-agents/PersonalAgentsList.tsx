import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain, Heart, Settings, Power, Terminal, Bot, Plus, Loader2,
  AlertCircle, CheckCircle, Sparkles,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useNotifications } from '@/hooks/useNotifications';
import { aiAgentService } from '@/services/aiAgentService';
import { AgentSettingsModal } from '@/components/modals/AgentSettingsModal';
import { AgentConfirmDialog } from '@/components/modals/AgentConfirmDialog';
import { AgentCommandModal } from '@/components/modals/AgentCommandModal';

/* ═══════════════════════════════════════════════════════════════
   PersonalAgentsList
   ───────────────────────────────────────────────────────────────
   Shows the user's activated personal agents with quick-action
   controls (toggle, configure, commands, deactivate).
   Used in User Settings → Agents tab.
   ═══════════════════════════════════════════════════════════════ */

interface ActivatedAgent {
  agent_type: string;
  enabled: boolean;
  settings?: Record<string, any>;
  activated_at?: string;
  usage_count?: number;
}

interface PersonalAgentsListProps {
  onBrowseAgents?: () => void;
}

// Agent display configuration
const PERSONAL_AGENT_CONFIG: Record<string, {
  name: string;
  description: string;
  command: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  gradient: string;
}> = {
  summarizer: {
    name: 'Summarizer', description: 'Condenses conversations into clear recaps',
    command: '/summarize', icon: Brain, color: 'blue', gradient: 'from-blue-500 to-cyan-600',
  },
  mood_tracker: {
    name: 'Mood Tracker', description: 'Tracks your emotional tone and sentiment',
    command: '/mood', icon: Heart, color: 'pink', gradient: 'from-pink-500 to-rose-600',
  },
  mood: {
    name: 'Mood Tracker', description: 'Tracks your emotional tone and sentiment',
    command: '/mood', icon: Heart, color: 'pink', gradient: 'from-pink-500 to-rose-600',
  },
  wellness: {
    name: 'Wellness', description: 'Monitors activity patterns and provides wellness tips',
    command: '/wellness', icon: Heart, color: 'purple', gradient: 'from-purple-500 to-pink-600',
  },
};

// Canonical personal agent types to show
const PERSONAL_AGENT_TYPES = ['summarizer', 'mood_tracker', 'wellness'];

export default function PersonalAgentsList({ onBrowseAgents }: PersonalAgentsListProps) {
  const { currentTheme } = useTheme();
  const { showSuccess, showError } = useNotifications();
  const isBasicTheme = currentTheme === 'basic';

  const [activatedAgents, setActivatedAgents] = useState<ActivatedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingAgent, setTogglingAgent] = useState<string | null>(null);

  // Modal states
  const [settingsAgent, setSettingsAgent] = useState<string | null>(null);
  const [commandAgent, setCommandAgent] = useState<string | null>(null);
  const [confirmAgent, setConfirmAgent] = useState<string | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await aiAgentService.getPersonalAgentStatus();
      setActivatedAgents(data);
    } catch (err) {
      console.error('Failed to fetch personal agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleToggle = async (agentType: string, currentlyEnabled: boolean) => {
    setTogglingAgent(agentType);
    try {
      if (currentlyEnabled) {
        await aiAgentService.deactivatePersonalAgent(agentType);
        showSuccess({ title: `${PERSONAL_AGENT_CONFIG[agentType]?.name || agentType} deactivated` });
      } else {
        await aiAgentService.activatePersonalAgent(agentType);
        showSuccess({ title: `${PERSONAL_AGENT_CONFIG[agentType]?.name || agentType} activated` });
      }
      fetchAgents();
    } catch (err: any) {
      showError({ title: err.message || 'Failed to toggle agent' });
    } finally {
      setTogglingAgent(null);
    }
  };

  const handleDeactivate = async () => {
    if (!confirmAgent) return;
    setConfirmLoading(true);
    try {
      await aiAgentService.deactivatePersonalAgent(confirmAgent);
      showSuccess({ title: 'Agent deactivated' });
      setConfirmAgent(null);
      fetchAgents();
    } catch (err: any) {
      showError({ title: err.message || 'Failed to deactivate agent' });
    } finally {
      setConfirmLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--theme-accent-primary))]" />
      </div>
    );
  }

  // Build a combined view: all personal agent types, marking which are activated
  const agentViews = PERSONAL_AGENT_TYPES.map((type) => {
    const activated = activatedAgents.find(
      (a) => a.agent_type === type || a.agent_type === (type === 'mood_tracker' ? 'mood' : type)
    );
    return {
      type,
      config: PERSONAL_AGENT_CONFIG[type],
      isActivated: !!activated && activated.enabled,
      agent: activated,
    };
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[hsl(var(--theme-text-primary))]">
            Personal Agents
          </h3>
          <p className="text-xs text-[hsl(var(--theme-text-muted))]">
            Manage your personal AI assistants
          </p>
        </div>
        {onBrowseAgents && (
          <button
            onClick={onBrowseAgents}
            className={`flex items-center gap-1.5 px-3 py-1.5 ${isBasicTheme ? 'rounded-md' : 'rounded-lg'} text-xs font-medium bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-accent-primary))] border border-[hsl(var(--theme-accent-primary)/0.3)] hover:bg-[hsl(var(--theme-accent-primary)/0.25)] transition-all`}
          >
            <Sparkles className="w-3.5 h-3.5" /> Explore Agents
          </button>
        )}
      </div>

      {/* Agent Cards */}
      <div className="space-y-3">
        {agentViews.map(({ type, config, isActivated, agent }) => {
          const IconComp = config.icon;
          const isToggling = togglingAgent === type;

          return (
            <div
              key={type}
              className={`${isBasicTheme ? 'rounded-lg' : 'rounded-xl'} border border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-bg-secondary)/0.5)] p-4 transition-all hover:border-[hsl(var(--theme-border-default))]`}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={`p-2.5 ${isBasicTheme ? 'rounded-md' : 'rounded-xl'} bg-gradient-to-br ${config.gradient} flex items-center justify-center flex-shrink-0`}>
                  <IconComp className="w-5 h-5 text-white" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <h4 className="font-semibold text-sm text-[hsl(var(--theme-text-primary))]">{config.name}</h4>
                    <button
                      onClick={() => handleToggle(type, isActivated)}
                      disabled={isToggling}
                      className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0
                        ${isActivated ? 'bg-emerald-500' : 'bg-[hsl(var(--theme-bg-tertiary))]'}
                        ${isToggling ? 'opacity-50' : ''}`}
                    >
                      <div
                        className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white transition-transform shadow-sm
                          ${isActivated ? 'translate-x-[18px]' : 'translate-x-0'}`}
                      />
                    </button>
                  </div>

                  <p className="text-xs text-[hsl(var(--theme-text-muted))] mb-2">{config.description}</p>

                  <div className="flex items-center gap-2">
                    {isActivated ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                        <CheckCircle className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--theme-text-muted))]">
                        <AlertCircle className="w-3 h-3" /> Not activated
                      </span>
                    )}
                    {config.command && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))]">
                        {config.command}
                      </span>
                    )}
                    {agent?.usage_count !== undefined && agent.usage_count > 0 && (
                      <span className="text-[10px] text-[hsl(var(--theme-text-muted))]">
                        {agent.usage_count} uses
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons (when activated) */}
              {isActivated && (
                <div className="flex items-center gap-2 mt-3 ml-[52px]">
                  <button
                    onClick={() => setSettingsAgent(type)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 ${isBasicTheme ? 'rounded-md' : 'rounded-lg'} text-xs font-medium bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))] border border-[hsl(var(--theme-border-default))] hover:bg-[hsl(var(--theme-bg-hover))] transition-all`}
                  >
                    <Settings className="w-3.5 h-3.5" /> Configure
                  </button>
                  <button
                    onClick={() => setCommandAgent(type)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 ${isBasicTheme ? 'rounded-md' : 'rounded-lg'} text-xs font-medium bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))] border border-[hsl(var(--theme-border-default))] hover:bg-[hsl(var(--theme-bg-hover))] transition-all`}
                  >
                    <Terminal className="w-3.5 h-3.5" /> Commands
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modals */}
      <AgentSettingsModal
        open={!!settingsAgent}
        onClose={() => setSettingsAgent(null)}
        agentType={settingsAgent || ''}
        onSuccess={fetchAgents}
      />

      <AgentCommandModal
        open={!!commandAgent}
        onClose={() => { setCommandAgent(null); }}
        agentType={commandAgent || 'summarizer'}
      />

      {confirmAgent && (
        <AgentConfirmDialog
          open={true}
          onClose={() => setConfirmAgent(null)}
          type="deactivate"
          agentName={PERSONAL_AGENT_CONFIG[confirmAgent]?.name || confirmAgent}
          onConfirm={handleDeactivate}
          isLoading={confirmLoading}
        />
      )}
    </div>
  );
}
