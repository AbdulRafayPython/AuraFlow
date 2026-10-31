// Agent details in the shell's right pane: Overview, Knowledge, Runs, Settings.
// Opens next to the channel so the conversation stays visible.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Loader2, Pause, Play } from 'lucide-react';
import { useRightPane } from '@/components/app/RightPane';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { channelService } from '@/services/channelService';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import { invalidateMentionableAgents } from '@/hooks/useMentionableAgents';
import { describeTrigger, toolLabel } from '@/lib/agentBuilder';
import StatusChip from '@/components/agent-builder/StatusChip';
import AgentKnowledgePanel from '@/components/agent-builder/KnowledgePanel';
import RunHistory from '@/components/agent-builder/RunHistory';
import { btnGhost, btnPrimary } from '@/components/agent-builder/styles';
import { AgentAvatar, AppBadge } from './AgentMessageShell';
import type { BuilderAgent, MentionableAgent } from '@/types/agentBuilder';
import type { Channel } from '@/types';

type Tab = 'overview' | 'knowledge' | 'runs' | 'settings';
const TABS: Array<[Tab, string]> = [
  ['overview', 'Overview'], ['knowledge', 'Knowledge'], ['runs', 'Runs'], ['settings', 'Settings'],
];

/** Open an agent in the right pane. Safe to call from any screen inside the shell. */
export function useOpenAgent() {
  const { open } = useRightPane();
  return useCallback((agent: MentionableAgent) => {
    open({
      key: `agent-${agent.id}`,
      title: agent.name,
      body: <AgentDetailPane agent={agent} />,
    });
  }, [open]);
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="border-b border-border py-3 last:border-b-0">
    <dt className="mb-1 text-xs font-medium text-muted-foreground">{label}</dt>
    <dd className="text-sm text-foreground">{children}</dd>
  </div>
);

const AgentDetailPane: React.FC<{ agent: MentionableAgent }> = ({ agent: listed }) => {
  const navigate = useNavigate();
  const { close } = useRightPane();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [agent, setAgent] = useState<BuilderAgent | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (listed.builtin) return;
    let cancelled = false;
    agentBuilderService.get(listed.id)
      .then((a) => {
        if (cancelled) return;
        setAgent(a);
        if (a.community_id) channelService.getCommunityChannels(a.community_id).then((c) => { if (!cancelled) setChannels(c); }).catch(() => {});
      })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [listed.id, listed.builtin]);

  const canManage = agent?.instructions !== undefined;
  const live = agent?.status === 'active';
  const tabs = TABS.filter(([key]) => canManage || key === 'overview');

  const setLive = async (next: boolean) => {
    if (!agent) return;
    setBusy(true);
    try {
      const updated = next ? await agentBuilderService.publish(agent.id) : await agentBuilderService.pause(agent.id);
      invalidateMentionableAgents();
      setAgent({ ...agent, ...updated });
      toast({ title: next ? `${agent.name} is on` : `${agent.name} is paused` });
    } catch (e) {
      toast({ title: next ? 'Could not publish' : 'Could not pause', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const channelName = (id: number) => channels.find((c) => c.id === id)?.name;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-3">
        <AgentAvatar name={listed.name} username={listed.username} builtin={listed.builtin} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-bold text-foreground">{listed.name}</span>
            <AppBadge label={listed.builtin ? 'Built in' : 'APP'} />
          </div>
          <p className="truncate text-sm text-muted-foreground">@{listed.username}</p>
        </div>
        {agent && <StatusChip status={agent.status} />}
      </div>

      <div role="tablist" aria-label="Agent sections" className="flex gap-1 border-b border-border px-3">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 px-2.5 py-2 text-sm font-medium transition-colors',
              tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        {tab === 'overview' && (
          <dl>
            <Row label="About">{listed.description || 'No description.'}</Row>
            {agent && (
              <>
                {agent.tools && agent.tools.length > 0 && (
                  <Row label="Can do">
                    <ul className="list-disc pl-4">{agent.tools.map((t) => <li key={t}>{toolLabel(t)}</li>)}</ul>
                  </Row>
                )}
                {agent.triggers && agent.triggers.length > 0 && (
                  <Row label="Speaks when">
                    <ul className="list-disc pl-4">
                      {agent.triggers.map((t, i) => <li key={t.id ?? i}>{describeTrigger(t, channelName)}</li>)}
                    </ul>
                  </Row>
                )}
                {agent.version != null && <Row label="Version">{agent.version}</Row>}
              </>
            )}
            {!agent && !listed.builtin && !error && (
              <div className="py-4" role="status"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            )}
            {listed.builtin && <Row label="How to use">Mention @{listed.username} in any channel.</Row>}
          </dl>
        )}

        {tab === 'knowledge' && agent && <AgentKnowledgePanel agentId={agent.id} channels={channels} />}
        {tab === 'runs' && agent && <RunHistory agentId={agent.id} />}

        {tab === 'settings' && agent && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Instructions, tools, triggers and integrations live in the builder, next to a live test chat.
            </p>
            <button type="button" className={btnGhost} onClick={() => { close(); navigate(`/agents/${agent.id}`); }}>
              <ExternalLink className="h-4 w-4" /> Open in builder
            </button>
            {live ? (
              <button type="button" className={btnGhost} disabled={busy} onClick={() => void setLive(false)}>
                <Pause className="h-4 w-4" /> Pause
              </button>
            ) : (
              <button type="button" className={btnPrimary} disabled={busy} onClick={() => void setLive(true)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Turn on
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentDetailPane;
