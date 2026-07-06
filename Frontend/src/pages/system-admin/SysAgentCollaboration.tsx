/**
 * System Admin — How agents work together (Phase 4.4, redesigned)
 *
 * Sibling to AgentMetrics: that page quantifies how often each agent acts;
 * this one shows the *hand-offs* between agents — when one agent acts and
 * another picks up the same situation moments later (joined on
 * agent_actions.correlation_id over a sliding window).
 *
 * The original force-directed canvas was hard to read for a non-technical
 * reviewer (jittery layout, raw agent ids, simulation noise). This version
 * presents the same data as a ranked, plain-English flow list:
 *
 *   Mood ──12──▶ Wellness     last seen 2h ago
 *
 * so a system admin can answer "who triggers whom, and how often" at a
 * glance. Data: GET /api/agents/collaboration-graph?hours=N (≤ 50 edges).
 */
import { useEffect, useMemo, useState } from 'react';
import { Activity, GitBranch, RefreshCw, ArrowRight, Workflow } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { API_SERVER } from '@/config/api';
import { agentLabel, accentFor } from '@/components/ai-agents/AgentAccent';

interface NodeRow {
  id: string;
  acts: number;
  defers: number;
  skips: number;
  total: number;
  last_acted: string | null;
  last_signal: string | null;
  outcome: 'positive' | 'negative' | 'neutral';
}

interface EdgeRow {
  source: string;
  target: string;
  count: number;
  last_seen: string | null;
  sample_correlation: string | null;
}

interface GraphResponse {
  nodes: NodeRow[];
  edges: EdgeRow[];
  window_hours: number;
  community_id: number | null;
}

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (t) headers.Authorization = t.startsWith('Bearer ') ? t : `Bearer ${t}`;
  return headers;
}

const OUTCOME_LABEL: Record<string, string> = {
  positive: 'Members liked its last suggestion',
  negative: 'Members disliked its last suggestion',
  neutral: 'No clear feedback yet',
};
const OUTCOME_DOT: Record<string, string> = {
  positive: 'bg-emerald-500',
  negative: 'bg-red-500',
  neutral: 'bg-[hsl(var(--theme-text-muted))]',
};

/** "2h ago", "just now", "3d ago" — friendlier than a raw timestamp. */
const relTime = (iso: string | null): string => {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
};

export default function SysAgentCollaboration() {
  const { toast } = useToast();
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchGraph = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_SERVER}/api/agents/collaboration-graph?hours=${hours}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      toast({
        title: 'Failed to load collaboration data',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchGraph(); }, [hours]);

  // Edges sorted by hand-off count, plus the max for proportional bars.
  const edges = useMemo(
    () => [...(data?.edges ?? [])].sort((a, b) => b.count - a.count),
    [data],
  );
  const maxEdge = edges.reduce((m, e) => Math.max(m, e.count), 0) || 1;
  const totalHandoffs = edges.reduce((s, e) => s + e.count, 0);
  const busiest = edges[0] ?? null;

  // Most active agents (by acts), for the right-hand "who's working" panel.
  const activeAgents = useMemo(
    () => [...(data?.nodes ?? [])].filter((n) => n.acts > 0).sort((a, b) => b.acts - a.acts),
    [data],
  );
  const maxActs = activeAgents.reduce((m, n) => Math.max(m, n.acts), 0) || 1;

  const empty = !data || edges.length === 0;

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))]">How agents work together</h1>
          <p className="text-sm text-[hsl(var(--theme-text-secondary))]">
            Agents don't work in isolation — when one acts, it sometimes hands the
            situation off to another. For example, the <b>Mood</b> agent spots a tense
            conversation and asks <b>Wellness</b> to step in. Each row below is one of
            those hand-offs and how often it happened in this window.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={hours}
            onChange={(e) => setHours(parseInt(e.target.value, 10))}
            className="rounded-md border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))] px-3 py-1.5 text-sm text-[hsl(var(--theme-text-primary))]"
          >
            <option value={1}>Last 1 h</option>
            <option value={6}>Last 6 h</option>
            <option value={24}>Last 24 h</option>
            <option value={24 * 7}>Last 7 days</option>
            <option value={24 * 30}>Last 30 days</option>
          </select>
          <button
            type="button"
            onClick={fetchGraph}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))] px-3 py-1.5 text-sm text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Summary tiles ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryTile
          icon={<Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
          title="Agents active"
          primary={data ? String(activeAgents.length) : '—'}
          subline="of 11 agents took an action"
        />
        <SummaryTile
          icon={<GitBranch className="h-5 w-5 text-sky-600 dark:text-sky-400" />}
          title="Hand-offs"
          primary={data ? String(totalHandoffs) : '—'}
          subline={data ? `across ${edges.length} distinct agent pairs` : ''}
        />
        <SummaryTile
          icon={<Workflow className="h-5 w-5 text-violet-600 dark:text-violet-400" />}
          title="Busiest hand-off"
          primary={busiest ? `${agentLabel(busiest.source)} → ${agentLabel(busiest.target)}` : '—'}
          subline={busiest ? `${busiest.count} times in this window` : 'no hand-offs yet'}
          small
        />
      </div>

      {/* ── Main: chains (left) + most-active agents (right) ─────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Hand-off chains */}
        <div className="lg:col-span-2 rounded-lg border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-elevated))]">
          <div className="flex items-center gap-2 border-b border-[hsl(var(--theme-border-default))] px-4 py-3">
            <GitBranch className="h-4 w-4 text-[hsl(var(--theme-text-secondary))]" />
            <h2 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">Hand-offs between agents</h2>
            <span className="text-xs text-[hsl(var(--theme-text-muted))]">— most frequent first</span>
          </div>

          {empty ? (
            <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-[hsl(var(--theme-text-muted))]">
              {loading
                ? 'Loading hand-offs…'
                : 'No agent worked with another agent in this window yet. Try a longer window above.'}
            </div>
          ) : (
            <ul className="divide-y divide-[hsl(var(--theme-border-default))]">
              {edges.map((e) => (
                <li key={`${e.source}->${e.target}`} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    {/* source → target */}
                    <div className="flex items-center gap-2 text-sm">
                      <AgentChip agent={e.source} />
                      <ArrowRight className="h-4 w-4 text-[hsl(var(--theme-text-muted))]" />
                      <AgentChip agent={e.target} />
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <span className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
                        {e.count}
                        <span className="ml-1 text-xs font-normal text-[hsl(var(--theme-text-muted))]">
                          {e.count === 1 ? 'time' : 'times'}
                        </span>
                      </span>
                      <span className="w-16 text-xs text-[hsl(var(--theme-text-muted))]">{relTime(e.last_seen)}</span>
                    </div>
                  </div>
                  {/* magnitude bar */}
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--theme-bg-secondary))]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(6, (e.count / maxEdge) * 100)}%`,
                        background: accentFor(e.source),
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Most active agents */}
        <div className="rounded-lg border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-elevated))]">
          <div className="flex items-center gap-2 border-b border-[hsl(var(--theme-border-default))] px-4 py-3">
            <Activity className="h-4 w-4 text-[hsl(var(--theme-text-secondary))]" />
            <h2 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">Who's doing the work</h2>
          </div>

          {!data || activeAgents.length === 0 ? (
            <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-[hsl(var(--theme-text-muted))]">
              {loading ? 'Loading…' : 'No agent acted in this window yet.'}
            </div>
          ) : (
            <ul className="p-2">
              {activeAgents.map((n) => (
                <li key={n.id} className="rounded-md px-2 py-2 hover:bg-[hsl(var(--theme-bg-hover))]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: accentFor(n.id) }}
                      />
                      <span className="text-sm text-[hsl(var(--theme-text-primary))]">{agentLabel(n.id)}</span>
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${OUTCOME_DOT[n.outcome]}`}
                        title={OUTCOME_LABEL[n.outcome]}
                      />
                    </div>
                    <span className="text-sm font-medium text-[hsl(var(--theme-text-secondary))]">
                      {n.acts}
                      <span className="ml-1 text-xs font-normal text-[hsl(var(--theme-text-muted))]">acts</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--theme-bg-secondary))]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(6, (n.acts / maxActs) * 100)}%`, background: accentFor(n.id) }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-[hsl(var(--theme-border-default))] px-4 py-2.5 text-[11px] leading-relaxed text-[hsl(var(--theme-text-muted))]">
            <span className="mr-3 inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> liked
            </span>
            <span className="mr-3 inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" /> disliked
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[hsl(var(--theme-text-muted))]" /> no feedback
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs text-[hsl(var(--theme-text-muted))]">
        Looking at the last {data ? data.window_hours : hours} hour(s)
        {data?.community_id ? ` · community ${data.community_id}` : ' · platform-wide'}.
        A hand-off is counted when one agent acts and a different agent acts on the
        same situation shortly after. Showing up to 50 agent pairs.
      </p>
    </div>
  );
}

// ── Tiny helpers ─────────────────────────────────────────────────────

function AgentChip({ agent }: { agent: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))] px-2 py-1 text-xs font-medium text-[hsl(var(--theme-text-primary))]">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: accentFor(agent) }} />
      {agentLabel(agent)}
    </span>
  );
}

interface SummaryTileProps {
  icon: React.ReactNode;
  title: string;
  primary: string;
  subline: string;
  small?: boolean;
}

function SummaryTile({ icon, title, primary, subline, small }: SummaryTileProps) {
  return (
    <div className="rounded-lg border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-elevated))] p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[hsl(var(--theme-text-secondary))]">
        {icon}
        {title}
      </div>
      <div className={`mt-2 font-semibold text-[hsl(var(--theme-text-primary))] ${small ? 'text-lg' : 'text-3xl'}`}>
        {primary}
      </div>
      <div className="mt-1 text-sm text-[hsl(var(--theme-text-secondary))]">{subline}</div>
    </div>
  );
}
