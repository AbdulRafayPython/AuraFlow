// Your agents: the ones you made and your communities' agents, plus Aura.
// A plain list (logo, name, what it does, when it replies, on/off) like an app manager.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarCheck, LayoutGrid, Loader2, Pause, Play, Plus } from 'lucide-react';
import { useRealtime } from '@/hooks/useRealtime';
import { useToast } from '@/hooks/use-toast';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import { channelService } from '@/services/channelService';
import { invalidateMentionableAgents } from '@/hooks/useMentionableAgents';
import { describeTrigger } from '@/lib/agentBuilder';
import { useApprovals } from '@/hooks/useApprovals';
import ApprovalCard from '@/components/agent-builder/ApprovalCard';
import StatusChip from '@/components/agent-builder/StatusChip';
import CreateAgentDialog from '@/components/agent-builder/CreateAgentDialog';
import AgentLogo from '@/components/ai-agents/AgentLogo';
import BuiltInAgentList from '@/components/ai-agents/BuiltInAgentList';
import AgentMetricsTiles from '@/components/ai-agents/AgentMetricsTiles';
import { PageHeader } from '@/components/app/PageHeader';
import { Section } from '@/components/app/Section';
import { EmptyState, ErrorState } from '@/components/app/EmptyState';
import { Icon } from '@/components/app/Icon';
import { cn } from '@/lib/utils';
import type { BuilderAgent } from '@/types/agentBuilder';

const MINE = 'mine';

const btn = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const btnMain = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
const btnQuiet = `${btn} border border-border text-foreground hover:bg-[hsl(var(--theme-bg-hover))]`;

const AgentHub: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { communities, currentCommunity } = useRealtime();
  const [searchParams] = useSearchParams();
  const appliedParam = useRef(false);
  const [scope, setScope] = useState<string>(MINE);
  const [agents, setAgents] = useState<BuilderAgent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // /agents/mine?create=1 (the marketplace's "Create an agent") opens the create dialog.
  const [creating, setCreating] = useState(() => searchParams.get('create') === '1');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [channelNames, setChannelNames] = useState<Record<number, string>>({});
  const { approvals } = useApprovals();

  const load = useCallback(async () => {
    setAgents(null);
    setError(null);
    try {
      setAgents(await agentBuilderService.list(scope === MINE ? {} : { communityId: scope }));
    } catch (e) {
      setAgents([]);
      setError(errorMessage(e));
    }
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  // /agents?community=<id> opens on that community (the community settings link here).
  useEffect(() => {
    const wanted = searchParams.get('community');
    if (appliedParam.current || !wanted || communities.length === 0) return;
    appliedParam.current = true;
    if (communities.some((c) => c.id === wanted)) setScope(wanted);
  }, [communities, searchParams]);

  // Trigger summaries say "#general" instead of a channel number.
  useEffect(() => {
    const ids = Array.from(new Set((agents ?? []).map((a) => a.community_id).filter((id): id is string => !!id)));
    ids.forEach((id) => {
      channelService.getCommunityChannels(id)
        .then((list) => setChannelNames((prev) => ({ ...prev, ...Object.fromEntries(list.map((c) => [c.id, c.name])) })))
        .catch(() => undefined);
    });
  }, [agents]);

  const toggleLive = async (agent: BuilderAgent) => {
    setBusyId(agent.id);
    try {
      const updated = agent.status === 'active' ? await agentBuilderService.pause(agent.id) : await agentBuilderService.publish(agent.id);
      invalidateMentionableAgents();
      setAgents((list) => (list ?? []).map((a) => (a.id === agent.id ? { ...a, ...updated } : a)));
      toast({ title: updated.status === 'active' ? `${agent.name} is on` : `${agent.name} is paused` });
    } catch (e) {
      toast({ title: 'Could not change it', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const communityName = (id: string | null) => communities.find((c) => c.id === id)?.name;
  const catalogCommunityId = scope !== MINE ? scope : currentCommunity?.id;

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <PageHeader
        title="Your agents"
        description="Helpers you can @mention in a channel. Add one from the marketplace or make your own."
        className="pl-16 md:pl-4"
        actions={
          <>
            <button type="button" className={cn(btnQuiet, 'hidden sm:inline-flex')} onClick={() => navigate('/today')}>
              <Icon icon={CalendarCheck} size="md" /> Today
            </button>
            <button type="button" className={btnQuiet} onClick={() => navigate('/agents')}>
              <Icon icon={LayoutGrid} size="md" /> Browse marketplace
            </button>
            <button type="button" className={btnMain} onClick={() => setCreating(true)}>
              <Icon icon={Plus} size="md" /> Create agent
            </button>
          </>
        }
      />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
          {approvals.length > 0 && (
            <Section title={`Waiting for you (${approvals.length})`} description="An agent wants to do something and needs your OK first.">
              <ul className="grid gap-3 md:grid-cols-2" aria-label="Waiting for your approval">
                {approvals.map((a) => <ApprovalCard key={a.id} approval={a} />)}
              </ul>
            </Section>
          )}

          <Section title="Built in">
            <div className="flex items-center gap-3 rounded-lg border border-border p-3" data-testid="builtin-aura">
              <AgentLogo name="Aura" builtin size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-foreground">Aura</p>
                <p className="text-sm text-muted-foreground">
                  Everyone's helper. Mention <strong className="text-foreground">@aura</strong> in any channel to summarize, translate, search or look something up.
                </p>
              </div>
              <StatusChip status="active" />
            </div>
            <AgentMetricsTiles communityId={catalogCommunityId} />
            <BuiltInAgentList communityId={catalogCommunityId} communityName={communityName(catalogCommunityId ?? null)} />
          </Section>

          <Section
            title={scope === MINE ? 'Your agents' : `Agents in ${communityName(scope) ?? 'this community'}`}
            actions={
              <select
                aria-label="Show agents from"
                className="h-8 rounded-md border border-border bg-[hsl(var(--theme-input-bg))] px-2 text-sm text-foreground"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value={MINE}>Made by you</option>
                {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            }
          >
            {error && <div className="mb-3"><ErrorState message={error} onRetry={() => void load()} /></div>}

            {agents === null ? (
              <div role="status" aria-label="Loading agents" className="divide-y divide-border rounded-lg border border-border">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3 p-3">
                    <div className="h-12 w-12 rounded-lg bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-4 w-40 rounded bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />
                      <div className="h-3.5 w-2/3 rounded bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />
                    </div>
                  </div>
                ))}
              </div>
            ) : agents.length === 0 && !error ? (
              <EmptyState
                icon={Plus}
                title={scope === MINE ? 'You have not made any agents yet' : 'No agents in this community yet'}
                description="Pick a ready-made one from the directory, or describe what you need and we'll set one up."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <button type="button" className={btnMain} onClick={() => navigate('/agents')}>Browse marketplace</button>
                    <button type="button" className={btnQuiet} onClick={() => setCreating(true)}>Create agent</button>
                  </div>
                }
              />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {agents.map((a) => {
                  const manageable = a.instructions !== undefined;
                  const triggers = (a.triggers ?? []).slice(0, 2).map((t) => describeTrigger(t, (id) => channelNames[id]));
                  return (
                    <li key={a.id} className="flex flex-wrap items-start gap-3 p-3 sm:flex-nowrap" data-testid="agent-card">
                      <AgentLogo name={a.name} username={a.username} slug={a.template_key} avatarUrl={a.avatar_url} size="lg" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={!manageable}
                            onClick={() => navigate(`/agents/${a.id}`)}
                            className="truncate text-base font-semibold text-foreground hover:underline disabled:no-underline"
                          >
                            {a.name}
                          </button>
                          <StatusChip status={a.status} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          @{a.username} · {a.community_id ? communityName(a.community_id) ?? 'Community' : 'Just you'}
                        </p>
                        {a.description && <p className="mt-1 line-clamp-2 text-sm text-[hsl(var(--theme-text-secondary))]">{a.description}</p>}
                        {manageable && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {triggers.length ? `Replies: ${triggers.join(' · ')}` : 'Not set up to reply yet. Open it to choose when it replies.'}
                          </p>
                        )}
                      </div>
                      {manageable && (
                        <div className="flex shrink-0 gap-2">
                          <button type="button" className={btnQuiet} onClick={() => navigate(`/agents/${a.id}`)}>Open</button>
                          <button
                            type="button"
                            className={a.status === 'active' ? btnQuiet : btnMain}
                            disabled={busyId === a.id || a.status === 'archived'}
                            onClick={() => void toggleLive(a)}
                          >
                            {busyId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon icon={a.status === 'active' ? Pause : Play} size="md" />}
                            {a.status === 'active' ? 'Pause' : 'Turn on'}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </main>

      <CreateAgentDialog
        open={creating}
        onOpenChange={setCreating}
        communities={communities}
        defaultCommunityId={scope !== MINE ? scope : currentCommunity?.id}
        onCreated={(agent) => navigate(`/agents/${agent.id}`)}
      />
    </div>
  );
};

export default AgentHub;
