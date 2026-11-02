// "Create an agent": pick where it lives, then a template, or describe it in your own words.
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { channelService } from '@/services/channelService';
import agentBuilderService, { errorMessage, type CreateAgentInput } from '@/services/agentBuilderService';
import { describeTrigger, toolLabel } from '@/lib/agentBuilder';
import type { AgentTemplate, BuilderAgent, GeneratedDraft } from '@/types/agentBuilder';
import type { Channel, Community } from '@/types';
import { btnGhost, btnPrimary, hintCls, inputCls, labelCls } from './styles';
import AgentLogo from '@/components/ai-agents/AgentLogo';

type Tab = 'template' | 'describe';
const PERSONAL = '';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communities: Community[];
  defaultCommunityId?: string;
  onCreated: (agent: BuilderAgent) => void;
}

const CreateAgentDialog: React.FC<Props> = ({ open, onOpenChange, communities, defaultCommunityId, onCreated }) => {
  const { toast } = useToast();
  const manageable = useMemo(() => communities.filter((c) => c.role === 'owner' || c.role === 'admin'), [communities]);
  const [tab, setTab] = useState<Tab>('template');
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [templateKey, setTemplateKey] = useState('faq');
  const [where, setWhere] = useState<string>(PERSONAL);
  const [name, setName] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState<number | ''>('');
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<GeneratedDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);

  // Templates that read one person's private data (Wellbeing Buddy) are personal agents only.
  const visibleTemplates = templates.filter((t) => !(where && t.personal_only));
  const template = visibleTemplates.find((t) => t.key === templateKey);

  useEffect(() => {
    if (!open) return;
    agentBuilderService.templates().then(setTemplates).catch((e) =>
      toast({ title: 'Could not load templates', description: errorMessage(e), variant: 'destructive' }));
    setWhere(defaultCommunityId && manageable.some((c) => c.id === defaultCommunityId) ? defaultCommunityId : PERSONAL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (template) setName(template.suggested_name);
  }, [template]);

  useEffect(() => {
    if (!template && visibleTemplates.length > 0) setTemplateKey(visibleTemplates[0].key);
  }, [template, visibleTemplates]);

  useEffect(() => {
    setChannelId('');
    if (!where) { setChannels([]); return; }
    channelService.getCommunityChannels(where).then((list) => {
      const text = list.filter((c) => c.type !== 'voice');
      setChannels(text);
      setChannelId(text[0]?.id ?? '');
    }).catch(() => setChannels([]));
  }, [where]);

  const generate = async () => {
    setGenerating(true);
    setDraft(null);
    try {
      setDraft(await agentBuilderService.generate(prompt));
    } catch (e) {
      toast({ title: 'Could not draft an agent', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const create = async () => {
    setCreating(true);
    try {
      let input: CreateAgentInput;
      if (tab === 'describe' && draft) {
        input = {
          template: 'blank', name: draft.draft.name, description: draft.draft.description,
          instructions: draft.draft.instructions, tools: draft.draft.tools, triggers: draft.draft.triggers,
          community_id: where || null,
        };
      } else {
        input = { template: templateKey, name: name.trim() || undefined, community_id: where || null,
                  channel_id: template?.needs_channel && channelId !== '' ? Number(channelId) : undefined };
      }
      const agent = await agentBuilderService.create(input);
      toast({ title: `${agent.name} created`, description: 'Try it in the test chat, then turn it on.' });
      onOpenChange(false);
      onCreated(agent);
    } catch (e) {
      toast({ title: 'Could not create the agent', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const canCreate = tab === 'describe' ? !!draft : !!template && name.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto bg-[hsl(var(--theme-bg-elevated))] text-[hsl(var(--theme-text-primary))]">
        <DialogHeader>
          <DialogTitle>Create an agent</DialogTitle>
          <DialogDescription>A helper people can @mention. You decide what it knows and when it replies.</DialogDescription>
        </DialogHeader>

        <div>
          <label className={labelCls} htmlFor="agent-where">Where should it work?</label>
          <select id="agent-where" className={inputCls} value={where} onChange={(e) => setWhere(e.target.value)}>
            <option value={PERSONAL}>Just for me</option>
            {manageable.map((c) => <option key={c.id} value={c.id}>{c.name} (community)</option>)}
          </select>
          <p className={hintCls}>
            {where ? 'Everyone in the community can mention it once you turn it on.' : 'Only you can talk to it.'}
            {manageable.length === 0 && ' To add one to a community you need to be its owner or an admin.'}
          </p>
        </div>

        <div role="tablist" aria-label="How to start" className="inline-flex w-fit rounded-md border border-[hsl(var(--theme-border-default))] p-0.5">
          {([['template', 'Pick a starting point'], ['describe', 'Describe what you need']] as Array<[Tab, string]>).map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                    className={`rounded px-3 py-1.5 text-xs font-medium ${
                      tab === t ? 'bg-[hsl(var(--theme-bg-active))] text-[hsl(var(--theme-text-primary))]' : 'text-[hsl(var(--theme-text-muted))]'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'template' && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Template">
              {visibleTemplates.map((t) => (
                <button key={t.key} type="button" role="radio" aria-checked={templateKey === t.key} aria-label={`${t.name}: ${t.description}`}
                        onClick={() => setTemplateKey(t.key)}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          templateKey === t.key
                            ? 'border-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-accent-primary)/0.12)]'
                            : 'border-[hsl(var(--theme-border-default))] hover:bg-[hsl(var(--theme-bg-hover))]'}`}>
                  <div className="flex items-start gap-3">
                    <AgentLogo name={t.name} slug={t.key} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{t.name}</div>
                      <div className="mt-0.5 text-xs text-[hsl(var(--theme-text-muted))]">{t.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {template && (
              <>
                <div>
                  <label className={labelCls} htmlFor="agent-new-name">Name</label>
                  <input id="agent-new-name" className={inputCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
                </div>
                {template.needs_channel && (
                  <div>
                    <label className={labelCls} htmlFor="agent-new-channel">Which channel should it post in?</label>
                    {where ? (
                      <select id="agent-new-channel" className={inputCls} value={channelId}
                              onChange={(e) => setChannelId(e.target.value ? Number(e.target.value) : '')}>
                        {channels.map((c) => <option key={c.id} value={c.id}># {c.name}</option>)}
                      </select>
                    ) : (
                      <p className={hintCls}>Scheduled posts need a community channel. Pick a community above, or add the schedule later.</p>
                    )}
                  </div>
                )}
                <ul className="space-y-1 text-xs text-[hsl(var(--theme-text-muted))]">
                  <li><strong className="text-[hsl(var(--theme-text-secondary))]">It can:</strong>{' '}
                    {template.tools.length ? template.tools.map(toolLabel).join(', ') : 'just reply with messages'}</li>
                  <li><strong className="text-[hsl(var(--theme-text-secondary))]">It replies:</strong>{' '}
                    {template.triggers.map((t) => describeTrigger({ type: t.type, channel_id: null, config: t.config ?? {} })).join(' · ')}</li>
                </ul>
              </>
            )}
          </div>
        )}

        {tab === 'describe' && (
          <div className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="agent-describe">What should it do?</label>
              <textarea id="agent-describe" className={`${inputCls} min-h-[100px]`} value={prompt} maxLength={1500}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g. Answers questions about hostel rules in English and Urdu, politely, and says so when it does not know." />
            </div>
            <button type="button" className={btnGhost} disabled={generating || prompt.trim().length < 5} onClick={() => void generate()}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Draft it for me
            </button>
            {draft && (
              <div className="space-y-2 rounded-lg border border-[hsl(var(--theme-border-default))] p-3 text-sm" data-testid="draft-preview">
                <div className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-[hsl(var(--theme-text-accent))]" />{draft.draft.name}</div>
                <p className="text-[hsl(var(--theme-text-secondary))]">{draft.draft.description}</p>
                <p className="whitespace-pre-line text-xs text-[hsl(var(--theme-text-muted))]">{draft.draft.instructions}</p>
                <p className="text-xs text-[hsl(var(--theme-text-muted))]">
                  It can: {draft.draft.tools.length ? draft.draft.tools.map(toolLabel).join(', ') : 'just reply with messages'}
                </p>
                {draft.notes.length > 0 && (
                  <ul className="list-disc pl-4 text-xs text-warning">{draft.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                )}
                <p className={hintCls}>You can edit everything after it is created.</p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={() => onOpenChange(false)}>Cancel</button>
          <button type="button" className={btnPrimary} disabled={!canCreate || creating} onClick={() => void create()}>
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            Create agent
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateAgentDialog;
