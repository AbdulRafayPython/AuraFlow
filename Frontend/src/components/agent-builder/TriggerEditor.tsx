// When an agent wakes up: mention, keywords, schedule, new member, quiet channel, new topic, or every message in a channel.
import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import {
  COMMON_TIME_ZONES, CRON_PRESETS, CUSTOM_CRON, SILENCE_CHOICES, TRIGGER_LABELS, describeTrigger, splitKeywords, triggerProblems,
} from '@/lib/agentBuilder';
import type { AgentTrigger, BuilderAgent, TriggerType } from '@/types/agentBuilder';
import type { Channel } from '@/types';
import { btnGhost, btnPrimary, cardCls, hintCls, inputCls, labelCls } from './styles';

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
    : type === 'channel_silent' ? { min_minutes: 60 } : {};
  return toDraft({ type, channel_id: type === 'schedule' || type === 'channel_message' ? defaultChannel : null, config, enabled: true });
}

interface Props {
  agent: BuilderAgent;
  channels: Channel[];
  onSaved: (agent: BuilderAgent) => void;
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
    if ((t === 'schedule' || t === 'channel_message') && textChannels.length === 0) return false;
    return true;
  });

  const withKeywords = (d: Draft): Draft =>
    d.type === 'keyword' ? { ...d, config: { ...d.config, keywords: splitKeywords(d.keywordText) } } : d;

  const problems = drafts.map((d) => triggerProblems(withKeywords(d)));
  const hasProblems = problems.some((p) => p.length > 0);

  const save = async () => {
    setSaving(true);
    try {
      const body = drafts.map((raw) => {
        const d = withKeywords(raw);
        return { type: d.type, channel_id: d.channel_id, config: d.config, enabled: d.enabled };
      });
      const updated = await agentBuilderService.setTriggers(agent.id, body);
      onSaved({ ...agent, ...updated });
      toast({ title: 'Triggers saved' });
    } catch (err) {
      toast({ title: 'Could not save triggers', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const channelSelect = (d: Draft, required: boolean) => (
    <div>
      <label className={labelCls}>{required ? 'Channel' : 'Only in channel'}</label>
      <select className={inputCls} value={d.channel_id ?? ''}
              onChange={(e) => patch(d.key, { channel_id: e.target.value ? Number(e.target.value) : null })}>
        {!required && <option value="">Any channel it may answer in</option>}
        {required && d.channel_id == null && <option value="">Pick a channel…</option>}
        {textChannels.map((c) => <option key={c.id} value={c.id}># {c.name}</option>)}
      </select>
    </div>
  );

  return (
    <div className="space-y-4">
      {drafts.length === 0 && (
        <p className="rounded-md border border-dashed border-[hsl(var(--theme-border-default))] p-4 text-sm text-[hsl(var(--theme-text-muted))]">
          No triggers yet. An agent needs at least one before you can publish it.
        </p>
      )}

      {drafts.map((d, i) => (
        <div key={d.key} className={`${cardCls} p-4`} data-testid={`trigger-${d.type}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">{TRIGGER_LABELS[d.type].label}</h4>
              <p className={hintCls}>{TRIGGER_LABELS[d.type].hint}</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-[hsl(var(--theme-text-muted))]">
                <input type="checkbox" className="accent-[hsl(var(--theme-accent-primary))]" checked={d.enabled}
                       onChange={(e) => patch(d.key, { enabled: e.target.checked })} />
                On
              </label>
              <button type="button" className="text-[hsl(var(--theme-text-muted))] hover:text-destructive"
                      aria-label={`Remove ${TRIGGER_LABELS[d.type].label}`}
                      onClick={() => setDrafts((list) => list.filter((x) => x.key !== d.key))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
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
                    <select className={inputCls}
                            value={CRON_PRESETS.some((p) => p.cron === d.config.cron) ? d.config.cron : CUSTOM_CRON}
                            onChange={(e) => patchConfig(d.key, { cron: e.target.value === CUSTOM_CRON ? '' : e.target.value })}>
                      {CRON_PRESETS.map((p) => <option key={p.cron} value={p.cron}>{p.label}</option>)}
                      <option value={CUSTOM_CRON}>Custom (cron expression)…</option>
                    </select>
                    {!CRON_PRESETS.some((p) => p.cron === d.config.cron) && (
                      <input className={`${inputCls} mt-2 font-mono`} placeholder="0 17 * * 5" value={d.config.cron ?? ''}
                             onChange={(e) => patchConfig(d.key, { cron: e.target.value })} />
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Time zone</label>
                    <select className={inputCls} value={d.config.tz || 'UTC'}
                            onChange={(e) => patchConfig(d.key, { tz: e.target.value })}>
                      {Array.from(new Set([d.config.tz || 'UTC', ...COMMON_TIME_ZONES])).map((z) => <option key={z}>{z}</option>)}
                    </select>
                  </div>
                </div>
                {channelSelect(d, true)}
                <div>
                  <label className={labelCls}>What should it do each time?</label>
                  <textarea className={`${inputCls} min-h-[70px]`} maxLength={500} value={d.config.prompt ?? ''}
                            onChange={(e) => patchConfig(d.key, { prompt: e.target.value })} />
                  <p className={hintCls}>Runs at most every 15 minutes. It posts a new message in the channel.</p>
                </div>
              </>
            )}

            {d.type === 'channel_message' && channelSelect(d, true)}
            {d.type === 'channel_silent' && (
              <>
                <div>
                  <label className={labelCls}>Quiet for at least</label>
                  <select className={inputCls} value={d.config.min_minutes ?? 60}
                          onChange={(e) => patchConfig(d.key, { min_minutes: Number(e.target.value) })}>
                    {SILENCE_CHOICES.map((c) => <option key={c.minutes} value={c.minutes}>{c.label}</option>)}
                  </select>
                </div>
                {textChannels.length > 0 && channelSelect(d, false)}
              </>
            )}
            {d.type === 'focus_drift' && textChannels.length > 0 && channelSelect(d, false)}
            {(d.type === 'mention' || d.type === 'keyword') && textChannels.length > 0 && channelSelect(d, false)}
          </div>

          {problems[i].length > 0 && (
            <ul className="mt-3 space-y-0.5 text-xs text-warning">
              {problems[i].map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          <p className="mt-3 text-xs text-[hsl(var(--theme-text-muted))]">{describeTrigger(withKeywords(d), channelName)}</p>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Plus className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--theme-text-muted))]" />
          <select className={`${inputCls} w-auto pl-8 pr-3`} value="" aria-label="Add a trigger"
                  onChange={(e) => {
                    if (e.target.value) setDrafts((list) => [...list, emptyTrigger(e.target.value as TriggerType, textChannels[0]?.id ?? null)]);
                  }}>
            <option value="">Add a trigger…</option>
            {available.map((t) => <option key={t} value={t}>{TRIGGER_LABELS[t].label}</option>)}
          </select>
        </div>
        <button type="button" className={btnPrimary} disabled={saving || hasProblems} onClick={() => void save()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save triggers
        </button>
        <button type="button" className={btnGhost} onClick={() => setDrafts((agent.triggers ?? []).map(toDraft))}>
          Discard changes
        </button>
      </div>
    </div>
  );
};

export default TriggerEditor;
