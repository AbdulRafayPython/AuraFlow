/**
 * System Admin — Autonomous-Agent Metrics
 *
 * Surfaces the three KPIs from §5.3 of AUTONOMOUS_AGENTS_PLAN.md:
 *   • Autonomy ratio   — what fraction of decisions ended in "act"
 *   • Goal attainment  — % of hourly buckets where avg sentiment ≥ 0
 *   • Feedback ratio   — 👍 / (👍 + 👎)
 *
 * Plus a per-agent breakdown so the jury can see which of the 11 agents
 * is pulling its weight. Data comes from a single GET /api/agents/metrics
 * call — three SQL queries plus the per-agent rollup, returned as one JSON.
 *
 * Theming: every surface colour is driven by the `--theme-*` CSS variables
 * so the page tracks light and dark themes. Only the semantic accents
 * (act = green, held off = amber) carry an explicit `dark:` shade so they
 * stay legible on a white card.
 */
import { useEffect, useState } from 'react';
import { Activity, ThumbsUp, Target, Brain, RefreshCw, HelpCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { API_SERVER } from '@/config/api';
import { agentLabel } from '@/components/ai-agents/AgentAccent';

interface PerAgentRow {
  agent_name: string;
  acts: number;
  defers: number;
  skips: number;
  total: number;
  autonomy_ratio: number;
}

interface MetricsResponse {
  window_days: number;
  community_id: number | null;
  autonomy: {
    acts: number;
    defers: number;
    skips: number;
    total_decisions: number;
    autonomy_ratio: number;
    human_triggered: number;
    autonomous_share: number;
  };
  goal_attainment: {
    goal_threshold: number;
    buckets: number;
    met: number;
    ratio: number;
    avg_sentiment: number;
  };
  feedback: {
    positive: number;
    negative: number;
    engaged: number;
    dismissed: number;
    ignored: number;
    feedback_ratio: number;
    total: number;
  };
  per_agent: PerAgentRow[];
}

const fmtPct = (x: number) => `${(x * 100).toFixed(1)}%`;

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (t) headers.Authorization = t.startsWith('Bearer ') ? t : `Bearer ${t}`;
  return headers;
}

export default function SysAgentMetrics() {
  const { toast } = useToast();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_SERVER}/api/agents/metrics?days=${days}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      toast({
        title: 'Failed to load agent metrics',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMetrics(); }, [days]);

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))]">How the AI agents are doing</h1>
          <p className="text-sm text-[hsl(var(--theme-text-secondary))]">
            A plain-English snapshot of how often the AI agents are acting on
            their own, whether the mood goal is being met, and whether members
            find the suggestions helpful.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="rounded-md border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))] px-3 py-1.5 text-sm text-[hsl(var(--theme-text-primary))]"
          >
            <option value={1}>Last 24 h</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            type="button"
            onClick={fetchMetrics}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))] px-3 py-1.5 text-sm text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Top KPI tiles ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiTile
          icon={<Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
          title="Acting on their own"
          hint="When an agent notices something (a tense message, a quiet channel, a question), it can act, hold off, or skip. This is the share that chose to act."
          primary={data ? fmtPct(data.autonomy.autonomy_ratio) : '—'}
          subline={data
            ? `${data.autonomy.acts} of ${data.autonomy.total_decisions} chances taken`
            : ''}
          tail={data
            ? `${fmtPct(data.autonomy.autonomous_share)} of all agent activity was self-started · ${data.autonomy.human_triggered} were triggered by a person`
            : ''}
        />
        <KpiTile
          icon={<Target className="h-5 w-5 text-sky-600 dark:text-sky-400" />}
          title="Mood goal met"
          hint="We split the window into hour-long buckets and check whether the community's average mood stayed positive (sentiment ≥ 0). This is the share of hours that did."
          primary={data ? fmtPct(data.goal_attainment.ratio) : '—'}
          subline={data
            ? `${data.goal_attainment.met} of ${data.goal_attainment.buckets} hours felt positive`
            : ''}
          tail={data
            ? `Average mood score: ${data.goal_attainment.avg_sentiment.toFixed(2)} (target ≥ ${data.goal_attainment.goal_threshold.toFixed(1)})`
            : ''}
        />
        <KpiTile
          icon={<ThumbsUp className="h-5 w-5 text-violet-600 dark:text-violet-400" />}
          title="Members find it helpful"
          hint="Out of every clear vote on an agent suggestion, this is the share of thumbs-up. Hover the bottom line to see who quietly engaged, dismissed, or ignored it."
          primary={data ? fmtPct(data.feedback.feedback_ratio) : '—'}
          subline={data
            ? `${data.feedback.positive} liked · ${data.feedback.negative} disliked`
            : ''}
          tail={data
            ? `Acted on it: ${data.feedback.engaged} · Closed it: ${data.feedback.dismissed} · Ignored: ${data.feedback.ignored}`
            : ''}
        />
      </div>

      {/* ── Per-agent table ──────────────────────────────────────── */}
      <div className="rounded-lg border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-elevated))]">
        <div className="flex items-center gap-2 border-b border-[hsl(var(--theme-border-default))] px-4 py-3">
          <Brain className="h-4 w-4 text-[hsl(var(--theme-text-secondary))]" />
          <h2 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">What each agent did</h2>
          <span className="text-xs text-[hsl(var(--theme-text-muted))]">— sorted by how often it stepped in</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--theme-bg-secondary))] text-xs uppercase text-[hsl(var(--theme-text-secondary))]">
              <tr>
                <th className="px-4 py-2 text-left">Agent</th>
                <th className="px-4 py-2 text-right" title="Times the agent stepped in.">Stepped in</th>
                <th className="px-4 py-2 text-right" title="Times it noticed but waited — usually quiet-hours, cool-downs, or low confidence.">Held off</th>
                <th className="px-4 py-2 text-right" title="Times it looked and decided nothing was needed.">Passed</th>
                <th className="px-4 py-2 text-right" title="Total chances the agent had to act in this window.">Total chances</th>
                <th className="px-4 py-2 text-right" title="Share of chances it acted on rather than holding off or passing.">Acted on</th>
              </tr>
            </thead>
            <tbody>
              {!data || data.per_agent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[hsl(var(--theme-text-muted))]">
                    {loading ? 'Loading…' : 'No agent activity in this window yet.'}
                  </td>
                </tr>
              ) : (
                data.per_agent.map((r) => (
                  <tr key={r.agent_name} className="border-t border-[hsl(var(--theme-border-default))] hover:bg-[hsl(var(--theme-bg-hover))]">
                    <td className="px-4 py-2 text-[hsl(var(--theme-text-primary))]" title={r.agent_name}>
                      {agentLabel(r.agent_name)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">{r.acts}</td>
                    <td className="px-4 py-2 text-right text-amber-600 dark:text-amber-400">{r.defers}</td>
                    <td className="px-4 py-2 text-right text-[hsl(var(--theme-text-muted))]">{r.skips}</td>
                    <td className="px-4 py-2 text-right text-[hsl(var(--theme-text-secondary))]">{r.total}</td>
                    <td className="px-4 py-2 text-right text-[hsl(var(--theme-text-primary))]">{fmtPct(r.autonomy_ratio)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-[hsl(var(--theme-text-muted))]">
        Looking at the last {data?.window_days ?? days} day(s). Numbers update live from each agent's
        decision log, the user feedback log, and recorded community mood.
      </p>
    </div>
  );
}

interface KpiTileProps {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  primary: string;
  subline: string;
  tail: string;
}

function KpiTile({ icon, title, hint, primary, subline, tail }: KpiTileProps) {
  return (
    <div className="rounded-lg border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-elevated))] p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[hsl(var(--theme-text-secondary))]">
        {icon}
        <span>{title}</span>
        {hint && (
          <span
            className="ml-auto inline-flex cursor-help text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]"
            title={hint}
            aria-label={hint}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="mt-2 text-3xl font-semibold text-[hsl(var(--theme-text-primary))]">{primary}</div>
      <div className="mt-1 text-sm text-[hsl(var(--theme-text-secondary))]">{subline}</div>
      <div className="mt-2 text-xs text-[hsl(var(--theme-text-muted))]">{tail}</div>
    </div>
  );
}
