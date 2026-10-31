// Shared class names so every Agent Builder screen looks the same.
export const inputCls =
  'w-full rounded-md border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))] ' +
  'px-3 py-2 text-sm text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))] ' +
  'outline-none focus:border-[hsl(var(--theme-accent-primary))] focus:ring-1 focus:ring-[hsl(var(--theme-accent-primary)/0.5)] ' +
  'disabled:opacity-50';

export const labelCls = 'block text-xs font-medium text-[hsl(var(--theme-text-muted))] mb-1.5';

export const hintCls = 'mt-1 text-xs text-[hsl(var(--theme-text-muted))]';

export const cardCls =
  'rounded-lg border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-primary)/0.6)]';

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ' +
  'bg-[hsl(var(--theme-accent-primary))] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';

export const btnGhost =
  'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
  'border border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-secondary))] ' +
  'hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))] disabled:opacity-50 disabled:cursor-not-allowed';

export const btnDanger =
  'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
  'border border-destructive/50 text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed';
