// "What it did lately": a built-in agent's own actions in one community, with a rating on each
// and the switch for its automatic actions. Only community admins can see it.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRealtime } from '@/hooks/useRealtime';
import { aiAgentService, type AgentAction } from '@/services/aiAgentService';
import { adminService } from '@/services/adminService';
import ExplainabilityRow from '@/components/ai-agents/ExplainabilityRow';
import { EmptyState, ErrorState } from '@/components/app/EmptyState';
import { actionToRow } from '@/lib/agentActivity';
import { cn } from '@/lib/utils';

interface Props {
  /** The agent's name in the actions table, e.g. `moderation`. */
  agentName: string;
}

const AgentActivity: React.FC<Props> = ({ agentName }) => {
  const { toast } = useToast();
  const { communities, currentCommunity } = useRealtime();
  // Only a community's owner or admin can see what its agents did.
  const manageable = useMemo(() => communities.filter((c) => c.role === 'owner' || c.role === 'admin'), [communities]);
  const [picked, setPicked] = useState<string | null>(null);
  const communityId = picked ?? (manageable.some((c) => c.id === currentCommunity?.id) ? currentCommunity?.id : manageable[0]?.id);
  const communityName = manageable.find((c) => c.id === communityId)?.name;
  const [actions, setActions] = useState<AgentAction[] | null>(null);
  const [auto, setAuto] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!communityId) return;
    setActions(null);
    setError(null);
    try {
      const [list, state] = await Promise.all([
        aiAgentService.getAgentActions({ community_id: communityId as unknown as number, limit: 15, agent_name: agentName }),
        adminService.getAgentState(agentName, communityId),
      ]);
      setActions(list);
      setAuto(state.enabled !== false);
    } catch (e) {
      setActions([]);
      setError(e instanceof Error ? e.message : 'Could not load its activity');
    }
  }, [agentName, communityId]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async () => {
    if (!communityId || auto === null) return;
    setSaving(true);
    try {
      await adminService.putAgentState(agentName, { community_id: communityId as unknown as number, enabled: !auto });
      setAuto(!auto);
      toast({ title: !auto ? 'It acts on its own again' : 'It will not act on its own', description: !auto ? undefined : 'It still answers when someone asks.' });
    } catch (e) {
      toast({ title: 'Could not change it', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!communityId) {
    return <EmptyState title="Only for community admins" description="You need to be an owner or admin of a community to see what its agents did." />;
  }
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4" data-testid="agent-activity">
      {manageable.length > 1 && (
        <select aria-label="Community" value={communityId} onChange={(e) => setPicked(e.target.value)}
                className="h-8 rounded-md border border-border bg-[hsl(var(--theme-input-bg))] px-2 text-sm text-foreground">
          {manageable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-medium text-foreground">Acts on its own{communityName ? ` in ${communityName}` : ''}</p>
          <p className="text-sm text-muted-foreground">Turn this off to stop its automatic actions. It still answers when someone asks.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={auto === true}
          aria-label="Acts on its own"
          disabled={auto === null || saving}
          onClick={() => void toggle()}
          className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
            auto ? 'bg-primary' : 'bg-muted')}
        >
          <span className={cn('inline-block h-5 w-5 rounded-full bg-background transition-transform', auto ? 'translate-x-5' : 'translate-x-0.5')} />
        </button>
      </div>

      {actions === null ? (
        <div role="status" aria-label="Loading activity" className="flex justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : actions.length === 0 ? (
        <EmptyState title="Nothing yet" description="When it acts on its own, each action shows up here and you can rate it." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {actions.map((a) => (
            <li key={a.id}>
              <ExplainabilityRow
                row={actionToRow(a, communityName)}
                density="standard"
                voted={a.has_feedback ? 'positive' : null}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AgentActivity;
