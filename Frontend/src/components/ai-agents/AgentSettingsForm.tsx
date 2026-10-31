// The settings of one built-in agent, drawn from what the server says they are.
// A personal agent saves for you; a community agent saves for the community you pick (owner or admin).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRealtime } from '@/hooks/useRealtime';
import { aiAgentService, type AgentCatalogEntry } from '@/services/aiAgentService';
import { ErrorState } from '@/components/app/EmptyState';
import {
  changedValues, problems, valuesFrom,
  type SettingField, type SettingValue, type SettingValues,
} from '@/lib/settingsSchema';
import { cn } from '@/lib/utils';

// Route ids are registry names; the catalog uses the longer ones for these two.
const CATALOG_NAMES: Record<string, string> = { mood: 'mood_tracker', knowledge: 'knowledge_builder' };

const btn = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const btnMain = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
const btnQuiet = `${btn} border border-border text-foreground hover:bg-[hsl(var(--theme-bg-hover))]`;
const inputCls = 'h-8 rounded-md border border-border bg-[hsl(var(--theme-input-bg))] px-2 text-sm text-foreground';

interface Props {
  /** The agent page's id: a registry name such as `moderation` or `mood`. */
  routeId: string;
}

const AgentSettingsForm: React.FC<Props> = ({ routeId }) => {
  const { toast } = useToast();
  const { communities, currentCommunity } = useRealtime();
  const manageable = useMemo(() => communities.filter((c) => c.role === 'owner' || c.role === 'admin'), [communities]);
  const [picked, setPicked] = useState<string | null>(null);
  const communityId = picked ?? (manageable.some((c) => c.id === currentCommunity?.id) ? currentCommunity?.id : manageable[0]?.id);
  const communityName = manageable.find((c) => c.id === communityId)?.name;

  const [fields, setFields] = useState<SettingField[] | null>(null);
  const [entry, setEntry] = useState<AgentCatalogEntry | null>(null);
  const [initial, setInitial] = useState<SettingValues>({});
  const [values, setValues] = useState<SettingValues>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const catalogName = CATALOG_NAMES[routeId] ?? routeId;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [schema, catalog] = await Promise.all([
        aiAgentService.getSettingsSchema(),
        aiAgentService.getAgentCatalog(communityId),
      ]);
      const mine = schema[routeId] ?? null;
      const found = catalog.find((a) => a.agent_type === catalogName) ?? null;
      setFields(mine);
      setEntry(found);
      const saved = found?.category === 'personal' ? found.personal_status?.settings : found?.community_status?.settings;
      const start = mine ? valuesFrom(mine, saved) : {};
      setInitial(start);
      setValues(start);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the settings');
    }
  }, [routeId, catalogName, communityId]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (fields === null && !entry) {
    return <div role="status" aria-label="Loading settings" className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!fields || fields.length === 0) {
    return <p className="text-sm text-muted-foreground">This agent has nothing to set up.</p>;
  }

  const isCommunity = entry?.category === 'community';
  const turnedOn = isCommunity ? !!entry?.community_status?.installed : !!entry?.personal_status?.activated;
  const canEdit = turnedOn && (!isCommunity || !!communityId);
  const issues = problems(fields, values);
  const changes = changedValues(initial, values);
  const dirty = Object.keys(changes).length > 0;

  const turnOn = async () => {
    if (!entry) return;
    setBusy(true);
    try {
      if (isCommunity && communityId) await aiAgentService.installCommunityAgent(communityId, entry.agent_type, {});
      else await aiAgentService.activatePersonalAgent(entry.agent_type, {});
      await load();
      toast({ title: `${entry.display_name} is on` });
    } catch (e) {
      toast({ title: 'Could not turn it on', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!entry || Object.keys(issues).length > 0) return;
    setBusy(true);
    try {
      if (isCommunity && communityId) await aiAgentService.configureCommunityAgent(communityId, entry.agent_type, changes);
      else await aiAgentService.configurePersonalAgent(entry.agent_type, changes);
      setInitial(values);
      toast({ title: 'Settings saved' });
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const set = (key: string, value: SettingValue) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <div className="space-y-4" data-testid="agent-settings">
      {isCommunity && (
        manageable.length === 0 ? (
          <p className="text-sm text-muted-foreground">Only a community owner or admin can change these.</p>
        ) : (
          manageable.length > 1 && (
            <select aria-label="Community" value={communityId} onChange={(e) => setPicked(e.target.value)} className={inputCls}>
              {manageable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )
        )
      )}

      {!turnedOn && entry && (isCommunity ? !!communityId : true) && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3">
          <p className="text-sm text-muted-foreground">
            {isCommunity ? `${entry.display_name} is not added to ${communityName ?? 'this community'} yet.` : `${entry.display_name} is not turned on for you yet.`}
          </p>
          <button type="button" className={btnMain} disabled={busy} onClick={() => void turnOn()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Turn it on
          </button>
        </div>
      )}

      <ul className={cn('divide-y divide-border rounded-lg border border-border', !canEdit && 'opacity-60')}>
        {fields.map((f) => (
          <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0 flex-1">
              <label htmlFor={`setting-${f.key}`} className="text-sm font-medium text-foreground">{f.label}</label>
              <p className="text-xs text-muted-foreground">{f.help}</p>
              {issues[f.key] && <p className="mt-0.5 text-xs text-warning" role="alert">{issues[f.key]}</p>}
            </div>

            {f.kind === 'toggle' && (
              <button
                id={`setting-${f.key}`} type="button" role="switch" aria-checked={values[f.key] === true}
                disabled={!canEdit || busy} onClick={() => set(f.key, !values[f.key])}
                className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed',
                  values[f.key] ? 'bg-primary' : 'bg-muted')}
              >
                <span className={cn('inline-block h-5 w-5 rounded-full bg-background transition-transform', values[f.key] ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
            )}

            {f.kind === 'number' && (
              <div className="flex w-52 items-center gap-3">
                <input
                  id={`setting-${f.key}`} type="range" min={f.min} max={f.max} step={f.step ?? 1}
                  value={Number(values[f.key])} disabled={!canEdit || busy}
                  onChange={(e) => set(f.key, Number(e.target.value))}
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-[hsl(var(--primary))]"
                />
                <span className="min-w-[3ch] text-right font-mono text-xs text-muted-foreground">{String(values[f.key])}</span>
              </div>
            )}

            {f.kind === 'choice' && (
              <select id={`setting-${f.key}`} className={inputCls} value={String(values[f.key])} disabled={!canEdit || busy}
                      onChange={(e) => set(f.key, e.target.value)}>
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}

            {f.kind === 'text' && (
              <input id={`setting-${f.key}`} className={cn(inputCls, 'w-28 font-mono')} value={String(values[f.key])} disabled={!canEdit || busy}
                     onChange={(e) => set(f.key, e.target.value)} />
            )}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <button type="button" className={btnMain} disabled={!canEdit || !dirty || busy || Object.keys(issues).length > 0} onClick={() => void save()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
        </button>
        <button type="button" className={btnQuiet} disabled={!dirty || busy} onClick={() => setValues(initial)}>Reset</button>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
    </div>
  );
};

export default AgentSettingsForm;
