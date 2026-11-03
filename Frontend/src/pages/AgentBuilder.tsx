// Agent Builder: configure, give knowledge to, test and publish one agent.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Archive, Loader2, Pause, Play, Store } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { channelService } from '@/services/channelService';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import { invalidateMentionableAgents } from '@/hooks/useMentionableAgents';
import AgentConfigForm from '@/components/agent-builder/AgentConfigForm';
import TriggerEditor from '@/components/agent-builder/TriggerEditor';
import AgentKnowledgePanel from '@/components/agent-builder/KnowledgePanel';
import TestChatPanel from '@/components/agent-builder/TestChatPanel';
import RunHistory from '@/components/agent-builder/RunHistory';
import IntegrationsPanel from '@/components/agent-builder/IntegrationsPanel';
import StatusChip from '@/components/agent-builder/StatusChip';
import AgentLogo from '@/components/ai-agents/AgentLogo';
import ShareAgentDialog from '@/components/agent-builder/ShareAgentDialog';
import { btnDanger, btnGhost, btnPrimary, cardCls } from '@/components/agent-builder/styles';
import type { BuilderAgent, BuilderTool } from '@/types/agentBuilder';
import type { Channel } from '@/types';

type Tab = 'configure' | 'triggers' | 'knowledge' | 'activity' | 'integrations';
const TABS: Array<[Tab, string]> = [
  ['configure', 'Basics'], ['triggers', 'When it replies'], ['knowledge', 'What it knows'], ['activity', 'History'],
  ['integrations', 'Connections'],
];

const AgentBuilder: React.FC = () => {
  const { agentId = '' } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [agent, setAgent] = useState<BuilderAgent | null>(null);
  const [tools, setTools] = useState<BuilderTool[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('configure');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, t] = await Promise.all([agentBuilderService.get(agentId), agentBuilderService.tools()]);
      setAgent(a);
      setTools(t);
      if (a.community_id) {
        channelService.getCommunityChannels(a.community_id).then(setChannels).catch(() => setChannels([]));
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [agentId]);

  useEffect(() => { void load(); }, [load]);

  const update = (next: BuilderAgent) => setAgent((cur) => (cur ? { ...cur, ...next } : next));

  const setLive = async (live: boolean) => {
    if (!agent) return;
    setBusy(true);
    try {
      const next = live ? await agentBuilderService.publish(agent.id) : await agentBuilderService.pause(agent.id);
      invalidateMentionableAgents();
      update(next);
      toast({ title: live ? `${agent.name} is on` : `${agent.name} is paused`,
              description: live ? `People can now mention @${agent.username}.` : undefined });
    } catch (e) {
      toast({ title: live ? 'Could not publish' : 'Could not pause', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!agent || !window.confirm(`Archive ${agent.name}? It stops answering and disappears from the hub.`)) return;
    setBusy(true);
    try {
      await agentBuilderService.archive(agent.id);
      invalidateMentionableAgents();
      navigate('/agents/mine');
    } catch (e) {
      toast({ title: 'Could not archive', description: errorMessage(e), variant: 'destructive' });
      setBusy(false);
    }
  };

  const back = (
    <button type="button" className={btnGhost} onClick={() => navigate('/agents/mine')}>
      <ArrowLeft className="h-4 w-4" /> Your agents
    </button>
  );

  if (error) {
    return (
      <div className="h-full p-8" style={{ background: 'var(--theme-bg-gradient)' }}>
        {back}
        <p className="mt-6 text-sm text-red-300" role="alert">{error}</p>
      </div>
    );
  }
  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: 'var(--theme-bg-gradient)' }} role="status">
        <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--theme-text-muted))]" />
      </div>
    );
  }

  // Someone who can see an agent but not manage it only gets its public card.
  if (agent.instructions === undefined) {
    return (
      <div className="h-full p-8" style={{ background: 'var(--theme-bg-gradient)' }}>
        {back}
        <div className={`${cardCls} mt-6 max-w-xl p-5`}>
          <h1 className="text-xl font-bold text-[hsl(var(--theme-text-primary))]">{agent.name}</h1>
          <p className="text-xs text-[hsl(var(--theme-text-muted))]">@{agent.username}</p>
          <p className="mt-3 text-sm text-[hsl(var(--theme-text-secondary))]">{agent.description || 'No description.'}</p>
          <p className="mt-3 text-sm text-[hsl(var(--theme-text-muted))]">Mention it in a channel to talk to it.</p>
        </div>
      </div>
    );
  }

  const live = agent.status === 'active';

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--theme-bg-gradient)' }}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {back}
            <AgentLogo name={agent.name} username={agent.username} slug={agent.template_key} avatarUrl={agent.avatar_url} size="lg" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-[hsl(var(--theme-text-primary))]">{agent.name}</h1>
              <p className="text-xs text-[hsl(var(--theme-text-muted))]">@{agent.username}</p>
            </div>
            <StatusChip status={agent.status} />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={btnGhost} disabled={busy || dirty} onClick={() => setSharing(true)}
                    title={dirty ? 'Save your changes first' : 'Share this agent in the marketplace'}>
              <Store className="h-4 w-4" /> Share
            </button>
            <button type="button" className={btnDanger} disabled={busy} onClick={() => void archive()}>
              <Archive className="h-4 w-4" /> Archive
            </button>
            {live ? (
              <button type="button" className={btnGhost} disabled={busy} onClick={() => void setLive(false)}>
                <Pause className="h-4 w-4" /> Pause
              </button>
            ) : (
              <button type="button" className={btnPrimary} disabled={busy || dirty} onClick={() => void setLive(true)}
                      title={dirty ? 'Save your changes first' : undefined}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Turn on
              </button>
            )}
          </div>
        </div>

        {agent.notes && agent.notes.length > 0 && (
          <ul className="mb-4 list-disc rounded-md border border-warning/40 bg-warning/10 py-2 pl-8 pr-3 text-sm text-foreground">
            {agent.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className={`${cardCls} p-5`}>
            <div role="tablist" aria-label="Agent sections" className="mb-5 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-[hsl(var(--theme-border-default))]">
              {TABS.map(([key, label]) => (
                <button key={key} type="button" role="tab" id={`tab-${key}`} aria-selected={tab === key} aria-controls={`panel-${key}`}
                        onClick={() => setTab(key)}
                        className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
                          tab === key ? 'border-[hsl(var(--theme-accent-primary))] text-[hsl(var(--theme-text-primary))]'
                            : 'border-transparent text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === 'configure' && (
                <AgentConfigForm agent={agent} tools={tools} channels={channels} onSaved={update} onDirtyChange={setDirty} />
              )}
              {tab === 'triggers' && <TriggerEditor agent={agent} channels={channels} onSaved={update} />}
              {tab === 'knowledge' && <AgentKnowledgePanel agentId={agent.id} channels={channels} />}
              {tab === 'activity' && <RunHistory agentId={agent.id} />}
              {tab === 'integrations' && <IntegrationsPanel agent={agent} onSaved={update} />}
            </div>
          </div>

          <div className="xl:sticky xl:top-6 xl:self-start">
            <TestChatPanel agentId={agent.id} agentName={agent.name} channels={channels} hasUnsavedChanges={dirty} />
          </div>
        </div>
      </div>
      <ShareAgentDialog open={sharing} onOpenChange={setSharing} agent={agent} />
    </div>
  );
};

export default AgentBuilder;
