// Identity, instructions, tools, model and limits of one agent.
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import { formFromAgent, isDirty, toolLabel } from '@/lib/agentBuilder';
import type { AgentFormValues, BuilderAgent, BuilderTool } from '@/types/agentBuilder';
import type { Channel } from '@/types';
import { btnPrimary, hintCls, inputCls, labelCls } from './styles';

const MAX_INSTRUCTIONS = 4000;

interface Props {
  agent: BuilderAgent;
  tools: BuilderTool[];
  channels: Channel[];
  onSaved: (agent: BuilderAgent) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const AgentConfigForm: React.FC<Props> = ({ agent, tools, channels, onSaved, onDirtyChange }) => {
  const { toast } = useToast();
  const saved = useMemo(() => formFromAgent(agent), [agent]);
  const [values, setValues] = useState<AgentFormValues>(saved);
  const [saving, setSaving] = useState(false);

  useEffect(() => setValues(saved), [saved]);
  const dirty = isDirty(values, saved);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  // Leaving this tab discards unsaved edits, so the page must not keep believing they exist.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const set = <K extends keyof AgentFormValues>(key: K, value: AgentFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const toggle = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await agentBuilderService.update(agent.id, values);
      onSaved({ ...agent, ...updated });
      toast({ title: 'Saved', description: 'Your changes are live for this agent.' });
    } catch (err) {
      toast({ title: 'Could not save', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const textChannels = channels.filter((c) => c.type !== 'voice');

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
        <div>
          <label className={labelCls} htmlFor="agent-name">Name</label>
          <input id="agent-name" className={inputCls} value={values.name} maxLength={60}
                 onChange={(e) => set('name', e.target.value)} />
          <p className={hintCls}>People mention it as <strong>@{agent.username}</strong>.</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="agent-description">Short description</label>
          <input id="agent-description" className={inputCls} value={values.description} maxLength={300}
                 onChange={(e) => set('description', e.target.value)} placeholder="Shown in the @ suggestions" />
        </div>
      </div>

      <div>
        <div className="flex items-end justify-between">
          <label className={labelCls} htmlFor="agent-instructions">How it should behave</label>
          <span className={`${hintCls} mb-1.5 mt-0`}>{values.instructions.length}/{MAX_INSTRUCTIONS}</span>
        </div>
        <textarea id="agent-instructions" className={`${inputCls} min-h-[180px] font-mono text-sm leading-relaxed`}
                  value={values.instructions} maxLength={MAX_INSTRUCTIONS}
                  onChange={(e) => set('instructions', e.target.value)} />
        <p className={hintCls}>Tell it who it is, what to do and what not to do. Write to it as &quot;You&quot;.</p>
      </div>

      <fieldset>
        <legend className={labelCls}>What it can do</legend>
        <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(230px,1fr))]">
          {tools.map((t) => (
            <label key={t.name}
                   className="flex cursor-pointer items-start gap-2.5 rounded-md border border-[hsl(var(--theme-border-default))] p-2.5 hover:bg-[hsl(var(--theme-bg-hover))]">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--theme-accent-primary))]"
                     checked={values.tools.includes(t.name)}
                     onChange={() => set('tools', toggle(values.tools, t.name))} />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--theme-text-primary))]">
                  {toolLabel(t.name)}
                  {t.risk === 'write' && (
                    <span className="rounded bg-warning/15 px-1.5 text-xs font-semibold text-warning">Needs approval</span>
                  )}
                  {t.private_only && (
                    <span className="rounded bg-[hsl(var(--theme-bg-tertiary))] px-1.5 text-xs font-semibold text-muted-foreground"
                          title="Reads the person's own mood or DMs, so it only works when the agent answers them by DM">
                      Private chats only
                    </span>
                  )}
                </span>
                <span className="block text-xs text-[hsl(var(--theme-text-muted))]">{t.description.split('.')[0]}.</span>
              </span>
            </label>
          ))}
        </div>
        <p className={hintCls}>Tools marked "Needs approval" never run on their own: you see exactly what the agent wants to do and approve it first.</p>
      </fieldset>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
        <div>
          <label className={labelCls} htmlFor="agent-tier">Quality</label>
          <select id="agent-tier" className={inputCls} value={values.model_tier}
                  onChange={(e) => set('model_tier', e.target.value as AgentFormValues['model_tier'])}>
            <option value="fast">Fast (cheaper, quick answers)</option>
            <option value="smart">Smart (slower, for harder questions)</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="agent-cap">Daily limit</label>
          <input id="agent-cap" type="number" min={1} max={2000} className={inputCls} value={values.daily_run_cap}
                 onChange={(e) => set('daily_run_cap', Math.max(1, Math.min(2000, Number(e.target.value) || 1)))} />
          <p className={hintCls}>Most answers it may give per day. Keeps costs predictable.</p>
        </div>
      </div>

      {textChannels.length > 0 && (
        <fieldset>
          <legend className={labelCls}>Where it may answer</legend>
          <p className={`${hintCls} mb-2 mt-0`}>
            {values.channel_ids.length === 0 ? 'Every channel of this community.' : 'Only the channels ticked below.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {textChannels.map((c) => {
              const on = values.channel_ids.includes(c.id);
              return (
                <label key={c.id}
                       className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${
                         on ? 'border-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-text-primary))]'
                            : 'border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover))]'}`}>
                  <input type="checkbox" className="sr-only" checked={on}
                         onChange={() => set('channel_ids', toggle(values.channel_ids, c.id))} />
                  # {c.name}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center gap-3 border-t border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-primary))] px-5 py-3" data-testid="save-bar">
        <button type="submit" className={btnPrimary} disabled={!dirty || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes
        </button>
        {dirty && <span className="text-xs text-[hsl(var(--theme-text-secondary))]">You have unsaved changes.</span>}
      </div>
    </form>
  );
};

export default AgentConfigForm;
