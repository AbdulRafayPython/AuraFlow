/**
 * AI Agents (Community Admin)
 *
 * Community-scoped agent dashboard for the currently-selected community.
 * Lists every platform community-category agent from `agent_registry` and
 * shows this community's per-community enabled / settings / usage state
 * pulled from GET /api/admin/community/<id>/agents (community_admin.py line
 * 2179). The toggle hits PUT /api/admin/community/<id>/agents/<agent_type>
 * with `{ enabled }` — the same endpoint AgentSettings uses for tuning.
 *
 * Previously this page mirrored the platform-admin AI Agents Management at
 * /admin/system/agents — that's the wrong context for a community owner.
 * See plan phase 1.8 in cached-dazzling-owl.md.
 *
 * "Configure" routes to /admin/agents/settings#<agent_type>; AgentSettings
 * reads the hash on mount and scrolls the matching card into view.
 *
 * Out of scope (per plan ground rules — no new analytics aggregations):
 * - "Create New Agent" — community admins don't author agents; removed.
 * - The hardcoded 3-series SVG chart and synthetic legend — removed.
 * - A real time-series chart of agent executions over 24h — would need a
 *   new aggregation endpoint; intentionally deferred.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommunityDashboard } from '@/contexts/CommunityDashboardContext';
import { useTheme } from '@/contexts/ThemeContext';
import adminService from '@/services/adminService';
import { cn } from '@/lib/utils';
import {
  Bot,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  CheckCircle2,
  PauseCircle,
  Activity,
  Clock,
  AlertCircle,
  Building2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface AgentRow {
  agent_type: string;
  display_name: string;
  description: string;
  icon: string | null;
  default_settings: Record<string, any> | null;
  enabled: boolean;
  has_override: boolean;
  settings: Record<string, any> | null;
  usage_count: number;
  last_active: string | null;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function AgentCardSkeleton({ isDark }: { isDark: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-5 flex flex-col',
        'bg-card border-border/50',
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <Skeleton className="w-16 h-7 rounded-full" />
      </div>
      <Skeleton className="h-5 w-2/3 mb-2" />
      <Skeleton className="h-4 w-full mb-1" />
      <Skeleton className="h-4 w-3/4 mb-6" />
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
      </div>
      <Skeleton className="h-9 w-full rounded-lg" />
    </div>
  );
}

interface AgentCardProps {
  agent: AgentRow;
  isToggling: boolean;
  isDark: boolean;
  onToggle: (enabled: boolean) => void;
  onConfigure: () => void;
}

function AgentCard({ agent, isToggling, isDark, onToggle, onConfigure }: AgentCardProps) {
  const enabled = agent.enabled;
  return (
    <div
      className={cn(
        'rounded-xl border p-5 flex flex-col transition-all',
        'bg-card border-border/50',
        enabled ? 'hover:border-accent/50 hover:shadow-md' : 'opacity-75 hover:opacity-100',
      )}
    >
      {/* Header: icon + status pill + toggle */}
      <div className="flex items-start justify-between mb-4 gap-3">
        <div
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0',
            enabled ? 'bg-accent/10' : 'bg-muted',
          )}
        >
          {agent.icon || <Bot className="h-6 w-6 text-accent" />}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-full',
              enabled
                ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30'
                : 'bg-muted text-muted-foreground border border-border/50',
            )}
          >
            {enabled ? (
              <>
                <CheckCircle2 className="h-3 w-3" />
                Active
              </>
            ) : (
              <>
                <PauseCircle className="h-3 w-3" />
                Paused
              </>
            )}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={`${enabled ? 'Disable' : 'Enable'} ${agent.display_name} for this community`}
            disabled={isToggling}
            onClick={() => onToggle(!enabled)}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-all disabled:opacity-50',
              enabled ? 'bg-accent' : 'bg-muted-foreground/30',
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                enabled ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>
      </div>

      {/* Title + Description */}
      <h3 className="text-lg font-semibold mb-1 truncate">{agent.display_name}</h3>
      <p className="text-sm text-muted-foreground mb-5 line-clamp-2 min-h-[2.5rem]">
        {agent.description || `${agent.agent_type} agent`}
      </p>

      {/* Stats — real data only */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg border border-border/50 bg-muted/40 p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Activity className="h-3.5 w-3.5" />
            <p className="text-[10px] uppercase font-semibold tracking-wider">Actions</p>
          </div>
          <p className="text-lg font-bold">{formatCount(agent.usage_count)}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/40 p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Clock className="h-3.5 w-3.5" />
            <p className="text-[10px] uppercase font-semibold tracking-wider">Last Active</p>
          </div>
          <p
            className="text-lg font-bold truncate"
            title={agent.last_active ? new Date(agent.last_active).toLocaleString() : 'Never'}
          >
            {formatTimeAgo(agent.last_active)}
          </p>
        </div>
      </div>

      {/* Configure */}
      <Button
        variant="outline"
        size="sm"
        className="w-full mt-auto"
        onClick={onConfigure}
      >
        <SettingsIcon className="h-4 w-4 mr-2" />
        Configure
      </Button>
    </div>
  );
}

export default function AIAgentsManagement() {
  const navigate = useNavigate();
  const { currentTheme, themes } = useTheme();
  const { selectedCommunity } = useCommunityDashboard();

  const theme = themes[currentTheme];
  const isDark = theme.isDark;

  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(
    async (silent: boolean) => {
      if (!selectedCommunity?.id) {
        setAgents([]);
        setLoading(false);
        return;
      }
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const rows = await adminService.listCommunityAgents(selectedCommunity.id);
        setAgents(rows as AgentRow[]);
      } catch (e: any) {
        setError(e?.message || 'Failed to load community agents');
        if (!silent) setAgents([]);
      } finally {
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    },
    [selectedCommunity?.id],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const handleToggle = async (agentType: string, enabled: boolean) => {
    if (!selectedCommunity?.id) return;
    setToggling(agentType);
    // Optimistic — flip locally, revert on error.
    setAgents((prev) =>
      prev.map((a) => (a.agent_type === agentType ? { ...a, enabled } : a)),
    );
    try {
      await adminService.updateCommunityAgent(selectedCommunity.id, agentType, { enabled });
    } catch (e: any) {
      setAgents((prev) =>
        prev.map((a) => (a.agent_type === agentType ? { ...a, enabled: !enabled } : a)),
      );
      setError(e?.message || 'Failed to update agent');
    } finally {
      setToggling(null);
    }
  };

  const handleConfigure = (agentType: string) => {
    navigate(`/admin/agents/settings#agent-${agentType}`);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        a.display_name.toLowerCase().includes(q) ||
        a.agent_type.toLowerCase().includes(q),
    );
  }, [agents, search]);

  const activeCount = useMemo(() => agents.filter((a) => a.enabled).length, [agents]);
  const totalUsage = useMemo(
    () => agents.reduce((sum, a) => sum + (a.usage_count || 0), 0),
    [agents],
  );

  // No community selected — sidebar selector hasn't picked one yet
  if (!selectedCommunity) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Admin &gt; AI Agents</p>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-accent" />
            AI Agents
          </h1>
        </div>
        <div
          className={cn(
            'rounded-xl border p-8 text-center',
            'bg-card border-border/50',
          )}
        >
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No community selected</p>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a community from the sidebar to manage its AI agents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Admin &gt; AI Agents</p>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-accent" />
            AI Agents
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Enable, disable, and tune the AI agents working inside{' '}
            <span className="font-semibold text-foreground">
              {selectedCommunity.name}
            </span>
            .
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              className="pl-10 w-56"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw
              className={cn('h-4 w-4 mr-2', (loading || refreshing) && 'animate-spin')}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              {error}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setError('');
              void load(true);
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className={cn(
            'rounded-xl border p-4',
            'bg-card border-border/50',
          )}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Bot className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Agents Available</p>
              <p className="text-2xl font-bold">
                {loading ? <Skeleton className="h-7 w-10" /> : agents.length}
              </p>
            </div>
          </div>
        </div>
        <div
          className={cn(
            'rounded-xl border p-4',
            'bg-card border-border/50',
          )}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Currently Active</p>
              <p className="text-2xl font-bold">
                {loading ? <Skeleton className="h-7 w-10" /> : activeCount}
              </p>
            </div>
          </div>
        </div>
        <div
          className={cn(
            'rounded-xl border p-4',
            'bg-card border-border/50',
          )}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10">
              <Activity className="h-5 w-5 text-sky-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Actions</p>
              <p className="text-2xl font-bold">
                {loading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  totalUsage.toLocaleString()
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <AgentCardSkeleton key={i} isDark={isDark} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div
          className={cn(
            'rounded-xl border p-10 text-center',
            'bg-card border-border/50',
          )}
        >
          <Bot className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">
            {agents.length === 0
              ? 'No community agents available'
              : 'No agents match your search'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {agents.length === 0
              ? 'Check back once the platform has community agents enabled.'
              : 'Try a different name or clear the search box.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((agent) => (
            <AgentCard
              key={agent.agent_type}
              agent={agent}
              isToggling={toggling === agent.agent_type}
              isDark={isDark}
              onToggle={(enabled) => void handleToggle(agent.agent_type, enabled)}
              onConfigure={() => handleConfigure(agent.agent_type)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
