import { describe, expect, it } from 'vitest';
import { coverageCell, coverageSummary } from './agentCoverage';

describe('coverageCell', () => {
  it('follows the community when the channel has no setting of its own', () => {
    expect(coverageCell({}, 1, 'moderation', true)).toEqual({ enabled: true, overridden: false });
    expect(coverageCell({}, 1, 'moderation', false)).toEqual({ enabled: false, overridden: false });
    expect(coverageCell({ 2: { focus: false } }, 1, 'moderation', true)).toEqual({ enabled: true, overridden: false });
  });

  it('a setting of its own wins, either way', () => {
    expect(coverageCell({ 1: { moderation: false } }, 1, 'moderation', true)).toEqual({ enabled: false, overridden: true });
    expect(coverageCell({ 1: { moderation: true } }, 1, 'moderation', false)).toEqual({ enabled: true, overridden: true });
  });
});

describe('coverageSummary', () => {
  it('counts the channels the agent acts in', () => {
    expect(coverageSummary({ 2: { focus: false } }, [1, 2, 3], 'focus', true)).toBe('Acts in 2 of 3 channels');
    expect(coverageSummary({}, [1], 'focus', true)).toBe('Acts in 1 of 1 channel');
    expect(coverageSummary({}, [1, 2], 'focus', false)).toBe('Acts in 0 of 2 channels');
  });
});
