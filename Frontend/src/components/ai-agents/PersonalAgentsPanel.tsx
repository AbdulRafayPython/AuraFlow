// Frontend/src/components/ai-agents/PersonalAgentsPanel.tsx
//
// F3 of the autonomous-agent frontend redesign
// (docs/AUTONOMOUS_AGENT_FRONTEND_REDESIGN.md §10 + §16/F3).
//
// Two internal sections inside the Settings → AI Agents tab:
//
//   1. My Assistant            — primary personal AI surface with the
//                                proactivity ladder (the trust control),
//                                tone/language, and the memory + privacy
//                                block.
//   2. Personal Automations    — Mood Tracker / Wellness / Translator /
//                                Personal Summaries. Each module shows
//                                status, visibility scope, last action,
//                                and a "Manage" disclosure.
//
// All writes go through the existing
//   PUT  /api/agents/configure/personal/<agent_type>
// endpoint (via aiAgentService.configurePersonalAgent). Clear-memory
// hits the new
//   DELETE /api/agents/assistant/memory
// endpoint. Aura Calm Ops theme tokens only — no shadows, 1px hairlines,
// accent tints icons/rails only.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Eraser,
  Languages,
  Loader2,
  PanelBottomClose,
  PauseCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

import { useAIAgents } from '@/contexts/AIAgentContext';
import { useToast } from '@/hooks/use-toast';
import type { InstalledAgent } from '@/services/aiAgentService';
import VisibilityChip, { type AgentVisibility } from './VisibilityChip';
import { accentFor, agentLabel } from './AgentAccent';
import { settingMeta, type SettingMeta } from './agentSettingsMeta';
import aiAgentService from '@/services/aiAgentService';
import { channelService } from '@/services/channelService';
import { getNotificationSettings, updateNotificationSettings } from '@/services/authService';
import { AGENT_ACTIVITY_PREF_EVENT } from '@/components/AgentActivityTimeline';

// ────────────────────────────────────────────────────────────────────────────
// Types & constants
// ────────────────────────────────────────────────────────────────────────────

type ProactivityMode = 'silent' | 'suggest' | 'ask_before_acting' | 'auto_when_safe';
type AssistantTone   = 'friendly' | 'concise' | 'formal';

interface AssistantSettings {
  tone?: AssistantTone;
  language?: string;
  proactivity?: ProactivityMode;
  /** When true, the backend stops reading or writing the per-user
   *  rolling Redis memory. Settings still persist. */
  memory_paused?: boolean;
  [key: string]: unknown;
}

const PROACTIVITY_LADDER: Array<{
  value: ProactivityMode;
  title: string;
  hint: string;
}> = [
  { value: 'silent',           title: 'Silent',              hint: 'Never speaks unless you /ask or @assistant.' },
  { value: 'suggest',          title: 'Suggest only',        hint: 'Shows a private suggestion you can copy. Never sends.' },
  { value: 'ask_before_acting', title: 'Ask before acting',  hint: 'Asks for confirmation before posting on your behalf.' },
  { value: 'auto_when_safe',   title: 'Auto when safe',      hint: 'Acts on low-risk replies; asks for high-risk ones.' },
];

const TONES: Array<{ value: AssistantTone; label: string }> = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'concise',  label: 'Concise'  },
  { value: 'formal',   label: 'Formal'   },
];

const LANGUAGES: Array<{ value: string; label: string }> = [
  { value: 'auto',     label: 'Match the user'   },
  { value: 'en',       label: 'English'          },
  { value: 'ur',       label: 'Urdu'             },
  { value: 'roman-ur', label: 'Roman Urdu'       },
  { value: 'es',       label: 'Spanish'          },
  { value: 'fr',       label: 'French'           },
  { value: 'de',       label: 'German'           },
  { value: 'ar',       label: 'Arabic'           },
];

const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  tone: 'friendly',
  language: 'auto',
  proactivity: 'silent',
  memory_paused: false,
};

interface AutomationSpec {
  agentType: string;
  description: string;
  visibility: AgentVisibility;
  manageHint: string;
}

const AUTOMATIONS: AutomationSpec[] = [
  {
    agentType: 'mood_tracker',
    description: 'Reads sentiment of your messages and keeps a private timeline.',
    visibility: 'you-only',
    manageHint: 'Open the Mood timeline from the channel intelligence rail.',
  },
  {
    agentType: 'wellness',
    description: 'Reaches out privately when stress patterns appear.',
    visibility: 'private-dm',
    manageHint: 'Cadence is set in this agent’s settings modal.',
  },
  {
    agentType: 'translator',
    description: 'Translates messages between 14 languages, viewer-side only.',
    visibility: 'you-only',
    manageHint: 'Toggle auto-translate per channel from the message footer.',
  },
  {
    agentType: 'summarizer',
    description: 'Generates personal recaps on the schedule you choose.',
    visibility: 'you-only',
    manageHint: 'Pick a community, a channel, and a time — you’ll get a private recap delivered every day.',
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'No activity yet';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'No activity yet';
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1)    return 'just now';
  if (min < 60)  return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)   return `${hr} h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30)  return `${day} d ago`;
  return new Date(iso).toLocaleDateString();
}

function toAssistantSettings(raw: Record<string, unknown> | undefined): AssistantSettings {
  const s = raw || {};
  const tone        = (s.tone as AssistantTone) || DEFAULT_ASSISTANT_SETTINGS.tone;
  const language    = (s.language as string)    || DEFAULT_ASSISTANT_SETTINGS.language;
  const proactivity = (s.proactivity as ProactivityMode) || DEFAULT_ASSISTANT_SETTINGS.proactivity;
  const memory_paused = Boolean(s.memory_paused);
  return { ...s, tone, language, proactivity, memory_paused };
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export default function PersonalAgentsPanel() {
  const ctx = useAIAgents() as any;
  const { toast } = useToast();

  const [loading, setLoading]   = useState<boolean>(true);
  const [agents,  setAgents]    = useState<InstalledAgent[]>([]);
  const [clearing, setClearing] = useState<boolean>(false);

  // Optimistic assistant settings — what the UI displays.
  const [assistantDraft, setAssistantDraft] = useState<AssistantSettings>(DEFAULT_ASSISTANT_SETTINGS);

  // Pull the personal-agent list once on mount; refresh on demand.
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await ctx.getPersonalAgentStatus();
      setAgents(list || []);
      const assistant = (list || []).find((a: InstalledAgent) => a.agent_type === 'assistant');
      setAssistantDraft(toAssistantSettings(assistant?.settings));
    } catch (err: any) {
      console.error('[PersonalAgentsPanel] refresh failed', err);
      toast({
        title: 'Could not load personal agents',
        description: err?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [ctx, toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  // ── Assistant write path (debounced) ───────────────────────────────
  const writeTimer = useRef<number | null>(null);
  const writeAssistant = useCallback((patch: Partial<AssistantSettings>) => {
    setAssistantDraft((prev) => {
      const next = { ...prev, ...patch };
      if (writeTimer.current) window.clearTimeout(writeTimer.current);
      writeTimer.current = window.setTimeout(() => {
        ctx.configurePersonalAgent('assistant', next, undefined)
          .catch((err: any) => {
            console.error('[PersonalAgentsPanel] save failed', err);
            toast({
              title: 'Could not save preference',
              description: err?.message ?? 'Please try again.',
              variant: 'destructive',
            });
            // Roll back to the server state.
            void refresh();
          });
      }, 400) as unknown as number;
      return next;
    });
  }, [ctx, refresh, toast]);

  const handleClearMemory = useCallback(async () => {
    const ok = window.confirm(
      'Clear the assistant’s conversation memory? Your last few turns will be forgotten.\n\n' +
      'This does not affect your settings.',
    );
    if (!ok) return;
    setClearing(true);
    try {
      await ctx.clearAssistantMemory();
      toast({ title: 'Memory cleared', description: 'The assistant starts fresh next time you /ask.' });
    } catch (err: any) {
      console.error('[PersonalAgentsPanel] clear memory failed', err);
      toast({
        title: 'Could not clear memory',
        description: err?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setClearing(false);
    }
  }, [ctx, toast]);

  const handleResetPreferences = useCallback(() => {
    const ok = window.confirm('Reset tone, language, and proactivity to defaults?');
    if (!ok) return;
    setAssistantDraft(DEFAULT_ASSISTANT_SETTINGS);
    ctx.configurePersonalAgent('assistant', DEFAULT_ASSISTANT_SETTINGS, undefined)
      .then(() => toast({ title: 'Preferences reset' }))
      .catch((err: any) => {
        toast({
          title: 'Could not reset preferences',
          description: err?.message ?? 'Please try again.',
          variant: 'destructive',
        });
        void refresh();
      });
  }, [ctx, refresh, toast]);

  // ── Derived ────────────────────────────────────────────────────────
  const byType = useMemo(() => {
    const m = new Map<string, InstalledAgent>();
    for (const a of agents) m.set(a.agent_type, a);
    return m;
  }, [agents]);

  const assistantAgent = byType.get('assistant');

  // ──────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-8 text-[12px] text-[hsl(var(--theme-text-muted))]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Loading your personal AI…
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Top intro — quiet, warmer than channel surfaces (§10.7) */}
      <header className="space-y-1">
        <h2 className="text-[15px] font-semibold text-[hsl(var(--theme-text-primary))]">
          Personal AI
        </h2>
        <p className="text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))]">
          Your assistant and personal automations are private to you. They
          never surface in channels without your explicit action.
        </p>
      </header>

      {/* ─── My Assistant ─────────────────────────────────────────── */}
      {assistantAgent
        ? (
          <MyAssistantCard
            agent={assistantAgent}
            settings={assistantDraft}
            onPatch={writeAssistant}
            onClearMemory={handleClearMemory}
            onResetPreferences={handleResetPreferences}
            clearing={clearing}
          />
        )
        : (
          <AssistantActivationCard
            onActivate={async () => {
              try {
                await ctx.activatePersonalAgent('assistant');
                toast({ title: 'AI Assistant activated' });
                await refresh();
              } catch (err: any) {
                toast({
                  title: 'Could not activate the assistant',
                  description: err?.message ?? 'Please try again.',
                  variant: 'destructive',
                });
              }
            }}
          />
        )
      }

      {/* ─── Personal Automations ─────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[hsl(var(--theme-text-muted))]">
            Personal Automations
          </h3>
          <span className="text-[11px] text-[hsl(var(--theme-text-muted))]">
            Capabilities that work under your assistant.
          </span>
        </div>

        <ul className="space-y-2">
          {AUTOMATIONS.map((spec) => (
            <li key={spec.agentType}>
              <AutomationCard
                spec={spec}
                agent={byType.get(spec.agentType)}
                onToggle={async (next) => {
                  try {
                    await ctx.configurePersonalAgent(spec.agentType, {}, next);
                    await refresh();
                  } catch (err: any) {
                    toast({
                      title: `Could not update ${agentLabel(spec.agentType)}`,
                      description: err?.message ?? 'Please try again.',
                      variant: 'destructive',
                    });
                  }
                }}
                onSaveSettings={async (next) => {
                  try {
                    await ctx.configurePersonalAgent(spec.agentType, next, undefined);
                    await refresh();
                    toast({ title: `${agentLabel(spec.agentType)} settings saved` });
                  } catch (err: any) {
                    toast({
                      title: `Could not save ${agentLabel(spec.agentType)} settings`,
                      description: err?.message ?? 'Please try again.',
                      variant: 'destructive',
                    });
                  }
                }}
                onActivate={async () => {
                  try {
                    await ctx.activatePersonalAgent(spec.agentType);
                    toast({ title: `${agentLabel(spec.agentType)} activated` });
                    await refresh();
                  } catch (err: any) {
                    toast({
                      title: `Could not activate ${agentLabel(spec.agentType)}`,
                      description: err?.message ?? 'Please try again.',
                      variant: 'destructive',
                    });
                  }
                }}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Activity panel preference ────────────────────────────── */}
      <ActivityFeedToggle />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Activity panel toggle — controls the floating "what the assistants did"
// panel. Off by default for new accounts; the preference is saved to the
// account via the notification-settings endpoint. A window event keeps the
// live panel and this switch in sync.
// ════════════════════════════════════════════════════════════════════════════

function ActivityFeedToggle() {
  const { toast } = useToast();
  const accent = accentFor('engagement');
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    getNotificationSettings()
      .then((s) => { if (alive) setEnabled(Boolean(s?.show_agent_activity)); })
      .catch(() => { if (alive) setEnabled(false); });

    const onPref = (e: Event) => {
      const next = (e as CustomEvent<boolean>).detail;
      if (typeof next === 'boolean') setEnabled(next);
    };
    window.addEventListener(AGENT_ACTIVITY_PREF_EVENT, onPref as EventListener);
    return () => {
      alive = false;
      window.removeEventListener(AGENT_ACTIVITY_PREF_EVENT, onPref as EventListener);
    };
  }, []);

  const handleToggle = useCallback((next: boolean) => {
    setEnabled(next);
    window.dispatchEvent(new CustomEvent(AGENT_ACTIVITY_PREF_EVENT, { detail: next }));
    void updateNotificationSettings({ show_agent_activity: next }).catch((err: any) => {
      setEnabled(!next); // roll back on failure
      window.dispatchEvent(new CustomEvent(AGENT_ACTIVITY_PREF_EVENT, { detail: !next }));
      toast({
        title: 'Could not save preference',
        description: err?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    });
  }, [toast]);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[hsl(var(--theme-text-muted))]">
          Activity panel
        </h3>
      </div>

      <label
        className={
          'flex items-start justify-between gap-3 rounded-lg border ' +
          'border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-elevated))] ' +
          'px-3 py-3 cursor-pointer select-none'
        }
      >
        <span className="flex min-w-0 items-start gap-2.5">
          <PanelBottomClose
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: accent }}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-[hsl(var(--theme-text-primary))]">
              Show the activity panel
            </span>
            <span className="mt-0.5 block text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))]">
              A small panel in the bottom corner that shows, in plain words, what
              the AI assistants are doing as it happens. Off by default — turn it
              on if you like to keep an eye on things.
            </span>
          </span>
        </span>
        {enabled === null ? (
          <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-[hsl(var(--theme-text-muted))]" aria-hidden />
        ) : (
          <span className="mt-0.5 shrink-0">
            <ToggleSwitch
              checked={enabled}
              onChange={handleToggle}
              accent={accent}
              label="Show the activity panel"
            />
          </span>
        )}
      </label>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// My Assistant card
// ════════════════════════════════════════════════════════════════════════════

interface MyAssistantCardProps {
  agent: InstalledAgent;
  settings: AssistantSettings;
  onPatch: (patch: Partial<AssistantSettings>) => void;
  onClearMemory: () => void;
  onResetPreferences: () => void;
  clearing: boolean;
}

function MyAssistantCard({
  agent,
  settings,
  onPatch,
  onClearMemory,
  onResetPreferences,
  clearing,
}: MyAssistantCardProps) {
  const accent = accentFor('assistant');
  const enabled = agent.enabled;

  return (
    <section
      className={
        'relative overflow-hidden rounded-lg border border-[hsl(var(--theme-border-default))] ' +
        'bg-[hsl(var(--theme-bg-elevated))]'
      }
    >
      {/* Accent left rail — community indigo for assistant. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-[2px]"
        style={{ backgroundColor: accent }}
      />

      {/* Header */}
      <header className="flex items-start gap-3 px-4 pt-4">
        <Bot
          className="mt-0.5 h-4 w-4 shrink-0"
          style={{ color: accent }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold text-[hsl(var(--theme-text-primary))]">
              {agentLabel('assistant')}
            </h3>
            <StatusPill enabled={enabled} />
            <VisibilityChip visibility="you-only" />
          </div>
          <p className="mt-1 text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))]">
            Your private assistant for /ask, @assistant, and the channel Ask popover.
          </p>
        </div>
      </header>

      {/* Last action */}
      <div className="border-t border-[hsl(var(--theme-border-default))] px-4 py-2.5 mt-3 text-[12px] leading-5 text-[hsl(var(--theme-text-muted))]">
        <span className="font-medium text-[hsl(var(--theme-text-secondary))]">Last reply </span>
        {relativeTime(agent.last_used)}
        <span className="px-1.5 text-[hsl(var(--theme-border-default))]">·</span>
        <span className="tabular-nums">{agent.usage_count}</span> conversations
      </div>

      {/* Tone */}
      <Subsection title="Tone">
        <div className="flex flex-wrap gap-1.5">
          {TONES.map((t) => (
            <ChipRadio
              key={t.value}
              selected={settings.tone === t.value}
              onSelect={() => onPatch({ tone: t.value })}
              label={t.label}
              accent={accent}
            />
          ))}
        </div>
      </Subsection>

      {/* Language */}
      <Subsection title="Language">
        <div className="flex items-center gap-2">
          <Languages
            className="h-3.5 w-3.5 text-[hsl(var(--theme-text-muted))]"
            aria-hidden
          />
          <select
            value={settings.language}
            onChange={(e) => onPatch({ language: e.target.value })}
            className={
              'h-7 min-w-[10rem] rounded border border-[hsl(var(--theme-border-default))] ' +
              'bg-[hsl(var(--theme-bg-secondary))] px-2 text-[12px] ' +
              'text-[hsl(var(--theme-text-primary))] ' +
              'transition-colors [transition-duration:140ms] hover:bg-[hsl(var(--theme-bg-hover))] ' +
              'focus:outline-none focus:ring-1 focus:ring-[hsl(var(--theme-border-focus))]'
            }
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
      </Subsection>

      {/* Proactivity ladder — the trust control. */}
      <Subsection title="Proactivity" hint="How much the assistant may speak unprompted.">
        <ul className="space-y-1.5">
          {PROACTIVITY_LADDER.map((mode) => {
            const selected = settings.proactivity === mode.value;
            return (
              <li key={mode.value}>
                <button
                  type="button"
                  onClick={() => onPatch({ proactivity: mode.value })}
                  className={
                    'group flex w-full items-start gap-2.5 rounded border px-3 py-2 text-left ' +
                    'transition-colors [transition-duration:140ms] ' +
                    (selected
                      ? 'border-[hsl(var(--theme-border-strong))] bg-[hsl(var(--theme-bg-hover))]'
                      : 'border-[hsl(var(--theme-border-default))] hover:bg-[hsl(var(--theme-bg-hover))]')
                  }
                  aria-pressed={selected}
                >
                  <span
                    aria-hidden
                    className={
                      'mt-1 inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full border ' +
                      (selected
                        ? 'border-transparent'
                        : 'border-[hsl(var(--theme-border-strong))]')
                    }
                    style={selected ? { backgroundColor: accent } : undefined}
                  >
                    {selected && <Check className="h-2 w-2 text-white" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-[hsl(var(--theme-text-primary))]">
                      {mode.title}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-4 text-[hsl(var(--theme-text-muted))]">
                      {mode.hint}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Subsection>

      {/* Memory & privacy block (§10.5) */}
      <Subsection title="Memory & privacy">
        <div
          className={
            'rounded border border-[hsl(var(--theme-border-default))] ' +
            'bg-[hsl(var(--theme-bg-secondary))] px-3 py-2.5 space-y-2'
          }
        >
          <div className="flex items-start gap-2">
            <ShieldCheck
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              style={{ color: 'hsl(var(--agent-accent-wellness))' }}
              aria-hidden
            />
            <p className="text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))]">
              The assistant remembers your last 5 turns in a Redis list keyed
              to your user id. It is private to you and kept until you clear
              it. We use it for follow-up questions and to keep your tone
              consistent across turns.
            </p>
          </div>

          {/* Pause-memory toggle (§14.3 follow-up). When on, the backend
              short-circuits all Redis read/write for this user — settings
              persist, only the rolling 5-turn context is suspended. */}
          <label
            className={
              'flex items-center justify-between gap-3 rounded ' +
              'border border-[hsl(var(--theme-border-default))] ' +
              'bg-[hsl(var(--theme-bg-elevated))] px-2.5 py-2 mt-1 ' +
              'cursor-pointer select-none'
            }
          >
            <span className="flex min-w-0 items-start gap-2">
              <PauseCircle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--theme-text-muted))]"
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-[hsl(var(--theme-text-primary))]">
                  Pause conversation memory
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-[hsl(var(--theme-text-muted))]">
                  Stops reading and writing the rolling 5-turn context. Tone,
                  language, and proactivity stay as you set them.
                </span>
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Pause conversation memory"
              checked={Boolean(settings.memory_paused)}
              onChange={(e) => onPatch({ memory_paused: e.target.checked })}
              className={
                'h-4 w-4 shrink-0 cursor-pointer accent-[hsl(var(--agent-accent-wellness))] ' +
                'transition-colors [transition-duration:140ms]'
              }
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClearMemory}
              disabled={clearing}
              className={
                'inline-flex items-center gap-1.5 rounded border border-[hsl(var(--theme-border-default))] ' +
                'bg-[hsl(var(--theme-bg-elevated))] px-2.5 py-1 text-[12px] font-medium ' +
                'text-[hsl(var(--theme-text-primary))] ' +
                'transition-colors [transition-duration:140ms] hover:bg-[hsl(var(--theme-bg-hover))] ' +
                'disabled:opacity-60 disabled:cursor-not-allowed'
              }
            >
              {clearing
                ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                : <Eraser  className="h-3 w-3" aria-hidden />}
              Clear conversation memory
            </button>

            <button
              type="button"
              onClick={onResetPreferences}
              className={
                'inline-flex items-center gap-1.5 rounded border border-[hsl(var(--theme-border-default))] ' +
                'bg-[hsl(var(--theme-bg-elevated))] px-2.5 py-1 text-[12px] font-medium ' +
                'text-[hsl(var(--theme-text-primary))] ' +
                'transition-colors [transition-duration:140ms] hover:bg-[hsl(var(--theme-bg-hover))]'
              }
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              Reset preferences
            </button>
          </div>
        </div>
      </Subsection>

      <div className="px-4 pb-4" />
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Assistant activation empty state
// ════════════════════════════════════════════════════════════════════════════

function AssistantActivationCard({ onActivate }: { onActivate: () => void | Promise<void> }) {
  const accent = accentFor('assistant');
  return (
    <section
      className={
        'relative overflow-hidden rounded-lg border border-dashed border-[hsl(var(--theme-border-default))] ' +
        'bg-[hsl(var(--theme-bg-elevated))] px-4 py-4'
      }
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-[2px]"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-[hsl(var(--theme-text-primary))]">
            Activate your AI Assistant
          </h3>
          <p className="mt-1 text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))]">
            One private layer across channels. You’ll be able to set
            tone, language, and how proactive it can be.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onActivate()}
          className={
            'shrink-0 rounded border border-[hsl(var(--theme-border-default))] ' +
            'bg-[hsl(var(--theme-bg-secondary))] px-3 py-1.5 text-[12px] font-medium ' +
            'text-[hsl(var(--theme-text-primary))] ' +
            'transition-colors [transition-duration:140ms] hover:bg-[hsl(var(--theme-bg-hover))]'
          }
        >
          Activate
        </button>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Automation card (Mood / Wellness / Translator / Personal Summaries)
// ════════════════════════════════════════════════════════════════════════════

interface AutomationCardProps {
  spec: AutomationSpec;
  agent: InstalledAgent | undefined;
  onToggle: (next: boolean) => void | Promise<void>;
  onActivate: () => void | Promise<void>;
  onSaveSettings: (next: Record<string, unknown>) => void | Promise<void>;
}

function AutomationCard({ spec, agent, onToggle, onActivate, onSaveSettings }: AutomationCardProps) {
  const accent = accentFor(spec.agentType);
  const [open, setOpen] = useState<boolean>(false);

  // Not installed yet → compact activate row.
  if (!agent) {
    return (
      <div
        className={
          'flex items-start gap-3 rounded-lg border border-dashed border-[hsl(var(--theme-border-default))] ' +
          'bg-[hsl(var(--theme-bg-elevated))] px-3 py-2.5'
        }
      >
        <span
          aria-hidden
          className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[hsl(var(--theme-text-primary))]">
            {agentLabel(spec.agentType)}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-[hsl(var(--theme-text-muted))]">
            {spec.description}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onActivate()}
          className={
            'shrink-0 rounded border border-[hsl(var(--theme-border-default))] ' +
            'bg-[hsl(var(--theme-bg-secondary))] px-2.5 py-1 text-[12px] font-medium ' +
            'text-[hsl(var(--theme-text-primary))] ' +
            'transition-colors [transition-duration:140ms] hover:bg-[hsl(var(--theme-bg-hover))]'
          }
        >
          Activate
        </button>
      </div>
    );
  }

  return (
    <div
      className={
        'rounded-lg border border-[hsl(var(--theme-border-default))] ' +
        'bg-[hsl(var(--theme-bg-elevated))] overflow-hidden'
      }
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <span
          aria-hidden
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-medium text-[hsl(var(--theme-text-primary))]">
              {agentLabel(spec.agentType)}
            </p>
            <StatusPill enabled={agent.enabled} />
            <VisibilityChip visibility={spec.visibility} />
          </div>
          <p className="mt-0.5 text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))]">
            {spec.description}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] leading-4 text-[hsl(var(--theme-text-muted))]">
            <Activity className="h-3 w-3" aria-hidden />
            <span className="font-medium text-[hsl(var(--theme-text-secondary))]">Last action</span>
            <span>{relativeTime(agent.last_used)}</span>
            <span className="text-[hsl(var(--theme-border-default))]">·</span>
            <span className="tabular-nums">{agent.usage_count}</span> uses
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <ToggleSwitch
            checked={agent.enabled}
            onChange={(next) => void onToggle(next)}
            accent={accent}
            label={`${agent.enabled ? 'Disable' : 'Enable'} ${agentLabel(spec.agentType)}`}
          />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={
              'inline-flex items-center gap-0.5 text-[11px] font-medium ' +
              'text-[hsl(var(--theme-text-muted))] ' +
              'transition-colors [transition-duration:140ms] hover:text-[hsl(var(--theme-text-primary))]'
            }
            aria-expanded={open}
          >
            {open
              ? <ChevronDown  className="h-3 w-3" aria-hidden />
              : <ChevronRight className="h-3 w-3" aria-hidden />}
            Manage
          </button>
        </div>
      </div>

      {/* Inline disclosure */}
      {open && (
        <div
          className={
            'border-t border-[hsl(var(--theme-border-default))] ' +
            'bg-[hsl(var(--theme-bg-secondary))] px-3 py-2.5 text-[12px] leading-5'
          }
        >
          <p className="text-[hsl(var(--theme-text-secondary))]">
            {spec.manageHint}
          </p>

          {spec.agentType === 'summarizer' && open && (
            <SummarySchedulePanel accent={accent} />
          )}

          {/* Friendly, labeled controls in place of the old raw JSON dump. */}
          <AutomationSettingsControls
            settings={agent.settings || {}}
            accent={accent}
            onSave={onSaveSettings}
          />
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Summary schedules — pick community + channel + time to get a private daily
// recap. Hits the per-user /api/agents/summary-schedules endpoints; the
// minute-resolution Celery beat job (check_user_summary_schedules) delivers
// the recap privately when the chosen local time comes around.
// ════════════════════════════════════════════════════════════════════════════

interface SummarySchedule {
  id: number;
  channel_id: number;
  community_id: number;
  channel_name?: string;
  community_name?: string;
  schedule_time: string;   // "HH:MM"
  timezone?: string;
  is_active: boolean;
}

function SummarySchedulePanel({ accent }: { accent: string }) {
  const { toast } = useToast();

  const [loading, setLoading]       = useState<boolean>(true);
  const [schedules, setSchedules]   = useState<SummarySchedule[]>([]);
  const [communities, setCommunities] = useState<Array<{ id: number; name: string }>>([]);

  // Add-form state
  const [showAdd, setShowAdd]         = useState<boolean>(false);
  const [selCommunity, setSelCommunity] = useState<number | null>(null);
  const [selChannel, setSelChannel]   = useState<number | null>(null);
  const [channels, setChannels]       = useState<Array<{ id: number; name: string }>>([]);
  const [channelsLoading, setChannelsLoading] = useState<boolean>(false);
  const [time, setTime]               = useState<string>('21:00');
  const [saving, setSaving]           = useState<boolean>(false);

  const localTz = useMemo(
    () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } },
    [],
  );

  const reloadSchedules = useCallback(async () => {
    const rows = await aiAgentService.getSummarySchedules();
    setSchedules(Array.isArray(rows) ? (rows as SummarySchedule[]) : []);
  }, []);

  // Initial load: schedules + the user's communities.
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [rows, comms] = await Promise.all([
          aiAgentService.getSummarySchedules(),
          channelService.getCommunities(),
        ]);
        if (!alive) return;
        setSchedules(Array.isArray(rows) ? (rows as SummarySchedule[]) : []);
        setCommunities((comms || []).map((c: any) => ({ id: c.id, name: c.name })));
      } catch (err: any) {
        if (alive) {
          toast({
            title: 'Could not load your summary schedules',
            description: err?.message ?? 'Please try again.',
            variant: 'destructive',
          });
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [toast]);

  // Load text channels whenever the picked community changes.
  useEffect(() => {
    if (!selCommunity) { setChannels([]); return; }
    let alive = true;
    setChannelsLoading(true);
    setSelChannel(null);
    channelService.getCommunityChannels(selCommunity)
      .then((ch) => {
        if (!alive) return;
        // Only text channels can be recapped — voice/private aren't summarisable.
        setChannels((ch || [])
          .filter((c: any) => c.type === 'text')
          .map((c: any) => ({ id: c.id, name: c.name })));
      })
      .catch(() => { if (alive) setChannels([]); })
      .finally(() => { if (alive) setChannelsLoading(false); });
    return () => { alive = false; };
  }, [selCommunity]);

  // Hide channels that already have a schedule (one per channel — backend upserts).
  const usedChannelIds = useMemo(
    () => new Set(schedules.map((s) => s.channel_id)),
    [schedules],
  );
  const availableChannels = useMemo(
    () => channels.filter((c) => !usedChannelIds.has(c.id)),
    [channels, usedChannelIds],
  );

  const resetForm = useCallback(() => {
    setShowAdd(false);
    setSelCommunity(null);
    setSelChannel(null);
    setChannels([]);
    setTime('21:00');
  }, []);

  const handleAdd = useCallback(async () => {
    if (!selCommunity || !selChannel) return;
    setSaving(true);
    try {
      await aiAgentService.createSummarySchedule({
        channel_id: selChannel,
        community_id: selCommunity,
        schedule_time: time,
        timezone: localTz,
      });
      await reloadSchedules();
      resetForm();
      toast({ title: 'Daily summary scheduled', description: `You’ll get a private recap at ${time}.` });
    } catch (err: any) {
      toast({
        title: 'Could not create the schedule',
        description: err?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [selCommunity, selChannel, time, localTz, reloadSchedules, resetForm, toast]);

  const handleToggle = useCallback(async (id: number, isActive: boolean) => {
    // Optimistic flip, roll back on failure.
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: !isActive } : s)));
    try {
      await aiAgentService.updateSummarySchedule(id, { is_active: !isActive });
    } catch (err: any) {
      setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: isActive } : s)));
      toast({
        title: 'Could not update the schedule',
        description: err?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleDelete = useCallback(async (id: number) => {
    const snapshot = schedules;
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    try {
      await aiAgentService.deleteSummarySchedule(id);
      toast({ title: 'Schedule removed' });
    } catch (err: any) {
      setSchedules(snapshot);
      toast({
        title: 'Could not remove the schedule',
        description: err?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [schedules, toast]);

  const inputCls =
    'h-8 w-full rounded border border-[hsl(var(--theme-border-default))] ' +
    'bg-[hsl(var(--theme-bg-elevated))] px-2 text-[12px] text-[hsl(var(--theme-text-primary))] ' +
    'focus:outline-none focus:ring-1 focus:ring-[hsl(var(--theme-border-focus))]';

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center gap-1.5">
        <CalendarClock className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--theme-text-muted))]">
          Daily summary schedules
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-[hsl(var(--theme-border-default))]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-5 text-[12px] text-[hsl(var(--theme-text-muted))]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Loading your schedules…
          </div>
        ) : (
          <>
            {schedules.length === 0 && !showAdd && (
              <p className="px-3 py-4 text-center text-[12px] leading-5 text-[hsl(var(--theme-text-muted))]">
                No schedules yet. Add one to get a private recap delivered at your preferred time each day.
              </p>
            )}

            {/* Existing schedules */}
            {schedules.map((s) => (
              <div
                key={s.id}
                className={
                  'flex items-center justify-between gap-3 px-3 py-2.5 ' +
                  'border-b border-[hsl(var(--theme-border-default))] last:border-b-0 ' +
                  'bg-[hsl(var(--theme-bg-secondary))]'
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-[hsl(var(--theme-text-primary))]">
                    #{s.channel_name || `channel ${s.channel_id}`}
                    {s.community_name && (
                      <span className="ml-1.5 font-normal text-[hsl(var(--theme-text-muted))]">
                        in {s.community_name}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[hsl(var(--theme-text-muted))]">
                    <Clock className="h-3 w-3" aria-hidden />
                    <span className="tabular-nums">{(s.schedule_time || '').slice(0, 5)}</span>
                    <span className="opacity-70">({s.timezone || 'UTC'})</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ToggleSwitch
                    checked={s.is_active}
                    onChange={() => void handleToggle(s.id, s.is_active)}
                    accent={accent}
                    label={`${s.is_active ? 'Pause' : 'Resume'} the schedule for ${s.channel_name || 'this channel'}`}
                  />
                  <button
                    type="button"
                    onClick={() => void handleDelete(s.id)}
                    aria-label={`Remove the schedule for ${s.channel_name || 'this channel'}`}
                    className={
                      'rounded p-1 text-[hsl(var(--theme-text-muted))] ' +
                      'transition-colors [transition-duration:140ms] ' +
                      'hover:bg-red-500/10 hover:text-red-400'
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            ))}

            {/* Add form */}
            {showAdd ? (
              <div className="space-y-2.5 bg-[hsl(var(--theme-bg-secondary))] px-3 py-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[hsl(var(--theme-text-muted))]">
                    Community
                  </label>
                  <select
                    value={selCommunity ?? ''}
                    onChange={(e) => setSelCommunity(Number(e.target.value) || null)}
                    className={inputCls}
                  >
                    <option value="">Select a community…</option>
                    {communities.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[hsl(var(--theme-text-muted))]">
                    Channel
                  </label>
                  <select
                    value={selChannel ?? ''}
                    onChange={(e) => setSelChannel(Number(e.target.value) || null)}
                    disabled={!selCommunity || channelsLoading}
                    className={inputCls + ' disabled:opacity-60'}
                  >
                    <option value="">
                      {!selCommunity
                        ? 'Pick a community first'
                        : channelsLoading
                          ? 'Loading channels…'
                          : availableChannels.length === 0
                            ? 'No channels left to schedule'
                            : 'Select a channel…'}
                    </option>
                    {availableChannels.map((c) => (
                      <option key={c.id} value={c.id}>#{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[hsl(var(--theme-text-muted))]">
                    Time (your local time · {localTz})
                  </label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className={inputCls}
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={resetForm}
                    className={
                      'inline-flex items-center gap-1 rounded border border-[hsl(var(--theme-border-default))] ' +
                      'bg-[hsl(var(--theme-bg-elevated))] px-2.5 py-1 text-[12px] font-medium ' +
                      'text-[hsl(var(--theme-text-secondary))] ' +
                      'transition-colors [transition-duration:140ms] hover:bg-[hsl(var(--theme-bg-hover))]'
                    }
                  >
                    <X className="h-3 w-3" aria-hidden />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAdd()}
                    disabled={!selChannel || saving}
                    className={
                      'inline-flex items-center gap-1.5 rounded border border-transparent px-3 py-1 ' +
                      'text-[12px] font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed'
                    }
                    style={{ backgroundColor: accent }}
                  >
                    {saving
                      ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      : <Check className="h-3 w-3" aria-hidden />}
                    Schedule it
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className={
                  'flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] font-medium ' +
                  'text-[hsl(var(--theme-text-secondary))] ' +
                  'transition-colors [transition-duration:140ms] hover:bg-[hsl(var(--theme-bg-hover))]'
                }
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add a schedule
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Automation settings — friendly, labeled controls (replaces the raw JSON dump)
// ════════════════════════════════════════════════════════════════════════════

function isLanguageKey(key: string): boolean {
  return key === 'language' || key === 'target_language';
}

function AutomationSettingsControls({
  settings,
  accent,
  onSave,
}: {
  settings: Record<string, unknown>;
  accent: string;
  onSave: (next: Record<string, unknown>) => void | Promise<void>;
}) {
  // Only primitive, user-meaningful keys get a control. Arrays/objects/null are
  // backend bookkeeping and stay hidden.
  const keys = useMemo(
    () => Object.keys(settings).filter((k) => {
      const v = settings[k];
      return typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string';
    }),
    [settings],
  );

  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...settings }));
  const [saving, setSaving] = useState(false);

  // Re-sync when the server value changes (after a refresh). Keyed on the
  // stringified value so we don't reset the draft on every render.
  const settingsKey = JSON.stringify(settings);
  useEffect(() => {
    setDraft({ ...settings });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey]);

  const dirty = keys.some((k) => draft[k] !== settings[k]);

  if (keys.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-[hsl(var(--theme-text-muted))]">
        Nothing to configure here — this one just works quietly in the background.
      </p>
    );
  }

  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 space-y-3">
      {keys.map((k) => {
        const meta = settingMeta(k);
        const value = draft[k];
        return (
          <div key={k} className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-[hsl(var(--theme-text-primary))]">{meta.label}</p>
              {meta.help && (
                <p className="mt-0.5 text-[11px] leading-4 text-[hsl(var(--theme-text-muted))]">{meta.help}</p>
              )}
            </div>
            <div className="shrink-0 pt-0.5">
              {typeof value === 'boolean' ? (
                <ToggleSwitch checked={value} onChange={(n) => set(k, n)} accent={accent} label={meta.label} />
              ) : isLanguageKey(k) ? (
                <SettingSelect value={String(value)} options={LANGUAGES} onChange={(v) => set(k, v)} />
              ) : meta.options ? (
                <SettingSelect value={String(value)} options={meta.options} onChange={(v) => set(k, v)} />
              ) : typeof value === 'number' ? (
                <NumberControl meta={meta} value={value} accent={accent} onChange={(n) => set(k, n)} />
              ) : (
                <input
                  type="text"
                  value={String(value)}
                  onChange={(e) => set(k, e.target.value)}
                  className={
                    'h-7 w-40 rounded border border-[hsl(var(--theme-border-default))] ' +
                    'bg-[hsl(var(--theme-bg-elevated))] px-2 text-[12px] text-[hsl(var(--theme-text-primary))] ' +
                    'focus:outline-none focus:ring-1 focus:ring-[hsl(var(--theme-border-focus))]'
                  }
                />
              )}
            </div>
          </div>
        );
      })}

      {dirty && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className={
              'inline-flex items-center gap-1.5 rounded border border-transparent px-3 py-1 ' +
              'text-[12px] font-medium text-white disabled:opacity-60'
            }
            style={{ backgroundColor: accent }}
          >
            {saving
              ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              : <Check className="h-3 w-3" aria-hidden />}
            Save changes
          </button>
        </div>
      )}
    </div>
  );
}

function NumberControl({
  meta,
  value,
  accent,
  onChange,
}: {
  meta: SettingMeta;
  value: number;
  accent: string;
  onChange: (n: number) => void;
}) {
  // Slider when the key declares a range; otherwise a plain number input.
  if (meta.min != null && meta.max != null) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={meta.min}
          max={meta.max}
          step={meta.step ?? 1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={meta.label}
          className="h-1 w-28 cursor-pointer appearance-none rounded-full bg-[hsl(var(--theme-bg-secondary))]"
          style={{ accentColor: accent }}
        />
        <span className="w-9 text-right font-mono text-[12px] tabular-nums text-[hsl(var(--theme-text-secondary))]">
          {value}
        </span>
      </div>
    );
  }
  return (
    <input
      type="number"
      value={value}
      step={meta.step ?? 1}
      aria-label={meta.label}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      className={
        'h-7 w-24 rounded border border-[hsl(var(--theme-border-default))] ' +
        'bg-[hsl(var(--theme-bg-elevated))] px-2 text-right text-[12px] text-[hsl(var(--theme-text-primary))] ' +
        'focus:outline-none focus:ring-1 focus:ring-[hsl(var(--theme-border-focus))]'
      }
    />
  );
}

function SettingSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  // Keep the current value selectable even if it isn't in the known list.
  const known = options.some((o) => o.value === value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        'h-7 min-w-[9rem] rounded border border-[hsl(var(--theme-border-default))] ' +
        'bg-[hsl(var(--theme-bg-elevated))] px-2 text-[12px] text-[hsl(var(--theme-text-primary))] ' +
        'focus:outline-none focus:ring-1 focus:ring-[hsl(var(--theme-border-focus))]'
      }
    >
      {!known && value && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Small primitives — kept local to this file (not promoted to /ai-agents
// yet because F3 is the only consumer right now).
// ════════════════════════════════════════════════════════════════════════════

function Subsection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[hsl(var(--theme-border-default))] px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--theme-text-muted))]">
          {title}
        </p>
        {hint && (
          <p className="text-[11px] text-[hsl(var(--theme-text-muted))]">
            {hint}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function StatusPill({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ' +
        (enabled
          ? 'border-[hsl(var(--agent-accent-support)_/_0.4)] text-[hsl(var(--agent-accent-support))]'
          : 'border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-muted))]')
      }
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: enabled
            ? 'hsl(var(--agent-accent-support))'
            : 'hsl(var(--theme-text-muted))',
        }}
      />
      {enabled ? 'Active' : 'Disabled'}
    </span>
  );
}

function ChipRadio({
  selected,
  onSelect,
  label,
  accent,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={
        'rounded-full border px-2.5 py-1 text-[12px] font-medium ' +
        'transition-colors [transition-duration:140ms] ' +
        (selected
          ? 'border-transparent text-white'
          : 'border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-secondary))] ' +
            'hover:bg-[hsl(var(--theme-bg-hover))]')
      }
      style={selected ? { backgroundColor: accent } : undefined}
    >
      {label}
    </button>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  accent,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  accent: string;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={
        'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors [transition-duration:140ms] ' +
        (checked
          ? 'border-transparent'
          : 'border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))]')
      }
      style={checked ? { backgroundColor: accent } : undefined}
    >
      <span
        aria-hidden
        className={
          'inline-block h-3 w-3 transform rounded-full bg-white transition-transform [transition-duration:140ms] ' +
          (checked ? 'translate-x-3.5' : 'translate-x-0.5')
        }
      />
    </button>
  );
}
