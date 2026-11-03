// Basics: who the agent is and how it talks. The rarely changed settings
// (daily limit, channels) sit under "More settings", closed by default.
import React, { useState } from 'react';
import { ChevronDown, Gauge, Plus, Zap } from 'lucide-react';
import AgentLogo from '@/components/ai-agents/AgentLogo';
import { INSTRUCTION_SNIPPETS, addSnippet } from '@/lib/agentBuilder';
import { cn } from '@/lib/utils';
import type { AgentFormValues, BuilderAgent } from '@/types/agentBuilder';
import type { Channel } from '@/types';
import { SettingsCard } from './AgentSettingsParts';

const MAX_INSTRUCTIONS = 4000;

const input = 'w-full rounded-md border border-border bg-[hsl(var(--theme-input-bg))] px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary';
const label = 'mb-1.5 block text-sm font-medium text-foreground';

const QUALITY: Array<{ value: AgentFormValues['model_tier']; title: string; text: string; icon: typeof Zap }> = [
  { value: 'fast', title: 'Fast', text: 'Quick answers to everyday questions. Costs less.', icon: Zap },
  { value: 'smart', title: 'Smart', text: 'Slower, but better at hard or long questions.', icon: Gauge },
];

interface Props {
  agent: BuilderAgent;
  values: AgentFormValues;
  set: <K extends keyof AgentFormValues>(key: K, value: AgentFormValues[K]) => void;
  channels: Channel[];
}

const BasicsPanel: React.FC<Props> = ({ agent, values, set, channels }) => {
  const [more, setMore] = useState(false);
  const textChannels = channels.filter((c) => c.type !== 'voice');
  const toggleChannel = (id: number) =>
    set('channel_ids', values.channel_ids.includes(id) ? values.channel_ids.filter((x) => x !== id) : [...values.channel_ids, id]);

  return (
    <div className="space-y-5">
      <SettingsCard title="Profile" hint="How people see it in channels and in the @ list.">
        <div className="flex flex-col gap-5 sm:flex-row">
          <AgentLogo name={values.name || agent.name} username={agent.username} slug={agent.template_key} avatarUrl={agent.avatar_url} size="xl" />
          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <label className={label} htmlFor="agent-name">Name</label>
              <input id="agent-name" className={input} value={values.name} maxLength={60} onChange={(e) => set('name', e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">People mention it as <strong className="text-foreground">@{agent.username}</strong>.</p>
            </div>
            <div>
              <label className={label} htmlFor="agent-description">What it helps with</label>
              <input id="agent-description" className={input} value={values.description} maxLength={300}
                     onChange={(e) => set('description', e.target.value)} placeholder="e.g. Answers questions about assignments and deadlines" />
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="How it behaves"
        hint={<>Write to it like you would brief a new helper: who it is, what to do, what to avoid. Start with <em>You…</em></>}
      >
        <textarea
          id="agent-instructions"
          aria-label="How it behaves"
          className={cn(input, 'min-h-[180px] leading-relaxed')}
          value={values.instructions}
          maxLength={MAX_INSTRUCTIONS}
          placeholder="You help students of the CS Department. Answer questions about assignments, deadlines and rules. Keep it short and friendly."
          onChange={(e) => set('instructions', e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Quick add:</span>
          {INSTRUCTION_SNIPPETS.map((s) => {
            const added = values.instructions.includes(s.text);
            return (
              <button
                key={s.label}
                type="button"
                disabled={added}
                onClick={() => set('instructions', addSnippet(values.instructions, s.text))}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-medium text-[hsl(var(--theme-text-secondary))] transition-colors duration-100 hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground disabled:cursor-default disabled:opacity-50"
              >
                <Plus className="h-3 w-3" /> {s.label}
              </button>
            );
          })}
          <span className="ml-auto text-xs text-muted-foreground">{values.instructions.length}/{MAX_INSTRUCTIONS}</span>
        </div>
      </SettingsCard>

      <SettingsCard title="Answer quality">
        <div role="radiogroup" aria-label="Answer quality" className="grid gap-3 sm:grid-cols-2">
          {QUALITY.map((q) => {
            const on = values.model_tier === q.value;
            return (
              <button
                key={q.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set('model_tier', q.value)}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors duration-100',
                  on ? 'border-primary bg-[hsl(var(--theme-bg-active))]' : 'border-border hover:bg-[hsl(var(--theme-bg-hover))]',
                )}
              >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', on ? 'bg-primary text-primary-foreground' : 'bg-[hsl(var(--theme-bg-tertiary))] text-muted-foreground')}>
                  <q.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground">{q.title}</span>
                  <span className="block text-sm text-muted-foreground">{q.text}</span>
                </span>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      <section className="rounded-xl border border-border bg-[hsl(var(--theme-bg-secondary))]">
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((m) => !m)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        >
          <span>
            <span className="block text-base font-semibold text-foreground">More settings</span>
            <span className="block text-sm text-muted-foreground">
              Up to {values.daily_run_cap} answers a day · {values.channel_ids.length === 0 ? 'all channels' : `${values.channel_ids.length} ${values.channel_ids.length === 1 ? 'channel' : 'channels'}`}
            </span>
          </span>
          <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform duration-150', more && 'rotate-180')} />
        </button>
        {more && (
          <div className="space-y-5 border-t border-border px-5 py-4">
            <div>
              <label className={label} htmlFor="agent-cap">Daily limit</label>
              <div className="flex items-center gap-2">
                <input id="agent-cap" type="number" min={1} max={2000} className={cn(input, 'w-28')} value={values.daily_run_cap}
                       onChange={(e) => set('daily_run_cap', Math.max(1, Math.min(2000, Number(e.target.value) || 1)))} />
                <span className="text-sm text-muted-foreground">answers a day, at most</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Keeps costs predictable. When it reaches the limit it stops until tomorrow.</p>
            </div>
            {textChannels.length > 0 && (
              <fieldset>
                <legend className={label}>Where it may answer</legend>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={values.channel_ids.length === 0}
                    onClick={() => set('channel_ids', [])}
                    className={cn('h-8 rounded-full border px-3 text-sm transition-colors duration-100',
                      values.channel_ids.length === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))]')}
                  >
                    All channels
                  </button>
                  {textChannels.map((c) => {
                    const on = values.channel_ids.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleChannel(c.id)}
                        className={cn('h-8 rounded-full border px-3 text-sm transition-colors duration-100',
                          on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))]')}
                      >
                        # {c.name}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">Pick channels to limit it to them. With none picked it may answer everywhere.</p>
              </fieldset>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default BasicsPanel;
