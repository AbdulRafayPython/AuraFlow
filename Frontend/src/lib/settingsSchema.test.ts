import { describe, expect, it } from 'vitest';
import { changedValues, problemWith, problems, valuesFrom, type SettingField } from './settingsSchema';

const fields: SettingField[] = [
  { key: 'auto', kind: 'toggle', label: 'Auto', help: '', default: true },
  { key: 'limit', kind: 'number', label: 'Limit', help: '', default: 5, min: 1, max: 10, step: 1 },
  { key: 'style', kind: 'choice', label: 'Style', help: '', default: 'short', options: [{ value: 'short', label: 'Short' }, { value: 'long', label: 'Long' }] },
  { key: 'schedule_time', kind: 'text', label: 'Time', help: '', default: '21:00' },
];

describe('valuesFrom', () => {
  it('uses the defaults when nothing is saved', () => {
    expect(valuesFrom(fields, null)).toEqual({ auto: true, limit: 5, style: 'short', schedule_time: '21:00' });
  });

  it('keeps a saved value, including false and zero-like switches from MySQL', () => {
    expect(valuesFrom(fields, { auto: 0, limit: 8, style: 'long', schedule_time: '08:30' }))
      .toEqual({ auto: false, limit: 8, style: 'long', schedule_time: '08:30' });
    expect(valuesFrom(fields, { auto: 1 }).auto).toBe(true);
    expect(valuesFrom(fields, { auto: false }).auto).toBe(false);
  });

  it('ignores a saved value of the wrong kind and keys it does not know', () => {
    expect(valuesFrom(fields, { limit: 'lots', style: 7, nope: 1 })).toEqual({ auto: true, limit: 5, style: 'short', schedule_time: '21:00' });
  });
});

describe('changedValues', () => {
  it('returns only what moved', () => {
    const a = valuesFrom(fields, null);
    expect(changedValues(a, { ...a, limit: 9 })).toEqual({ limit: 9 });
    expect(changedValues(a, { ...a })).toEqual({});
  });
});

describe('problemWith', () => {
  it('checks numbers against the range', () => {
    expect(problemWith(fields[1], 0)).toBe('Must be at least 1.');
    expect(problemWith(fields[1], 11)).toBe('Must be at most 10.');
    expect(problemWith(fields[1], 5)).toBeNull();
    expect(problemWith(fields[1], Number.NaN)).toBe('Enter a number.');
  });

  it('checks choices and the daily time', () => {
    expect(problemWith(fields[2], 'medium')).toBe('Pick one of the choices.');
    expect(problemWith(fields[2], 'long')).toBeNull();
    expect(problemWith(fields[3], '9pm')).toBe('Use 24-hour time, like 21:00.');
    expect(problemWith(fields[3], '23:59')).toBeNull();
  });

  it('collects every problem by key', () => {
    expect(Object.keys(problems(fields, { auto: true, limit: 99, style: 'x', schedule_time: '21:00' }))).toEqual(['limit', 'style']);
  });
});
