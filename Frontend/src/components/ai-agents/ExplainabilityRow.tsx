// Frontend/src/components/ai-agents/ExplainabilityRow.tsx
//
// The canonical row primitive for every autonomous-agent surface defined
// in docs/AUTONOMOUS_AGENT_FRONTEND_REDESIGN.md §13.1.
//
// Three density modes share one component:
//   - `dense`    — floating timeline, admin activity tables    (one line, 28-32px)
//   - `standard` — Channel Intelligence rail Activity tab      (two lines, ~56px)
//   - `expanded` — Community Hub recent activity center        (three lines, ~84px)
//
// Every row carries five facts (§13.1):
//   1. Agent identity         — accent dot + short code + label
//   2. Action title           — what was done
//   3. Reason                 — why, in user-readable language
//   4. Scope label            — community / channel / user
//   5. Visibility chip        — public-in-channel / you-only / admins-only / private-dm
//
// Plus three controls (§13.2):
//   - Helpful (positive)
//   - Not helpful (negative)
//   - Dismiss (dismissed)
//
// Controls POST to /api/agents/<name>/feedback via postAgentFeedback().
// The component is presentation-only; it does not own feedback state —
// callers manage `voted` so the same row can be visible in multiple
// surfaces without diverging.

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, X, Check } from 'lucide-react';
import VisibilityChip, { AgentVisibility } from './VisibilityChip';
import { accentFor, agentLabel } from './AgentAccent';
import { decisionVerb, humanizeReason } from './humanize';
import { postAgentFeedback } from '@/components/AgentEventListener';

export type AgentDecision = 'act' | 'skip' | 'defer';
export type FeedbackSignal = 'positive' | 'negative' | 'dismissed';
export type RowDensity = 'dense' | 'standard' | 'expanded';

export interface ExplainabilityRowData {
  /** Agent identifier, e.g. `wellness`, `mood_tracker`. */
  agent: string;
  /** Backend decision. Only `act` rows render feedback controls. */
  decision: AgentDecision;
  /** One-line title of what happened. */
  title: string;
  /** Short explanation. Shown verbatim — write user-facing copy at call site. */
  reason: string;
  /** Scope label, e.g. `#general`, `Community: AuraFlow`, `You`. */
  scope?: string;
  /** Visibility chip. Required on standard + expanded; optional in dense. */
  visibility?: AgentVisibility;
  /** correlation_id from the backend `agent_action` event. */
  correlationId: string;
  /** ISO timestamp; rendered as relative time. */
  createdAt?: string | null;
  /** Optional outcome state if the agent has reported back. */
  outcome?: 'positive' | 'negative' | 'neutral';
}

export interface ExplainabilityRowProps {
  row: ExplainabilityRowData;
  /** Visual density. Defaults to `standard`. */
  density?: RowDensity;
  /** External feedback state — keep consistent across surfaces showing the same correlation_id. */
  voted?: FeedbackSignal | null;
  /** Called after a successful feedback POST. */
  onVoted?: (correlationId: string, signal: FeedbackSignal) => void;
  /**
   * Optional "close this card" action. When provided, a cross button is
   * shown after the user votes (👍/👎) so they can dismiss the card from
   * view without it counting as a separate `dismissed` feedback signal.
   */
  onDismiss?: (correlationId: string) => void;
  className?: string;
}

function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const seconds = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

export default function ExplainabilityRow({
  row,
  density = 'standard',
  voted = null,
  onVoted,
  onDismiss,
  className = '',
}: ExplainabilityRowProps) {
  const [busy, setBusy] = useState(false);
  const [localVote, setLocalVote] = useState<FeedbackSignal | null>(voted);
  const currentVote = voted ?? localVote;

  const isAct = row.decision === 'act';
  const accent = accentFor(row.agent);

  // Belt-and-suspenders: even if a caller forgot to humanise, never render a
  // raw `warming_window_2/5`-style code. Human sentences pass through.
  const detail = humanizeReason(row.agent, row.decision, row.reason);

  async function vote(signal: FeedbackSignal) {
    if (currentVote || busy) return;
    setBusy(true);
    try {
      await postAgentFeedback(row.agent, row.correlationId, signal);
      setLocalVote(signal);
      onVoted?.(row.correlationId, signal);
    } finally {
      setBusy(false);
    }
  }

  // ── Dense (one-line) ─────────────────────────────────────
  if (density === 'dense') {
    return (
      <div
        className={
          'group flex items-center gap-2 px-2 py-1.5 text-[12px] leading-4 ' +
          'border-b border-[hsl(var(--theme-border-default))] last:border-b-0 ' +
          'hover:bg-[hsl(var(--theme-bg-hover))] transition-colors [transition-duration:140ms] ' +
          className
        }
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <span
          className="w-16 shrink-0 truncate text-[11px] font-medium text-[hsl(var(--theme-text-muted))]"
          title={agentLabel(row.agent)}
        >
          {agentLabel(row.agent)}
        </span>
        <span
          className="min-w-0 flex-1 truncate font-medium text-[hsl(var(--theme-text-primary))]"
          title={detail !== row.title ? `${row.title} — ${detail}` : row.title}
        >
          {row.title}
        </span>
        {row.visibility && (
          <VisibilityChip visibility={row.visibility} compact className="shrink-0" />
        )}
        {row.createdAt && (
          <span className="w-8 shrink-0 text-right font-mono text-[10px] text-[hsl(var(--theme-text-muted))]">
            {relativeTime(row.createdAt)}
          </span>
        )}
        {isAct && (
          <FeedbackControls
            onVote={vote}
            voted={currentVote}
            disabled={busy}
            dense
            onClose={onDismiss ? () => onDismiss(row.correlationId) : undefined}
          />
        )}
      </div>
    );
  }

  // ── Standard (two-line) and Expanded (three-line) share scaffolding ─────────
  const isExpanded = density === 'expanded';

  return (
    <div
      className={
        'group flex items-start gap-3 px-3 py-2.5 ' +
        'border-b border-[hsl(var(--theme-border-default))] last:border-b-0 ' +
        'transition-colors [transition-duration:140ms] hover:bg-[hsl(var(--theme-bg-hover))] ' +
        className
      }
    >
      {/* Accent rail — 2px wide, full height. Identity without panel color. */}
      <span
        aria-hidden
        className="mt-0.5 h-8 w-[2px] shrink-0 rounded-sm"
        style={{ backgroundColor: accent }}
      />

      <div className="min-w-0 flex-1">
        {/* Row 1 — agent label, decision, scope, timestamp */}
        <div className="flex items-baseline gap-2 text-[11px] leading-4 text-[hsl(var(--theme-text-muted))]">
          <span
            className="font-medium uppercase tracking-wide"
            style={{ color: accent }}
          >
            {agentLabel(row.agent)}
          </span>
          <span className="font-medium">{decisionVerb(row.decision)}</span>
          {row.scope && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{row.scope}</span>
            </>
          )}
          {row.createdAt && (
            <>
              <span aria-hidden>·</span>
              <span className="font-mono tabular-nums">{relativeTime(row.createdAt)}</span>
            </>
          )}
        </div>

        {/* Row 2 — title (primary) */}
        <p className="mt-0.5 truncate text-[13px] font-medium text-[hsl(var(--theme-text-primary))]">
          {row.title}
        </p>

        {/* Row 3 — reason (expanded mode only; otherwise tooltip-only) */}
        {isExpanded && (
          <p className="mt-0.5 text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))]">
            {detail}
          </p>
        )}
        {!isExpanded && detail !== row.title && (
          <p
            className="mt-0.5 truncate text-[12px] text-[hsl(var(--theme-text-muted))]"
            title={detail}
          >
            {detail}
          </p>
        )}

        {/* Footer chips */}
        {row.visibility && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <VisibilityChip visibility={row.visibility} />
            {row.outcome && (
              <span
                className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                style={{
                  borderColor: `hsl(var(--agent-state-${row.outcome}))`,
                  color: `hsl(var(--agent-state-${row.outcome}))`,
                }}
              >
                {row.outcome}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Controls — right-aligned, only on act rows */}
      {isAct && (
        <FeedbackControls
          onVote={vote}
          voted={currentVote}
          disabled={busy}
          allowDismiss
          onClose={onDismiss ? () => onDismiss(row.correlationId) : undefined}
        />
      )}
    </div>
  );
}

/* ─── Subcomponents ───────────────────────────────────────────────── */

interface ControlProps {
  onVote: (signal: FeedbackSignal) => void;
  voted: FeedbackSignal | null;
  disabled: boolean;
  /** Dense rows keep the controls always visible (the row is one line). */
  dense?: boolean;
  /** Standard/expanded rows additionally offer a dismiss control. */
  allowDismiss?: boolean;
  /**
   * When provided, a cross button is rendered after voting so the user can
   * close the card from view. Pure UI removal — does not POST feedback.
   */
  onClose?: () => void;
}

/**
 * Feedback controls shared by every density. The thumbs train the agent's
 * bandit (`postAgentFeedback` → backend `learn()`), but to a normal user they
 * just answer one plain question — so we lead with "Was this helpful?" rather
 * than bare icons. Once a vote lands the row shows a quiet "Thanks".
 */
function FeedbackControls({ onVote, voted, disabled, dense = false, allowDismiss = false, onClose }: ControlProps) {
  if (voted) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-[hsl(var(--theme-text-muted))]">
        <Check className="h-3 w-3" aria-hidden style={{ color: 'hsl(var(--agent-state-positive))' }} />
        {dense ? 'Thanks' : 'Thanks for the feedback'}
        {onClose && (
          <IconBtn
            onClick={onClose}
            active={false}
            activeColor="var(--theme-text-muted)"
            title="Close"
            disabled={false}
            Icon={X}
          />
        )}
      </span>
    );
  }

  return (
    <span
      className={
        'flex shrink-0 items-center gap-1 ' +
        // Standard/expanded rows reveal on hover/focus to stay calm; dense rows
        // (the floating timeline) keep them visible since the row is tiny.
        (dense
          ? ''
          : 'opacity-0 transition-opacity [transition-duration:140ms] group-hover:opacity-100 focus-within:opacity-100')
      }
    >
      <span
        className={
          'whitespace-nowrap text-[11px] text-[hsl(var(--theme-text-muted))] ' +
          // In dense rows the thumbs stay visible but the prompt only appears on
          // hover so it never crowds the one-line layout.
          (dense ? 'hidden group-hover:inline' : '')
        }
      >
        Was this helpful?
      </span>
      <IconBtn
        onClick={() => onVote('positive')}
        active={false}
        activeColor="var(--agent-state-positive)"
        title="Yes, helpful"
        disabled={disabled}
        Icon={ThumbsUp}
      />
      <IconBtn
        onClick={() => onVote('negative')}
        active={false}
        activeColor="var(--agent-state-attention)"
        title="No, not helpful"
        disabled={disabled}
        Icon={ThumbsDown}
      />
      {allowDismiss && (
        <IconBtn
          onClick={() => onVote('dismissed')}
          active={false}
          activeColor="var(--theme-text-muted)"
          title="Dismiss"
          disabled={disabled}
          Icon={X}
        />
      )}
    </span>
  );
}

interface IconBtnProps {
  onClick: () => void;
  active: boolean;
  activeColor: string;
  title: string;
  disabled: boolean;
  Icon: typeof ThumbsUp;
}

function IconBtn({ onClick, active, activeColor, title, disabled, Icon }: IconBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={
        'inline-flex h-6 w-6 items-center justify-center rounded transition-colors [transition-duration:140ms] ' +
        'hover:bg-[hsl(var(--theme-bg-active))] disabled:opacity-60 disabled:hover:bg-transparent'
      }
      style={active ? { color: `hsl(${activeColor})` } : undefined}
    >
      <Icon className="h-3 w-3" aria-hidden />
    </button>
  );
}
