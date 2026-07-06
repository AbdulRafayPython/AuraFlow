// Frontend/src/components/AgentActivityTimeline.tsx
//
// Live feed of autonomous-agent decisions. Subscribes to the
// `auraflow:agent-action` DOM event fanned out by AgentEventListener
// (which in turn forwards Socket.IO's `agent_action` messages).
//
// Renders a floating, collapsible panel in the bottom-right corner.
// Rows are rendered through the shared <ExplainabilityRow> primitive
// (see docs/AUTONOMOUS_AGENT_FRONTEND_REDESIGN.md §13.1) so this surface
// stays visually consistent with the Channel Intelligence rail and the
// Community Hub recent-activity center.

import { useEffect, useMemo, useState } from 'react';
import { Activity, ChevronDown, ChevronUp, X } from 'lucide-react';
import ExplainabilityRow, {
  AgentDecision,
  ExplainabilityRowData,
  FeedbackSignal,
} from './ai-agents/ExplainabilityRow';
import { AgentVisibility } from './ai-agents/VisibilityChip';
import { humanAction } from './ai-agents/humanize';
import { getNotificationSettings, updateNotificationSettings } from '@/services/authService';

/**
 * Window event used to keep this widget and the Settings → AI Agents toggle
 * in sync without a shared context. The detail carries the new boolean so the
 * widget shows/hides instantly when the user flips the switch in Settings.
 */
export const AGENT_ACTIVITY_PREF_EVENT = 'auraflow:agent-activity-pref';

interface AgentActionEvent {
  id: number;
  agent_name: string;
  community_id?: number | null;
  channel_id?: number | null;
  user_id?: number | null;
  decision: AgentDecision;
  reason: string;
  correlation_id: string;
  created_at?: string | null;
  // Optional fields supplied by some agents (translator footer, wellness DM, …).
  title?: string;
  visibility?: AgentVisibility;
  scope?: string;
}

const MAX_ROWS = 20;

/**
 * Derive a default visibility for the row when the agent didn't supply one.
 * Personal-scope agents default to `you-only`; everything else is
 * `public-in-channel`. Surfaces that know better can override at the source.
 */
function defaultVisibility(agent: string): AgentVisibility {
  if (agent === 'mood_tracker' || agent === 'wellness' || agent === 'assistant') {
    return 'you-only';
  }
  if (agent === 'translator') return 'you-only';
  return 'public-in-channel';
}

/** Default scope label. Agents with richer payloads override at the source. */
function defaultScope(ev: AgentActionEvent): string | undefined {
  if (ev.channel_id) return `Channel #${ev.channel_id}`;
  if (ev.community_id) return `Community ${ev.community_id}`;
  if (ev.user_id) return 'You';
  return undefined;
}

function toRow(ev: AgentActionEvent): ExplainabilityRowData {
  const human = humanAction(ev.agent_name, ev.decision, ev.reason);
  return {
    agent: ev.agent_name,
    decision: ev.decision,
    title: ev.title ?? human.title,
    reason: human.detail,
    scope: ev.scope ?? defaultScope(ev),
    visibility: ev.visibility ?? defaultVisibility(ev.agent_name),
    correlationId: ev.correlation_id,
    createdAt: ev.created_at ?? new Date().toISOString(),
  };
}

export function AgentActivityTimeline() {
  const [rows, setRows] = useState<AgentActionEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [voted, setVoted] = useState<Record<string, FeedbackSignal>>({});

  // Off by default. `null` = preference not loaded yet (keeps the panel hidden
  // until we know the user opted in, so it never flashes on for new accounts).
  const [enabled, setEnabled] = useState<boolean | null>(null);

  // Load the saved preference once, and keep in sync with the Settings toggle.
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

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AgentActionEvent>).detail;
      if (!detail || !detail.agent_name) return;
      setRows((prev) => {
        // Dedupe by correlation_id — orchestrator stamps these so re-dispatched
        // events don't double up.
        const without = prev.filter((r) => r.correlation_id !== detail.correlation_id);
        return [detail, ...without].slice(0, MAX_ROWS);
      });
    };
    window.addEventListener('auraflow:agent-action', handler as EventListener);
    return () => window.removeEventListener('auraflow:agent-action', handler as EventListener);
  }, []);

  const actCount = useMemo(
    () => rows.filter((r) => r.decision === 'act').length,
    [rows],
  );

  // Turn the panel off from its own header. Persists to the account and
  // notifies the Settings toggle so both stay in sync.
  const handleDismiss = () => {
    setEnabled(false);
    setOpen(false);
    window.dispatchEvent(new CustomEvent(AGENT_ACTIVITY_PREF_EVENT, { detail: false }));
    void updateNotificationSettings({ show_agent_activity: false }).catch(() => {/* best-effort */});
  };

  // Hidden unless the user has opted in (preference on) and at least one event
  // has arrived — no point shouting about something they haven't seen yet.
  if (enabled !== true || rows.length === 0) return null;

  return (
    <div
      className={
        'fixed bottom-4 right-4 z-50 w-[360px] max-w-[92vw] overflow-hidden ' +
        'rounded-lg border border-[hsl(var(--theme-border-default))] ' +
        'bg-[hsl(var(--theme-bg-elevated))] ' +
        'shadow-[0_1px_2px_rgba(0,0,0,0.4)]'
      }
    >
      <div
        className={
          'flex w-full items-center gap-1 pr-1.5 ' +
          'transition-colors [transition-duration:140ms] hover:bg-[hsl(var(--theme-bg-hover))]'
        }
      >
        <button
          type="button"
          onClick={() => setOpen((x) => !x)}
          className="flex flex-1 items-center justify-between gap-2 px-3 py-2 text-[12px] font-medium text-[hsl(var(--theme-text-primary))]"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            <Activity
              className="h-3.5 w-3.5"
              style={{ color: 'hsl(var(--agent-accent-community))' }}
              aria-hidden
            />
            <span>What the assistants did</span>
            <span
              className={
                'rounded-full border border-[hsl(var(--theme-border-default))] ' +
                'bg-[hsl(var(--theme-bg-secondary))] px-1.5 py-0.5 ' +
                'text-[10px] tabular-nums text-[hsl(var(--theme-text-muted))]'
              }
              title={`${actCount} action${actCount === 1 ? '' : 's'} taken out of ${rows.length} recent decision${rows.length === 1 ? '' : 's'}`}
            >
              {rows.length}
            </span>
          </span>
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--theme-text-muted))]" aria-hidden />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-[hsl(var(--theme-text-muted))]" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className={
            'shrink-0 rounded p-1 text-[hsl(var(--theme-text-muted))] ' +
            'transition-colors [transition-duration:140ms] ' +
            'hover:bg-[hsl(var(--theme-bg-secondary))] hover:text-[hsl(var(--theme-text-primary))]'
          }
          aria-label="Hide the activity panel"
          title="Hide this panel — turn it back on in Settings → AI Agents"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {open && (
        <ul
          className={
            'max-h-80 overflow-y-auto border-t border-[hsl(var(--theme-border-default))] ' +
            'bg-[hsl(var(--theme-bg-primary))]'
          }
        >
          {rows.map((ev) => (
            <li key={ev.correlation_id}>
              <ExplainabilityRow
                row={toRow(ev)}
                density="dense"
                voted={voted[ev.correlation_id] ?? null}
                onVoted={(cid, signal) =>
                  setVoted((m) => ({ ...m, [cid]: signal }))
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AgentActivityTimeline;
