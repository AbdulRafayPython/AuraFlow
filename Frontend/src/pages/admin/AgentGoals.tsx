/**
 * Community Admin — Agent Goals (Phase 5.2)
 * ==========================================
 * Per-agent tunables + clamp windows + kill-switch for autonomous agents.
 *
 * Companion to AgentSettings.tsx:
 *   - AgentSettings.tsx → on/off + free-form `settings` blob (catalog-driven).
 *   - AgentGoals.tsx    → the autonomous agents' learned thresholds, with
 *                         hard min/max clamps that learn() may not exceed.
 *
 * One section per registered tunable agent. Each section shows the
 * current learned value, the catalog default, and lets the admin tighten
 * the [min, max] window so learn() can't drift outside it. A header
 * Switch is the autonomous kill-switch for that community.
 */

import { useState, useEffect, useMemo } from 'react';
import { useOptionalCommunityDashboard } from '@/contexts/CommunityDashboardContext';
import adminService from '@/services/adminService';
import { Bot, Loader2, Check, AlertCircle, RefreshCw, Sliders, Lock } from 'lucide-react';
import { SETTING_META } from '@/components/ai-agents/agentSettingsMeta';

// ── Types matching /api/agents/state/catalog + /api/agents/<name>/state ─

interface TunableSpec {
  default: any;
  type: 'float' | 'int' | 'enum' | 'tuple_hour_range' | 'dict_readonly';
  min?: number;
  max?: number;
  choices?: string[];
  label: string;
  help: string;
}

interface AgentStateResponse {
  agent: string;
  community_id: number;
  enabled: boolean;
  current: Record<string, any>;
  defaults: Record<string, any>;
  clamps: Record<string, { min?: number; max?: number }>;
  specs: Record<string, TunableSpec>;
  last_acted_at: string | null;
  last_outcome: string | null;
}

// Display order — keep the high-impact moderation/wellness ones near the top.
const AGENT_ORDER = [
  'moderation', 'wellness', 'mood_tracker', 'focus',
  'summarizer', 'knowledge_builder', 'engagement', 'auto_message',
  'support', 'translator', 'assistant',
] as const;

const AGENT_META: Record<string, { display: string; icon: string; tagline: string }> = {
  moderation:        { display: 'Moderation',         icon: '🛡️', tagline: 'Flags violations for downstream agents.' },
  wellness:          { display: 'Wellness',           icon: '💚', tagline: 'Quiet-hour-aware check-ins.' },
  mood_tracker:      { display: 'Mood Tracker',       icon: '🌡️', tagline: 'Sentiment scoring + escalation.' },
  focus:             { display: 'Focus',              icon: '🎯', tagline: 'Topic-drift detection.' },
  summarizer:        { display: 'Summarizer',         icon: '📝', tagline: 'Channel summaries on demand or on drift.' },
  knowledge_builder: { display: 'Knowledge Builder',  icon: '📚', tagline: 'Extracts facts + decisions.' },
  engagement:        { display: 'Engagement',         icon: '🎉', tagline: 'Icebreaker bandit.' },
  auto_message:      { display: 'Auto Message',       icon: '👋', tagline: 'Welcome-template bandit.' },
  support:           { display: 'Support',            icon: '🧰', tagline: 'KB-document matching.' },
  translator:        { display: 'Translator',         icon: '🌐', tagline: 'Cross-language relay.' },
  assistant:         { display: 'Assistant',          icon: '🤖', tagline: 'Per-channel chat memory.' },
};

/**
 * Props for the embedded variant (Community Intelligence Hub policy drawer in
 * F4). When `communityId` is supplied this component skips the dashboard
 * context entirely and uses the passed-in community as its scope. When
 * `embedded` is true the outer h1 + refresh row are dropped so the host chrome
 * (drawer header) can own that affordance.
 *
 * Default behavior is unchanged: with no props the component reads
 * selectedCommunity from CommunityDashboardContext exactly as before, so the
 * standalone /admin/agents/goals route keeps working.
 */
interface AgentGoalsProps {
  communityId?: number;
  communityName?: string;
  embedded?: boolean;
}

export default function AgentGoals({ communityId, communityName, embedded = false }: AgentGoalsProps = {}) {
  const dashboard = useOptionalCommunityDashboard();
  const selectedCommunity = communityId !== undefined
    ? { id: communityId, name: communityName ?? '' }
    : dashboard?.selectedCommunity ?? null;
  const [catalog, setCatalog] = useState<Record<string, Record<string, TunableSpec>>>({});
  const [states, setStates] = useState<Record<string, AgentStateResponse>>({});
  const [loading, setLoading] = useState(true);
  const [savingAgent, setSavingAgent] = useState<string | null>(null);
  const [savedAgent, setSavedAgent] = useState<string | null>(null);
  const [error, setError] = useState('');

  const orderedAgents = useMemo(() => {
    const known = Object.keys(catalog);
    const head = AGENT_ORDER.filter(a => known.includes(a));
    const tail = known.filter(a => !head.includes(a as any));
    return [...head, ...tail];
  }, [catalog]);

  useEffect(() => {
    if (selectedCommunity?.id) void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommunity?.id]);

  const loadAll = async () => {
    if (!selectedCommunity?.id) return;
    setLoading(true);
    setError('');
    try {
      const cat = await adminService.getAgentStateCatalog();
      setCatalog(cat.tunables);
      // Fan out one GET per agent. 11 calls; the page is admin-only and
      // navigated to deliberately — this is fine.
      const results = await Promise.allSettled(
        cat.agents.map(name =>
          adminService.getAgentState(name, selectedCommunity.id)
            .then(s => [name, s] as const),
        ),
      );
      const next: Record<string, AgentStateResponse> = {};
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const [name, st] = r.value;
          next[name] = st;
        }
      }
      setStates(next);
    } catch (e: any) {
      setError(e.message || 'Failed to load agent goals');
    } finally {
      setLoading(false);
    }
  };

  const saveAgent = async (agentName: string, payload: {
    enabled?: boolean;
    thresholds?: Record<string, any>;
    clamps?: Record<string, { min?: number; max?: number }>;
  }) => {
    if (!selectedCommunity?.id) return;
    setSavingAgent(agentName);
    setError('');
    try {
      const updated = await adminService.putAgentState(agentName, {
        community_id: selectedCommunity.id,
        ...payload,
      });
      // Merge the server's authoritative response back into state so the
      // displayed "current" / "clamps" reflect any server-side clipping.
      setStates(prev => ({
        ...prev,
        [agentName]: {
          ...prev[agentName],
          ...updated,
          specs: prev[agentName]?.specs || {},
          defaults: prev[agentName]?.defaults || {},
        },
      }));
      setSavedAgent(agentName);
      setTimeout(() => setSavedAgent(cur => (cur === agentName ? null : cur)), 1800);
    } catch (e: any) {
      setError(e.message || `Failed to save ${agentName}`);
    } finally {
      setSavingAgent(null);
    }
  };

  if (!selectedCommunity) {
    return (
      <div className="flex items-center justify-center h-64 text-[hsl(var(--theme-text-muted))]">
        Select a community to manage its agent goals.
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-6' : 'space-y-6 max-w-5xl'}>
      {!embedded && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
              <Sliders className="w-6 h-6 text-[hsl(var(--theme-accent-primary))]" />
              Agent Goals
            </h1>
            <p className="text-sm text-[hsl(var(--theme-text-muted))] mt-1 max-w-2xl">
              Set the limits each helper is allowed to work within for{' '}
              <span className="font-medium">{selectedCommunity.name}</span>. They keep fine-tuning
              themselves over time, but never outside the range you set here.
            </p>
          </div>
          <button
            onClick={() => void loadAll()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[hsl(var(--theme-border-default))] text-sm text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      )}

      {embedded && (
        <p className="text-sm text-[hsl(var(--theme-text-muted))] max-w-2xl">
          These helpers fine-tune themselves over time. Set a range you’re comfortable
          with and they’ll keep adjusting within it — never outside. Anything you leave
          alone keeps the recommended setting.
        </p>
      )}

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
      ) : orderedAgents.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary)/0.5)]">
          <Bot className="w-10 h-10 text-[hsl(var(--theme-text-muted))] mx-auto mb-3" />
          <p className="text-[hsl(var(--theme-text-secondary))] font-medium">No tunable agents registered</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orderedAgents.map((name) => {
            const st = states[name];
            const specs = catalog[name] || {};
            if (!st) return null;
            return (
              <AgentGoalCard
                key={name}
                name={name}
                state={st}
                specs={specs}
                isSaving={savingAgent === name}
                wasSaved={savedAgent === name}
                onSave={(payload) => void saveAgent(name, payload)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Per-agent card ──────────────────────────────────────────────────

interface CardProps {
  name: string;
  state: AgentStateResponse;
  specs: Record<string, TunableSpec>;
  isSaving: boolean;
  wasSaved: boolean;
  onSave: (payload: {
    enabled?: boolean;
    thresholds?: Record<string, any>;
    clamps?: Record<string, { min?: number; max?: number }>;
  }) => void;
}

function AgentGoalCard({ name, state, specs, isSaving, wasSaved, onSave }: CardProps) {
  // Local edit buffer — admin changes don't fire until "Save" is clicked.
  const [thresholds, setThresholds] = useState<Record<string, any>>(() => ({ ...state.current }));
  const [clamps, setClamps] = useState<Record<string, { min?: number; max?: number }>>(
    () => ({ ...state.clamps }),
  );
  const meta = AGENT_META[name] || { display: name, icon: '🤖', tagline: '' };

  // Re-sync when the server's snapshot changes (after Save).
  useEffect(() => {
    setThresholds({ ...state.current });
    setClamps({ ...state.clamps });
  }, [state.current, state.clamps]);

  const tunableKeys = Object.keys(specs);
  const hasEdits =
    JSON.stringify(thresholds) !== JSON.stringify(state.current) ||
    JSON.stringify(clamps) !== JSON.stringify(state.clamps);

  const resetKey = (key: string) => {
    const def = state.defaults[key];
    setThresholds(prev => ({ ...prev, [key]: def }));
    setClamps(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const resetAll = () => {
    setThresholds({ ...state.defaults });
    setClamps({});
  };

  return (
    <div className="rounded-2xl border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary)/0.5)] overflow-hidden">
      {/* ── Header — name, kill-switch, save state ──────────── */}
      <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[hsl(var(--theme-border-default))]">
        <div className="flex items-start gap-3 min-w-0">
          <div className="text-2xl flex-shrink-0">{meta.icon}</div>
          <div className="min-w-0">
            <h3 className="font-semibold text-[hsl(var(--theme-text-primary))]">
              {meta.display}
            </h3>
            <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5">
              {meta.tagline}
            </p>
            <div className="flex items-center gap-3 mt-2 text-xs text-[hsl(var(--theme-text-muted))]">
              {state.last_outcome && (
                <span className="px-2 py-0.5 rounded-full bg-[hsl(var(--theme-bg-tertiary))]">
                  Last result: {state.last_outcome}
                </span>
              )}
              {!state.enabled && (
                <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                  Disabled
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {wasSaved && <Check className="w-4 h-4 text-emerald-400" />}
          <KillSwitch
            enabled={state.enabled}
            disabled={isSaving}
            onChange={(v) => onSave({ enabled: v })}
          />
        </div>
      </div>

      {/* ── Tunable rows ────────────────────────────────────── */}
      {tunableKeys.length === 0 ? (
        <div className="px-6 py-6 text-sm text-[hsl(var(--theme-text-muted))]">
          No tunable thresholds.
        </div>
      ) : (
        <div className="p-6 space-y-5">
          {tunableKeys.map((key) => {
            const spec = specs[key];
            return (
              <TunableRow
                key={key}
                tunableKey={key}
                spec={spec}
                value={thresholds[key]}
                defaultValue={state.defaults[key]}
                clamp={clamps[key]}
                onValueChange={(v) => setThresholds(prev => ({ ...prev, [key]: v }))}
                onClampChange={(c) => setClamps(prev => {
                  const next = { ...prev };
                  if (c && (c.min !== undefined || c.max !== undefined)) {
                    next[key] = c;
                  } else {
                    delete next[key];
                  }
                  return next;
                })}
                onReset={() => resetKey(key)}
              />
            );
          })}

          {/* ── Footer actions ─────────────────────────────── */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[hsl(var(--theme-border-default))]">
            <button
              onClick={resetAll}
              disabled={isSaving}
              className="px-3 py-1.5 text-xs text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-secondary))] transition-colors disabled:opacity-50"
            >
              Reset all to defaults
            </button>
            <button
              onClick={() => onSave({ thresholds, clamps })}
              disabled={isSaving || !hasEdits}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[hsl(var(--theme-accent-primary))] text-white hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Single tunable row ──────────────────────────────────────────────

function TunableRow({
  tunableKey, spec, value, defaultValue, clamp,
  onValueChange, onClampChange, onReset,
}: {
  tunableKey: string;
  spec: TunableSpec;
  value: any;
  defaultValue: any;
  clamp: { min?: number; max?: number } | undefined;
  onValueChange: (v: any) => void;
  onClampChange: (c: { min?: number; max?: number } | null) => void;
  onReset: () => void;
}) {
  const isReadOnly = spec.type === 'dict_readonly';
  const isNumeric = spec.type === 'float' || spec.type === 'int';
  const isEnum = spec.type === 'enum';
  const isTuple = spec.type === 'tuple_hour_range';

  // Prefer the plain-English override from the shared meta; fall back to the
  // backend catalog's label/help (which can carry jargon like "mod.violation").
  const friendly = SETTING_META[tunableKey];
  const label = friendly?.label ?? spec.label;
  const help = friendly?.help ?? spec.help;

  const parseNum = (s: string) => {
    if (s === '' || s === '-') return undefined;
    const n = spec.type === 'int' ? parseInt(s, 10) : parseFloat(s);
    return Number.isFinite(n) ? n : undefined;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
      <div className="md:col-span-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[hsl(var(--theme-text-primary))]">
            {label}
          </span>
          {isReadOnly && (
            <Lock className="w-3 h-3 text-[hsl(var(--theme-text-muted))]" aria-label="Set automatically" />
          )}
        </div>
        <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5">{help}</p>
        <p className="text-[11px] text-[hsl(var(--theme-text-muted))] mt-1">
          Recommended: <span className="font-medium text-[hsl(var(--theme-text-secondary))]">{formatVal(defaultValue)}</span>
        </p>
      </div>

      {/* Current value */}
      <div className="md:col-span-3">
        <label className="block text-[10px] uppercase tracking-wide text-[hsl(var(--theme-text-muted))] mb-1">
          Current
        </label>
        {isReadOnly ? (
          <div className="px-3 py-2 rounded-lg bg-[hsl(var(--theme-bg-tertiary))] text-xs font-mono text-[hsl(var(--theme-text-muted))] truncate">
            {formatVal(value)}
          </div>
        ) : isEnum ? (
          <select
            value={value ?? ''}
            onChange={(e) => onValueChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--theme-bg-tertiary))] border border-[hsl(var(--theme-border-default))] text-sm text-[hsl(var(--theme-text-primary))] focus:outline-none focus:border-[hsl(var(--theme-accent-primary))]"
          >
            {(spec.choices || []).map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : isTuple ? (
          <div className="flex items-center gap-1">
            <input
              type="number" min={0} max={23}
              value={Array.isArray(value) ? value[0] : 0}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                const cur = Array.isArray(value) ? value : [0, 0];
                onValueChange([Number.isFinite(v) ? v : cur[0], cur[1]]);
              }}
              className="w-14 px-2 py-2 rounded-lg bg-[hsl(var(--theme-bg-tertiary))] border border-[hsl(var(--theme-border-default))] text-sm text-[hsl(var(--theme-text-primary))]"
            />
            <span className="text-xs text-[hsl(var(--theme-text-muted))]">→</span>
            <input
              type="number" min={0} max={23}
              value={Array.isArray(value) ? value[1] : 0}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                const cur = Array.isArray(value) ? value : [0, 0];
                onValueChange([cur[0], Number.isFinite(v) ? v : cur[1]]);
              }}
              className="w-14 px-2 py-2 rounded-lg bg-[hsl(var(--theme-bg-tertiary))] border border-[hsl(var(--theme-border-default))] text-sm text-[hsl(var(--theme-text-primary))]"
            />
          </div>
        ) : (
          <input
            type="number"
            step={spec.type === 'float' ? '0.01' : '1'}
            value={value ?? ''}
            onChange={(e) => onValueChange(parseNum(e.target.value))}
            className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--theme-bg-tertiary))] border border-[hsl(var(--theme-border-default))] text-sm text-[hsl(var(--theme-text-primary))] focus:outline-none focus:border-[hsl(var(--theme-accent-primary))]"
          />
        )}
      </div>

      {/* Clamp window — only meaningful for numeric tunables */}
      <div className="md:col-span-4">
        <label className="block text-[10px] uppercase tracking-wide text-[hsl(var(--theme-text-muted))] mb-1">
          Allowed range {isNumeric && (
            <span className="opacity-50 normal-case">
              (can be {formatVal(spec.min)} to {formatVal(spec.max)})
            </span>
          )}
        </label>
        {isNumeric ? (
          <div className="flex items-center gap-1">
            <input
              type="number" step={spec.type === 'float' ? '0.01' : '1'}
              placeholder={`min ${formatVal(spec.min)}`}
              value={clamp?.min ?? ''}
              onChange={(e) => {
                const v = parseNum(e.target.value);
                onClampChange({ min: v, max: clamp?.max });
              }}
              className="w-full px-2 py-2 rounded-lg bg-[hsl(var(--theme-bg-tertiary))] border border-[hsl(var(--theme-border-default))] text-sm text-[hsl(var(--theme-text-primary))]"
            />
            <span className="text-xs text-[hsl(var(--theme-text-muted))]">→</span>
            <input
              type="number" step={spec.type === 'float' ? '0.01' : '1'}
              placeholder={`max ${formatVal(spec.max)}`}
              value={clamp?.max ?? ''}
              onChange={(e) => {
                const v = parseNum(e.target.value);
                onClampChange({ min: clamp?.min, max: v });
              }}
              className="w-full px-2 py-2 rounded-lg bg-[hsl(var(--theme-bg-tertiary))] border border-[hsl(var(--theme-border-default))] text-sm text-[hsl(var(--theme-text-primary))]"
            />
          </div>
        ) : (
          <div className="px-3 py-2 text-xs text-[hsl(var(--theme-text-muted))] italic">
            Set automatically — no range to limit.
          </div>
        )}
      </div>

      <div className="md:col-span-1 flex justify-end">
        <button
          onClick={onReset}
          className="text-xs text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-secondary))] transition-colors"
          title="Reset to default + clear clamp"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// ── Kill-switch toggle (matches AgentSettings.tsx visual style) ─────

function KillSwitch({
  enabled, onChange, disabled,
}: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      title={enabled ? 'Disable agent for this community' : 'Enable agent'}
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
}

// ── helpers ─────────────────────────────────────────────────────────

function formatVal(v: any): string {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  if (Array.isArray(v)) return `[${v.join(', ')}]`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
