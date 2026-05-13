import { useState, useEffect, useCallback } from 'react';
import {
  Bot, Shield, Heart, TrendingUp, BookOpen, Brain, Focus as FocusIcon,
  Power, Settings, Trash2, Loader2, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Plus, RefreshCw, Sliders, Terminal,
  Sparkles, Mail, GraduationCap, Languages
} from 'lucide-react';
import { aiAgentService, AgentCatalogEntry, InstalledAgent } from '@/services/aiAgentService';
import { useNotifications } from '@/hooks/useNotifications';
import { AgentSettingsModal } from '@/components/modals/AgentSettingsModal';
import { AgentConfirmDialog } from '@/components/modals/AgentConfirmDialog';
import { AgentCommandModal } from '@/components/modals/AgentCommandModal';

interface CommunityAgentsTabProps {
  communityId: number;
  isAdmin: boolean;
}

const AGENT_ICONS: Record<string, React.ReactNode> = {
  moderation:        <Shield className="w-5 h-5" />,
  engagement:        <TrendingUp className="w-5 h-5" />,
  knowledge:         <BookOpen className="w-5 h-5" />,
  knowledge_builder: <BookOpen className="w-5 h-5" />,
  focus:             <FocusIcon className="w-5 h-5" />,
  summarizer:        <Brain className="w-5 h-5" />,
  mood:              <Heart className="w-5 h-5" />,
  mood_tracker:      <Heart className="w-5 h-5" />,
  wellness:          <Heart className="w-5 h-5" />,
  assistant:         <Sparkles className="w-5 h-5" />,
  auto_message:      <Mail className="w-5 h-5" />,
  support:           <GraduationCap className="w-5 h-5" />,
  translator:        <Languages className="w-5 h-5" />,
};

const AGENT_COLORS: Record<string, { bg: string; text: string; border: string; gradient: string }> = {
  moderation:        { bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30',     gradient: 'from-red-500 to-rose-600' },
  engagement:        { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', gradient: 'from-emerald-500 to-teal-600' },
  knowledge:         { bg: 'bg-indigo-500/15',  text: 'text-indigo-400',  border: 'border-indigo-500/30',  gradient: 'from-indigo-500 to-blue-600' },
  knowledge_builder: { bg: 'bg-indigo-500/15',  text: 'text-indigo-400',  border: 'border-indigo-500/30',  gradient: 'from-indigo-500 to-blue-600' },
  focus:             { bg: 'bg-orange-500/15',  text: 'text-orange-400',  border: 'border-orange-500/30',  gradient: 'from-orange-500 to-amber-600' },
  summarizer:        { bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30',    gradient: 'from-blue-500 to-cyan-600' },
  mood:              { bg: 'bg-pink-500/15',    text: 'text-pink-400',    border: 'border-pink-500/30',    gradient: 'from-pink-500 to-rose-600' },
  mood_tracker:      { bg: 'bg-pink-500/15',    text: 'text-pink-400',    border: 'border-pink-500/30',    gradient: 'from-pink-500 to-rose-600' },
  wellness:          { bg: 'bg-purple-500/15',  text: 'text-purple-400',  border: 'border-purple-500/30',  gradient: 'from-purple-500 to-violet-600' },
  assistant:         { bg: 'bg-violet-500/15',  text: 'text-violet-400',  border: 'border-violet-500/30',  gradient: 'from-violet-500 to-purple-600' },
  auto_message:      { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30',   gradient: 'from-amber-500 to-orange-600' },
  support:           { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', gradient: 'from-emerald-500 to-teal-600' },
  translator:        { bg: 'bg-cyan-500/15',    text: 'text-cyan-400',    border: 'border-cyan-500/30',    gradient: 'from-cyan-500 to-blue-600' },
};

export default function CommunityAgentsTab({ communityId, isAdmin }: CommunityAgentsTabProps) {
  const { showSuccess, showError } = useNotifications();
  const [installed, setInstalled] = useState<InstalledAgent[]>([]);
  const [catalog, setCatalog] = useState<AgentCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showInstallPanel, setShowInstallPanel] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);

  // Modal state
  const [settingsAgent, setSettingsAgent] = useState<string | null>(null);
  const [commandAgent, setCommandAgent] = useState<string | null>(null);
  const [confirmDialogAgent, setConfirmDialogAgent] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [installedAgents, catalogData] = await Promise.all([
        aiAgentService.getCommunityAgentStatus(communityId),
        aiAgentService.getAgentCatalog(communityId),
      ]);
      setInstalled(installedAgents);
      setCatalog(catalogData);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = async (agentType: string, currentEnabled: boolean) => {
    setActionLoading(agentType);
    try {
      await aiAgentService.configureCommunityAgent(communityId, agentType, {}, !currentEnabled);
      setInstalled(prev => prev.map(a => 
        a.agent_type === agentType ? { ...a, enabled: !currentEnabled } : a
      ));
      showSuccess({ title: `${agentType} ${!currentEnabled ? 'enabled' : 'disabled'}` });
    } catch (err: any) {
      showError({ title: err.message || 'Failed to toggle agent' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleInstall = async (agentType: string) => {
    setActionLoading(agentType);
    try {
      await aiAgentService.installCommunityAgent(communityId, agentType);
      showSuccess({ title: `${agentType} agent installed!` });
      await fetchData();
      setShowInstallPanel(false);
    } catch (err: any) {
      showError({ title: err.message || 'Failed to install agent' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUninstall = async (agentType: string) => {
    setActionLoading(agentType);
    try {
      await aiAgentService.uninstallCommunityAgent(communityId, agentType);
      showSuccess({ title: `${agentType} agent uninstalled` });
      setConfirmUninstall(null);
      await fetchData();
    } catch (err: any) {
      showError({ title: err.message || 'Failed to uninstall agent' });
    } finally {
      setActionLoading(null);
    }
  };

  const availableToInstall = catalog.filter(
    a => a.category === 'community' && !a.community_status?.installed
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--theme-accent-primary))]" />
        <span className="ml-2 text-sm text-[hsl(var(--theme-text-muted))]">Loading agents...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-[hsl(var(--theme-accent-primary))]" />
          <h3 className="text-base font-semibold text-[hsl(var(--theme-text-primary))]">
            AI Agents
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))]">
            {installed.length} installed
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="p-2 rounded-lg hover:bg-[hsl(var(--theme-bg-hover))] transition-colors text-[hsl(var(--theme-text-muted))]"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowInstallPanel(!showInstallPanel)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] text-white hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" />
              Install Agent
            </button>
          )}
        </div>
      </div>

      {!isAdmin && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
          <p className="text-xs text-amber-300">Only admins and owners can manage agents.</p>
        </div>
      )}

      {/* Install Panel */}
      {showInstallPanel && isAdmin && (
        <div className="p-4 rounded-xl border bg-[hsl(var(--theme-bg-tertiary)/0.5)] border-[hsl(var(--theme-border-default))]">
          <h4 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))] mb-3">
            Available Community Agents
          </h4>
          {availableToInstall.length === 0 ? (
            <p className="text-xs text-[hsl(var(--theme-text-muted))]">
              All community agents are already installed! 🎉
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {availableToInstall.map(agent => {
                const colors = AGENT_COLORS[agent.agent_type] || AGENT_COLORS.moderation;
                const icon = AGENT_ICONS[agent.agent_type] || <Bot className="w-5 h-5" />;
                return (
                  <div
                    key={agent.agent_type}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${colors.border} ${colors.bg} transition-all hover:scale-[1.02]`}
                  >
                    <div className={`p-2 rounded-lg ${colors.bg} ${colors.text}`}>
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[hsl(var(--theme-text-primary))] truncate">
                        {agent.display_name}
                      </p>
                      <p className="text-[11px] text-[hsl(var(--theme-text-muted))] truncate">
                        {agent.description.slice(0, 60)}...
                      </p>
                    </div>
                    <button
                      onClick={() => handleInstall(agent.agent_type)}
                      disabled={actionLoading === agent.agent_type}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-gradient-to-r ${colors.gradient} hover:opacity-90 transition-opacity disabled:opacity-50`}
                    >
                      {actionLoading === agent.agent_type ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        'Install'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Installed Agents List */}
      {installed.length === 0 ? (
        <div className="text-center py-10">
          <Bot className="w-12 h-12 mx-auto mb-3 text-[hsl(var(--theme-text-muted))] opacity-30" />
          <p className="text-sm text-[hsl(var(--theme-text-muted))]">No agents installed yet</p>
          <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-1">
            Click "Install Agent" to add AI-powered features
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {installed.map(agent => {
            const colors = AGENT_COLORS[agent.agent_type] || AGENT_COLORS.moderation;
            const icon = AGENT_ICONS[agent.agent_type] || <Bot className="w-5 h-5" />;
            const isExpanded = expandedAgent === agent.agent_type;

            return (
              <div
                key={agent.agent_type}
                className={`rounded-xl border transition-all ${
                  agent.enabled
                    ? `${colors.border} bg-[hsl(var(--theme-bg-secondary)/0.7)]`
                    : 'border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-bg-secondary)/0.3)] opacity-60'
                }`}
              >
                {/* Agent Header Row */}
                <div className="flex items-center gap-3 p-4">
                  <div className={`p-2.5 rounded-xl ${colors.bg} ${colors.text}`}>
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
                        {agent.display_name}
                      </h4>
                      {agent.enabled ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle className="w-2.5 h-2.5" /> Active
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))]">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5">
                      {agent.usage_count} uses · {agent.installed_by ? `by ${agent.installed_by}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Toggle */}
                    {isAdmin && (
                      <button
                        onClick={() => handleToggle(agent.agent_type, agent.enabled)}
                        disabled={actionLoading === agent.agent_type}
                        className={`relative w-11 h-6 rounded-full transition-colors ${
                          agent.enabled ? 'bg-emerald-500' : 'bg-[hsl(var(--theme-bg-tertiary))]'
                        }`}
                      >
                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                          agent.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`} />
                      </button>
                    )}

                    {/* Expand */}
                    <button
                      onClick={() => setExpandedAgent(isExpanded ? null : agent.agent_type)}
                      className="p-1.5 rounded-lg hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))]"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-[hsl(var(--theme-border-default)/0.3)]">
                    <div className="pt-3 space-y-3">
                      {/* Features */}
                      <div>
                        <p className="text-xs font-medium text-[hsl(var(--theme-text-secondary))] mb-2">Features</p>
                        <div className="flex flex-wrap gap-1.5">
                          {agent.features?.slice(0, 5).map((f, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] border border-[hsl(var(--theme-border-default)/0.3)]">
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Settings Preview */}
                      {agent.settings && Object.keys(agent.settings).length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-[hsl(var(--theme-text-secondary))] mb-2">Settings</p>
                          <div className="grid grid-cols-2 gap-2">
                            {Object.entries(agent.settings).slice(0, 4).map(([key, value]) => (
                              <div key={key} className="text-[11px] p-2 rounded-lg bg-[hsl(var(--theme-bg-tertiary)/0.5)]">
                                <span className="text-[hsl(var(--theme-text-muted))]">{key.replace(/_/g, ' ')}: </span>
                                <span className="text-[hsl(var(--theme-text-primary))] font-medium">
                                  {typeof value === 'boolean' ? (value ? 'On' : 'Off') : String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {isAdmin && (
                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            onClick={() => setCommandAgent(agent.agent_type)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover))] transition-colors"
                          >
                            <Terminal className="w-3 h-3" />
                            Commands
                          </button>
                          <button
                            onClick={() => setSettingsAgent(agent.agent_type)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover))] transition-colors"
                          >
                            <Sliders className="w-3 h-3" />
                            Configure
                          </button>
                          <button
                            onClick={() => setConfirmDialogAgent(agent.agent_type)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            Uninstall
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* Modals */}
      {settingsAgent && (
        <AgentSettingsModal
          open={true}
          onClose={() => setSettingsAgent(null)}
          agentType={settingsAgent}
          communityId={communityId}
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

      {confirmDialogAgent && (
        <AgentConfirmDialog
          open={true}
          onClose={() => setConfirmDialogAgent(null)}
          type="uninstall"
          agentName={confirmDialogAgent}
          onConfirm={async () => {
            await handleUninstall(confirmDialogAgent);
            setConfirmDialogAgent(null);
          }}
        />
      )}
    </div>
  );
}
