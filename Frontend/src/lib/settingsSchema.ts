// The settings of a built-in agent, as the server describes them (GET /api/agents/settings-schema).
// The form is drawn from this, so it can only offer values the server accepts.

export interface SettingOption { value: string; label: string }

export interface SettingField {
  key: string;
  kind: 'toggle' | 'number' | 'choice' | 'text';
  label: string;
  help: string;
  default: boolean | number | string;
  min?: number;
  max?: number;
  step?: number;
  options?: SettingOption[];
}

export type SettingsSchema = Record<string, SettingField[]>;
export type SettingValue = boolean | number | string;
export type SettingValues = Record<string, SettingValue>;

/** MySQL hands back 0/1 for switches; the form wants true/false. */
function asToggle(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

/** What the form shows: each field's saved value, or its default when nothing was saved. */
export function valuesFrom(fields: SettingField[], saved?: Record<string, unknown> | null): SettingValues {
  const out: SettingValues = {};
  for (const f of fields) {
    const v = saved?.[f.key];
    if (f.kind === 'toggle') out[f.key] = asToggle(v, f.default as boolean);
    else if (f.kind === 'number') out[f.key] = typeof v === 'number' && Number.isFinite(v) ? v : (f.default as number);
    else out[f.key] = typeof v === 'string' && v !== '' ? v : (f.default as string);
  }
  return out;
}

/** Only the settings the person changed, so saving never rewrites the rest. */
export function changedValues(initial: SettingValues, current: SettingValues): SettingValues {
  const out: SettingValues = {};
  for (const key of Object.keys(current)) if (current[key] !== initial[key]) out[key] = current[key];
  return out;
}

/** A plain-words problem with a value, or null when it is fine. */
export function problemWith(field: SettingField, value: SettingValue): string | null {
  if (field.kind === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'Enter a number.';
    if (field.min !== undefined && n < field.min) return `Must be at least ${field.min}.`;
    if (field.max !== undefined && n > field.max) return `Must be at most ${field.max}.`;
  }
  if (field.kind === 'choice' && !field.options?.some((o) => o.value === value)) return 'Pick one of the choices.';
  if (field.key === 'schedule_time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))) return 'Use 24-hour time, like 21:00.';
  return null;
}

export function problems(fields: SettingField[], values: SettingValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const p = problemWith(f, values[f.key]);
    if (p) out[f.key] = p;
  }
  return out;
}
