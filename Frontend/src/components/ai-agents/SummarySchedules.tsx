// The Summarizer's daily summaries: pick a channel and a time, and a summary is made for you every day.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRealtime } from '@/hooks/useRealtime';
import { aiAgentService } from '@/services/aiAgentService';
import { channelService } from '@/services/channelService';
import { ConfirmDialog } from '@/components/modals/ConfirmDialog';
import { EmptyState, ErrorState } from '@/components/app/EmptyState';
import { COMMON_TIME_ZONES } from '@/lib/agentBuilder';
import { describeSchedule, scheduleProblem, type SummarySchedule } from '@/lib/summarySchedules';
import type { Channel } from '@/types';
import { cn } from '@/lib/utils';

const btn = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const btnMain = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
const inputCls = 'h-8 rounded-md border border-border bg-[hsl(var(--theme-input-bg))] px-2 text-sm text-foreground';

const SummarySchedules: React.FC = () => {
  const { toast } = useToast();
  const { communities, currentCommunity } = useRealtime();
  const [schedules, setSchedules] = useState<SummarySchedule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [communityId, setCommunityId] = useState<string>('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState<number | ''>('');
  const [time, setTime] = useState('21:00');
  const [timezone, setTimezone] = useState('UTC');
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SummarySchedule | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSchedules(await aiAgentService.getSummarySchedules());
    } catch (e) {
      setSchedules([]);
      setError(e instanceof Error ? e.message : 'Could not load your summaries');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startCommunity = useMemo(
    () => (communities.some((c) => c.id === currentCommunity?.id) ? currentCommunity?.id : communities[0]?.id) ?? '',
    [communities, currentCommunity],
  );
  useEffect(() => { if (!communityId && startCommunity) setCommunityId(startCommunity); }, [communityId, startCommunity]);

  useEffect(() => {
    if (!communityId) return;
    setChannelId('');
    channelService.getCommunityChannels(communityId)
      .then((list) => setChannels(list.filter((c) => c.type !== 'voice')))
      .catch(() => setChannels([]));
  }, [communityId]);

  const problem = scheduleProblem({ channelId, time }, schedules ?? []);

  const add = async () => {
    if (problem || channelId === '') return;
    setBusy('new');
    try {
      await aiAgentService.createSummarySchedule({ channel_id: channelId, community_id: communityId, schedule_time: time, timezone });
      await load();
      toast({ title: 'Daily summary added' });
    } catch (e) {
      toast({ title: 'Could not add it', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (s: SummarySchedule) => {
    setBusy(s.id);
    try {
      await aiAgentService.updateSummarySchedule(s.id, { is_active: !s.is_active });
      setSchedules((list) => (list ?? []).map((x) => (x.id === s.id ? { ...x, is_active: !s.is_active } : x)));
    } catch (e) {
      toast({ title: 'Could not change it', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(deleting.id);
    try {
      await aiAgentService.deleteSummarySchedule(deleting.id);
      setSchedules((list) => (list ?? []).filter((x) => x.id !== deleting.id));
      toast({ title: 'Daily summary removed' });
    } catch (e) {
      toast({ title: 'Could not remove it', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(null);
      setDeleting(null);
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4" data-testid="summary-schedules">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
        <label className="text-xs text-muted-foreground">Community
          <select className={cn(inputCls, 'mt-1 block')} value={communityId} onChange={(e) => setCommunityId(e.target.value)}>
            {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">Channel
          <select className={cn(inputCls, 'mt-1 block')} value={channelId} onChange={(e) => setChannelId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Pick a channel…</option>
            {channels.map((c) => <option key={c.id} value={c.id}># {c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">Time
          <input type="time" className={cn(inputCls, 'mt-1 block')} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="text-xs text-muted-foreground">Time zone
          <select className={cn(inputCls, 'mt-1 block')} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {COMMON_TIME_ZONES.map((z) => <option key={z}>{z}</option>)}
          </select>
        </label>
        <button type="button" className={btnMain} disabled={!!problem || busy !== null} onClick={() => void add()} title={problem ?? undefined}>
          {busy === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </button>
      </div>

      {schedules === null ? (
        <div role="status" aria-label="Loading your summaries" className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : schedules.length === 0 ? (
        <EmptyState title="No daily summaries yet" description="Pick a channel and a time above. A summary is made for you every day at that time." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {schedules.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className={cn('text-sm font-medium', s.is_active ? 'text-foreground' : 'text-muted-foreground')}>{describeSchedule(s)}</p>
                <p className="text-xs text-muted-foreground">
                  {s.community_name ?? 'Community'}{s.last_triggered_at ? ` · last made ${new Date(s.last_triggered_at).toLocaleString()}` : ' · not made yet'}
                  {!s.is_active ? ' · paused' : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button" role="switch" aria-checked={s.is_active} aria-label={`Daily summary in #${s.channel_name ?? s.channel_id}`}
                  disabled={busy === s.id} onClick={() => void toggle(s)}
                  className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50', s.is_active ? 'bg-primary' : 'bg-muted')}
                >
                  <span className={cn('inline-block h-5 w-5 rounded-full bg-background transition-transform', s.is_active ? 'translate-x-5' : 'translate-x-0.5')} />
                </button>
                <button type="button" aria-label="Remove" disabled={busy === s.id} onClick={() => setDeleting(s)}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={deleting !== null}
        title="Remove this daily summary?"
        description={deleting ? `${describeSchedule(deleting)} will stop. Summaries already made stay.` : ''}
        confirmText="Remove"
        isDangerous
        isLoading={busy !== null && busy !== 'new'}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
};

export default SummarySchedules;
