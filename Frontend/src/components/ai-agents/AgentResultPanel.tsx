// Frontend/src/components/ai-agents/AgentResultPanel.tsx
//
// F2 — Channel Intelligence rail.
//
// Per docs/AUTONOMOUS_AGENT_FRONTEND_REDESIGN.md §8.5 + §16/F2, this is the
// persistent right-rail companion to the Channel Assist strip. Five tabs:
//
//   • Activity     — live ExplainabilityRow feed of every agent decision
//                    affecting this channel, consumed from the
//                    `auraflow:agent-action` DOM event (dual-emitted by
//                    AgentEventListener).
//   • Recap        — Summarizer history + on-demand generate.
//   • Knowledge    — Embeds the existing KnowledgePanel inline.
//   • Focus        — Focus agent analysis for the current channel.
//   • Translations — Per-viewer translation history (kept by parent).
//
// Admins additionally see a **Safety** tab: filtered Activity feed showing
// moderation decisions only. Same primitive, scoped filter.
//
// Information hierarchy:
//   - Theme via `--theme-*` variables (matte, no glow, no shadow).
//   - Identity colour per row via `--agent-accent-*` through ExplainabilityRow.
//   - 1px hairline borders, 140ms colour transitions, no slide bounce.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Activity as ActivityIcon,
  FileText,
  Brain,
  Target,
  Languages,
  Shield,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { useAIAgents } from '@/contexts/AIAgentContext';
import KnowledgePanel from './KnowledgePanel';
import ExplainabilityRow, {
  ExplainabilityRowData,
  FeedbackSignal,
} from './ExplainabilityRow';
import { AgentVisibility } from './VisibilityChip';
import { humanAction } from './humanize';

export type AgentResultTab =
  | 'activity'
  | 'recap'
  | 'knowledge'
  | 'focus'
  | 'translations'
  | 'safety'
  // Legacy aliases retained so existing callers keep compiling; mapped on mount.
  | 'summary'
  | 'mood';

interface AgentResultPanelProps {
  open: boolean;
  onClose: () => void;
  channelId: number;
  channelName: string;
  communityId?: number | null;
  initialTab?: AgentResultTab;
  /** Set true if the current viewer is an admin/owner of the community. */
  isAdmin?: boolean;
  /** A history of translated messages: kept by parent component. */
  translations?: TranslationHistoryItem[];
}

export interface TranslationHistoryItem {
  message_id: number;
  original: string;
  translated: string;
  target_language: string;
  at: string;
}

type CanonicalTab = 'activity' | 'recap' | 'knowledge' | 'focus' | 'translations' | 'safety';

const TAB_DEFS: { key: CanonicalTab; label: string; Icon: typeof ActivityIcon; adminOnly?: boolean }[] = [
  { key: 'activity',     label: 'Activity',     Icon: ActivityIcon },
  { key: 'recap',        label: 'Recap',        Icon: FileText },
  { key: 'knowledge',    label: 'Knowledge',    Icon: Brain },
  { key: 'focus',        label: 'Focus',        Icon: Target },
  { key: 'translations', label: 'Translations', Icon: Languages },
  { key: 'safety',       label: 'Safety',       Icon: Shield, adminOnly: true },
];

function canonicalize(tab: AgentResultTab | undefined): CanonicalTab {
  if (tab === 'summary') return 'recap';
  if (tab === 'mood') return 'activity'; // mood tab removed; show full feed
  return (tab ?? 'activity') as CanonicalTab;
}

export default function AgentResultPanel({
  open,
  onClose,
  channelId,
  channelName,
  communityId: _communityId,
  initialTab = 'activity',
  isAdmin = false,
  translations = [],
}: AgentResultPanelProps) {
  const [tab, setTab] = useState<CanonicalTab>(canonicalize(initialTab));

  useEffect(() => {
    if (open) setTab(canonicalize(initialTab));
  }, [open, initialTab]);

  if (!open) return null;

  const tabs = TAB_DEFS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <aside
      className={
        'fixed inset-y-0 right-0 z-40 flex w-full flex-col sm:w-[400px] ' +
        'border-l border-[hsl(var(--theme-border-default))] ' +
        'bg-[hsl(var(--theme-bg-elevated))] ' +
        'animate-in slide-in-from-right duration-200 motion-reduce:animate-none ' +
        'pt-safe pb-safe'
      }
      aria-label={`Channel intelligence for ${channelName}`}
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[hsl(var(--theme-border-default))] px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold text-[hsl(var(--theme-text-primary))]">
            Channel intelligence
          </h3>
          <p className="truncate text-[11px] text-[hsl(var(--theme-text-muted))]">
            #{channelName}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close channel intelligence"
          className={
            'rounded p-1.5 text-[hsl(var(--theme-text-muted))] ' +
            'transition-colors [transition-duration:140ms] ' +
            'hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))]'
          }
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* Tab strip */}
      <nav
        className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-[hsl(var(--theme-border-default))] px-2 py-1.5"
        role="tablist"
      >
        {tabs.map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={
                'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 ' +
                'text-[11px] font-medium transition-colors [transition-duration:140ms] ' +
                (active
                  ? 'bg-[hsl(var(--theme-bg-active))] text-[hsl(var(--theme-text-primary))]'
                  : 'text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-secondary))]')
              }
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'activity'     && <ActivityTab channelId={channelId} channelName={channelName} adminOnly={false} />}
        {tab === 'recap'        && <RecapTab channelId={channelId} />}
        {tab === 'knowledge'    && <KnowledgeTab channelId={channelId} channelName={channelName} />}
        {tab === 'focus'        && <FocusTab channelId={channelId} />}
        {tab === 'translations' && <TranslationsTab items={translations} />}
        {tab === 'safety'       && <ActivityTab channelId={channelId} channelName={channelName} adminOnly safetyOnly />}
      </div>
    </aside>
  );
}

/* ─── Activity tab — live ExplainabilityRow feed ──────────────────────────── */

interface AgentActionEventDetail {
  id: number;
  agent_name: string;
  community_id?: number | null;
  channel_id?: number | null;
  user_id?: number | null;
  decision: 'act' | 'skip' | 'defer';
  reason: string;
  correlation_id: string;
  created_at?: string | null;
  /** Optional fields added by the dual-emit path (see AgentEventListener). */
  title?: string;
  visibility?: AgentVisibility;
}

const VISIBILITY_DEFAULT: Record<string, AgentVisibility> = {
  mood_tracker: 'you-only',
  wellness:     'you-only',
  assistant:    'you-only',
  translator:   'you-only',
};

function defaultVisibility(agent: string): AgentVisibility {
  return VISIBILITY_DEFAULT[agent] ?? 'public-in-channel';
}

function scopeFor(detail: AgentActionEventDetail, channelName?: string): string | undefined {
  if (detail.channel_id) return channelName ? `#${channelName}` : `Channel #${detail.channel_id}`;
  if (detail.community_id) return 'This community';
  if (detail.user_id) return 'You';
  return undefined;
}

interface ActivityTabProps {
  channelId: number;
  channelName?: string;
  adminOnly: boolean;
  safetyOnly?: boolean;
}

const FEED_CAP = 80;

function ActivityTab({ channelId, channelName, safetyOnly = false }: ActivityTabProps) {
  const [rows, setRows] = useState<ExplainabilityRowData[]>([]);
  const [votes, setVotes] = useState<Record<string, FeedbackSignal>>({});
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Reset the feed when the channel changes; we only want this channel's rows.
    setRows([]);
    seenRef.current = new Set();

    // Replay buffered events so late-mounting panels don't show "No activity".
    const buf: any[] = (window as any).__auraAgentActionBuffer ?? [];
    for (const detail of buf) {
      if (!detail) continue;
      if (detail.channel_id && detail.channel_id !== channelId) continue;
      if (safetyOnly && detail.agent_name !== 'moderation') continue;
      const corr = detail.correlation_id || `agent-${detail.id}`;
      if (seenRef.current.has(corr)) continue;
      seenRef.current.add(corr);
      const human = humanAction(detail.agent_name, detail.decision, detail.reason);
      setRows((prev) => [
        {
          agent: detail.agent_name,
          decision: detail.decision,
          title: detail.title || human.title,
          reason: human.detail,
          scope: scopeFor(detail, channelName),
          visibility: detail.visibility ?? defaultVisibility(detail.agent_name),
          correlationId: corr,
          createdAt: detail.created_at ?? new Date().toISOString(),
        },
        ...prev,
      ].slice(0, FEED_CAP));
    }
  }, [channelId, channelName, safetyOnly]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<AgentActionEventDetail>).detail;
      if (!detail) return;

      // Show rows that belong to this channel OR that are user-private
      // (no channel binding). Drop rows for other channels entirely.
      if (detail.channel_id && detail.channel_id !== channelId) return;

      if (safetyOnly && detail.agent_name !== 'moderation') return;

      const corr = detail.correlation_id || `agent-${detail.id}`;
      if (seenRef.current.has(corr)) return;
      seenRef.current.add(corr);

      const human = humanAction(detail.agent_name, detail.decision, detail.reason);
      const row: ExplainabilityRowData = {
        agent: detail.agent_name,
        decision: detail.decision,
        title: detail.title || human.title,
        reason: human.detail,
        scope: scopeFor(detail, channelName),
        visibility: detail.visibility ?? defaultVisibility(detail.agent_name),
        correlationId: corr,
        createdAt: detail.created_at ?? new Date().toISOString(),
      };

      setRows((prev) => [row, ...prev].slice(0, FEED_CAP));
    };

    window.addEventListener('auraflow:agent-action', handler);
    return () => window.removeEventListener('auraflow:agent-action', handler);
  }, [channelId, channelName, safetyOnly]);

  const onVoted = (correlationId: string, signal: FeedbackSignal) => {
    setVotes((v) => ({ ...v, [correlationId]: signal }));
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ActivityIcon className="h-7 w-7 opacity-40" />}
        title={safetyOnly ? 'Nothing to flag here' : 'No recent autonomous actions in this channel yet.'}
        subtitle={
          safetyOnly
            ? 'Moderation has been watching — no intervention was needed.'
            : 'Agents will act when the channel needs them, and explain why here.'
        }
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-[hsl(var(--theme-border-default))] px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--theme-text-muted))]">
          {safetyOnly ? 'Safety feed' : 'Live decisions'}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-[hsl(var(--theme-text-muted))]">
          {rows.length}
        </span>
      </div>
      <ul role="list" className="divide-y divide-[hsl(var(--theme-border-default))]">
        {rows.map((row) => (
          <li key={row.correlationId}>
            <ExplainabilityRow
              row={row}
              density="standard"
              voted={votes[row.correlationId] ?? null}
              onVoted={onVoted}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Recap tab — summarizer history ────────────────────────────────────── */

function RecapTab({ channelId }: { channelId: number }) {
  const { getChannelSummaries, generateSummary } = useAIAgents() as any;
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getChannelSummaries(channelId);
      setItems(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const onGenerate = async () => {
    try {
      setBusy(true);
      await generateSummary(channelId, 100);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-[hsl(var(--theme-border-default))] px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--theme-text-muted))]">
          Recent recaps
        </span>
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy}
          className={
            'inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ' +
            'border border-[hsl(var(--theme-border-default))] ' +
            'text-[hsl(var(--theme-text-secondary))] ' +
            'transition-colors [transition-duration:140ms] ' +
            'hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))] ' +
            'disabled:opacity-50'
          }
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Recap now'}
        </button>
      </div>

      {loading && (
        <p className="px-3 py-6 text-center text-[11px] text-[hsl(var(--theme-text-muted))]">Loading…</p>
      )}

      {!loading && items && items.length === 0 && (
        <EmptyState
          icon={<FileText className="h-7 w-7 opacity-40" />}
          title="No recaps generated for this channel yet."
          subtitle="Run one to catch the channel up on what it missed."
        />
      )}

      {!loading && items && items.length > 0 && (
        <ul className="divide-y divide-[hsl(var(--theme-border-default))]">
          {items.map((s: any) => (
            <li key={s.id} className="px-3 py-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wide text-[hsl(var(--agent-accent-community))]">
                  Recap
                </span>
                <span className="font-mono text-[10px] text-[hsl(var(--theme-text-muted))]">
                  {s.created_at ? new Date(s.created_at).toLocaleString() : ''}
                </span>
              </div>
              <p className="line-clamp-6 whitespace-pre-wrap text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))]">
                {s.summary || s.content}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Knowledge tab — embedded ──────────────────────────────────────────── */

function KnowledgeTab({ channelId, channelName }: { channelId: number; channelName: string }) {
  return (
    <div className="relative h-full">
      <div className="[&>div]:!relative [&>div]:!w-full [&>div]:!h-full [&>div]:!shadow-none [&>div]:!border-0 [&>div]:!bg-transparent">
        <KnowledgePanel
          channelId={channelId}
          channelName={channelName}
          onClose={() => {
            /* parent rail handles close */
          }}
        />
      </div>
    </div>
  );
}

/* ─── Focus tab ─────────────────────────────────────────────────────────── */

function FocusTab({ channelId }: { channelId: number }) {
  const { analyzeFocus } = useAIAgents() as any;
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!channelId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await analyzeFocus(24, channelId);
      setData(r);
    } catch (e: any) {
      setError(e?.message || 'Could not analyze focus for this channel.');
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [analyzeFocus, channelId]);

  // Auto-run analysis when the Focus tab opens (e.g. via the drift card's
  // "Recenter" action) so the section shows results immediately instead of an
  // empty "click Analyze" state. Re-runs if the channel changes.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Backend returns the score nested under `analysis` (already 0-100);
  // fall back to a flat shape for safety. Scale only if it's a 0-1 ratio.
  const analysis = data?.analysis ?? data;
  const rawScore =
    typeof analysis?.focus_score === 'number' ? analysis.focus_score : null;
  const focusScore =
    rawScore === null
      ? null
      : rawScore <= 1
        ? Math.round(rawScore * 100)
        : Math.round(rawScore);
  const topics = analysis?.main_topics ?? analysis?.dominant_topics ?? [];

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-[hsl(var(--theme-border-default))] px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--theme-text-muted))]">
          Channel focus · 24h
        </span>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className={
            'inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ' +
            'border border-[hsl(var(--theme-border-default))] ' +
            'text-[hsl(var(--theme-text-secondary))] ' +
            'transition-colors [transition-duration:140ms] ' +
            'hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))] ' +
            'disabled:opacity-50'
          }
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Analyze'}
        </button>
      </div>

      {!data && busy && (
        <div className="flex items-center justify-center gap-2 px-3 py-8 text-[12px] text-[hsl(var(--theme-text-muted))]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing channel focus…
        </div>
      )}

      {!data && !busy && !error && (
        <EmptyState
          icon={<Target className="h-7 w-7 opacity-40" />}
          title="Focus hasn't been measured in this channel yet."
          subtitle="Run an analysis to see how closely the conversation tracks the channel's purpose."
        />
      )}

      {!data && !busy && error && (
        <EmptyState
          icon={<Target className="h-7 w-7 opacity-40" />}
          title="Couldn't measure focus yet."
          subtitle={error}
        />
      )}

      {data && (
        <div className="space-y-3 px-3 py-3">
          <div className="rounded border border-[hsl(var(--theme-border-default))] p-3">
            <p className="text-[11px] text-[hsl(var(--theme-text-muted))]">Focus score</p>
            <p
              className="mt-0.5 font-mono text-2xl tabular-nums"
              style={{ color: 'hsl(var(--agent-accent-focus))' }}
            >
              {focusScore !== null ? `${focusScore}%` : '—'}
            </p>
          </div>

          {Array.isArray(topics) && topics.length > 0 && (
            <div className="rounded border border-[hsl(var(--theme-border-default))] p-3">
              <p className="mb-2 text-[11px] text-[hsl(var(--theme-text-muted))]">
                Dominant topics
              </p>
              <div className="flex flex-wrap gap-1.5">
                {topics.slice(0, 8).map((t: any, i: number) => (
                  <span
                    key={i}
                    className="rounded border px-1.5 py-0.5 text-[10px]"
                    style={{
                      borderColor: 'hsl(var(--agent-accent-focus) / 0.4)',
                      color: 'hsl(var(--agent-accent-focus))',
                    }}
                  >
                    {typeof t === 'string' ? t : (t?.topic ?? t?.name ?? '')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Translations tab ──────────────────────────────────────────────────── */

function TranslationsTab({ items }: { items: TranslationHistoryItem[] }) {
  const grouped = useMemo(() => items.slice().reverse(), [items]);

  if (!grouped.length) {
    return (
      <EmptyState
        icon={<Languages className="h-7 w-7 opacity-40" />}
        title="No translations requested yet."
        subtitle="Right-click any message and choose Translate to start."
      />
    );
  }

  return (
    <ul className="divide-y divide-[hsl(var(--theme-border-default))]">
      {grouped.map((t, i) => (
        <li key={i} className="px-3 py-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span
              className="font-mono text-[10px] uppercase tracking-wide"
              style={{ color: 'hsl(var(--agent-accent-translation))' }}
            >
              → {t.target_language}
            </span>
            <span className="font-mono text-[10px] text-[hsl(var(--theme-text-muted))]">
              {new Date(t.at).toLocaleTimeString()}
            </span>
          </div>
          <p className="line-clamp-2 text-[11px] text-[hsl(var(--theme-text-muted))]">
            {t.original}
          </p>
          <div className="mt-1 flex items-start gap-1.5">
            <ChevronRight
              className="mt-0.5 h-3 w-3 shrink-0"
              style={{ color: 'hsl(var(--agent-accent-translation))' }}
              aria-hidden
            />
            <p className="whitespace-pre-wrap text-[12px] leading-5 text-[hsl(var(--theme-text-primary))]">
              {t.translated}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ─── Empty state ───────────────────────────────────────────────────────── */

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center text-[hsl(var(--theme-text-muted))]">
      <div className="mb-2">{icon}</div>
      <p className="text-[13px] text-[hsl(var(--theme-text-secondary))]">{title}</p>
      {subtitle && <p className="mt-1 text-[11px] opacity-80">{subtitle}</p>}
    </div>
  );
}
