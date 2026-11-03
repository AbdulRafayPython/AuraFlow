// Your agents (/agents/mine): every agent you can manage, in one place.
// Laid out like Discord's Friends page: a top bar with All / On / Off tabs and
// one primary button, a search box, then uppercase section labels with counts
// ("MADE BY YOU — 3") over rows that show the agent, whether it is on, and the
// controls: an on/off switch, Manage, and a ⋯ menu for the rest.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AtSign, Bot, Clock, LayoutGrid, MoreHorizontal, Plug, Plus, Search, Settings2, Trash2, X,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRealtime } from '@/hooks/useRealtime';
import { useToast } from '@/hooks/use-toast';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import { channelService } from '@/services/channelService';
import { invalidateMentionableAgents } from '@/hooks/useMentionableAgents';
import { describeTrigger, STATUS_LABELS } from '@/lib/agentBuilder';
import { useApprovals } from '@/hooks/useApprovals';
import ApprovalCard from '@/components/agent-builder/ApprovalCard';
import CreateAgentDialog from '@/components/agent-builder/CreateAgentDialog';
import AgentLogo from '@/components/ai-agents/AgentLogo';
import BuiltInAgentList from '@/components/ai-agents/BuiltInAgentList';
import AgentMetricsTiles from '@/components/ai-agents/AgentMetricsTiles';
import AgentsNav from '@/components/agents/AgentsNav';
import { AgentRow, OnOffSwitch, SECTION_LABEL, iconBtn, rowBtnQuiet } from '@/components/agents/AgentRow';
import { useConfirm } from '@/components/modals/ConfirmDialog';
import AppSelect from '@/components/app/AppSelect';
import { ErrorState } from '@/components/app/EmptyState';
import { Icon } from '@/components/app/Icon';
import { cn } from '@/lib/utils';
import type { BuilderAgent } from '@/types/agentBuilder';

const MINE = 'mine';
type Show = 'all' | 'on' | 'off';

const btn = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50';
const btnMain = `${btn} bg-primary text-primary-foreground hover:opacity-90`;

const isOn = (a: BuilderAgent) => a.status === 'active';

const AgentHub: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { communities, currentCommunity } = useRealtime();
  const [searchParams] = useSearchParams();
  const appliedParam = useRef(false);
  const [scope, setScope] = useState<string>(MINE);
  const [show, setShow] = useState<Show>('all');
  const [query, setQuery] = useState('');
  const [agents, setAgents] = useState<BuilderAgent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Old links (/agents/mine?create=1) still open the create dialog.
  const [creating, setCreating] = useState(() => searchParams.get('create') === '1');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [builtInCount, setBuiltInCount] = useState(0);
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

  // /agents/mine?community=<id> opens on that community (the community settings link here).
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

  const setLive = async (agent: BuilderAgent, on: boolean) => {
    setBusyId(agent.id);
    try {
      const updated = on ? await agentBuilderService.publish(agent.id) : await agentBuilderService.pause(agent.id);
      invalidateMentionableAgents();
      setAgents((list) => (list ?? []).map((a) => (a.id === agent.id ? { ...a, ...updated } : a)));
      toast(updated.status === 'active'
        ? { title: `${agent.name} is on`, description: `People can now mention @${agent.username}.`, variant: 'success' }
        : { title: `${agent.name} is paused`, description: 'It will not reply until you turn it back on.', variant: 'info' });
    } catch (e) {
      toast({ title: on ? 'Could not turn it on' : 'Could not pause it', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (agent: BuilderAgent) => {
    const ok = await confirm({
      title: `Delete ${agent.name}?`,
      description: `It stops replying and is removed from Your agents. People can no longer mention @${agent.username}.`,
      confirmText: 'Delete agent',
      danger: true,
    });
    if (!ok) return;
    setBusyId(agent.id);
    try {
      await agentBuilderService.archive(agent.id);
      invalidateMentionableAgents();
      setAgents((list) => (list ?? []).filter((a) => a.id !== agent.id));
      toast({ title: `${agent.name} was deleted`, variant: 'success' });
    } catch (e) {
      toast({ title: 'Could not delete the agent', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const copyMention = async (agent: BuilderAgent) => {
    try {
      await navigator.clipboard.writeText(`@${agent.username}`);
      toast({ title: `Copied @${agent.username}`, description: 'Paste it in a channel to talk to the agent.', variant: 'success' });
    } catch {
      toast({ title: 'Could not copy', description: `The mention is @${agent.username}.`, variant: 'destructive' });
    }
  };

  const communityName = (id: string | null) => communities.find((c) => c.id === id)?.name;
  const catalogCommunityId = scope !== MINE ? scope : currentCommunity?.id;

  const live = useMemo(() => (agents ?? []).filter((a) => a.status !== 'archived'), [agents]);
  const counts = { all: live.length, on: live.filter(isOn).length, off: live.filter((a) => !isOn(a)).length };
  const q = query.trim().toLowerCase();
  const shown = live.filter((a) => {
    if (show === 'on' && !isOn(a)) return false;
    if (show === 'off' && isOn(a)) return false;
    return !q || `${a.name} ${a.username} ${a.description}`.toLowerCase().includes(q);
  });
  const auraShown = show !== 'off' && (!q || 'aura everyone helper'.includes(q));
  const scopeLabel = scope === MINE ? 'Made by you' : communityName(scope) ?? 'This community';

  const tab = (key: Show, label: string) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={show === key}
      onClick={() => setShow(key)}
      className={cn(
        'h-8 shrink-0 rounded-md px-2.5 text-sm font-medium transition-colors duration-100',
        show === key ? 'bg-[hsl(var(--theme-bg-active))] text-foreground' : 'text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground',
      )}
    >
      {label}{agents !== null && <span className="ml-1.5 text-xs text-muted-foreground">{counts[key]}</span>}
    </button>
  );

  const nothingAtAll = agents !== null && !error && live.length === 0;

  return (
    <div className="flex h-full min-w-0 bg-background">
      <AgentsNav current="mine" onCreate={() => setCreating(true)} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (Discord's Friends header) */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border pl-16 pr-4 md:pl-4">
          <h1 className="flex shrink-0 items-center gap-2 text-base font-semibold text-foreground">
            <Icon icon={Bot} size="md" className="text-muted-foreground" /> Your agents
          </h1>
          <span className="hidden h-6 w-px bg-border sm:block" aria-hidden />
          <div role="tablist" aria-label="Show" className="hidden min-w-0 items-center gap-1 overflow-x-auto scrollbar-none sm:flex">
            {tab('all', 'All')}
            {tab('on', 'On')}
            {tab('off', 'Off')}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => navigate('/agents')} className={cn(btn, 'text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground md:hidden')}>
              <Icon icon={LayoutGrid} size="md" /> Marketplace
            </button>
            <button type="button" className={btnMain} onClick={() => setCreating(true)}>
              <Icon icon={Plus} size="md" /> <span className="hidden sm:inline">Create agent</span><span className="sm:hidden">New</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-4 pb-10 pt-4 sm:px-6">
            {/* Tabs move under the bar on phones */}
            <div role="tablist" aria-label="Show" className="mb-3 flex gap-1 sm:hidden">
              {tab('all', 'All')}
              {tab('on', 'On')}
              {tab('off', 'Off')}
            </div>

            {/* Search + whose agents */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your agents"
                  aria-label="Search your agents"
                  className="h-9 w-full rounded-md bg-[hsl(var(--theme-input-bg))] pl-9 pr-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary [&::-webkit-search-cancel-button]:hidden"
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Showing
                <AppSelect
                  label="Show agents from"
                  className="w-48"
                  value={scope}
                  onChange={setScope}
                  options={[{ value: MINE, label: 'Made by you' }, ...communities.map((c) => ({ value: c.id, label: c.name }))]}
                />
              </label>
            </div>

            {/* Approvals come first: something is waiting on you */}
            {approvals.length > 0 && (
              <section className="mt-6" aria-labelledby="waiting-label">
                <h2 id="waiting-label" className={cn(SECTION_LABEL, 'flex items-center gap-1.5')}>
                  <Clock className="h-3.5 w-3.5" /> Waiting for your OK — {approvals.length}
                </h2>
                <ul className="grid gap-3 md:grid-cols-2" aria-label="Waiting for your approval">
                  {approvals.map((a) => <ApprovalCard key={a.id} approval={a} />)}
                </ul>
              </section>
            )}

            {scope !== MINE && <AgentMetricsTiles communityId={scope} />}

            {/* Your own (or the community's) agents */}
            <section className="mt-6" aria-labelledby="mine-label">
              <h2 id="mine-label" className={SECTION_LABEL}>
                {scopeLabel} — {agents === null ? '…' : shown.length}
              </h2>

              {error && <div className="mb-3"><ErrorState message={error} onRetry={() => void load()} /></div>}

              {agents === null ? (
                <ul role="status" aria-label="Loading agents">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <li key={i} className="flex items-center gap-3 border-t border-border px-3 py-2.5 first:border-t-0">
                      <div className="h-12 w-12 rounded-lg bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-40 rounded bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />
                        <div className="h-3.5 w-2/3 rounded bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : nothingAtAll ? (
                <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-10 text-center" data-testid="agents-empty">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-muted-foreground">
                    <Bot className="h-7 w-7" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-foreground">
                    {scope === MINE ? 'You have no agents yet' : `${scopeLabel} has no agents yet`}
                  </h3>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Add a ready-made one from the marketplace, or create your own in a minute.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <button type="button" className={btnMain} onClick={() => navigate('/agents')}>
                      <Icon icon={LayoutGrid} size="md" /> Browse marketplace
                    </button>
                    <button type="button" className={rowBtnQuiet} onClick={() => setCreating(true)}>
                      <Icon icon={Plus} size="md" /> Create agent
                    </button>
                  </div>
                </div>
              ) : shown.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {q ? `No agents match "${query.trim()}".` : show === 'on' ? 'None of these agents are on.' : 'All of these agents are on.'}
                </p>
              ) : (
                <ul aria-label={scopeLabel}>
                  {shown.map((a) => {
                    const manageable = a.instructions !== undefined;
                    const triggers = (a.triggers ?? []).slice(0, 2).map((t) => describeTrigger(t, (id) => channelNames[id]));
                    const where = a.community_id ? communityName(a.community_id) ?? 'A community' : 'Just you';
                    const open = () => navigate(`/agents/${a.id}`);
                    return (
                      <AgentRow
                        key={a.id}
                        testId="agent-card"
                        logo={<AgentLogo name={a.name} username={a.username} slug={a.template_key} avatarUrl={a.avatar_url} size="lg" />}
                        status={a.status}
                        name={a.name}
                        statusText={STATUS_LABELS[a.status]}
                        subtitle={`@${a.username} · ${where}`}
                        description={manageable
                          ? (triggers.length ? `Replies: ${triggers.join(' · ')}` : 'Not set to reply yet. Open it and choose when it replies.')
                          : (a.description || 'Managed by the community admins.')}
                        onOpen={manageable ? open : undefined}
                        controls={manageable ? (
                          <>
                            <OnOffSwitch
                              on={isOn(a)}
                              busy={busyId === a.id}
                              label={`${a.name} on or off`}
                              onChange={(next) => void setLive(a, next)}
                            />
                            <button type="button" className={cn(rowBtnQuiet, 'hidden sm:inline-flex')} onClick={open}>Manage</button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button type="button" className={iconBtn} aria-label={`More for ${a.name}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem onSelect={open}><Settings2 className="mr-2 h-4 w-4" /> Manage</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => navigate(`/agents/${a.id}?tab=triggers`)}><Clock className="mr-2 h-4 w-4" /> When it replies</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => navigate(`/agents/${a.id}?tab=integrations`)}><Plug className="mr-2 h-4 w-4" /> Connections</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => void copyMention(a)}><AtSign className="mr-2 h-4 w-4" /> Copy @{a.username}</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => void remove(a)}
                                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete agent
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        ) : undefined}
                      />
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Built in: Aura plus the platform's agents */}
            {(auraShown || builtInCount > 0) && (
              <h2 className={cn(SECTION_LABEL, 'mt-8')}>Built in — {(auraShown ? 1 : 0) + builtInCount}</h2>
            )}
            {auraShown && (
              <ul aria-label="Aura">
                <AgentRow
                  testId="builtin-aura"
                  logo={<AgentLogo name="Aura" builtin size="lg" />}
                  status="active"
                  name="Aura"
                  tag="Built in"
                  statusText="Always on"
                  subtitle="Mention @aura in any channel to summarize, translate, search or look something up."
                />
              </ul>
            )}
            <BuiltInAgentList
              communityId={catalogCommunityId}
              communityName={communityName(catalogCommunityId ?? null)}
              query={query}
              show={show}
              onCount={setBuiltInCount}
            />
          </div>
        </main>
      </div>

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
