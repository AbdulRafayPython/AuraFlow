// Frontend/src/components/ai-agents/ChannelInterventions.tsx
//
// F2 — Inline conversation interventions, anchored just above the composer.
//
// Per docs/AUTONOMOUS_AGENT_FRONTEND_REDESIGN.md §8.4, autonomous actions
// should appear "where they affect comprehension or behavior" — i.e. in the
// reader's natural eye line as they read or compose, not buried in a toast
// or a side rail (those exist too, but for backlog and audit).
//
// This component listens to the same socket stream as `AgentEventListener`
// but instead of toasting, it pins the most recent 0–2 unresolved
// interventions to a slim rail directly above the composer. Each row
// reuses the canonical `ExplainabilityRow` primitive in expanded density,
// and exposes per-agent quick actions:
//
//   • support_suggestion → "Open in knowledge"
//   • summary_checkpoint → "Open recap"
//   • focus.drift        → "Recenter" + "Spin up thread"
//
// Each row also carries the standard Helpful / Not helpful / Dismiss
// controls (free, from ExplainabilityRow). Dismissing removes the
// intervention from the rail; the same correlation_id still lives on
// the right-rail Activity tab via the dual-emit path.
//
// Per-viewer translation footer and composer moderation hint are
// scoped to the message bubble + composer respectively, and live in
// Dashboard.tsx where they have a natural anchor.

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, FileText, Target } from 'lucide-react';
import { socket } from '@/socket';
import ExplainabilityRow, {
  ExplainabilityRowData,
  FeedbackSignal,
} from './ExplainabilityRow';
import { accentFor } from './AgentAccent';

interface ChannelInterventionsProps {
  channelId?: number | null;
  /** Open the Channel Intelligence rail at the given tab. */
  onOpenPanel?: (tab: 'recap' | 'knowledge' | 'focus' | 'activity') => void;
  /** "Recenter" action — replaces composer placeholder / scrolls to topic anchor. */
  onRecenter?: () => void;
  /** "Spin up thread" action — opens a thread composer for the suggestion. */
  onSpinThread?: (label: string) => void;
}

type InterventionKind = 'support' | 'recap' | 'focus';

interface Intervention {
  kind: InterventionKind;
  row: ExplainabilityRowData;
  /** Optional per-kind primary action. */
  primary?: { label: string; onClick: () => void };
  /** Optional per-kind secondary action. */
  secondary?: { label: string; onClick: () => void };
}

const VISIBILITY_MAP = {
  support: 'public-in-channel',
  recap:   'public-in-channel',
  focus:   'public-in-channel',
} as const;

const MAX_PINNED = 2;

export default function ChannelInterventions({
  channelId,
  onOpenPanel,
  onRecenter,
  onSpinThread,
}: ChannelInterventionsProps) {
  const [items, setItems] = useState<Intervention[]>([]);
  const [votes, setVotes] = useState<Record<string, FeedbackSignal>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Reset when the channel changes — interventions are channel-scoped.
  useEffect(() => {
    setItems([]);
    setDismissed(new Set());
  }, [channelId]);

  const append = useCallback((intervention: Intervention) => {
    setItems((prev) => {
      // Dedup by correlation_id.
      if (prev.some((p) => p.row.correlationId === intervention.row.correlationId)) {
        return prev;
      }
      const next = [intervention, ...prev];
      return next.slice(0, MAX_PINNED);
    });
  }, []);

  /* ── support_suggestion ───────────────────────────────────────────────── */
  useEffect(() => {
    if (!channelId) return;
    const handler = (data: {
      channel_id: number;
      community_id?: number | null;
      message_id?: number | null;
      kb_id?: number | null;
      kb_title?: string | null;
      snippet?: string | null;
      correlation_id: string;
    }) => {
      if (data.channel_id !== channelId) return;
      append({
        kind: 'support',
        row: {
          agent: 'support',
          decision: 'act',
          title: data.kb_title
            ? `Possible answer: ${data.kb_title}`
            : 'Possible answer in knowledge base',
          reason: (data.snippet ?? '').slice(0, 220) || 'Matched recent question to a KB entry.',
          scope: `#channel ${data.channel_id}`,
          visibility: VISIBILITY_MAP.support,
          correlationId: data.correlation_id,
          createdAt: new Date().toISOString(),
        },
        primary: {
          label: 'Open in knowledge',
          onClick: () => onOpenPanel?.('knowledge'),
        },
      });
    };
    socket.on('support_suggestion', handler);
    return () => {
      socket.off('support_suggestion', handler);
    };
  }, [channelId, append, onOpenPanel]);

  /* ── summary_checkpoint ───────────────────────────────────────────────── */
  useEffect(() => {
    if (!channelId) return;
    const handler = (data: {
      channel_id: number;
      community_id?: number | null;
      summary: string;
      correlation_id: string;
    }) => {
      if (data.channel_id !== channelId) return;
      const preview = (data.summary || '').slice(0, 220);
      append({
        kind: 'recap',
        row: {
          agent: 'summarizer',
          decision: 'act',
          title: 'New topic checkpoint',
          reason: preview + (data.summary.length > 220 ? '…' : ''),
          scope: `#channel ${data.channel_id}`,
          visibility: VISIBILITY_MAP.recap,
          correlationId: data.correlation_id,
          createdAt: new Date().toISOString(),
        },
        primary: {
          label: 'Open recap',
          onClick: () => onOpenPanel?.('recap'),
        },
      });
    };
    socket.on('summary_checkpoint', handler);
    return () => {
      socket.off('summary_checkpoint', handler);
    };
  }, [channelId, append, onOpenPanel]);

  /* ── focus.drift via agent_action ─────────────────────────────────────── */
  useEffect(() => {
    if (!channelId) return;
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<any>).detail;
      if (!detail) return;
      if (detail.channel_id !== channelId) return;
      if (detail.agent_name !== 'focus') return;
      if (detail.decision !== 'act') return;

      // Heuristic: surface as a drift card unless the reason explicitly says
      // "on-topic". Backend `focus` agent fires `agent_action` with the
      // drift summary in `reason` when it decides to act.
      const reason = String(detail.reason || '');
      if (/on[- ]?topic/i.test(reason)) return;

      const driftLabel = reason.split(/[.;:]/)[0]?.slice(0, 80) || 'Topic drift detected';

      append({
        kind: 'focus',
        row: {
          agent: 'focus',
          decision: 'act',
          title: 'Topic is drifting',
          reason: reason || 'The recent conversation has moved away from the channel topic.',
          scope: `#channel ${channelId}`,
          visibility: VISIBILITY_MAP.focus,
          correlationId: detail.correlation_id || `focus-${detail.id}`,
          createdAt: detail.created_at ?? new Date().toISOString(),
        },
        primary: onRecenter
          ? { label: 'Recenter', onClick: () => onRecenter() }
          : { label: 'Open focus', onClick: () => onOpenPanel?.('focus') },
        secondary: onSpinThread
          ? { label: 'Spin up thread', onClick: () => onSpinThread(driftLabel) }
          : undefined,
      });
    };
    window.addEventListener('auraflow:agent-action', handler);
    return () => window.removeEventListener('auraflow:agent-action', handler);
  }, [channelId, append, onOpenPanel, onRecenter, onSpinThread]);

  /* ── Voting + dismiss ─────────────────────────────────────────────────── */
  const onVoted = useCallback((correlationId: string, signal: FeedbackSignal) => {
    setVotes((v) => ({ ...v, [correlationId]: signal }));
    if (signal === 'dismissed') {
      setDismissed((s) => {
        const next = new Set(s);
        next.add(correlationId);
        return next;
      });
    }
  }, []);

  // "Close" the card from the rail after the user has voted. Pure UI removal —
  // the vote already POSTed feedback, so this does not send another signal.
  const onDismiss = useCallback((correlationId: string) => {
    setDismissed((s) => {
      const next = new Set(s);
      next.add(correlationId);
      return next;
    });
  }, []);

  const visible = items.filter((i) => !dismissed.has(i.row.correlationId));
  if (visible.length === 0) return null;

  return (
    <div
      className={
        'flex flex-col gap-1 border-t border-[hsl(var(--theme-border-default))] ' +
        'bg-[hsl(var(--theme-bg-secondary))] px-2 py-1.5'
      }
      role="region"
      aria-label="Channel interventions"
    >
      {visible.map((intervention) => (
        <InterventionCard
          key={intervention.row.correlationId}
          intervention={intervention}
          voted={votes[intervention.row.correlationId] ?? null}
          onVoted={onVoted}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

/* ─── Card subcomponent ─────────────────────────────────────────────────── */

function InterventionCard({
  intervention,
  voted,
  onVoted,
  onDismiss,
}: {
  intervention: Intervention;
  voted: FeedbackSignal | null;
  onVoted: (correlationId: string, signal: FeedbackSignal) => void;
  onDismiss: (correlationId: string) => void;
}) {
  const { row, kind, primary, secondary } = intervention;
  const KindIcon = kind === 'support' ? BookOpen : kind === 'recap' ? FileText : Target;
  const accent = accentFor(row.agent);

  return (
    <article
      className={
        'rounded-md border border-[hsl(var(--theme-border-default))] ' +
        'bg-[hsl(var(--theme-bg-elevated))]'
      }
    >
      <ExplainabilityRow
        row={row}
        density="expanded"
        voted={voted}
        onVoted={onVoted}
        onDismiss={onDismiss}
      />
      {(primary || secondary) && (
        <footer
          className={
            'flex items-center gap-1.5 border-t border-[hsl(var(--theme-border-default))] ' +
            'px-3 py-1.5'
          }
        >
          <KindIcon
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: accent }}
            aria-hidden
          />
          {primary && (
            <button
              type="button"
              onClick={primary.onClick}
              className={
                'inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ' +
                'transition-colors [transition-duration:140ms] hover:bg-[hsl(var(--theme-bg-hover))]'
              }
              style={{
                borderColor: `hsl(var(--agent-accent-${kindDomain(kind)}) / 0.5)`,
                color: accent,
              }}
            >
              {primary.label}
            </button>
          )}
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              className={
                'inline-flex items-center rounded border border-[hsl(var(--theme-border-default))] ' +
                'px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--theme-text-secondary))] ' +
                'transition-colors [transition-duration:140ms] hover:bg-[hsl(var(--theme-bg-hover))] ' +
                'hover:text-[hsl(var(--theme-text-primary))]'
              }
            >
              {secondary.label}
            </button>
          )}
        </footer>
      )}
    </article>
  );
}

function kindDomain(kind: InterventionKind): 'support' | 'community' | 'focus' {
  if (kind === 'support') return 'support';
  if (kind === 'recap') return 'community';
  return 'focus';
}
