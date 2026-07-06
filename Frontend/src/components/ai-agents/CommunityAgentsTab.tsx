// Frontend/src/components/ai-agents/CommunityAgentsTab.tsx
//
// F4 — Community Intelligence Hub.
//   docs/AUTONOMOUS_AGENT_FRONTEND_REDESIGN.md §7 + §16/F4.
//
// Replaces the F1-era placeholder with a calm operations console mounted
// inside CommunitySettingsModal. Six sections, top to bottom:
//
//   A. Intelligence header  — state pill + quick links
//   B. Outcome tiles        — 6 KPIs from /api/agents/metrics
//   C. Automation packs     — 5 frontend bundles toggling community agents
//   D. Channel coverage     — read-only dot matrix (per §16/F4)
//   E. Recent activity      — expanded ExplainabilityRows from /api/agents/logs
//   F. Policy drawer        — ResponsiveModal embedding AgentGoals
//
// Design constraints (F1 lockdown):
//   - 6-domain semantic accents from AgentAccent.ts. Accents tint
//     icons/chips/dots/rails only. Panel backgrounds stay neutral.
//   - 1px hairlines, no drop shadows. Depth via bg-elevated + border.
//   - Inter 13/12/11 px. JetBrains Mono for short codes.
//   - 8/12/16/24 spacing. 140ms inline / 180ms panel transitions.

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  ChevronDown,
  Loader2,
  Network,
  Power,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { useToast } from '@/hooks/use-toast';
import aiAgentService, {
  type InstalledAgent,
  type MetricsResponse,
  type ChannelCoverage,
  type AgentAction,
  type AgentDecisionLiteral,
} from '@/services/aiAgentService';
import { channelService } from '@/services/channelService';
import type { Channel } from '@/types';

import {
  ResponsiveModal,
  ResponsiveModalBody,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from '@/components/ui/responsive-modal';

import AgentGoals from '@/pages/admin/AgentGoals';
import ExplainabilityRow, {
  type ExplainabilityRowData,
} from './ExplainabilityRow';
import { humanAction } from './humanize';
import VisibilityChip from './VisibilityChip';
import {
  type AgentDomain,
  accentFor,
  accentSoftFor,
  accentVar,
  agentLabel,
  shortCode,
} from './AgentAccent';

// ────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────

interface CommunityAgentsTabProps {
  communityId: number;
  isAdmin: boolean;
  /** Community name surfaced to the embedded AgentGoals drawer. */
  communityName?: string;
}

// ────────────────────────────────────────────────────────────────────────
// Pure helpers — kept local so the Hub stays self-contained
// ────────────────────────────────────────────────────────────────────────

type IntelligenceState = 'healthy' | 'watch' | 'attention';

function deriveIntelligenceState(m: MetricsResponse | null): IntelligenceState | null {
  if (!m) return null;
  const decisions = m.autonomy.total_decisions ?? 0;
  const autonomyRatio = m.autonomy.autonomy_ratio ?? 0;
  const feedbackRatio = m.feedback.feedback_ratio ?? 0;
  const feedbackTotal = m.feedback.total ?? 0;

  if (decisions === 0) return 'attention';
  if (feedbackTotal > 10 && feedbackRatio < 0.3) return 'attention';
  if (autonomyRatio < 0.4 || feedbackRatio < 0.5) return 'watch';
  return 'healthy';
}

const STATE_DOMAIN: Record<IntelligenceState, AgentDomain> = {
  healthy: 'support',
  watch: 'focus',
  attention: 'safety',
};

const STATE_LABEL: Record<IntelligenceState, string> = {
  healthy: 'All good',
  watch: 'Keep an eye',
  attention: 'Needs a look',
};

function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const seconds = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

function findAgent(per_agent: MetricsResponse['per_agent'], name: string) {
  return per_agent.find(a => a.agent_name === name);
}

// ────────────────────────────────────────────────────────────────────────
// Automation packs — pure frontend grouping (§7.3.C)
// ────────────────────────────────────────────────────────────────────────

interface Pack {
  id: string;
  label: string;
  domain: AgentDomain;
  description: string;
  agents: string[]; // agent_type values
}

const PACKS: Pack[] = [
  {
    id: 'safe',
    label: 'Safe Community',
    domain: 'safety',
    description: 'Moderation + drift detection so violations are caught and policy stays consistent.',
    agents: ['moderation', 'focus'],
  },
  {
    id: 'study',
    label: 'Study Group',
    domain: 'support',
    description: 'Recaps, knowledge capture, peer support, and focus signals for learning channels.',
    agents: ['summarizer', 'support', 'knowledge_builder', 'focus'],
  },
  {
    id: 'multilingual',
    label: 'Multilingual Community',
    domain: 'translation',
    description: 'Translation relay plus an assistant that matches each member’s language.',
    agents: ['translator', 'assistant'],
  },
  {
    id: 'welcome',
    label: 'Newcomer Welcome',
    domain: 'community',
    description: 'Auto welcome messages and starter prompts for first-week members.',
    agents: ['auto_message', 'support'],
  },
  {
    id: 'recovery',
    label: 'Quiet Channel Recovery',
    domain: 'community',
    description: 'Re-engages quiet channels with icebreakers and short catch-up summaries.',
    agents: ['engagement', 'summarizer'],
  },
];

type PackState = 'all-on' | 'partial' | 'off';

function packStateFor(pack: Pack, installed: Map<string, InstalledAgent>): PackState {
  const enabledMembers = pack.agents.filter(a => installed.get(a)?.enabled).length;
  if (enabledMembers === 0) return 'off';
  if (enabledMembers === pack.agents.length) return 'all-on';
  return 'partial';
}

const PACK_STATE_DOMAIN: Record<PackState, AgentDomain> = {
  'all-on': 'support',
  partial: 'focus',
  off: 'safety',
};

const PACK_STATE_LABEL: Record<PackState, string> = {
  'all-on': 'All on',
  partial: 'Partial',
  off: 'Off',
};

// ────────────────────────────────────────────────────────────────────────
// Channel coverage matrix (§7.3.D)
// ────────────────────────────────────────────────────────────────────────

interface CoverageColumn {
  key: string;
  label: string;
  agent: string; // agent_type backing this capability
}

const COVERAGE_COLUMNS: CoverageColumn[] = [
  { key: 'mod', label: 'Moderation', agent: 'moderation' },
  { key: 'sup', label: 'Support', agent: 'support' },
  { key: 'sum', label: 'Summaries', agent: 'summarizer' },
  { key: 'foc', label: 'Focus', agent: 'focus' },
  { key: 'eng', label: 'Engagement', agent: 'engagement' },
  { key: 'tra', label: 'Translation', agent: 'translator' },
];

// ────────────────────────────────────────────────────────────────────────
// Section A — Intelligence header
// ────────────────────────────────────────────────────────────────────────

function IntelligenceHeader({
  state,
  metrics,
  installedCount,
  lastActionAt,
  isAdmin,
  loading,
  error,
  onRetry,
  onOpenPolicies,
  onJumpToActivity,
}: {
  state: IntelligenceState | null;
  metrics: MetricsResponse | null;
  installedCount: number;
  lastActionAt: string | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenPolicies: () => void;
  onJumpToActivity: () => void;
}) {
  const domain: AgentDomain = state ? STATE_DOMAIN[state] : 'community';
  const stateLabel = state ? STATE_LABEL[state] : 'Loading';

  return (
    <header
      className={
        'rounded-lg border border-[hsl(var(--theme-border-default))] ' +
        'bg-[hsl(var(--theme-bg-elevated))] px-3 py-3'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--theme-text-muted))]">
            Community AI
          </p>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-[hsl(var(--theme-text-primary))]">
              AI Helpers
            </h2>
            {/* State pill */}
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
              style={{
                borderColor: state ? `hsl(var(${accentVar(domain)}) / 0.45)` : undefined,
                color: state ? `hsl(var(${accentVar(domain)}))` : undefined,
                backgroundColor: state ? `hsl(var(${accentVar(domain)}) / 0.08)` : undefined,
              }}
              aria-label={`Intelligence state: ${stateLabel}`}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: state ? `hsl(var(${accentVar(domain)}))` : 'currentColor' }}
              />
              {loading ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading
                </span>
              ) : (
                stateLabel
              )}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))]">
            {installedCount} helper{installedCount === 1 ? '' : 's'} turned on ·{' '}
            <span title={lastActionAt ?? ''}>last active {relativeTime(lastActionAt)}</span>
            {metrics && (
              <>
                {' '}· {metrics.autonomy.total_decisions} action
                {metrics.autonomy.total_decisions === 1 ? '' : 's'} in the last {metrics.window_days} days
              </>
            )}
          </p>
        </div>

        {/* Quick actions — admins only */}
        {isAdmin && (
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={onJumpToActivity}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-[hsl(var(--theme-text-secondary))] transition-colors [transition-duration:140ms] hover:text-[hsl(var(--theme-text-primary))]"
            >
              <Activity className="h-3.5 w-3.5" aria-hidden />
              See what they did
            </button>
            <button
              type="button"
              onClick={onOpenPolicies}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-[hsl(var(--theme-text-secondary))] transition-colors [transition-duration:140ms] hover:text-[hsl(var(--theme-text-primary))]"
            >
              <Sliders className="h-3.5 w-3.5" aria-hidden />
              Adjust rules
            </button>
            <Link
              to="/system-admin/analytics/agent-collaboration"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-[hsl(var(--theme-text-secondary))] transition-colors [transition-duration:140ms] hover:text-[hsl(var(--theme-text-primary))]"
            >
              <Network className="h-3.5 w-3.5" aria-hidden />
              How they work together
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-[hsl(var(--theme-text-muted))]">
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
          <span>Couldn't load helper activity.</span>
          <button
            type="button"
            onClick={onRetry}
            className="underline underline-offset-2 transition-colors hover:text-[hsl(var(--theme-text-secondary))]"
          >
            Retry
          </button>
        </div>
      )}
    </header>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Section B — Outcome tiles
// ────────────────────────────────────────────────────────────────────────

interface OutcomeTileData {
  key: string;
  label: string;
  agent: string;
  value: number | string;
  caption: string;
}

function OutcomeTile({ tile, hasData }: { tile: OutcomeTileData; hasData: boolean }) {
  const accent = accentFor(tile.agent);
  return (
    <div
      className={
        'rounded-lg border border-[hsl(var(--theme-border-default))] ' +
        'bg-[hsl(var(--theme-bg-elevated))] px-3 py-3'
      }
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <p className="truncate text-[12px] font-medium text-[hsl(var(--theme-text-primary))]">
          {tile.label}
        </p>
      </div>
      <p className="mt-2 text-[20px] font-semibold tabular-nums text-[hsl(var(--theme-text-primary))]">
        {hasData ? tile.value : '—'}
      </p>
      <p className="mt-0.5 text-[11px] leading-4 text-[hsl(var(--theme-text-muted))]">
        {hasData ? tile.caption : 'No data yet'}
      </p>
    </div>
  );
}

function OutcomeTiles({
  metrics,
  installed,
  loading,
}: {
  metrics: MetricsResponse | null;
  installed: Map<string, InstalledAgent>;
  loading: boolean;
}) {
  const tiles = useMemo<OutcomeTileData[]>(() => {
    const mod = metrics ? findAgent(metrics.per_agent, 'moderation') : undefined;
    const eng = metrics ? findAgent(metrics.per_agent, 'engagement') : undefined;
    const welcome = metrics ? findAgent(metrics.per_agent, 'auto_message') : undefined;
    const sup = metrics ? findAgent(metrics.per_agent, 'support') : undefined;
    const foc = metrics ? findAgent(metrics.per_agent, 'focus') : undefined;
    const sum = metrics ? findAgent(metrics.per_agent, 'summarizer') : undefined;
    const window = metrics?.window_days ?? 7;

    return [
      {
        key: 'safety',
        label: 'Kept things safe',
        agent: 'moderation',
        value: mod?.acts ?? 0,
        caption: `Messages moderated · last ${window} days`,
      },
      {
        key: 'engagement',
        label: 'Sparked conversation',
        agent: 'engagement',
        value: (eng?.acts ?? 0) + (welcome?.acts ?? 0),
        caption: `Icebreakers & welcomes · last ${window} days`,
      },
      {
        key: 'support',
        label: 'Questions waiting',
        agent: 'support',
        value: (sup?.defers ?? 0) + (sup?.skips ?? 0),
        caption: `Couldn’t answer on their own · last ${window} days`,
      },
      {
        key: 'focus',
        label: 'Kept chats on track',
        agent: 'focus',
        value: foc?.acts ?? 0,
        caption: `Off-topic nudges · last ${window} days`,
      },
      {
        key: 'welcome',
        label: 'Welcomed newcomers',
        agent: 'auto_message',
        value: welcome?.acts ?? 0,
        caption: `Welcome messages sent · last ${window} days`,
      },
      {
        key: 'recap',
        label: 'Last recap',
        agent: 'summarizer',
        value: installed.get('summarizer')?.last_active
          ? relativeTime(installed.get('summarizer')?.last_active)
          : sum
            ? `${sum.acts}`
            : '—',
        caption: installed.get('summarizer')?.last_active
          ? 'Most recent summary'
          : `Summaries · last ${window} days`,
      },
    ];
  }, [metrics, installed]);

  if (loading && !metrics) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[88px] animate-pulse rounded-lg border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-elevated))]"
          />
        ))}
      </div>
    );
  }

  const hasData = !!metrics && metrics.autonomy.total_decisions > 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {tiles.map(tile => (
        <OutcomeTile key={tile.key} tile={tile} hasData={hasData} />
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Section C — Automation pack cards
// ────────────────────────────────────────────────────────────────────────

function PackCard({
  pack,
  installed,
  isAdmin,
  busy,
  onToggle,
}: {
  pack: Pack;
  installed: Map<string, InstalledAgent>;
  isAdmin: boolean;
  busy: boolean;
  onToggle: (pack: Pack, enable: boolean) => void;
}) {
  const state = packStateFor(pack, installed);
  const stateDomain = PACK_STATE_DOMAIN[state];
  const railColor = `hsl(var(${accentVar(pack.domain)}))`;

  const targetEnable = state !== 'all-on';

  return (
    <div
      className={
        'relative overflow-hidden rounded-lg border border-[hsl(var(--theme-border-default))] ' +
        'bg-[hsl(var(--theme-bg-elevated))]'
      }
    >
      {/* Left accent rail */}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-[2px]"
        style={{ backgroundColor: railColor }}
      />
      <div className="flex items-start justify-between gap-3 px-3 py-3 pl-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-semibold text-[hsl(var(--theme-text-primary))]">
              {pack.label}
            </p>
            {/* Pack state pill */}
            <span
              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                borderColor: `hsl(var(${accentVar(stateDomain)}) / 0.4)`,
                color: `hsl(var(${accentVar(stateDomain)}))`,
                backgroundColor: `hsl(var(${accentVar(stateDomain)}) / 0.08)`,
              }}
            >
              {PACK_STATE_LABEL[state]}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))]">
            {pack.description}
          </p>
          {/* Member agent chips */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {pack.agents.map(a => {
              const enabled = installed.get(a)?.enabled === true;
              return (
                <span
                  key={a}
                  className={
                    'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tracking-normal transition-opacity [transition-duration:140ms] ' +
                    (enabled ? '' : 'opacity-50')
                  }
                  style={{
                    borderColor: 'hsl(var(--theme-border-default))',
                    color: 'hsl(var(--theme-text-secondary))',
                    backgroundColor: accentSoftFor(a, enabled ? 0.1 : 0.04),
                  }}
                  title={`${agentLabel(a)} (${shortCode(a)}) · ${enabled ? 'enabled' : installed.get(a) ? 'disabled' : 'not installed'}`}
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: accentFor(a) }}
                  />
                  {agentLabel(a)}
                </span>
              );
            })}
          </div>
        </div>

        {isAdmin && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onToggle(pack, targetEnable)}
            className={
              'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors [transition-duration:140ms] ' +
              'border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))] ' +
              'disabled:cursor-not-allowed disabled:opacity-50'
            }
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Power className="h-3.5 w-3.5" aria-hidden />
            )}
            {targetEnable ? 'Enable pack' : 'Disable pack'}
          </button>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Section D — Channel coverage matrix
// ────────────────────────────────────────────────────────────────────────

function CoverageMatrix({
  channels,
  installed,
  coverage,
  coverageBusy,
  isAdmin,
  loading,
  onToggleCell,
}: {
  channels: Channel[];
  installed: Map<string, InstalledAgent>;
  coverage: ChannelCoverage;
  coverageBusy: Record<string, boolean>;
  isAdmin: boolean;
  loading: boolean;
  onToggleCell: (channelId: number, agentType: string, nextEnabled: boolean) => void;
}) {
  if (loading) {
    return (
      <div className="h-32 animate-pulse rounded-lg border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-elevated))]" />
    );
  }

  if (channels.length === 0) {
    return (
      <div
        className={
          'rounded-lg border border-dashed border-[hsl(var(--theme-border-default))] ' +
          'px-3 py-4 text-center text-[12px] text-[hsl(var(--theme-text-muted))]'
        }
      >
        This community doesn't have any channels yet.
      </div>
    );
  }

  return (
    <div
      className={
        'overflow-hidden rounded-lg border border-[hsl(var(--theme-border-default))] ' +
        'bg-[hsl(var(--theme-bg-elevated))]'
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-[hsl(var(--theme-border-default))]">
              <th className="sticky left-0 z-10 bg-[hsl(var(--theme-bg-elevated))] px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--theme-text-muted))]">
                Channel
              </th>
              {COVERAGE_COLUMNS.map(col => (
                <th
                  key={col.key}
                  className="px-2 py-2 text-center text-[11px] font-medium text-[hsl(var(--theme-text-secondary))]"
                  title={`${col.label} (${agentLabel(col.agent)})`}
                >
                  <span className="inline-flex items-center gap-1">
                    <span
                      aria-hidden
                      className="h-1 w-1 rounded-full"
                      style={{ backgroundColor: accentFor(col.agent) }}
                    />
                    {col.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {channels.map(ch => (
              <tr
                key={ch.id}
                className="border-b border-[hsl(var(--theme-border-default))] last:border-b-0"
              >
                <td className="sticky left-0 bg-[hsl(var(--theme-bg-elevated))] px-3 py-2 text-[12px] text-[hsl(var(--theme-text-primary))]">
                  <span className="text-[hsl(var(--theme-text-muted))]">#</span>
                  {ch.name}
                </td>
                {COVERAGE_COLUMNS.map(col => {
                  const agent = installed.get(col.agent);
                  const installedAndEnabled = agent?.enabled === true;
                  const present = !!agent;
                  const lastActive = agent?.last_active ?? null;
                  const accent = accentFor(col.agent);

                  // G1a override resolution.
                  // override === undefined  → inherit community-level (installedAndEnabled).
                  // override === boolean    → row in community_channel_agents wins.
                  const override = coverage[ch.id]?.[col.agent];
                  const effectiveEnabled =
                    override !== undefined ? override : installedAndEnabled;
                  const hasOverride = override !== undefined;
                  const busyKey = `${ch.id}:${col.agent}`;
                  const busy = !!coverageBusy[busyKey];

                  // Admins can flip cells whose agent is installed in the
                  // community. Cells for uninstalled agents stay as a passive
                  // dashed ring so we don't pretend a write would work.
                  const interactive = isAdmin && present;

                  const baseTitle = !present
                    ? `${agentLabel(col.agent)} not installed`
                    : effectiveEnabled
                      ? `${agentLabel(col.agent)} enabled${hasOverride ? ' (per-channel override)' : ' community-wide'} · last action ${relativeTime(lastActive)}`
                      : `${agentLabel(col.agent)} disabled${hasOverride ? ' on this channel' : ' community-wide'}`;
                  const clickHint = interactive
                    ? effectiveEnabled
                      ? ` · Click to disable on #${ch.name}`
                      : ` · Click to enable on #${ch.name}`
                    : '';

                  const dotStyle: CSSProperties = effectiveEnabled
                    ? { backgroundColor: accent, border: `1px solid ${accent}` }
                    : present
                      ? {
                          backgroundColor: 'transparent',
                          border: '1px solid hsl(var(--theme-border-default))',
                        }
                      : {
                          backgroundColor: 'transparent',
                          border: '1px dashed hsl(var(--theme-border-default))',
                          opacity: 0.4,
                        };

                  return (
                    <td key={col.key} className="px-2 py-2 text-center">
                      {interactive ? (
                        <button
                          type="button"
                          title={baseTitle + clickHint}
                          aria-label={baseTitle + clickHint}
                          aria-pressed={effectiveEnabled}
                          disabled={busy}
                          onClick={() => onToggleCell(ch.id, col.agent, !effectiveEnabled)}
                          className={
                            'relative inline-flex h-5 w-5 items-center justify-center ' +
                            'rounded transition-colors [transition-duration:140ms] ' +
                            'hover:bg-[hsl(var(--theme-bg-primary)/0.4)] ' +
                            'disabled:cursor-progress disabled:opacity-60 ' +
                            'focus:outline-none focus-visible:ring-1 ' +
                            'focus-visible:ring-[hsl(var(--theme-border-strong,var(--theme-border-default)))]'
                          }
                        >
                          <span
                            aria-hidden
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={dotStyle}
                          />
                          {hasOverride && (
                            <span
                              aria-hidden
                              title="Per-channel override"
                              className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full"
                              style={{ backgroundColor: accent }}
                            />
                          )}
                        </button>
                      ) : (
                        <span
                          title={baseTitle}
                          aria-label={baseTitle}
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={dotStyle}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[hsl(var(--theme-border-default))] px-3 py-2 text-[11px] leading-4 text-[hsl(var(--theme-text-muted))]">
        {isAdmin
          ? 'Tap a dot to turn a helper on or off for just one channel. A small mark shows where a channel differs from the community setting.'
          : 'This shows the community-wide setting for each helper.'}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Section E — Recent activity
// ────────────────────────────────────────────────────────────────────────

// G1b — filter chips align with the agent_actions.decision enum (act/defer/skip)
// rather than the legacy ai_agent_logs status (success/error). 'all' omits the
// `decision` query param.
type ActivityFilter = 'all' | AgentDecisionLiteral;

function actionToRow(action: AgentAction): ExplainabilityRowData {
  // agent_actions has no verb column, so derive a plain-English title + detail
  // from (agent, decision, reason) via the shared humanizer — the same copy
  // every other agent surface uses. This turns "mood_tracker"/"act"/
  // "warming_window_1/5" into "Updated your private mood timeline" instead of
  // the old "Moodded tracker act".
  const human = humanAction(action.agent_name, action.decision, action.reason);
  const scope =
    action.channel_id != null
      ? `Channel #${action.channel_id}`
      : action.user_id != null
        ? 'A member'
        : 'This community';
  return {
    agent: action.agent_name,
    decision: action.decision,
    title: human.title,
    reason: human.detail,
    scope,
    visibility: 'admins-only',
    correlationId: action.correlation_id,
    createdAt: action.created_at ?? undefined,
  };
}

function RecentActivity({
  actions,
  loading,
  filter,
  onFilterChange,
}: {
  actions: AgentAction[];
  loading: boolean;
  filter: ActivityFilter;
  onFilterChange: (f: ActivityFilter) => void;
}) {
  const filters: { key: ActivityFilter; label: string }[] = [
    { key: 'all',   label: 'Everything' },
    { key: 'act',   label: 'Took action' },
    { key: 'defer', label: 'Held for review' },
    { key: 'skip',  label: 'Left alone' },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {filters.map(f => {
          const active = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => onFilterChange(f.key)}
              className={
                'inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium transition-colors [transition-duration:140ms] ' +
                (active
                  ? 'border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-primary))]'
                  : 'border-transparent text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-secondary))]')
              }
            >
              {f.label}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-[hsl(var(--theme-text-muted))]">
          Showing the last 25
        </span>
      </div>

      <div
        className={
          'overflow-hidden rounded-lg border border-[hsl(var(--theme-border-default))] ' +
          'bg-[hsl(var(--theme-bg-elevated))]'
        }
      >
        {loading ? (
          <div className="divide-y divide-[hsl(var(--theme-border-default))]">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[84px] animate-pulse" />
            ))}
          </div>
        ) : actions.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-[hsl(var(--theme-text-muted))]">
            Your helpers are on, but nothing needed attention today.
          </div>
        ) : (
          actions.map(action => (
            <ExplainabilityRow
              key={action.id}
              row={actionToRow(action)}
              density="expanded"
              // has_feedback gates the vote buttons via the standard
              // ExplainabilityRow flow. We pass 'positive' as a stand-in
              // signal because the persisted choice isn't echoed back —
              // the buttons go disabled either way, which is the goal.
              voted={action.has_feedback ? 'positive' : null}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Top-level component
// ────────────────────────────────────────────────────────────────────────

export default function CommunityAgentsTab({
  communityId,
  isAdmin,
  communityName,
}: CommunityAgentsTabProps) {
  const { toast } = useToast();

  // ── Metrics
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  // ── Installed agents
  const [installedList, setInstalledList] = useState<InstalledAgent[]>([]);
  const [installedLoading, setInstalledLoading] = useState(true);

  // ── Channels
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);

  // ── Per-channel coverage overrides (G1a)
  const [coverage, setCoverage] = useState<ChannelCoverage>({});
  const [coverageBusy, setCoverageBusy] = useState<Record<string, boolean>>({});

  // ── Activity — Section E reads agent_actions (G1b), not ai_agent_logs.
  // Real correlation_ids so ExplainabilityRow feedback votes persist.
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');

  // ── Drawer
  const [policiesOpen, setPoliciesOpen] = useState(false);

  // ── Per-pack busy state
  const [packBusy, setPackBusy] = useState<Record<string, boolean>>({});

  // ────────────────────────────────────────────────────────────────────
  // Loaders
  // ────────────────────────────────────────────────────────────────────

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const m = await aiAgentService.getAgentMetrics({ days: 7, community_id: communityId });
      setMetrics(m);
    } catch (err) {
      console.error('[CommunityIntelHub] metrics error', err);
      setMetricsError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setMetricsLoading(false);
    }
  }, [communityId]);

  const loadInstalled = useCallback(async () => {
    setInstalledLoading(true);
    try {
      const list = await aiAgentService.getCommunityAgentStatus(communityId);
      setInstalledList(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('[CommunityIntelHub] installed error', err);
      setInstalledList([]);
    } finally {
      setInstalledLoading(false);
    }
  }, [communityId]);

  const loadChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const list = await channelService.getCommunityChannels(communityId);
      setChannels(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('[CommunityIntelHub] channels error', err);
      setChannels([]);
    } finally {
      setChannelsLoading(false);
    }
  }, [communityId]);

  const loadCoverage = useCallback(async () => {
    try {
      const map = await aiAgentService.getChannelCoverage(communityId);
      setCoverage(map);
    } catch (err) {
      // Coverage is purely additive — failure leaves the matrix inheriting
      // community-level state, which is exactly the no-override behaviour.
      console.warn('[CommunityIntelHub] coverage error', err);
      setCoverage({});
    }
  }, [communityId]);

  /**
   * G1a — flip a per-channel override.
   *
   * Optimistic: we update the local map first, fire the PUT, and roll back +
   * toast on error. The unique busy key (`${channelId}:${agentType}`) ensures
   * the same cell can't be double-clicked while in flight, but other cells
   * remain interactive.
   */
  const handleToggleCoverage = useCallback(async (
    channelId: number,
    agentType: string,
    nextEnabled: boolean,
  ) => {
    const busyKey = `${channelId}:${agentType}`;
    if (coverageBusy[busyKey]) return;

    setCoverageBusy(prev => ({ ...prev, [busyKey]: true }));

    // Snapshot for rollback. We capture `undefined` when no override existed
    // so rollback restores "inherit from community" rather than a stale value.
    const prevCell = coverage[channelId]?.[agentType];

    setCoverage(prev => {
      const channelMap = { ...(prev[channelId] ?? {}) };
      channelMap[agentType] = nextEnabled;
      return { ...prev, [channelId]: channelMap };
    });

    try {
      await aiAgentService.configureChannelAgent(
        communityId, channelId, agentType, nextEnabled,
      );
    } catch (err) {
      // Roll back the optimistic flip.
      setCoverage(prev => {
        const channelMap = { ...(prev[channelId] ?? {}) };
        if (prevCell === undefined) {
          delete channelMap[agentType];
        } else {
          channelMap[agentType] = prevCell;
        }
        // Drop the channel key entirely when it has no remaining overrides
        // so callers see the same shape they would from a fresh GET.
        const next = { ...prev };
        if (Object.keys(channelMap).length === 0) {
          delete next[channelId];
        } else {
          next[channelId] = channelMap;
        }
        return next;
      });
      toast({
        title: 'Override failed',
        description: err instanceof Error ? err.message : 'Could not save the channel override.',
        variant: 'destructive',
      });
    } finally {
      setCoverageBusy(prev => {
        const next = { ...prev };
        delete next[busyKey];
        return next;
      });
    }
  }, [communityId, coverage, coverageBusy, toast]);

  const loadActions = useCallback(async (filter: ActivityFilter) => {
    setActionsLoading(true);
    try {
      const list = await aiAgentService.getAgentActions({
        community_id: communityId,
        limit: 25,
        ...(filter !== 'all' ? { decision: filter } : {}),
      });
      setActions(list);
    } catch (err) {
      console.error('[CommunityIntelHub] actions error', err);
      setActions([]);
    } finally {
      setActionsLoading(false);
    }
  }, [communityId]);

  // Initial fan-out — each section loads independently.
  useEffect(() => {
    void loadMetrics();
    void loadInstalled();
    void loadChannels();
    void loadCoverage();
  }, [loadMetrics, loadInstalled, loadChannels, loadCoverage]);

  useEffect(() => {
    void loadActions(activityFilter);
  }, [loadActions, activityFilter]);

  // ────────────────────────────────────────────────────────────────────
  // Derived state
  // ────────────────────────────────────────────────────────────────────

  const installedMap = useMemo(() => {
    const m = new Map<string, InstalledAgent>();
    for (const a of installedList) m.set(a.agent_type, a);
    return m;
  }, [installedList]);

  const installedCount = useMemo(
    () => installedList.filter(a => a.enabled).length,
    [installedList],
  );

  const lastActionAt = useMemo(() => {
    let max: string | null = null;
    for (const a of installedList) {
      const t = a.last_active ?? null;
      if (!t) continue;
      if (!max || new Date(t).getTime() > new Date(max).getTime()) max = t;
    }
    return max;
  }, [installedList]);

  const state = useMemo(() => deriveIntelligenceState(metrics), [metrics]);

  // ────────────────────────────────────────────────────────────────────
  // Pack toggle — fan out install + configure with optimistic UI
  // ────────────────────────────────────────────────────────────────────

  const togglePack = useCallback(
    async (pack: Pack, enable: boolean) => {
      setPackBusy(prev => ({ ...prev, [pack.id]: true }));

      // Optimistic flip
      setInstalledList(prev => {
        const next = [...prev];
        for (const agentType of pack.agents) {
          const idx = next.findIndex(a => a.agent_type === agentType);
          if (idx >= 0) {
            next[idx] = { ...next[idx], enabled: enable };
          }
        }
        return next;
      });

      const results = await Promise.allSettled(
        pack.agents.map(async agentType => {
          const cur = installedMap.get(agentType);
          if (!cur) {
            // Not installed — install first, then ensure enabled state.
            await aiAgentService.installCommunityAgent(communityId, agentType);
            if (!enable) {
              await aiAgentService.configureCommunityAgent(communityId, agentType, {}, false);
            }
          } else {
            // Toggle only flips the `enabled` flag — send an empty settings
            // patch so we don't re-submit the stored defaults (whose registry
            // keys aren't in the configure-endpoint whitelist and would 400).
            await aiAgentService.configureCommunityAgent(communityId, agentType, {}, enable);
          }
        }),
      );

      const failed = results.filter(r => r.status === 'rejected');
      setPackBusy(prev => ({ ...prev, [pack.id]: false }));

      if (failed.length > 0) {
        toast({
          title: `Couldn't ${enable ? 'enable' : 'disable'} ${pack.label}`,
          description: `${failed.length} of ${pack.agents.length} agent change(s) failed. Refreshing state.`,
          variant: 'destructive',
        });
        void loadInstalled();
      } else {
        toast({
          title: `${pack.label} ${enable ? 'enabled' : 'disabled'}`,
          description: `${pack.agents.length} agent${pack.agents.length === 1 ? '' : 's'} updated for this community.`,
        });
        // Refresh authoritative state — settings/last_active may have changed.
        void loadInstalled();
      }
    },
    [communityId, installedMap, loadInstalled, toast],
  );

  // ────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <IntelligenceHeader
        state={state}
        metrics={metrics}
        installedCount={installedCount}
        lastActionAt={lastActionAt}
        isAdmin={isAdmin}
        loading={metricsLoading || installedLoading}
        error={metricsError}
        onRetry={() => void loadMetrics()}
        onOpenPolicies={() => setPoliciesOpen(true)}
        onJumpToActivity={() => {
          const el = document.getElementById('community-hub-activity');
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />

      {!isAdmin && (
        <p className="rounded-md border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))] px-3 py-2 text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))]">
          Members can see what the helpers are doing. Only admins can change the rules or turn bundles on and off.
        </p>
      )}

      {/* Section B — outcome tiles */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[hsl(var(--theme-text-primary))]">
            At a glance
          </h3>
          <VisibilityChip visibility="admins-only" />
        </div>
        <OutcomeTiles metrics={metrics} installed={installedMap} loading={metricsLoading} />
      </section>

      {/* Section C — automation packs */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[hsl(var(--theme-text-primary))]">
            Helper bundles
          </h3>
          <span className="text-[11px] text-[hsl(var(--theme-text-muted))]">
            Turn related helpers on or off together
          </span>
        </div>
        <div className="space-y-2">
          {PACKS.map(pack => (
            <PackCard
              key={pack.id}
              pack={pack}
              installed={installedMap}
              isAdmin={isAdmin}
              busy={!!packBusy[pack.id]}
              onToggle={togglePack}
            />
          ))}
        </div>
      </section>

      {/* Section D — channel coverage */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[hsl(var(--theme-text-primary))]">
            Where helpers are active
          </h3>
          <span className="text-[11px] text-[hsl(var(--theme-text-muted))]">
            {channels.length} channel{channels.length === 1 ? '' : 's'}
          </span>
        </div>
        <CoverageMatrix
          channels={channels}
          installed={installedMap}
          coverage={coverage}
          coverageBusy={coverageBusy}
          isAdmin={isAdmin}
          loading={channelsLoading || installedLoading}
          onToggleCell={handleToggleCoverage}
        />
      </section>

      {/* Section E — recent activity */}
      <section id="community-hub-activity" className="space-y-3 scroll-mt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[hsl(var(--theme-text-primary))]">
            What happened recently
          </h3>
          <VisibilityChip visibility="admins-only" />
        </div>
        <RecentActivity
          actions={actions}
          loading={actionsLoading}
          filter={activityFilter}
          onFilterChange={setActivityFilter}
        />
      </section>

      {/* Section F trigger — policy drawer */}
      {isAdmin && (
        <button
          type="button"
          onClick={() => setPoliciesOpen(true)}
          className={
            'group inline-flex w-full items-center justify-between gap-3 rounded-lg border ' +
            'border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-elevated))] ' +
            'px-3 py-3 text-left transition-colors [transition-duration:140ms] ' +
            'hover:bg-[hsl(var(--theme-bg-hover))] focus:outline-none focus-visible:bg-[hsl(var(--theme-bg-hover))]'
          }
        >
          <span className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[hsl(var(--theme-text-secondary))]" aria-hidden />
            <span className="flex flex-col">
              <span className="text-[13px] font-medium text-[hsl(var(--theme-text-primary))]">
                Rules &amp; limits
              </span>
              <span className="text-[11px] leading-4 text-[hsl(var(--theme-text-muted))]">
                Quiet hours, what needs your approval, how strict to be, and an on/off switch for each helper.
              </span>
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-[hsl(var(--theme-text-muted))] group-hover:text-[hsl(var(--theme-text-primary))]" aria-hidden />
        </button>
      )}

      {/* Section F — policy drawer */}
      {isAdmin && (
        <ResponsiveModal open={policiesOpen} onOpenChange={setPoliciesOpen}>
          <ResponsiveModalContent size="2xl">
            <ResponsiveModalHeader>
              <ResponsiveModalTitle>Rules &amp; limits</ResponsiveModalTitle>
            </ResponsiveModalHeader>
            <ResponsiveModalBody>
              <AgentGoals
                communityId={communityId}
                communityName={communityName}
                embedded
              />
            </ResponsiveModalBody>
          </ResponsiveModalContent>
        </ResponsiveModal>
      )}
    </div>
  );
}
