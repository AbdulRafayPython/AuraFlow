// Voice messages: a mic button in the composer. While recording, the whole
// input row becomes a recording bar (red dot, timer, a live waveform drawn from
// the microphone that scrolls in from the right, Trash / Pause / Stop / Send).
// After Stop, the same bar shows the take in the chat's own VoicePlayer so it
// can be checked before sending. No animation library: Web Audio + CSS.
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play, SendHorizontal, Square, Trash2 } from 'lucide-react';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useToast } from '@/hooks/use-toast';
import { formatClock, pushLevel } from '@/lib/waveform';
import { cn } from '@/lib/utils';
import VoicePlayer from './VoicePlayer';

const LIVE_BARS = 48;
const SAMPLE_MS = 80;

export interface VoiceRecorderHandle {
  /** Start recording (the composer's + menu uses this). */
  start: () => void;
}

interface VoiceRecorderProps {
  onSend: (audioBlob: Blob, duration: number) => Promise<void>;
  disabled?: boolean;
  maxDuration?: number;
  className?: string;
}

const roundBtn = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-100 disabled:opacity-50';

const VoiceRecorder = forwardRef<VoiceRecorderHandle, VoiceRecorderProps>(({ onSend, disabled = false, maxDuration = 300, className }, ref) => {
  const { toast } = useToast();
  const {
    isRecording, isPaused, duration, audioBlob, audioUrl, error, getLevel,
    startRecording, stopRecording, pauseRecording, resumeRecording, cancelRecording, resetRecording,
  } = useVoiceRecorder(maxDuration);

  const [levels, setLevels] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const sendAfterStop = useRef(false);

  useImperativeHandle(ref, () => ({ start: () => { if (!disabled && !isRecording) void begin(); } }));

  useEffect(() => {
    if (error) toast({ title: 'Could not use the microphone', description: error, variant: 'destructive' });
  }, [error, toast]);

  // One bar every 80 ms from the current loudness: the waveform "draws itself".
  useEffect(() => {
    if (!isRecording || isPaused) return;
    // A timer, not requestAnimationFrame, so it keeps drawing in a background tab.
    const id = window.setInterval(() => {
      setLevels((l) => pushLevel(l, Math.sqrt(Math.min(1, getLevel() * 2.5)), LIVE_BARS));
    }, SAMPLE_MS);
    return () => window.clearInterval(id);
  }, [isRecording, isPaused, getLevel]);

  // "Send" pressed while still recording: stop, then send as soon as the take exists.
  useEffect(() => {
    if (audioBlob && !isRecording && sendAfterStop.current) {
      sendAfterStop.current = false;
      void send();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioBlob, isRecording]);

  async function begin() {
    setLevels([]);
    await startRecording();
  }

  async function send() {
    if (!audioBlob || sending) return;
    setSending(true);
    try {
      await onSend(audioBlob, duration);
      resetRecording();
      setLevels([]);
    } catch {
      // The page shows the upload error; keep the take so it can be sent again.
    } finally {
      setSending(false);
    }
  }

  const discard = () => {
    sendAfterStop.current = false;
    cancelRecording();
    setLevels([]);
  };

  const bar = 'absolute inset-0 z-10 flex items-center gap-2 rounded-lg bg-[hsl(var(--theme-input-bg))] px-1.5 duration-150 animate-in fade-in-0 slide-in-from-right-2';

  if (isRecording) {
    const shown = Array.from({ length: LIVE_BARS - levels.length }, () => 0).concat(levels);
    return (
      <div className={cn(bar, className)} role="group" aria-label="Recording a voice message" data-testid="voice-recording">
        <button type="button" onClick={discard} aria-label="Delete recording" title="Delete"
                className={cn(roundBtn, 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive')}>
          <Trash2 className="h-4 w-4" />
        </button>
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
          {!isPaused && <span className="af-rec-ring absolute inline-flex h-full w-full rounded-full bg-destructive" />}
          <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', isPaused ? 'bg-[hsl(var(--theme-text-muted))]' : 'bg-destructive')} />
        </span>
        <span className="w-10 shrink-0 text-sm font-semibold tabular-nums text-foreground" aria-live="off">{formatClock(duration)}</span>
        <div className="flex h-7 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden" aria-hidden>
          {shown.map((l, i) => (
            <span
              key={i}
              className={cn('w-[3px] shrink-0 rounded-full transition-[height] duration-100 ease-out',
                isPaused ? 'bg-[hsl(var(--theme-text-muted)/0.4)]' : 'bg-[hsl(var(--theme-text-secondary))]')}
              style={{ height: `${Math.max(3, l * 26)}px` }}
            />
          ))}
        </div>
        <button type="button" onClick={isPaused ? resumeRecording : pauseRecording}
                aria-label={isPaused ? 'Resume recording' : 'Pause recording'} title={isPaused ? 'Resume' : 'Pause'}
                className={cn(roundBtn, 'text-muted-foreground hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground')}>
          {isPaused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
        </button>
        <button type="button" onClick={() => void stopRecording()} aria-label="Stop and listen" title="Stop and listen"
                className={cn(roundBtn, 'text-muted-foreground hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground')}>
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
        <button type="button" onClick={() => { sendAfterStop.current = true; void stopRecording(); }}
                aria-label="Send voice message" title="Send"
                className={cn(roundBtn, 'bg-primary text-primary-foreground hover:opacity-90')}>
          <SendHorizontal className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (audioBlob && audioUrl) {
    return (
      <div className={cn(bar, className)} role="group" aria-label="Voice message ready to send" data-testid="voice-preview">
        <button type="button" onClick={discard} disabled={sending} aria-label="Delete recording" title="Delete"
                className={cn(roundBtn, 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive')}>
          <Trash2 className="h-4 w-4" />
        </button>
        <VoicePlayer src={audioUrl} duration={duration} compact className="flex-1" />
        <button type="button" onClick={() => void send()} disabled={sending} aria-label="Send voice message" title="Send"
                className={cn(roundBtn, 'bg-primary text-primary-foreground hover:opacity-90')}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void begin()}
      disabled={disabled}
      aria-label="Record a voice message"
      title="Record a voice message"
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Mic className="h-5 w-5" />
    </button>
  );
});

VoiceRecorder.displayName = 'VoiceRecorder';

export default VoiceRecorder;
export { VoiceRecorder };
