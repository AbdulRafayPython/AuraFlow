// Every run of an agent, with the steps behind each answer.
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import type { AgentRunDetail, AgentRunSummary } from '@/types/agentBuilder';
import RunTrace from './RunTrace';
import { cardCls } from './styles';

const STATUS_STYLE: Record<string, string> = {
  succeeded: 'text-success', failed: 'text-destructive', running: 'text-warning', unavailable: 'text-muted-foreground',
  waiting_approval: 'text-warning', cancelled: 'text-muted-foreground',
};

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

const RunHistory: React.FC<{ agentId: string }> = ({ agentId }) => {
  const [runs, setRuns] = useState<AgentRunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentRunDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    agentBuilderService.runs(agentId, 30)
      .then((r) => { if (!cancelled) setRuns(r); })
      .catch((e) => { if (!cancelled) { setError(errorMessage(e)); setRuns([]); } });
    return () => { cancelled = true; };
  }, [agentId]);

  const toggle = async (uuid: string) => {
    if (open === uuid) { setOpen(null); return; }
    setOpen(uuid);
    setDetail(null);
    setLoadingDetail(true);
    try {
      setDetail(await agentBuilderService.run(uuid));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingDetail(false);
    }
  };

  if (runs === null) return <p className="text-sm text-[hsl(var(--theme-text-muted))]">Loading…</p>;
  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {runs.length === 0 && (
        <p className="rounded-md border border-dashed border-[hsl(var(--theme-border-default))] p-4 text-sm text-[hsl(var(--theme-text-muted))]">
          No runs yet. Try the agent in the test panel, or mention it in a channel once it is live.
        </p>
      )}
      {runs.map((r) => (
        <div key={r.run_uuid} className={cardCls} data-testid="agent-run">
          <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left" onClick={() => void toggle(r.run_uuid)}
                  aria-expanded={open === r.run_uuid}>
            <span className={`text-xs font-semibold ${STATUS_STYLE[r.status] ?? 'text-muted-foreground'}`}>{r.status.replace(/_/g, ' ')}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-[hsl(var(--theme-text-primary))]">{r.input_text || '(no input)'}</span>
            <span className="rounded bg-[hsl(var(--theme-bg-tertiary))] px-1.5 py-0.5 text-xs text-[hsl(var(--theme-text-muted))]">
              {r.is_dry_run ? 'test' : r.trigger_type}
            </span>
            <span className="hidden text-xs text-[hsl(var(--theme-text-muted))] sm:inline">{when(r.started_at)}</span>
          </button>
          {open === r.run_uuid && (
            <div className="border-t border-[hsl(var(--theme-border-default))] px-3 py-3 text-sm">
              {r.output_text && <p className="whitespace-pre-line text-[hsl(var(--theme-text-secondary))]">{r.output_text}</p>}
              {r.error && <p className="mt-1 text-destructive">{r.error}</p>}
              {loadingDetail && <Loader2 className="mt-2 h-4 w-4 animate-spin" />}
              {detail && detail.run_uuid === r.run_uuid && (
                <RunTrace steps={detail.steps} tokens={{ in: detail.tokens_in, out: detail.tokens_out }} />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default RunHistory;
