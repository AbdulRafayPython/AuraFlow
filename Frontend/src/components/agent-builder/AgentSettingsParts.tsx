// Building blocks of the agent's manage page: a titled card, the setup checklist
// and Discord's "unsaved changes" bar.
import React from 'react';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SetupStepKey } from '@/lib/agentBuilder';

export function SettingsCard({ title, hint, action, children, className }: {
  title: string; hint?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-[hsl(var(--theme-bg-secondary))] p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SetupChecklist({ name, steps, onGo }: {
  name: string;
  steps: Array<{ key: SetupStepKey; label: string; done: boolean; optional?: boolean }>;
  onGo: (key: SetupStepKey) => void;
}) {
  const done = steps.filter((s) => s.done).length;
  return (
    <section aria-label="Get it ready" className="mb-6 rounded-xl border border-border bg-[hsl(var(--theme-bg-secondary))] p-5" data-testid="setup-checklist">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Get {name} ready</h2>
          <p className="text-sm text-muted-foreground">{done} of {steps.length} done. Follow the steps in order.</p>
        </div>
        <div className="h-2 w-28 shrink-0 overflow-hidden rounded-full bg-[hsl(var(--theme-bg-tertiary))]" aria-hidden>
          <div className="h-full rounded-full bg-success transition-[width] duration-150" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => onGo(s.key)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-100',
                s.done ? 'border-transparent bg-[hsl(var(--theme-bg-tertiary))]' : 'border-border hover:bg-[hsl(var(--theme-bg-hover))]',
              )}
            >
              <span className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                s.done ? 'bg-success text-white' : 'border border-border text-muted-foreground',
              )}>
                {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn('flex-1 text-sm font-medium', s.done ? 'text-muted-foreground line-through' : 'text-foreground')}>
                {s.label}
                {s.optional && !s.done && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>}
              </span>
              {!s.done && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Floats at the bottom while there are unsaved edits, like Discord's settings. */
export function SaveBar({ saving, onReset, onSave }: { saving: boolean; onReset: () => void; onSave: () => void }) {
  return (
    <div className="pointer-events-none sticky bottom-0 z-10 px-4 pb-4 pt-2 sm:px-6" data-testid="save-bar">
      <div
        role="region"
        aria-label="Unsaved changes"
        className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-3 rounded-lg border border-border bg-[hsl(var(--theme-bg-tertiary))] px-4 py-2.5 shadow-popover duration-150 animate-in fade-in-0 slide-in-from-bottom-2"
      >
        <p className="flex-1 text-sm font-medium text-foreground">You have unsaved changes.</p>
        <button type="button" onClick={onReset} disabled={saving}
                className="h-8 rounded-md px-3 text-sm font-medium text-foreground hover:underline disabled:opacity-50">
          Undo
        </button>
        <button type="button" onClick={onSave} disabled={saving}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-success px-3.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
        </button>
      </div>
    </div>
  );
}
