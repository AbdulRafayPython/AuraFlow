// Small pure helpers for voice messages: the bar heights of a waveform and the
// clock shown next to it. No React, easy to test.

/** `count` bar heights between 0 and 1 from raw samples (loudest sample per slice, gently lifted). */
export function computePeaks(samples: ArrayLike<number>, count: number): number[] {
  if (count <= 0) return [];
  const out = new Array<number>(count).fill(0);
  const size = samples.length / count;
  if (samples.length === 0) return out;
  let max = 0;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * size);
    const end = Math.max(start + 1, Math.floor((i + 1) * size));
    let peak = 0;
    for (let j = start; j < end && j < samples.length; j++) {
      const v = Math.abs(samples[j]);
      if (v > peak) peak = v;
    }
    out[i] = peak;
    if (peak > max) max = peak;
  }
  if (max === 0) return out;
  // Normalise, then a square root so quiet speech still shows as bars.
  return out.map((p) => Math.sqrt(p / max));
}

/** "0:07", "1:05", "12:30". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Playback speeds offered on a voice message, in order. */
export const SPEEDS = [1, 1.5, 2] as const;

export function nextSpeed(current: number): number {
  const i = SPEEDS.indexOf(current as (typeof SPEEDS)[number]);
  return SPEEDS[(i + 1) % SPEEDS.length];
}

/** Keep the last `max` levels (newest last), for the live recording waveform. */
export function pushLevel(levels: number[], level: number, max: number): number[] {
  const next = levels.length >= max ? levels.slice(levels.length - max + 1) : levels.slice();
  next.push(Math.max(0, Math.min(1, level)));
  return next;
}
