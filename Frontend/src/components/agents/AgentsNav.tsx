// Left column shared by the Agent Marketplace and Your agents (like Discord's
// Discover column): the same three places in the same order on both pages, so
// moving between them never feels like leaving. The marketplace adds its
// categories in the middle; "Create an agent" is pinned at the bottom.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, LayoutGrid, Plus, Share2 } from 'lucide-react';
import { Icon } from '@/components/app/Icon';
import { cn } from '@/lib/utils';

export type AgentsPlace = 'marketplace' | 'mine' | 'shared' | null;

export function AgentsNavItem({ label, icon, active, count, onClick }: {
  label: string; icon: React.ReactNode; active: boolean; count?: number; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors duration-100',
        active ? 'bg-[hsl(var(--theme-bg-active))] font-medium text-foreground' : 'text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground',
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs text-muted-foreground">{count}</span>}
    </button>
  );
}

export default function AgentsNav({ current, onCreate, onNavigate, sharedCount, children }: {
  current: AgentsPlace;
  onCreate: () => void;
  /** Runs before every move (the marketplace clears its search). */
  onNavigate?: () => void;
  sharedCount?: number;
  children?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const go = (to: string) => { onNavigate?.(); navigate(to); };

  return (
    <nav aria-label="Agents" className="hidden w-sidebar shrink-0 flex-col border-r border-border md:flex" style={{ background: 'var(--theme-sidebar-gradient)' }}>
      <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
        <h2 className="text-base font-semibold text-foreground">Agents</h2>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        <AgentsNavItem label="Marketplace" icon={<Icon icon={LayoutGrid} size="md" />} active={current === 'marketplace'} onClick={() => go('/agents')} />
        <AgentsNavItem label="Your agents" icon={<Icon icon={Bot} size="md" />} active={current === 'mine'} onClick={() => go('/agents/mine')} />
        <AgentsNavItem label="Shared by you" icon={<Icon icon={Share2} size="md" />} active={current === 'shared'} count={sharedCount} onClick={() => go('/agents?c=mine')} />
        {children}
      </div>
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-opacity duration-100 hover:opacity-90"
        >
          <Icon icon={Plus} size="md" /> Create an agent
        </button>
      </div>
      {/* Room for the floating user dock. */}
      <div aria-hidden className="h-[72px] shrink-0" />
    </nav>
  );
}
