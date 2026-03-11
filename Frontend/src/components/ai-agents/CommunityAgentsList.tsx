import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, TrendingUp, BookOpen, Focus, Settings, Power, Trash2,
  Terminal, Bot, Plus, Loader2, AlertCircle, CheckCircle,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useNotifications } from '@/hooks/useNotifications';
import { aiAgentService } from '@/services/aiAgentService';
import { AgentSettingsModal } from '@/components/modals/AgentSettingsModal';
import { AgentConfirmDialog } from '@/components/modals/AgentConfirmDialog';
import { AgentCommandModal } from '@/components/modals/AgentCommandModal';

/* ═══════════════════════════════════════════════════════════════
   CommunityAgentsList
   ───────────────────────────────────────────────────────────────
   Shows installed agents in a community with quick-action
   controls (toggle, configure, commands, uninstall).
   Used in CommunitySettings → Agents tab.
   ═══════════════════════════════════════════════════════════════ */

interface InstalledAgent {
  agent_type: string;
  enabled: boolean;
  settings?: Record<string, any>;
  installed_at?: string;
  usage_count?: number;
  last_active?: string;
}

interface CommunityAgentsListProps {
  communityId: number;
  isAdmin: boolean;
  onBrowseAgents?: () => void;
}

// Agent display configuration
const AGENT_CONFIG: Record<string, {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  gradient: string;
}> = {
  moderation: { name: 'Moderation', icon: Shield, color: 'red', gradient: 'from-red-500 to-rose-600' },
  engagement: { name: 'Engagement', icon: TrendingUp, color: 'emerald', gradient: 'from-emerald-500 to-green-600' },
  knowledge_builder: { name: 'Knowledge Builder', icon: BookOpen, color: 'indigo', gradient: 'from-indigo-500 to-purple-600' },
  knowledge: { name: 'Knowledge Builder', icon: BookOpen, color: 'indigo', gradient: 'from-indigo-500 to-purple-600' },
  focus: { name: 'Focus', icon: Focus, color: 'orange', gradient: 'from-orange-500 to-red-600' },
};

export default function CommunityAgentsList({ communityId, isAdmin, onBrowseAgents }: CommunityAgentsListProps) {
  const { currentTheme } = useTheme();
  const { showSuccess, showError } = useNotifications();
  const isBasicTheme = currentTheme === 'basic';

  const [agents, setAgents] = useState<InstalledAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingAgent, setTogglingAgent] = useState<string | null>(null);

  // Modal states
  const [settingsAgent, setSettingsAgent] = useState<string | null>(null);
  const [commandAgent, setCommandAgent] = useState<string | null>(null);
  const [confirmAgent, setConfirmAgent] = useState<{ type: 'uninstall' | 'deactivate'; agentType: string } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await aiAgentService.getCommunityAgentStatus(communityId);
      setAgents(data);
    } catch (err) {
      console.error('Failed to fetch community agents:', err);
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleToggle = async (agentType: string, currentlyEnabled: boolean) => {
    if (!isAdmin) return;
    setTogglingAgent(agentType);
    try {
      await aiAgentService.configureCommunityAgent(communityId, agentType, {}, !currentlyEnabled);
      showSuccess({ title: `Agent ${!currentlyEnabled ? 'enabled' : 'disabled'}` });
      fetchAgents();
    } catch (err: any) {
      showError({ title: err.message || 'Failed to toggle agent' });
    } finally {
      setTogglingAgent(null);
    }
  };

  const handleUninstall = async () => {
    if (!confirmAgent) return;
    setConfirmLoading(true);
    try {
      await aiAgentService.uninstallCommunityAgent(communityId, confirmAgent.agentType);
      showSuccess({ title: 'Agent uninstalled successfully' });
      setConfirmAgent(null);
      fetchAgents();
    } catch (err: any) {
      showError({ title: err.message || 'Failed to uninstall agent' });
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

  if (agents.length === 0) {
    return (
      <div className="text-center py-16">
        <Bot className={`w-16 h-16 mx-auto mb-4 text-[hsl(var(--theme-text-muted)/0.3)]`} />
        <h3 className="text-lg font-semibold text-[hsl(var(--theme-text-primary))] mb-2">No Agents Installed</h3>
        <p className="text-sm text-[hsl(var(--theme-text-muted))] mb-6 max-w-sm mx-auto">
          Install AI agents to automate moderation, boost engagement, and more.
        </p>
        {isAdmin && onBrowseAgents && (
          <button
            onClick={onBrowseAgents}
            className={`inline-flex items-center gap-2 px-5 py-2.5 ${isBasicTheme ? 'rounded-md' : 'rounded-xl'} font-semibold text-sm text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 transition-all`}
          >
            <Plus className="w-4 h-4" /> Browse Agents
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[hsl(var(--theme-text-primary))]">
            Installed Agents ({agents.length})
          </h3>
          <p className="text-xs text-[hsl(var(--theme-text-muted))]">
            Manage AI agents active in this community
          </p>
        </div>
        {isAdmin && onBrowseAgents && (
          <button
            onClick={onBrowseAgents}
            className={`flex items-center gap-1.5 px-3 py-1.5 ${isBasicTheme ? 'rounded-md' : 'rounded-lg'} text-xs font-medium bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-accent-primary))] border border-[hsl(var(--theme-accent-primary)/0.3)] hover:bg-[hsl(var(--theme-accent-primary)/0.25)] transition-all`}
          >
            <Plus className="w-3.5 h-3.5" /> Add Agent
          </button>
        )}
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {agents.map((agent) => {
          const config = AGENT_CONFIG[agent.agent_type] || AGENT_CONFIG.moderation;
          const IconComp = config.icon;
          const isToggling = togglingAgent === agent.agent_type;

          return (
            <div
              key={agent.agent_type}
              className={`${isBasicTheme ? 'rounded-lg' : 'rounded-xl'} border border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-bg-secondary)/0.5)] p-4 transition-all hover:border-[hsl(var(--theme-border-default))]`}
            >
              {/* Top Row: Icon + Name + Toggle */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 ${isBasicTheme ? 'rounded-md' : 'rounded-xl'} bg-gradient-to-br ${config.gradient} flex items-center justify-center`}>
                    <IconComp className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-[hsl(var(--theme-text-primary))]">{config.name}</h4>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {agent.enabled ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                          <CheckCircle className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--theme-text-muted))]">
                          <AlertCircle className="w-3 h-3" /> Disabled
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <button
                    onClick={() => handleToggle(agent.agent_type, agent.enabled)}
                    disabled={isToggling}
                    className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0
                      ${agent.enabled ? 'bg-emerald-500' : 'bg-[hsl(var(--theme-bg-tertiary))]'}
                      ${isToggling ? 'opacity-50' : ''}`}
                  >
                    <div
                      className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white transition-transform shadow-sm
                        ${agent.enabled ? 'translate-x-[18px]' : 'translate-x-0'}`}
                    />
                  </button>
                )}
              </div>

              {/* Stats */}
              {agent.usage_count !== undefined && (
                <div className="text-[11px] text-[hsl(var(--theme-text-muted))] mb-3">
                  {agent.usage_count} uses
                  {agent.last_active && ` · Last active ${new Date(agent.last_active).toLocaleDateString()}`}
                </div>
              )}

              {/* Action Buttons */}
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSettingsAgent(agent.agent_type)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 ${isBasicTheme ? 'rounded-md' : 'rounded-lg'} text-xs font-medium bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))] border border-[hsl(var(--theme-border-default))] hover:bg-[hsl(var(--theme-bg-hover))] transition-all`}
                  >
                    <Settings className="w-3.5 h-3.5" /> Configure
                  </button>
                  <button
                    onClick={() => setCommandAgent(agent.agent_type)}
                    className={`p-1.5 ${isBasicTheme ? 'rounded-md' : 'rounded-lg'} text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-all`}
                    title="Commands"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmAgent({ type: 'uninstall', agentType: agent.agent_type })}
                    className={`p-1.5 ${isBasicTheme ? 'rounded-md' : 'rounded-lg'} text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all`}
                    title="Uninstall"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
        communityId={communityId}
        onSuccess={fetchAgents}
      />

      <AgentCommandModal
        open={!!commandAgent}
        onClose={() => { setCommandAgent(null); }}
        agentType={commandAgent || 'moderation'}
      />

      {confirmAgent && (
        <AgentConfirmDialog
          open={true}
          onClose={() => setConfirmAgent(null)}
          type={confirmAgent.type}
          agentName={AGENT_CONFIG[confirmAgent.agentType]?.name || confirmAgent.agentType}
          onConfirm={handleUninstall}
          isLoading={confirmLoading}
        />
      )}
    </div>
  );
}
