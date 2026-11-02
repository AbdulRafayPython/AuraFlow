// The built-in agents (summarizer, moderation, mood...) in the Agents page, next to Aura.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Pause, Play, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { aiAgentService, type AgentCatalogEntry } from '@/services/aiAgentService';
import { adminService } from '@/services/adminService';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import { invalidateMentionableAgents } from '@/hooks/useMentionableAgents';
import { ConfirmDialog } from '@/components/modals/ConfirmDialog';
import AgentLogo from '@/components/ai-agents/AgentLogo';
import { ErrorState } from '@/components/app/EmptyState';
import { Icon } from '@/components/app/Icon';
import { STATUS_STYLES } from '@/lib/agentBuilder';
import { legacyRouteId, legacyStatus, upgradePath, type UpgradePath } from '@/lib/legacyAgents';
import { cn } from '@/lib/utils';

const btn = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const btnMain = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
const btnQuiet = `${btn} border border-border text-foreground hover:bg-[hsl(var(--theme-bg-hover))]`;

interface Props {
  /** Community whose install status to show; without one, community agents show as "Community agent". */
  communityId?: string;
  communityName?: string;
}

const BuiltInAgentList: React.FC<Props> = ({ communityId, communityName }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [entries, setEntries] = useState<AgentCatalogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState<{ entry: AgentCatalogEntry; path: UpgradePath } | null>(null);
  // Templates this community already has an agent for, so the same twin is not added twice.
  const [haveTemplates, setHaveTemplates] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries(await aiAgentService.getAgentCatalog(communityId));
    } catch (e) {
      setEntries([]);
      setError(e instanceof Error ? e.message : 'Could not load the built-in agents');
    }
  }, [communityId]);

  useEffect(() => { void load(); }, [load]);

  const loadExisting = useCallback(async () => {
    if (!communityId) return setHaveTemplates(new Set());
    try {
      const list = await agentBuilderService.list({ communityId });
      setHaveTemplates(new Set(list.filter((a) => a.status !== 'archived' && a.template_key).map((a) => a.template_key as string)));
    } catch {
      setHaveTemplates(new Set());
    }
  }, [communityId]);

  useEffect(() => { void loadExisting(); }, [loadExisting]);

  const upgrade = async () => {
    if (!upgrading || !communityId) return;
    const { entry, path } = upgrading;
    setBusy(entry.agent_type);
    try {
      const agent = await agentBuilderService.create({ template: path.template, community_id: communityId, name: path.name });
      await agentBuilderService.publish(agent.id);
      if (path.pauses === 'agent') await aiAgentService.configureCommunityAgent(communityId, entry.agent_type, {}, false);
      // The kill-switch for its own automatic posts: reports and charts keep working.
      if (path.pauses === 'nudges') await adminService.putAgentState(entry.agent_type, { community_id: communityId as unknown as number, enabled: false });
      invalidateMentionableAgents();
      await Promise.all([load(), loadExisting()]);
      const stopped = path.pauses === 'agent' ? `${entry.display_name} is paused.`
        : path.pauses === 'nudges' ? `${entry.display_name} no longer posts on its own.` : undefined;
      toast({ title: `${path.name} is on`, description: stopped });
    } catch (e) {
      toast({ title: 'Could not set it up', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setBusy(null);
      setUpgrading(null);
    }
  };

  const toggle = async (entry: AgentCatalogEntry, turnOn: boolean) => {
    setBusy(entry.agent_type);
    try {
      if (entry.category === 'personal') await aiAgentService.configurePersonalAgent(entry.agent_type, {}, turnOn);
      else if (communityId) await aiAgentService.configureCommunityAgent(communityId, entry.agent_type, {}, turnOn);
      await load();
      toast({ title: `${entry.display_name} is ${turnOn ? 'on' : 'paused'}` });
    } catch (e) {
      toast({ title: 'Could not change it', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div className="mt-3"><ErrorState message={error} onRetry={() => void load()} /></div>;
  if (entries === null) {
    return <div role="status" aria-label="Loading built-in agents" className="mt-3 h-24 rounded-lg border border-border animate-skeleton" />;
  }

  return (
    <>
    <ul className="mt-3 divide-y divide-border rounded-lg border border-border" aria-label="Built-in agents" data-testid="builtin-list">
      {entries.map((entry) => {
        const s = legacyStatus(entry, communityName);
        const open = () => navigate(`/agent/${legacyRouteId(entry.agent_type)}`);
        const twin = upgradePath(entry, !!communityId);
        const canUpgrade = twin && !haveTemplates.has(twin.template);
        return (
          <li key={entry.agent_type} className="flex flex-wrap items-start gap-3 p-3 sm:flex-nowrap" data-testid="builtin-agent">
            <AgentLogo name={entry.display_name} slug={entry.agent_type} builtin size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={open} className="truncate text-base font-semibold text-foreground hover:underline">
                  {entry.display_name}
                </button>
                <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_STYLES[s.status])}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                  {s.label}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-[hsl(var(--theme-text-secondary))]">{entry.description}</p>
              {canUpgrade && (
                <button type="button" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                        onClick={() => setUpgrading({ entry, path: twin })}>
                  <Icon icon={Sparkles} size="md" /> {twin.button}
                </button>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className={btnQuiet} onClick={open}>Open</button>
              {s.switchable && (
                <button
                  type="button"
                  className={s.status === 'active' ? btnQuiet : btnMain}
                  disabled={busy === entry.agent_type}
                  onClick={() => void toggle(entry, s.status !== 'active')}
                >
                  {busy === entry.agent_type ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon icon={s.status === 'active' ? Pause : Play} size="md" />}
                  {s.status === 'active' ? 'Pause' : 'Turn on'}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
    <ConfirmDialog
      isOpen={upgrading !== null}
      title={upgrading?.path.title ?? ''}
      description={upgrading?.path.description ?? ''}
      confirmText="Set it up"
      isLoading={busy !== null}
      onConfirm={upgrade}
      onCancel={() => setUpgrading(null)}
    />
    </>
  );
};

export default BuiltInAgentList;
