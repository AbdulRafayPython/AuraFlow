// Manage one agent (/agents/:id). Laid out like Discord's settings and the
// configure-and-preview split of agent builders such as OpenAI's GPT editor and
// Appian's Agent Studio: a short list of sections on the left, one section at a
// time in the middle, and a live test chat on the right. A checklist says what
// to do next until the agent is ready, and one bar collects unsaved changes.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, AtSign, BookOpen, Clock, History, Loader2, MessageSquare, MoreHorizontal, Plug, Store, Trash2,
  UserRound, Wrench,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { channelService } from '@/services/channelService';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import { invalidateMentionableAgents } from '@/hooks/useMentionableAgents';
import { STATUS_LABELS, formFromAgent, isDirty, setupSteps, type SetupStepKey } from '@/lib/agentBuilder';
import BasicsPanel from '@/components/agent-builder/BasicsPanel';
import SkillsPanel from '@/components/agent-builder/SkillsPanel';
import TriggerEditor from '@/components/agent-builder/TriggerEditor';
import AgentKnowledgePanel from '@/components/agent-builder/KnowledgePanel';
import TestChatPanel from '@/components/agent-builder/TestChatPanel';
import RunHistory from '@/components/agent-builder/RunHistory';
import IntegrationsPanel from '@/components/agent-builder/IntegrationsPanel';
import { SaveBar, SetupChecklist } from '@/components/agent-builder/AgentSettingsParts';
import AgentLogo from '@/components/ai-agents/AgentLogo';
import ShareAgentDialog from '@/components/agent-builder/ShareAgentDialog';
import { OnOffSwitch, DOT } from '@/components/agents/AgentRow';
import { useConfirm } from '@/components/modals/ConfirmDialog';
import { cn } from '@/lib/utils';
import type { AgentFormValues, BuilderAgent, BuilderTool, KnowledgeSource } from '@/types/agentBuilder';
import type { Channel } from '@/types';

type Tab = 'configure' | 'skills' | 'triggers' | 'knowledge' | 'integrations' | 'activity';

const SECTIONS: Array<{ key: Tab; label: string; hint: string; icon: typeof UserRound }> = [
  { key: 'configure', label: 'Basics', hint: 'Its name, how it behaves and how smart it is.', icon: UserRound },
  { key: 'skills', label: 'Skills', hint: 'What it is allowed to do.', icon: Wrench },
  { key: 'triggers', label: 'When it replies', hint: 'What makes it speak up: a mention, keywords, a schedule and more.', icon: Clock },
  { key: 'knowledge', label: 'What it knows', hint: 'Notes, files and channels it can answer from.', icon: BookOpen },
  { key: 'integrations', label: 'Connections', hint: 'Link it to other apps like Zapier, n8n or a CRM.', icon: Plug },
  { key: 'activity', label: 'History', hint: 'What it did recently and why.', icon: History },
];
const STEP_TAB: Record<SetupStepKey, Tab | null> = { instructions: 'configure', triggers: 'triggers', knowledge: 'knowledge', live: null };

const btn = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50';

const AgentBuilder: React.FC = () => {
  const { agentId = '' } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();
  const [agent, setAgent] = useState<BuilderAgent | null>(null);
  const [tools, setTools] = useState<BuilderTool[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  // ?tab=triggers etc. (Your agents' menu links straight to a section).
  const [tab, setTab] = useState<Tab>(() => {
    const wanted = searchParams.get('tab');
    return SECTIONS.some((s) => s.key === wanted) ? (wanted as Tab) : 'configure';
  });
  const [values, setValues] = useState<AgentFormValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, t] = await Promise.all([agentBuilderService.get(agentId), agentBuilderService.tools()]);
      setAgent(a);
      setValues(formFromAgent(a));
      setTools(t);
      if (a.community_id) {
        channelService.getCommunityChannels(a.community_id).then(setChannels).catch(() => setChannels([]));
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [agentId]);

  useEffect(() => { void load(); }, [load]);

  const saved = useMemo(() => (agent ? formFromAgent(agent) : null), [agent]);
  const dirty = !!values && !!saved && isDirty(values, saved);

  // Leaving with unsaved edits asks first (the browser's own box on reload/close).
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const onKnowledge = useCallback((knowledge: KnowledgeSource[]) => setAgent((cur) => (cur ? { ...cur, knowledge } : cur)), []);
  const update = (next: BuilderAgent) => setAgent((cur) => (cur ? { ...cur, ...next } : next));
  const set = <K extends keyof AgentFormValues>(key: K, value: AgentFormValues[K]) =>
    setValues((v) => (v ? { ...v, [key]: value } : v));

  const save = async () => {
    if (!agent || !values) return;
    setSaving(true);
    try {
      const updated = await agentBuilderService.update(agent.id, values);
      const next = { ...agent, ...updated };
      setAgent(next);
      setValues(formFromAgent(next));
      invalidateMentionableAgents();
      toast({ title: 'Changes saved', variant: 'success' });
    } catch (err) {
      toast({ title: 'Could not save', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const setLive = async (live: boolean) => {
    if (!agent) return;
    setBusy(true);
    try {
      const next = live ? await agentBuilderService.publish(agent.id) : await agentBuilderService.pause(agent.id);
      invalidateMentionableAgents();
      update(next);
      toast(live
        ? { title: `${agent.name} is on`, description: `People can now mention @${agent.username}.`, variant: 'success' }
        : { title: `${agent.name} is paused`, description: 'It will not reply until you turn it back on.', variant: 'info' });
    } catch (e) {
      toast({ title: live ? 'Could not turn it on' : 'Could not pause it', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!agent) return;
    const ok = await confirm({
      title: `Delete ${agent.name}?`,
      description: `It stops replying and is removed from Your agents. People can no longer mention @${agent.username}.`,
      confirmText: 'Delete agent',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await agentBuilderService.archive(agent.id);
      invalidateMentionableAgents();
      toast({ title: `${agent.name} was deleted`, variant: 'success' });
      navigate('/agents/mine');
    } catch (e) {
      toast({ title: 'Could not delete the agent', description: errorMessage(e), variant: 'destructive' });
      setBusy(false);
    }
  };

  const copyMention = async () => {
    if (!agent) return;
    try {
      await navigator.clipboard.writeText(`@${agent.username}`);
      toast({ title: `Copied @${agent.username}`, description: 'Paste it in a channel to talk to the agent.', variant: 'success' });
    } catch {
      toast({ title: 'Could not copy', description: `The mention is @${agent.username}.`, variant: 'destructive' });
    }
  };

  const back = (
    <button type="button" onClick={() => navigate('/agents/mine')} aria-label="Back to Your agents" title="Back to Your agents"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground">
      <ArrowLeft className="h-5 w-5" />
    </button>
  );

  if (error) {
    return (
      <div className="h-full bg-background p-6">
        <div className="flex items-center gap-2">{back}<span className="text-sm text-muted-foreground">Your agents</span></div>
        <p className="mt-6 text-sm text-destructive" role="alert">{error}</p>
      </div>
    );
  }
  if (!agent || !values) {
    return (
      <div className="flex h-full items-center justify-center bg-background" role="status" aria-label="Loading agent">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Someone who can see an agent but not manage it only gets its public card.
  if (agent.instructions === undefined) {
    return (
      <div className="h-full bg-background p-6">
        <div className="flex items-center gap-2">{back}<span className="text-sm text-muted-foreground">Your agents</span></div>
        <div className="mt-6 flex max-w-xl items-start gap-4 rounded-xl border border-border bg-[hsl(var(--theme-bg-secondary))] p-5">
          <AgentLogo name={agent.name} username={agent.username} slug={agent.template_key} avatarUrl={agent.avatar_url} size="lg" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">{agent.name}</h1>
            <p className="text-sm text-muted-foreground">@{agent.username}</p>
            <p className="mt-3 text-sm text-[hsl(var(--theme-text-secondary))]">{agent.description || 'No description.'}</p>
            <p className="mt-3 text-sm text-muted-foreground">Only the community's admins can change it. Mention it in a channel to talk to it.</p>
          </div>
        </div>
      </div>
    );
  }

  const live = agent.status === 'active';
  const steps = setupSteps(agent);
  const ready = steps.every((s) => s.done || s.optional);
  const showChecklist = !live || !ready;
  const section = SECTIONS.find((s) => s.key === tab) ?? SECTIONS[0];
  const goStep = (key: SetupStepKey) => {
    const target = STEP_TAB[key];
    if (target) setTab(target);
    else if (!dirty) void setLive(true);
    else toast({ title: 'Save your changes first', description: 'Then turn it on.', variant: 'warning' });
  };
  const test = <TestChatPanel bare agentId={agent.id} agentName={agent.name} channels={channels} hasUnsavedChanges={dirty} />;

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      {/* Header: who it is, whether it is on, and everything else in one menu */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border pl-16 pr-4 md:pl-4">
        {back}
        <span className="relative shrink-0">
          <AgentLogo name={agent.name} username={agent.username} slug={agent.template_key} avatarUrl={agent.avatar_url} size="md" />
          <span aria-hidden className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[hsl(var(--theme-bg-primary))]', DOT[agent.status])} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold leading-tight text-foreground">{agent.name}</h1>
          <p className="truncate text-xs text-muted-foreground">@{agent.username} · {STATUS_LABELS[agent.status]}</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setTesting(true)}
                  className={cn(btn, 'bg-[hsl(var(--theme-bg-tertiary))] text-foreground hover:bg-[hsl(var(--theme-bg-hover))] xl:hidden')}>
            <MessageSquare className="h-4 w-4" /> Try it
          </button>
          <label className="flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-foreground"
                 title={dirty && !live ? 'Save your changes first' : undefined}>
            <span className="hidden sm:inline">{live ? 'On' : 'Off'}</span>
            <OnOffSwitch
              on={live}
              busy={busy}
              disabled={dirty && !live}
              label={`${agent.name} on or off`}
              onChange={(next) => void setLive(next)}
            />
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="More actions"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem disabled={dirty} onSelect={() => setSharing(true)}>
                <Store className="mr-2 h-4 w-4" /> {dirty ? 'Save first to share' : 'Share to the marketplace'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copyMention()}><AtSign className="mr-2 h-4 w-4" /> Copy @{agent.username}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void remove()} className="text-destructive focus:bg-destructive focus:text-destructive-foreground">
                <Trash2 className="mr-2 h-4 w-4" /> Delete agent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sections (Discord's settings list) */}
        <nav aria-label="Agent settings" className="hidden w-56 shrink-0 space-y-0.5 overflow-y-auto border-r border-border p-3 lg:block">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setTab(s.key)}
              aria-current={tab === s.key ? 'page' : undefined}
              className={cn(
                'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors duration-100',
                tab === s.key ? 'bg-[hsl(var(--theme-bg-active))] font-medium text-foreground' : 'text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground',
              )}
            >
              <s.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{s.label}</span>
              {s.key === 'skills' && <span className="text-xs text-muted-foreground">{values.tools.length}</span>}
              {s.key === 'triggers' && <span className="text-xs text-muted-foreground">{(agent.triggers ?? []).length}</span>}
            </button>
          ))}
        </nav>

        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto" data-agent-scroll>
          {/* Sections as tabs on smaller screens */}
          <div role="tablist" aria-label="Agent settings" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-4 py-2 scrollbar-none lg:hidden">
            {SECTIONS.map((s) => (
              <button key={s.key} type="button" role="tab" aria-selected={tab === s.key} onClick={() => setTab(s.key)}
                      className={cn('h-8 shrink-0 rounded-md px-3 text-sm font-medium',
                        tab === s.key ? 'bg-[hsl(var(--theme-bg-active))] text-foreground' : 'text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))]')}>
                {s.label}
              </button>
            ))}
          </div>

          <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
            {agent.notes && agent.notes.length > 0 && (
              <ul className="mb-4 list-disc rounded-lg border border-warning/40 bg-warning/10 py-2 pl-8 pr-3 text-sm text-foreground">
                {agent.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            )}

            {showChecklist && <SetupChecklist name={agent.name} steps={steps} onGo={goStep} />}

            <div className="mb-5">
              <h2 className="text-xl font-semibold text-foreground">{section.label}</h2>
              <p className="text-sm text-muted-foreground">{section.hint}</p>
            </div>

            {tab === 'configure' && <BasicsPanel agent={agent} values={values} set={set} channels={channels} />}
            {tab === 'skills' && <SkillsPanel name={agent.name} tools={tools} values={values} set={set} />}
            {tab === 'triggers' && <TriggerEditor agent={agent} channels={channels} onSaved={update} />}
            {tab === 'knowledge' && (
              <AgentKnowledgePanel agentId={agent.id} channels={channels} onChange={onKnowledge} />
            )}
            {tab === 'integrations' && <IntegrationsPanel agent={agent} onSaved={update} />}
            {tab === 'activity' && <RunHistory agentId={agent.id} />}
          </div>

          {dirty && <SaveBar saving={saving} onReset={() => setValues(saved)} onSave={() => void save()} />}
        </main>

        {/* Live test, always next to the settings on wide screens */}
        <aside aria-label={`Try ${agent.name}`} className="hidden w-[380px] shrink-0 flex-col border-l border-border xl:flex">
          {test}
        </aside>
      </div>

      <Sheet open={testing} onOpenChange={setTesting}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetTitle className="sr-only">Try {agent.name}</SheetTitle>
          {test}
        </SheetContent>
      </Sheet>
      <ShareAgentDialog open={sharing} onOpenChange={setSharing} agent={agent} />
    </div>
  );
};

export default AgentBuilder;
