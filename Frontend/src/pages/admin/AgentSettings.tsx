/**
 * Community Admin — AI Agent Settings
 * Toggle and tune AI agents per-community. Falls back to platform defaults
 * when no per-community override exists.
 */

import { useState, useEffect } from 'react';
import { useCommunityDashboard } from '@/contexts/CommunityDashboardContext';
import adminService from '@/services/adminService';
import { Bot, Loader2, Check, AlertCircle, RefreshCw } from 'lucide-react';

interface AgentRow {
  agent_type: string;
  display_name: string;
  description: string;
  icon: string | null;
  default_settings: Record<string, any> | null;
  enabled: boolean;
  has_override: boolean;
  settings: Record<string, any> | null;
  usage_count: number;
  last_active: string | null;
}

export default function AgentSettings() {
  const { selectedCommunity } = useCommunityDashboard();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [savedType, setSavedType] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (selectedCommunity?.id) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommunity?.id]);

  const load = async () => {
    if (!selectedCommunity?.id) return;
    setLoading(true);
    setError('');
    try {
      const rows = await adminService.listCommunityAgents(selectedCommunity.id);
      setAgents(rows);
    } catch (e: any) {
      setError(e.message || 'Failed to load agents');
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  const save = async (agentType: string, payload: { enabled?: boolean; settings?: Record<string, any> }) => {
    if (!selectedCommunity?.id) return;
    setSavingType(agentType);
    setError('');
    try {
      await adminService.updateCommunityAgent(selectedCommunity.id, agentType, payload);
      setSavedType(agentType);
      setTimeout(() => setSavedType((cur) => (cur === agentType ? null : cur)), 2000);
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to update agent');
    } finally {
      setSavingType(null);
    }
  };

  const ToggleSwitch = ({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 disabled:opacity-50 ${
        enabled ? 'bg-[hsl(var(--theme-accent-primary))]' : 'bg-[hsl(var(--theme-bg-tertiary))]'
      }`}
    >
      <span
        className={`inline-flex items-center justify-center h-5 w-5 transform rounded-full bg-white shadow-lg transition-all duration-300 ${
          enabled ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );

  if (!selectedCommunity) {
    return (
      <div className="flex items-center justify-center h-64 text-[hsl(var(--theme-text-muted))]">
        Select a community to manage its AI agents.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))]">AI Agents</h1>
          <p className="text-sm text-[hsl(var(--theme-text-muted))] mt-1">
            Toggle and tune AI agents for <span className="font-medium">{selectedCommunity.name}</span>. Platform defaults
            apply when no override is set.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[hsl(var(--theme-border-default))] text-sm text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[hsl(var(--theme-accent-primary))] animate-spin" />
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary)/0.5)]">
          <Bot className="w-10 h-10 text-[hsl(var(--theme-text-muted))] mx-auto mb-3" />
          <p className="text-[hsl(var(--theme-text-secondary))] font-medium">No community agents available</p>
        </div>
      ) : (
        <div className="space-y-4">
          {agents.map((a) => (
            <AgentCard
              key={a.agent_type}
              agent={a}
              isSaving={savingType === a.agent_type}
              wasSaved={savedType === a.agent_type}
              onToggle={(v) => void save(a.agent_type, { enabled: v })}
              onSaveSettings={(s) => void save(a.agent_type, { settings: s })}
              ToggleSwitch={ToggleSwitch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({
  agent,
  isSaving,
  wasSaved,
  onToggle,
  onSaveSettings,
  ToggleSwitch,
}: {
  agent: AgentRow;
  isSaving: boolean;
  wasSaved: boolean;
  onToggle: (v: boolean) => void;
  onSaveSettings: (s: Record<string, any>) => void;
  ToggleSwitch: any;
}) {
  const [settings, setSettings] = useState<Record<string, any>>(() => ({ ...(agent.settings || {}) }));

  useEffect(() => {
    setSettings({ ...(agent.settings || {}) });
  }, [agent.agent_type, JSON.stringify(agent.settings)]);

  const editableKeys = Object.keys(agent.default_settings || agent.settings || {});

  return (
    <div className="rounded-2xl border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary)/0.5)] overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[hsl(var(--theme-border-default))]">
        <div className="flex items-start gap-3 min-w-0">
          <div className="text-2xl flex-shrink-0">{agent.icon || '🤖'}</div>
          <div className="min-w-0">
            <h3 className="font-semibold text-[hsl(var(--theme-text-primary))]">{agent.display_name}</h3>
            <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5 line-clamp-2">{agent.description}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-[hsl(var(--theme-text-muted))]">
              <span className="font-mono">{agent.agent_type}</span>
              {agent.has_override ? (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Custom override
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))]">
                  Using platform defaults
                </span>
              )}
              {agent.usage_count > 0 && <span>{agent.usage_count} runs</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {wasSaved && <Check className="w-4 h-4 text-emerald-400" />}
          {isSaving ? (
            <Loader2 className="w-5 h-5 text-[hsl(var(--theme-accent-primary))] animate-spin" />
          ) : (
            <ToggleSwitch enabled={agent.enabled} onChange={onToggle} disabled={isSaving} />
          )}
        </div>
      </div>

      {editableKeys.length > 0 && (
        <div className="p-6 space-y-4">
          <p className="text-xs text-[hsl(var(--theme-text-muted))]">
            Per-community tunables. Leave blank to inherit platform defaults.
          </p>
          {editableKeys.map((k) => {
            const def = agent.default_settings?.[k];
            const current = settings[k] ?? '';
            const isBool = typeof def === 'boolean' || typeof current === 'boolean';
            const isNumber = typeof def === 'number' || (typeof current === 'number');
            return (
              <div key={k} className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[hsl(var(--theme-text-primary))]">{k}</p>
                  <p className="text-xs text-[hsl(var(--theme-text-muted))]">
                    Default: <span className="font-mono">{JSON.stringify(def)}</span>
                  </p>
                </div>
                {isBool ? (
                  <ToggleSwitch
                    enabled={Boolean(current)}
                    onChange={(v: boolean) => setSettings({ ...settings, [k]: v })}
                  />
                ) : isNumber ? (
                  <input
                    type="number"
                    value={current === '' ? '' : current}
                    onChange={(e) => setSettings({ ...settings, [k]: e.target.value === '' ? '' : Number(e.target.value) })}
                    className="w-32 px-3 py-2 rounded-lg border bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] text-sm text-right focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))]"
                  />
                ) : (
                  <input
                    type="text"
                    value={String(current)}
                    onChange={(e) => setSettings({ ...settings, [k]: e.target.value })}
                    className="w-48 px-3 py-2 rounded-lg border bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))]"
                  />
                )}
              </div>
            );
          })}
          <div className="flex justify-end pt-2">
            <button
              onClick={() => onSaveSettings(settings)}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-[hsl(var(--theme-accent-primary))] text-white text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
