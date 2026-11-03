// Today: what needs you, what is coming up, and what your agents did in the last day.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlarmClock, CheckCircle2, RefreshCw } from 'lucide-react';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import { useApprovals } from '@/hooks/useApprovals';
import ApprovalCard from '@/components/agent-builder/ApprovalCard';
import StatusChip from '@/components/agent-builder/StatusChip';
import AgentLogo from '@/components/ai-agents/AgentLogo';
import { PageHeader } from '@/components/app/PageHeader';
import { Section } from '@/components/app/Section';
import { EmptyState, ErrorState } from '@/components/app/EmptyState';
import { Icon } from '@/components/app/Icon';
import { describeDue } from '@/lib/agentBuilder';
import type { TodayView } from '@/types/agentBuilder';

/** Why an agent ran, in plain words. */
export const RUN_REASON: Record<string, string> = {
  mention: 'Someone mentioned it',
  keyword: 'A keyword came up',
  schedule: 'Scheduled post',
  channel_message: 'New message in its channel',
  member_joined: 'Someone joined',
  channel_silent: 'The channel went quiet',
  focus_drift: 'The topic changed',
  api: 'Test chat',
  ask: 'Asked in the Ask box',
  approval: 'You approved an action',
};

/** How a run ended, in plain words, with a token colour. */
export const RUN_RESULT: Record<string, [string, string]> = {
  succeeded: ['Done', 'text-success'],
  failed: ['Did not finish', 'text-destructive'],
  running: ['Working on it', 'text-warning'],
  waiting_approval: ['Waiting for you', 'text-warning'],
  cancelled: ['Stopped', 'text-muted-foreground'],
  unavailable: ['Skipped', 'text-muted-foreground'],
};

const timeAgo = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(mins)) return '';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const Today: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<TodayView | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The approvals list is live (socket events and decisions update it at once).
  const { approvals } = useApprovals();

  const load = useCallback(async () => {
    setError(null);
    try {
      setView(await agentBuilderService.today());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <PageHeader
        title="Today"
        description="What needs you, what is coming up, and what your agents did."
        className="pl-16 md:pl-4"
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-[hsl(var(--theme-bg-hover))]"
          >
            <Icon icon={RefreshCw} size="md" /> Refresh
          </button>
        }
      />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
          {error && <div className="mb-4"><ErrorState message={error} onRetry={() => void load()} /></div>}

          {!view && !error && (
            <div role="status" aria-label="Loading" className="space-y-3 py-4">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />)}
            </div>
          )}

          {view && (
            <>
              <Section title={`Waiting for you (${approvals.length})`} description="Things an agent wants to do that need your OK.">
                {approvals.length === 0
                  ? <EmptyState icon={CheckCircle2} title="You're all caught up" description="Nothing is waiting for your approval." />
                  : <ul className="grid gap-3 md:grid-cols-2">{approvals.map((a) => <ApprovalCard key={a.id} approval={a} />)}</ul>}
              </Section>

              <Section title={`Coming up (${view.reminders.length})`}>
                {view.reminders.length === 0 ? (
                  <EmptyState icon={AlarmClock} title="No reminders yet" description="Ask @aura in any channel to remind you about something." />
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {view.reminders.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 p-3" data-testid="reminder">
                        <Icon icon={AlarmClock} size="md" className="text-warning" />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.text}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">#{r.channel} · {describeDue(r.remind_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Your agents in the last 24 hours">
                {view.agents.length === 0 ? (
                  <EmptyState title="You have no agents yet" action={
                    <button type="button" onClick={() => navigate('/agents')} className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
                      Browse directory
                    </button>
                  } />
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {view.agents.map((a) => (
                      <li key={a.id} data-testid="agent-stat">
                        <button
                          type="button"
                          onClick={() => navigate(`/agents/${a.id}`)}
                          className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-[hsl(var(--theme-bg-hover))]"
                        >
                          <AgentLogo name={a.name} size="md" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-foreground">{a.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {a.runs === 0 ? 'Quiet today' : `Helped ${a.runs} ${a.runs === 1 ? 'time' : 'times'}`}
                              {a.waiting > 0 && <span className="text-warning"> · {a.waiting} waiting for you</span>}
                              {a.failed > 0 && <span className="text-destructive"> · {a.failed} did not finish</span>}
                            </span>
                          </span>
                          <StatusChip status={a.status} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Recent activity">
                {view.recent_runs.length === 0 ? (
                  <EmptyState title="Nothing yet" description="When your agents reply or post, it shows up here." />
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {view.recent_runs.map((r) => {
                      const [result, tone] = RUN_RESULT[r.status] ?? [r.status.replace('_', ' '), 'text-muted-foreground'];
                      return (
                        <li key={r.run_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <AgentLogo name={r.agent} size="xs" />
                          <span className="min-w-0 flex-1 truncate text-foreground">
                            {r.agent} <span className="text-muted-foreground">· {RUN_REASON[r.trigger] ?? r.trigger}</span>
                          </span>
                          <span className={`text-xs font-medium ${tone}`}>{result}</span>
                          <span className="hidden w-20 text-right text-xs text-muted-foreground sm:inline">{timeAgo(r.started_at)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Today;
