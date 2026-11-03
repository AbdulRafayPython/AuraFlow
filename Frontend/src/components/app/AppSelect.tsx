// A drop-in for <select> with the app's own list (Discord-style) instead of the
// operating system's menu. Takes the same value strings, including '' (Radix
// Select does not allow an empty value, so it is mapped to a placeholder key).
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const EMPTY = '__empty__';

export interface AppSelectOption {
  value: string;
  label: React.ReactNode;
}

export default function AppSelect({ value, onChange, options, label, placeholder, className, id, disabled }: {
  value: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  /** Accessible name when there is no visible <label htmlFor>. */
  label?: string;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}) {
  const toKey = (v: string) => (v === '' ? EMPTY : v);
  return (
    <Select value={toKey(value)} onValueChange={(v) => onChange(v === EMPTY ? '' : v)} disabled={disabled}>
      <SelectTrigger id={id} aria-label={label} className={cn('h-9', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || EMPTY} value={toKey(o.value)}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
