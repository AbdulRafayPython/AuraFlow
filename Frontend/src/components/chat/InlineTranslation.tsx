// Frontend/src/components/chat/InlineTranslation.tsx
//
// Renders the per-viewer auto-translation beneath a message: a compact chip
// (source → target language) plus the translated text, with a Hide/Show
// toggle. Presentation-only — translation state is owned by useAutoTranslate.

import { Languages } from 'lucide-react';
import { languageName, type TranslationState } from '@/hooks/useAutoTranslate';

interface InlineTranslationProps {
  state: TranslationState | undefined;
  targetLang: string;
  collapsed: boolean;
  onToggle: () => void;
}

const ACCENT = 'hsl(var(--agent-accent-translation))';

export default function InlineTranslation({
  state,
  targetLang,
  collapsed,
  onToggle,
}: InlineTranslationProps) {
  if (!state || state.status === 'skipped' || state.status === 'error') return null;

  if (state.status === 'loading') {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[hsl(var(--theme-text-muted))]">
        <Languages className="h-3 w-3 animate-pulse" style={{ color: ACCENT }} aria-hidden />
        <span>Translating…</span>
      </div>
    );
  }

  const target = languageName(targetLang);
  const source = languageName(state.sourceLang);
  const label = source ? `${source} → ${target}` : `Translated · ${target}`;

  return (
    <div
      className="mt-1 rounded-md border-l-2 bg-[hsl(var(--theme-bg-secondary)/0.4)] py-1 pl-2 pr-2"
      style={{ borderColor: ACCENT }}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--theme-text-muted))]">
        <Languages className="h-3 w-3 shrink-0" style={{ color: ACCENT }} aria-hidden />
        <span className="font-medium" style={{ color: ACCENT }}>
          {label}
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="ml-1 rounded px-1 text-[10px] font-medium uppercase tracking-wide transition-colors hover:text-[hsl(var(--theme-text-secondary))]"
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>
      {!collapsed && state.text && (
        <p className="mt-0.5 text-[14px] leading-[1.4] text-[hsl(var(--theme-text-primary))]">
          {state.text}
        </p>
      )}
    </div>
  );
}
