// One player for every voice message: in the chat and in the recording preview.
// A round play button, the message's own waveform (bars fill with the accent
// colour as it plays; click or drag to seek; arrow keys skip 5 s), the time
// and a speed button. Built on <audio> and the Web Audio API, no library.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { computePeaks, formatClock, nextSpeed } from '@/lib/waveform';
import { cn } from '@/lib/utils';

const BARS = 40;
const peakCache = new Map<string, number[]>();

async function loadPeaks(src: string): Promise<number[]> {
  const cached = peakCache.get(src);
  if (cached) return cached;
  const buffer = await (await fetch(src)).arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buffer);
    const peaks = computePeaks(audio.getChannelData(0), BARS);
    peakCache.set(src, peaks);
    return peaks;
  } finally {
    void ctx.close();
  }
}

// A soft, even shape while the real one loads (or if it cannot be read).
const PLACEHOLDER = Array.from({ length: BARS }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 0.7)));

export default function VoicePlayer({ src, duration: savedDuration, className, compact = false }: {
  src: string;
  /** Seconds, if known before the audio loads (stored with the message). */
  duration?: number;
  className?: string;
  /** Slimmer version for the composer preview. */
  compact?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number>();
  const [peaks, setPeaks] = useState<number[] | null>(peakCache.get(src) ?? null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(savedDuration && Number.isFinite(savedDuration) ? savedDuration : 0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    let live = true;
    loadPeaks(src).then((p) => { if (live) setPeaks(p); }).catch(() => { if (live) setPeaks(null); });
    return () => { live = false; };
  }, [src]);

  // Smooth progress while playing (timeupdate alone is too coarse).
  const tick = useCallback(() => {
    const a = audioRef.current;
    if (a) setTime(a.currentTime);
    frame.current = requestAnimationFrame(tick);
  }, []);
  useEffect(() => {
    if (playing) frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [playing, tick]);

  const onMeta = () => {
    const d = audioRef.current?.duration;
    if (d && Number.isFinite(d) && d > 0) setDuration(d);
  };

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); return; }
    setLoading(true);
    try {
      a.playbackRate = speed;
      await a.play();
    } catch {
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  };

  const seekTo = (fraction: number) => {
    const a = audioRef.current;
    const total = duration || a?.duration || 0;
    if (!a || !total) return;
    a.currentTime = Math.max(0, Math.min(total, fraction * total));
    setTime(a.currentTime);
  };
  const seekFromPointer = (clientX: number) => {
    const r = barsRef.current?.getBoundingClientRect();
    if (r && r.width) seekTo((clientX - r.left) / r.width);
  };

  const changeSpeed = () => {
    const next = nextSpeed(speed);
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const progress = duration > 0 ? Math.min(1, time / duration) : 0;
  const bars = peaks ?? PLACEHOLDER;
  const height = compact ? 22 : 28;

  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)} data-testid="voice-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={onMeta}
        onDurationChange={onMeta}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setTime(0); }}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-100 hover:opacity-90 active:scale-95',
          compact ? 'h-8 w-8' : 'h-9 w-9',
        )}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" />
          : playing ? <Pause className="h-4 w-4 fill-current" />
          : <Play className="ml-0.5 h-4 w-4 fill-current" />}
      </button>

      <div
        ref={barsRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${formatClock(time)} of ${formatClock(duration)}`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seekFromPointer(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons === 1) seekFromPointer(e.clientX); }}
        onKeyDown={(e) => {
          if (!duration) return;
          if (e.key === 'ArrowRight') { e.preventDefault(); seekTo((time + 5) / duration); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo((time - 5) / duration); }
        }}
        className="flex min-w-0 flex-1 cursor-pointer touch-none items-center gap-[2px] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        style={{ height }}
      >
        {bars.map((p, i) => {
          const played = (i + 0.5) / bars.length <= progress;
          return (
            <span
              key={i}
              aria-hidden
              className={cn(
                'min-w-[2px] flex-1 rounded-full transition-[background-color,height] duration-150',
                played ? 'bg-primary' : 'bg-[hsl(var(--theme-text-muted)/0.45)]',
                !peaks && 'animate-skeleton',
              )}
              style={{ height: `${Math.max(3, p * height)}px` }}
            />
          );
        })}
      </div>

      <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
        {formatClock(playing || time > 0 ? time : duration)}
      </span>
      <button
        type="button"
        onClick={changeSpeed}
        aria-label={`Playback speed ${speed}×`}
        className="h-6 shrink-0 rounded-full bg-[hsl(var(--theme-bg-tertiary))] px-2 text-xs font-semibold tabular-nums text-[hsl(var(--theme-text-secondary))] hover:text-foreground"
      >
        {speed}×
      </button>
    </div>
  );
}
