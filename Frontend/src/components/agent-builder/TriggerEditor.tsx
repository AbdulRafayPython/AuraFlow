// When an agent wakes up: mention, keywords, schedule, new member, quiet channel, new topic, or every message in a channel.
import React, { useEffect, useState } from 'react';
import {
  AtSign, CalendarClock, HeartPulse, MessagesSquare, MoonStar, Plus, Shuffle, Tag, Trash2, UserPlus,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OnOffSwitch } from '@/components/agents/AgentRow';
import { SaveBar } from './AgentSettingsParts';
import AppSelect from '@/components/app/AppSelect';
import { useToast } from '@/hooks/use-toast';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import {
  COMMON_TIME_ZONES, CRON_PRESETS, CUSTOM_CRON, SILENCE_CHOICES, TRIGGER_LABELS, describeTrigger, privateRecipient,
  splitKeywords, triggerProblems,
} from '@/lib/agentBuilder';
import type { AgentTrigger, BuilderAgent, TriggerType } from '@/types/agentBuilder';
import type { Channel } from '@/types';
import { hintCls, inputCls, labelCls } from './styles';

const ICONS: Record<TriggerType, typeof AtSign> = {
  mention: AtSign, keyword: Tag, channel_message: MessagesSquare, schedule: CalendarClock,
  member_joined: UserPlus, channel_silent: MoonStar, focus_drift: Shuffle, mood_escalation: HeartPulse,
};

interface Draft extends AgentTrigger {
  key: string;
  keywordText: string;
}

let counter = 0;
const newKey = () => `t${++counter}`;

function toDraft(t: AgentTrigger): Draft {
  return { ...t, key: newKey(), keywordText: (t.config.keywords ?? []).join(', ') };
}

function emptyTrigger(type: TriggerType, defaultChannel: number | null): Draft {
  const config = type === 'schedule' ? { cron: CRON_PRESETS[0].cron, tz: 'UTC', prompt: 'Post the scheduled update.' }
    : type === 'channel_silent' ? { min_minutes: 60 }
    : type === 'mood_escalation' ? { delivery: 'private' as const } : {};
  return toDraft({ type, channel_id: type === 'schedule' || type === 'channel_message' ? defaultChannel : null, config, enabled: true });
}

interface Props {
  agent: BuilderAgent;
  channels: Channel[];
  onSaved: (agent: BuilderAgent) => void;
}

function TriggerIcon({ type }: { type: TriggerType }) {
  const TIcon = ICONS[type];
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--theme-bg-tertiary))] text-foreground">
      <TIcon className="h-4 w-4" />
    </span>
  );
}

const TriggerEditor: React.FC<Props> = ({ agent, channels, onSaved }) => {
  const { toast } = useToast();
  const isCommunityAgent = agent.community_id != null;
  const textChannels = channels.filter((c) => c.type !== 'voice');
  const [drafts, setDrafts] = useState<Draft[]>(() => (agent.triggers ?? []).map(toDraft));
  const [saving, setSaving] = useState(false);

  useEffect(() => setDrafts((agent.triggers ?? []).map(toDraft)), [agent.triggers]);

  const channelName = (id: number) => channels.find((c) => c.id === id)?.name;
  const patch = (key: string, change: Partial<Draft>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...change } : d)));
  const patchConfig = (key: string, change: Partial<Draft['config']>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, config: { ...d.config, ...change } } : d)));

  const available = (Object.keys(TRIGGER_LABELS) as TriggerType[]).filter((t) => {
    if ((t === 'member_joined' || t === 'channel_silent' || t === 'focus_drift') && !isCommunityAgent) return false;
    if (t === 'mood_escalation' && isCommunityAgent) return false;      // only ever your own mood
    if ((t === 'schedule' || t === 'channel_message') && textChannels.length === 0) return false;
    return true;
  });

  const withKeywords = (d: Draft): Draft =>
    d.type === 'keyword' ? { ...d, config: { ...d.config, keywords: splitKeywords(d.keywordText) } } : d;

  const problems = drafts.map((d) => triggerProblems(withKeywords(d)));
  const hasProblems = problems.some((p) => p.length > 0);
  const bodyOf = (list: Draft[]) => JSON.stringify(list.map((raw) => {
    const d = withKeywords(raw);
    return { type: d.type, channel_id: d.channel_id, config: d.config, enabled: d.enabled };
  }));
  const dirty = bodyOf(drafts) !== bodyOf((agent.triggers ?? []).map(toDraft));
  const add = (type: TriggerType) => setDrafts((list) => [...list, emptyTrigger(type, textChannels[0]?.id ?? null)]);

  const save = async () => {
    setSaving(true);
    try {
      const body = drafts.map((raw) => {
        const d = withKeywords(raw);
        return { type: d.type, channel_id: d.channel_id, config: d.config, enabled: d.enabled };
      });
      const updated = await agentBuilderService.setTriggers(agent.id, body);
      onSaved({ ...agent, ...updated });
      toast({ title: 'Changes saved', variant: 'success' });
    } catch (err) {
      toast({ title: 'Could not save', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const channelSelect = (d: Draft, required: boolean) => (
    <div>
      <label className={labelCls}>{required ? 'Channel' : 'Only in channel'}</label>
      <AppSelect label={required ? 'Channel' : 'Only in channel'} value={d.channel_id == null ? '' : String(d.channel_id)}
                 placeholder="Pick a channel"
                 onChange={(v) => patch(d.key, { channel_id: v ? Number(v) : null })}
                 options={[...(required ? [] : [{ value: '', label: 'Any channel it may answer in' }]),
                           ...textChannels.map((c) => ({ value: String(c.id), label: `# ${c.name}` }))]} />
    </div>
  );

  return (
    <div className="space-y-4">
      {drafts.length === 0 && (
        <div data-testid="trigger-picker">
          <p className="mb-3 text-sm text-muted-foreground">It does nothing until you pick at least one. Most agents start with <strong className="text-foreground">When mentioned</strong>.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {available.map((t) => {
              const TIcon = ICONS[t];
              return (
                <button key={t} type="button" onClick={() => add(t)}
                        className="flex items-start gap-3 rounded-xl border border-border bg-[hsl(var(--theme-bg-secondary))] p-4 text-left transition-colors duration-100 hover:border-primary hover:bg-[hsl(var(--theme-bg-hover))]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--theme-bg-tertiary))] text-foreground"><TIcon className="h-4 w-4" /></span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{TRIGGER_LABELS[t].label}</span>
                    <span className="block text-sm text-muted-foreground">{TRIGGER_LABELS[t].hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {drafts.map((d, i) => (
        <div key={d.key} className={`rounded-xl border border-border bg-[hsl(var(--theme-bg-secondary))] p-5 ${d.enabled ? '' : 'opacity-70'}`} data-testid={`trigger-${d.type}`}>
          <div className="flex items-start gap-3">
            <TriggerIcon type={d.type} />
            <div className="min-w-0 flex-1">
              <h4 className="text-base font-semibold text-foreground">{TRIGGER_LABELS[d.type].label}</h4>
              <p className="text-sm text-muted-foreground">{TRIGGER_LABELS[d.type].hint}</p>
            </div>
            <OnOffSwitch on={d.enabled} label={`${TRIGGER_LABELS[d.type].label} on or off`} title={d.enabled ? 'On' : 'Off'}
                         onChange={(next) => patch(d.key, { enabled: next })} />
            <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove ${TRIGGER_LABELS[d.type].label}`} title="Remove"
                    onClick={() => setDrafts((list) => list.filter((x) => x.key !== d.key))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {d.type === 'keyword' && (
              <div>
                <label className={labelCls}>Words (comma separated)</label>
                <input className={inputCls} value={d.keywordText} placeholder="fees, deadline, hostel"
                       onChange={(e) => patch(d.key, { keywordText: e.target.value })} />
              </div>
            )}

            {d.type === 'schedule' && (
              <>
                <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
                  <div>
                    <label className={labelCls}>When</label>
                    <AppSelect label="When"
                               value={CRON_PRESETS.some((p) => p.cron === d.config.cron) ? (d.config.cron as string) : CUSTOM_CRON}
                               onChange={(v) => patchConfig(d.key, { cron: v === CUSTOM_CRON ? '' : v })}
                               options={[...CRON_PRESETS.map((p) => ({ value: p.cron, label: p.label })),
                                         { value: CUSTOM_CRON, label: 'Custom (cron expression)' }]} />
                    {!CRON_PRESETS.some((p) => p.cron === d.config.cron) && (
                      <input className={`${inputCls} mt-2 font-mono`} placeholder="0 17 * * 5" value={d.config.cron ?? ''}
                             onChange={(e) => patchConfig(d.key, { cron: e.target.value })} />
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Time zone</label>
                    <AppSelect label="Time zone" value={d.config.tz || 'UTC'}
                               onChange={(v) => patchConfig(d.key, { tz: v })}
                               options={Array.from(new Set([d.config.tz || 'UTC', ...COMMON_TIME_ZONES])).map((z) => ({ value: z, label: z }))} />
                  </div>
                </div>
                {channelSelect(d, true)}
                <div>
                  <label className={labelCls}>What should it do each time?</label>
                  <textarea className={`${inputCls} min-h-[70px]`} maxLength={500} value={d.config.prompt ?? ''}
                            onChange={(e) => patchConfig(d.key, { prompt: e.target.value })} />
                  <p className={hintCls}>
                    Runs at most every 15 minutes. {d.config.delivery === 'private' ? 'It sends you a DM.' : 'It posts a new message in the channel.'}
                  </p>
                </div>
              </>
            )}

            {d.type === 'channel_message' && channelSelect(d, true)}
            {d.type === 'channel_silent' && (
              <>
                <div>
                  <label className={labelCls}>Quiet for at least</label>
                  <AppSelect label="Quiet for at least" value={String(d.config.min_minutes ?? 60)}
                             onChange={(v) => patchConfig(d.key, { min_minutes: Number(v) })}
                             options={SILENCE_CHOICES.map((c) => ({ value: String(c.minutes), label: c.label }))} />
                </div>
                {textChannels.length > 0 && channelSelect(d, false)}
              </>
            )}
            {d.type === 'focus_drift' && textChannels.length > 0 && channelSelect(d, false)}
            {(d.type === 'mention' || d.type === 'keyword') && textChannels.length > 0 && channelSelect(d, false)}
            {d.type !== 'mood_escalation' && (
            <div>
              <label className={labelCls}>Where it answers</label>
              <AppSelect label="Where it answers" value={d.config.delivery ?? 'channel'}
                         onChange={(v) => patchConfig(d.key, { delivery: v === 'private' ? 'private' : undefined })}
                         options={[{ value: 'channel', label: 'In the channel' },
                                   { value: 'private', label: `Privately, as a DM to ${privateRecipient(d.type)}` }]} />
              {d.config.delivery === 'private' && (
                <p className={hintCls}>Only reads in private: it cannot post, start polls or set reminders.</p>
              )}
            </div>
            )}
          </div>

          {problems[i].length > 0 && (
            <ul className="mt-3 space-y-0.5 text-xs text-warning">
              {problems[i].map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          <p className="mt-3 rounded-md bg-[hsl(var(--theme-bg-tertiary))] px-3 py-2 text-sm text-[hsl(var(--theme-text-secondary))]">
            <span className="font-medium text-foreground">In short: </span>{describeTrigger(withKeywords(d), channelName)}
          </p>
        </div>
      ))}

      {drafts.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-dashed border-border px-3.5 text-sm font-medium text-foreground hover:bg-[hsl(var(--theme-bg-hover))]">
              <Plus className="h-4 w-4" /> Add another way to reply
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80">
            {available.map((t) => {
              const TIcon = ICONS[t];
              return (
                <DropdownMenuItem key={t} onSelect={() => add(t)} className="items-start gap-3 py-2">
                  <TIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="block text-sm font-medium">{TRIGGER_LABELS[t].label}</span>
                    <span className="block text-xs text-muted-foreground">{TRIGGER_LABELS[t].hint}</span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {dirty && (
        <div className="-mx-4 sm:-mx-6">
          {hasProblems && <p className="px-4 text-sm text-warning sm:px-6">Fix the notes in yellow above before saving.</p>}
          <SaveBar saving={saving} onReset={() => setDrafts((agent.triggers ?? []).map(toDraft))} onSave={() => { if (!hasProblems) void save(); }} />
        </div>
      )}
    </div>
  );
};

export default TriggerEditor;
