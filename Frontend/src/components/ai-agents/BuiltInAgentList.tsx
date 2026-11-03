// The built-in agents (summarizer, moderation, mood...) in the Agents page, next to Aura.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { aiAgentService, type AgentCatalogEntry } from '@/services/aiAgentService';
import { adminService } from '@/services/adminService';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import { invalidateMentionableAgents } from '@/hooks/useMentionableAgents';
import { ConfirmDialog } from '@/components/modals/ConfirmDialog';
import AgentLogo from '@/components/ai-agents/AgentLogo';
import { ErrorState } from '@/components/app/EmptyState';
import { Icon } from '@/components/app/Icon';
import { legacyRouteId, legacyStatus, upgradePath, type UpgradePath } from '@/lib/legacyAgents';
import { AgentRow, OnOffSwitch, rowBtnQuiet } from '@/components/agents/AgentRow';

interface Props {
  /** Community whose install status to show; without one, community agents show as "Community agent". */
  communityId?: string;
  communityName?: string;
  /** Search text and the All / On / Off tab from Your agents. */
  query?: string;
  show?: 'all' | 'on' | 'off';
  /** How many rows are showing, for the section heading. */
  onCount?: (n: number) => void;
}

const BuiltInAgentList: React.FC<Props> = ({ communityId, communityName, query = '', show = 'all', onCount }) => {
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
    try {
      // Twins already made: the community's, plus your own (a Wellbeing Buddy is personal).
      const [shared, mine] = await Promise.all([
        communityId ? agentBuilderService.list({ communityId }) : Promise.resolve([]),
        agentBuilderService.list(),
      ]);
      const made = [...shared, ...mine.filter((a) => a.community_id == null)];
      setHaveTemplates(new Set(made.filter((a) => a.status !== 'archived' && a.template_key).map((a) => a.template_key as string)));
    } catch {
      setHaveTemplates(new Set());
    }
  }, [communityId]);

  useEffect(() => { void loadExisting(); }, [loadExisting]);

  const upgrade = async () => {
    if (!upgrading) return;
    const { entry, path } = upgrading;
    if (!path.personal && !communityId) return;
    setBusy(entry.agent_type);
    try {
      const agent = await agentBuilderService.create({ template: path.template, community_id: path.personal ? null : communityId,
                                                       name: path.name });
      await agentBuilderService.publish(agent.id);
      if (path.pauses === 'agent') await aiAgentService.configureCommunityAgent(communityId, entry.agent_type, {}, false);
      // The kill-switch for its own automatic posts: reports and charts keep working.
      if (path.pauses === 'nudges') await adminService.putAgentState(entry.agent_type, { community_id: communityId as unknown as number, enabled: false });
      invalidateMentionableAgents();
      await Promise.all([load(), loadExisting()]);
      const stopped = path.pauses === 'agent' ? `${entry.display_name} is paused.`
        : path.pauses === 'nudges' ? `${entry.display_name} no longer posts on its own.` : undefined;
      toast({ title: `${path.name} is on`, description: stopped, variant: 'success' });
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
      toast({ title: `${entry.display_name} is ${turnOn ? 'on' : 'paused'}`, variant: 'success' });
    } catch (e) {
      toast({ title: 'Could not change it', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const q = query.trim().toLowerCase();
  const shown = (entries ?? []).filter((entry) => {
    const s = legacyStatus(entry, communityName);
    if (show === 'on' && s.status !== 'active') return false;
    if (show === 'off' && s.status === 'active') return false;
    return !q || `${entry.display_name} ${entry.description}`.toLowerCase().includes(q);
  });
  useEffect(() => { if (entries !== null) onCount?.(shown.length); }, [entries, shown.length, onCount]);

  if (error) return <div className="mt-2"><ErrorState message={error} onRetry={() => void load()} /></div>;
  if (entries === null) {
    return <div role="status" aria-label="Loading built-in agents" className="h-24 rounded-lg animate-skeleton bg-[hsl(var(--theme-bg-tertiary))]" />;
  }

  if (shown.length === 0) return null;

  return (
    <>
    <ul aria-label="Built-in agents" data-testid="builtin-list">
      {shown.map((entry) => {
        const s = legacyStatus(entry, communityName);
        const open = () => navigate(`/agent/${legacyRouteId(entry.agent_type)}`);
        const twin = upgradePath(entry, !!communityId);
        const canUpgrade = twin && !haveTemplates.has(twin.template);
        return (
          <AgentRow
            key={entry.agent_type}
            testId="builtin-agent"
            logo={<AgentLogo name={entry.display_name} slug={entry.agent_type} builtin size="lg" />}
            status={s.status}
            name={entry.display_name}
            tag="Built in"
            statusText={s.label}
            subtitle={entry.description}
            onOpen={open}
            extra={canUpgrade ? (
              <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--theme-text-accent))] hover:underline"
                      onClick={() => setUpgrading({ entry, path: twin })}>
                <Icon icon={Sparkles} size="md" /> {twin.button}
              </button>
            ) : undefined}
            controls={
              <>
                {s.switchable && (
                  <OnOffSwitch
                    on={s.status === 'active'}
                    busy={busy === entry.agent_type}
                    label={`${entry.display_name} on or off`}
                    onChange={(next) => void toggle(entry, next)}
                  />
                )}
                <button type="button" className={rowBtnQuiet} onClick={open}>Settings</button>
              </>
            }
          />
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
