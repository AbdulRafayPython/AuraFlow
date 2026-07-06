// Frontend/src/components/chat/LanguageMenu.tsx
//
// Header control that sets the viewer's auto-translate language. Persisted by
// the parent (localStorage). 'off' disables autonomous inline translation.

import { useEffect, useRef, useState } from 'react';
import { Globe, Check } from 'lucide-react';
import { TRANSLATE_LANGUAGES } from '@/hooks/useAutoTranslate';

interface LanguageMenuProps {
  value: string; // language code, or 'off'
  onChange: (value: string) => void;
}

export default function LanguageMenu({ value, onChange }: LanguageMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const active = value !== 'off';
  const shortLabel = value === 'off' ? 'Off' : value.split('-')[0].toUpperCase();

  const entries: [string, string][] = [
    ['off', "Don't translate"],
    ...Object.entries(TRANSLATE_LANGUAGES),
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Auto-translate messages into your language"
        className={`flex items-center gap-1 p-2 rounded-lg transition-colors ${
          active
            ? 'bg-cyan-500/15 text-cyan-400'
            : 'hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))]'
        }`}
      >
        <Globe className="w-4 h-4" />
        <span className="text-[11px] font-semibold hidden sm:inline">{shortLabel}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-52 max-h-80 overflow-y-auto rounded-lg border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-elevated))] shadow-xl z-50 py-1">
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-[hsl(var(--theme-text-muted))]">
            Auto-translate to
          </p>
          {entries.map(([code, label]) => (
            <button
              key={code}
              onClick={() => {
                onChange(code);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] text-[hsl(var(--theme-text-secondary))] transition-colors hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))]"
            >
              <span>{label}</span>
              {value === code && <Check className="h-3.5 w-3.5 text-cyan-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
