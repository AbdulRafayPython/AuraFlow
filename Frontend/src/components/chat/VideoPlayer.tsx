// Inline video in a message (Discord-style): the first frame in a rounded
// frame with a big round play button; once playing, a slim control bar
// (play/pause, seek, time, mute, full screen) that fades in on hover.
import React, { useRef, useState } from 'react';
import { Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { formatClock } from '@/lib/waveform';
import { cn } from '@/lib/utils';

export default function VideoPlayer({ src, type, fileName }: { src: string; type?: string; fileName: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    setStarted(true);
    if (v.paused) void v.play(); else v.pause();
  };

  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const v = ref.current;
    const r = e.currentTarget.getBoundingClientRect();
    if (!v || !duration || !r.width) return;
    v.currentTime = Math.max(0, Math.min(duration, ((e.clientX - r.left) / r.width) * duration));
  };

  return (
    <div className="group/video relative mt-1 mb-1 w-full max-w-md overflow-hidden rounded-lg border border-border bg-black" data-testid="video-player">
      <video
        ref={ref}
        preload="metadata"
        playsInline
        muted={muted}
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={() => setPlaying(false)}
        className="block max-h-[320px] w-full cursor-pointer object-contain"
        aria-label={fileName}
      >
        <source src={src} type={type} />
      </video>

      {!playing && (
        <button
          type="button"
          onClick={toggle}
          aria-label={`Play ${fileName}`}
          className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition-transform duration-100 hover:scale-105 active:scale-95"
        >
          <Play className="ml-1 h-6 w-6 fill-current" />
        </button>
      )}

      {started && (
        <div className={cn(
          'absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/70 px-2.5 py-1.5 text-white transition-opacity duration-150',
          playing ? 'opacity-0 group-hover/video:opacity-100 group-focus-within/video:opacity-100' : 'opacity-100',
        )}>
          <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10">
            {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          </button>
          <div
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seek(e); }}
            onPointerMove={(e) => { if (e.buttons === 1) seek(e); }}
            className="relative h-1.5 flex-1 cursor-pointer touch-none rounded-full bg-white/25"
          >
            <span className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: duration ? `${(time / duration) * 100}%` : 0 }} />
          </div>
          <span className="shrink-0 text-xs tabular-nums">{formatClock(time)} / {formatClock(duration)}</span>
          <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'} className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => void ref.current?.requestFullscreen?.()} aria-label="Full screen" className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10">
            <Maximize className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
