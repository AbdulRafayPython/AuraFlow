// components/chat/VoiceRecorder.tsx - Voice message recording component
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, X, Send, Pause, Play, Trash2 } from 'lucide-react';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { cn } from '@/lib/utils';

interface VoiceRecorderProps {
  onSend: (audioBlob: Blob, duration: number) => Promise<void>;
  disabled?: boolean;
  maxDuration?: number;
  className?: string;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onSend,
  disabled = false,
  maxDuration = 300,
  className,
}) => {
  const {
    isRecording,
    isPaused,
    duration,
    audioBlob,
    audioUrl,
    error,
    visualizerData,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    resetRecording,
  } = useVoiceRecorder(maxDuration);

  const [isSending, setIsSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Show preview after recording stops
  useEffect(() => {
    if (audioBlob && !isRecording) {
      setShowPreview(true);
    }
  }, [audioBlob, isRecording]);

  // Audio playback handlers for preview
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (audio.duration) {
        setPlaybackProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setPlaybackProgress(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const handleMicClick = async () => {
    if (disabled) return;
    
    if (isRecording) {
      // Stop recording and show preview
      await stopRecording();
    } else if (showPreview) {
      // Already have a recording, do nothing (use send button)
    } else {
      // Start new recording
      await startRecording();
    }
  };

  const handleSend = async () => {
    if (!audioBlob || isSending) return;
    
    setIsSending(true);
    try {
      await onSend(audioBlob, duration);
      // Reset after successful send
      setShowPreview(false);
      setIsPlaying(false);
      setPlaybackProgress(0);
      resetRecording();
    } catch (err) {
      console.error('[VoiceRecorder] Failed to send:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleCancel = () => {
    setShowPreview(false);
    setIsPlaying(false);
    setPlaybackProgress(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    cancelRecording();
  };

  const handlePauseResume = () => {
    if (isPaused) {
      resumeRecording();
    } else {
      pauseRecording();
    }
  };

  const togglePreviewPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Recording Mode UI
  // ─────────────────────────────────────────────────────────────
  if (isRecording) {
    return (
      <div className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-2xl",
        "bg-gradient-to-r from-red-500/8 to-red-500/12",
        "border border-red-500/20",
        "shadow-sm shadow-red-500/5",
        "animate-in slide-in-from-right-2 duration-300",
        className
      )}>
        {/* Cancel button */}
        <button
          onClick={handleCancel}
          className={cn(
            "p-1.5 -ml-0.5 rounded-full",
            "text-red-400/70 hover:text-red-400",
            "hover:bg-red-500/10",
            "transition-all duration-200"
          )}
          title="Cancel recording"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {/* Recording indicator dot + Visualizer */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Pulsing recording dot */}
          <div className={cn(
            "w-2 h-2 rounded-full bg-red-500 flex-shrink-0",
            !isPaused && "animate-pulse"
          )} />

          {/* Waveform visualizer */}
          <div className="flex items-center justify-center gap-[3px] h-7 flex-1 max-w-[100px]">
            {visualizerData.slice(0, 16).map((value, index) => (
              <div
                key={index}
                className={cn(
                  "w-[3px] rounded-full transition-all duration-100 ease-out",
                  isPaused ? "bg-red-400/30" : "bg-red-400"
                )}
                style={{
                  height: `${Math.max(3, value * 24)}px`,
                  opacity: isPaused ? 0.5 : 0.5 + value * 0.5,
                }}
              />
            ))}
          </div>
        </div>

        {/* Duration timer */}
        <div className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-lg",
          "bg-red-500/10",
          "font-mono text-sm tabular-nums tracking-tight",
          isPaused ? "text-red-300/70" : "text-red-400"
        )}>
          <span>{formatDuration(duration)}</span>
        </div>

        {/* Pause/Resume button */}
        <button
          onClick={handlePauseResume}
          className={cn(
            "p-2 rounded-xl",
            "text-red-400 hover:text-red-300",
            "bg-red-500/10 hover:bg-red-500/20",
            "transition-all duration-200"
          )}
          title={isPaused ? "Resume" : "Pause"}
        >
          {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
        </button>

        {/* Stop/Send button */}
        <button
          onClick={async () => await stopRecording()}
          className={cn(
            "p-2.5 rounded-xl",
            "bg-red-500 hover:bg-red-600",
            "text-white shadow-sm",
            "transition-all duration-200",
            "hover:shadow-md hover:shadow-red-500/25",
            "active:scale-95"
          )}
          title="Stop recording"
        >
          <Square className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Preview Mode UI (after recording, before sending)
  // ─────────────────────────────────────────────────────────────
  if (showPreview && audioBlob) {
    return (
      <div className={cn(
        "flex items-center gap-2.5 pl-2 pr-2.5 py-2 rounded-2xl",
        "bg-[hsl(var(--theme-accent-primary)/0.08)]",
        "border border-[hsl(var(--theme-accent-primary)/0.2)]",
        "shadow-sm",
        "animate-in slide-in-from-right-2 duration-300",
        className
      )}>
        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          src={audioUrl || undefined}
          preload="metadata"
          className="hidden"
        />

        {/* Discard button */}
        <button
          onClick={handleCancel}
          className={cn(
            "p-1.5 rounded-full",
            "text-[hsl(var(--theme-text-muted))]",
            "hover:text-red-400 hover:bg-red-500/10",
            "transition-all duration-200"
          )}
          title="Discard recording"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Play/Pause toggle */}
        <button
          onClick={togglePreviewPlayback}
          className={cn(
            "p-2 rounded-xl flex-shrink-0",
            "bg-[hsl(var(--theme-accent-primary))]",
            "text-white",
            "hover:bg-[hsl(var(--theme-accent-secondary))]",
            "transition-all duration-200",
            "shadow-sm hover:shadow-md hover:shadow-[hsl(var(--theme-accent-primary)/0.25)]",
            "active:scale-95"
          )}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        {/* Progress bar + Duration */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {/* Progress track */}
          <div className="flex-1 h-1.5 rounded-full bg-[hsl(var(--theme-text-muted)/0.15)] overflow-hidden">
            <div 
              className="h-full rounded-full bg-[hsl(var(--theme-accent-primary))] transition-all duration-150 ease-out"
              style={{ width: `${playbackProgress}%` }}
            />
          </div>

          {/* Duration label */}
          <span className="text-xs font-mono tabular-nums text-[hsl(var(--theme-text-muted))] flex-shrink-0">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={isSending}
          className={cn(
            "p-2.5 rounded-xl flex-shrink-0",
            "bg-[hsl(var(--theme-accent-primary))]",
            "text-white",
            "hover:bg-[hsl(var(--theme-accent-secondary))]",
            "transition-all duration-200",
            "shadow-sm hover:shadow-md hover:shadow-[hsl(var(--theme-accent-primary)/0.25)]",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
            "active:scale-95"
          )}
          title="Send voice message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Default State - Mic Button
  // ─────────────────────────────────────────────────────────────
  return (
    <div className={cn("relative", className)}>
      <button
        onClick={handleMicClick}
        disabled={disabled}
        className={cn(
          "p-2 rounded-xl",
          "text-[hsl(var(--theme-text-muted))]",
          "hover:text-[hsl(var(--theme-text-primary))]",
          "hover:bg-[hsl(var(--theme-bg-hover))]",
          "transition-all duration-200",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          error && "text-red-400 hover:text-red-300"
        )}
        title={error || "Record voice message"}
      >
        <Mic className="w-5 h-5" />
      </button>
      
      {/* Error tooltip */}
      {error && (
        <div className={cn(
          "absolute bottom-full right-0 mb-2",
          "px-3 py-2 rounded-xl",
          "text-xs max-w-[220px] whitespace-normal leading-relaxed",
          "bg-red-500/95 text-white",
          "shadow-lg shadow-red-500/20",
          "animate-in fade-in slide-in-from-bottom-1 duration-200"
        )}>
          {error}
        </div>
      )}
    </div>
  );
};

export default VoiceRecorder;
