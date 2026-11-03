import { describe, expect, it } from 'vitest';
import { computePeaks, formatClock, nextSpeed, pushLevel } from './waveform';

describe('voice message waveform', () => {
  it('turns samples into bars between 0 and 1, loudest = 1', () => {
    const samples = [0, 0.1, -0.5, 0.2, 0, 0, 0.25, -0.05];
    const peaks = computePeaks(samples, 4);
    expect(peaks).toHaveLength(4);
    expect(Math.max(...peaks)).toBe(1);
    expect(peaks.every((p) => p >= 0 && p <= 1)).toBe(true);
    expect(peaks[2]).toBe(0);
  });

  it('handles silence and empty input', () => {
    expect(computePeaks([0, 0, 0, 0], 2)).toEqual([0, 0]);
    expect(computePeaks([], 3)).toEqual([0, 0, 0]);
    expect(computePeaks([1, 1], 0)).toEqual([]);
  });

  it('formats the clock', () => {
    expect(formatClock(7)).toBe('0:07');
    expect(formatClock(65.9)).toBe('1:05');
    expect(formatClock(Number.NaN)).toBe('0:00');
  });

  it('cycles the playback speed', () => {
    expect(nextSpeed(1)).toBe(1.5);
    expect(nextSpeed(1.5)).toBe(2);
    expect(nextSpeed(2)).toBe(1);
  });

  it('keeps only the newest levels', () => {
    expect(pushLevel([0.1, 0.2, 0.3], 0.4, 3)).toEqual([0.2, 0.3, 0.4]);
    expect(pushLevel([], 2, 3)).toEqual([1]);
  });
});
