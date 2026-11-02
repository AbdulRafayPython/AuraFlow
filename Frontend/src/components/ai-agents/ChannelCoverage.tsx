// Where in a community this agent may act: one switch per channel. A channel with no setting of its
// own follows the community-wide switch. Only a community's owner or admin can change it.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRealtime } from '@/hooks/useRealtime';
import { aiAgentService, type ChannelCoverage as Coverage } from '@/services/aiAgentService';
import { channelService } from '@/services/channelService';
import { EmptyState, ErrorState } from '@/components/app/EmptyState';
import { coverageCell, coverageSummary } from '@/lib/agentCoverage';
import type { Channel } from '@/types';
import { cn } from '@/lib/utils';

const inputCls = 'h-8 rounded-md border border-border bg-[hsl(var(--theme-input-bg))] px-2 text-sm text-foreground';

interface Props {
  /** The agent's name in the catalog, e.g. `moderation`, `knowledge_builder`. */
  agentType: string;
}

const ChannelCoverage: React.FC<Props> = ({ agentType }) => {
  const { toast } = useToast();
  const { communities, currentCommunity } = useRealtime();
  const manageable = useMemo(() => communities.filter((c) => c.role === 'owner' || c.role === 'admin'), [communities]);
  const [picked, setPicked] = useState<string | null>(null);
  const communityId = picked ?? (manageable.some((c) => c.id === currentCommunity?.id) ? currentCommunity?.id : manageable[0]?.id);

  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [coverage, setCoverage] = useState<Coverage>({});
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [communityEnabled, setCommunityEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!communityId) return;
    setChannels(null);
    setError(null);
    try {
      const [list, cov, status] = await Promise.all([
        channelService.getCommunityChannels(communityId),
        aiAgentService.getChannelCoverage(communityId),
        aiAgentService.getCommunityAgentStatus(communityId),
      ]);
      const mine = status.find((a) => a.agent_type === agentType);
      setChannels(list.filter((c) => c.type !== 'voice'));
      setCoverage(cov);
      setInstalled(!!mine);
      setCommunityEnabled(mine ? !!mine.enabled : false);
    } catch (e) {
      setChannels([]);
      setError(e instanceof Error ? e.message : 'Could not load the channels');
    }
  }, [communityId, agentType]);

  useEffect(() => { void load(); }, [load]);

  if (!communityId) {
    return <EmptyState title="Only for community admins" description="You need to be an owner or admin of a community to choose where an agent acts." />;
  }
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (channels === null) {
    return <div role="status" aria-label="Loading channels" className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  const toggle = async (channel: Channel, next: boolean) => {
    setBusy(channel.id);
    try {
      await aiAgentService.configureChannelAgent(communityId, channel.id, agentType, next);
      setCoverage((c) => ({ ...c, [channel.id]: { ...(c[channel.id] ?? {}), [agentType]: next } }));
    } catch (e) {
      toast({ title: 'Could not change it', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="channel-coverage">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {manageable.length > 1 ? (
          <select aria-label="Community" className={inputCls} value={communityId} onChange={(e) => setPicked(e.target.value)}>
            {manageable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : <span />}
        {installed && <p className="text-sm text-muted-foreground">{coverageSummary(coverage, channels.map((c) => c.id), agentType, communityEnabled)}</p>}
      </div>

      {installed === false && (
        <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          This agent is not added to the community yet. Add it in Settings first, then choose its channels here.
        </p>
      )}

      {channels.length === 0 ? (
        <EmptyState title="No text channels" description="This community has no text channels yet." />
      ) : (
        <ul className={cn('divide-y divide-border rounded-lg border border-border', installed === false && 'opacity-60')}>
          {channels.map((c) => {
            const cell = coverageCell(coverage, c.id, agentType, communityEnabled);
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground"># {c.name}</p>
                  <p className="text-xs text-muted-foreground">{cell.overridden ? 'Set by hand' : 'Follows the community'}</p>
                </div>
                <button
                  type="button" role="switch" aria-checked={cell.enabled} aria-label={`Acts in #${c.name}`}
                  disabled={installed === false || busy === c.id} onClick={() => void toggle(c, !cell.enabled)}
                  className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50', cell.enabled ? 'bg-primary' : 'bg-muted')}
                >
                  <span className={cn('inline-block h-5 w-5 rounded-full bg-background transition-transform', cell.enabled ? 'translate-x-5' : 'translate-x-0.5')} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ChannelCoverage;
