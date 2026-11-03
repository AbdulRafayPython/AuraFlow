// One agent in Your agents, laid out like a row in Discord's friends list or
// server integrations: logo with a status dot, name and tag, one line about it,
// and the controls on the right (an on/off switch, Manage, and a ⋯ menu).
import React from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentStatus } from '@/types/agentBuilder';

export const DOT: Record<AgentStatus, string> = {
  active: 'bg-success',
  paused: 'bg-[hsl(var(--theme-text-muted))]',
  draft: 'bg-warning',
  archived: 'bg-destructive',
};

export const SECTION_LABEL = 'px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground';

export const rowBtn = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50';
export const rowBtnQuiet = `${rowBtn} bg-[hsl(var(--theme-bg-tertiary))] text-foreground hover:bg-[hsl(var(--theme-bg-hover))]`;
export const iconBtn = 'flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-muted-foreground transition-colors duration-100 hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

/** A real switch (role="switch"), so "on or off" is one tap and reads out loud correctly. */
export function OnOffSwitch({ on, busy, disabled, label, title, onChange }: {
  on: boolean; busy?: boolean; disabled?: boolean; label: string; title?: string; onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title ?? (on ? 'On — tap to pause' : 'Off — tap to turn on')}
      disabled={disabled || busy}
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      data-testid="agent-switch"
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60',
        on ? 'bg-success' : 'bg-[hsl(var(--theme-text-muted))]/60',
      )}
    >
      <span
        className={cn(
          'flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white transition-transform duration-150',
          on ? 'translate-x-[19px]' : 'translate-x-[3px]',
        )}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin text-[#4e5058]" />
          : on ? <Check className="h-3 w-3 text-success" strokeWidth={3} />
          : <X className="h-3 w-3 text-[#80848e]" strokeWidth={3} />}
      </span>
    </button>
  );
}

export function AgentRow({ logo, status, name, tag, statusText, subtitle, description, extra, onOpen, controls, testId }: {
  logo: React.ReactNode;
  status: AgentStatus;
  name: string;
  /** Small label next to the name ("Built in", "Community"). */
  tag?: string;
  statusText: string;
  subtitle?: React.ReactNode;
  description?: React.ReactNode;
  extra?: React.ReactNode;
  /** Opens the agent's page; without it the row is not clickable. */
  onOpen?: () => void;
  controls?: React.ReactNode;
  testId?: string;
}) {
  const body = (
    <>
      <span className="relative shrink-0">
        {logo}
        <span
          aria-hidden
          className={cn('absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[hsl(var(--theme-bg-primary))] transition-colors duration-100 group-hover:border-[hsl(var(--theme-bg-hover))]', DOT[status])}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-base font-semibold text-foreground">{name}</span>
          {tag && (
            <span className="shrink-0 rounded bg-primary px-1.5 text-xs font-semibold leading-5 text-primary-foreground">{tag}</span>
          )}
        </span>
        <span className="block truncate text-sm text-muted-foreground">
          <span className="font-medium text-[hsl(var(--theme-text-secondary))]">{statusText}</span>
          {subtitle && <> · {subtitle}</>}
        </span>
        {description && <span className="mt-0.5 line-clamp-1 text-sm text-[hsl(var(--theme-text-secondary))]">{description}</span>}
      </span>
    </>
  );

  return (
    <li
      data-testid={testId}
      className="group relative border-t border-border first:border-t-0 hover:z-[1] hover:border-transparent [&+li]:hover:border-transparent"
    >
      <div className="-mx-1 rounded-lg transition-colors duration-100 group-hover:bg-[hsl(var(--theme-bg-hover))]">
      <div className="flex items-center gap-3 px-3 py-2.5">
        {onOpen ? (
          <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {body}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
        )}
        {controls && <div className="flex shrink-0 items-center gap-2">{controls}</div>}
      </div>
      {extra && <div className="-mt-1 pb-2.5 pl-[4.5rem] pr-3">{extra}</div>}
      </div>
    </li>
  );
}
