// components/chat/FileAttachment.tsx
// Renders file attachments inside message bubbles (images, audio, video, docs)

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { FileText, Download, Image as ImageIcon, Music, Film, Archive, File, Expand, Play, Pause } from 'lucide-react';
import {
  isImageFile,
  isAudioFile,
  isVideoFile,
  getFileUrl,
  formatFileSize,
  getFileExtension,
} from '@/services/uploadService';
import { useMediaViewer, type MediaItem } from '@/contexts/MediaViewerContext';
import { cn } from '@/lib/utils';

interface FileAttachmentProps {
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  /** If true, use lighter bubble (e.g. "sent" messages with accent bg) */
  variant?: 'default' | 'accent';
  /** Optional metadata for the viewer */
  uploaderName?: string;
  uploadedAt?: string;
  /** Duration in seconds (for audio/voice messages, from DB) */
  duration?: number;
}

function getFileIcon(filename: string) {
  const ext = getFileExtension(filename);
  if (['pdf'].includes(ext)) return <FileText className="w-5 h-5" />;
  if (['doc', 'docx', 'txt', 'md', 'csv'].includes(ext)) return <FileText className="w-5 h-5" />;
  if (['xls', 'xlsx'].includes(ext)) return <FileText className="w-5 h-5" />;
  if (['ppt', 'pptx'].includes(ext)) return <FileText className="w-5 h-5" />;
  if (['zip', 'rar', '7z'].includes(ext)) return <Archive className="w-5 h-5" />;
  if (isImageFile(filename)) return <ImageIcon className="w-5 h-5" />;
  if (isAudioFile(filename)) return <Music className="w-5 h-5" />;
  if (isVideoFile(filename)) return <Film className="w-5 h-5" />;
  return <File className="w-5 h-5" />;
}

// Format seconds to mm:ss
function formatAudioDuration(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const FileAttachment: React.FC<FileAttachmentProps> = ({
  fileName,
  fileUrl,
  fileSize,
  mimeType,
  variant = 'default',
  uploaderName,
  uploadedAt,
  duration: savedDuration,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const { openMedia } = useMediaViewer();
  const fullUrl = getFileUrl(fileUrl);
  const ext = getFileExtension(fileName);

  // Audio player state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(savedDuration && isFinite(savedDuration) ? savedDuration : 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isAudioLoading, setIsAudioLoading] = useState(true);

  // Generate static waveform pattern (seeded by filename for consistency)
  const waveformBars = useMemo(() => {
    if (!isAudioFile(fileName)) return [];
    const bars: number[] = [];
    let seed = 0;
    for (let i = 0; i < fileName.length; i++) {
      seed += fileName.charCodeAt(i);
    }
    for (let i = 0; i < 35; i++) {
      // Pseudo-random but deterministic based on filename
      const val = Math.sin(seed * (i + 1) * 0.15) * 0.5 + 0.5;
      const height = 0.3 + val * 0.7; // Range 0.3 to 1.0 for better visibility
      bars.push(height);
    }
    return bars;
  }, [fileName]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setAudioDuration(audio.duration);
        setIsAudioLoading(false);
      }
    };

    const handleDurationChange = () => {
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setAudioDuration(audio.duration);
        setIsAudioLoading(false);
      }
    };

    const handleLoadedData = () => {
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setAudioDuration(audio.duration);
      }
      setIsAudioLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      // Also try to get duration if we don't have it yet
      if (audioDuration === 0 && audio.duration && isFinite(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleCanPlay = () => {
      setIsAudioLoading(false);
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setAudioDuration(audio.duration);
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('loadeddata', handleLoadedData);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('canplay', handleCanPlay);

    // Try to load immediately
    audio.load();

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('loadeddata', handleLoadedData);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [audioDuration]);

  const toggleAudioPlayback = (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !audioDuration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = (clickX / rect.width) * audioDuration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Create media item for the viewer
  const createMediaItem = useCallback((): MediaItem => {
    let type: MediaItem['type'] = 'document';
    if (isImageFile(fileName)) type = 'image';
    else if (isVideoFile(fileName)) type = 'video';
    else if (isAudioFile(fileName)) type = 'audio';

    return {
      id: fileUrl,
      url: fullUrl,
      fileName,
      fileSize,
      mimeType,
      type,
      uploaderName,
      uploadedAt,
    };
  }, [fileName, fileUrl, fullUrl, fileSize, mimeType, uploaderName, uploadedAt]);

  const handleOpenViewer = useCallback(() => {
    openMedia(createMediaItem());
  }, [openMedia, createMediaItem]);

  // ── Image attachment ──
  if (isImageFile(fileName) && !imageError) {
    return (
      <div 
        className="mt-1 mb-1 max-w-xs sm:max-w-sm relative group cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleOpenViewer}
      >
        <img
          src={fullUrl}
          alt={fileName}
          className="rounded-xl max-h-[300px] w-auto object-cover transition-all duration-200 group-hover:brightness-90"
          onError={() => setImageError(true)}
          loading="lazy"
        />
        {/* Hover overlay with expand icon */}
        <div className={`absolute inset-0 rounded-xl flex items-center justify-center bg-black/40 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
          <div className="p-2.5 rounded-full bg-white/20 backdrop-blur-sm">
            <Expand className="w-5 h-5 text-white" />
          </div>
        </div>
        {fileSize != null && (
          <span className="text-[10px] mt-1 block text-[hsl(var(--theme-text-muted))]">
            {formatFileSize(fileSize)}
          </span>
        )}
      </div>
    );
  }

  // ── Audio / Voice Message attachment ──
  if (isAudioFile(fileName)) {
    const progress = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;
    const isVoiceMessage = fileName.startsWith('voice_message');

    return (
      <div className={cn(
        "mt-1 mb-1 w-full",
        isVoiceMessage ? "max-w-[280px]" : "max-w-xs sm:max-w-sm"
      )}>
        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          src={fullUrl}
          preload="auto"
          className="hidden"
        >
          <source src={fullUrl} type={mimeType || `audio/${ext}`} />
        </audio>

        {/* Custom audio player UI */}
        <div 
          className={cn(
            "group flex items-center gap-3 p-3 rounded-2xl",
            "transition-all duration-200",
            variant === 'accent'
              ? "bg-white/10 hover:bg-white/15"
              : "bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-tertiary))]"
          )}
        >
          {/* Play/Pause button */}
          <button
            onClick={toggleAudioPlayback}
            disabled={isAudioLoading}
            className={cn(
              "flex-shrink-0 w-10 h-10 rounded-full",
              "flex items-center justify-center",
              "transition-all duration-200",
              "active:scale-95",
              variant === 'accent'
                ? "bg-white/20 hover:bg-white/30 text-white"
                : "bg-[hsl(var(--theme-accent-primary))] hover:bg-[hsl(var(--theme-accent-secondary))] text-white shadow-sm hover:shadow-md hover:shadow-[hsl(var(--theme-accent-primary)/0.25)]",
              isAudioLoading && "opacity-60 cursor-wait"
            )}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>

          {/* Waveform / Progress area */}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            {/* Waveform visualization */}
            <div 
              className="h-9 flex items-center gap-[3px] cursor-pointer relative py-1"
              onClick={handleProgressClick}
            >
              {waveformBars.map((height, index) => {
                const barProgress = ((index + 0.5) / waveformBars.length) * 100;
                const isPlayed = progress >= barProgress;
                
                return (
                  <div
                    key={index}
                    className={cn(
                      "flex-1 rounded-full transition-colors duration-100",
                      "min-w-[3px]",
                      isPlayed 
                        ? variant === 'accent'
                          ? "bg-white"
                          : "bg-[hsl(var(--theme-accent-primary))]"
                        : variant === 'accent'
                          ? "bg-white/25"
                          : "bg-[hsl(var(--theme-text-muted)/0.2)]"
                    )}
                    style={{ 
                      height: `${Math.max(15, height * 100)}%`,
                    }}
                  />
                );
              })}
            </div>

            {/* Duration display */}
            <div className="flex items-center justify-between">
              <span className={cn(
                "text-[11px] font-mono tabular-nums",
                variant === 'accent'
                  ? "text-white/70"
                  : "text-[hsl(var(--theme-text-muted))]"
              )}>
                {formatAudioDuration(currentTime)}
              </span>
              <span className={cn(
                "text-[11px] font-mono tabular-nums",
                variant === 'accent'
                  ? "text-white/70"
                  : "text-[hsl(var(--theme-text-muted))]"
              )}>
                {audioDuration > 0 ? formatAudioDuration(audioDuration) : '--:--'}
              </span>
            </div>
          </div>

          {/* Expand button for full viewer */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenViewer();
            }}
            className={cn(
              "flex-shrink-0 p-1.5 rounded-lg",
              "transition-all duration-200",
              "opacity-0 group-hover:opacity-100",
              variant === 'accent'
                ? "text-white/60 hover:text-white hover:bg-white/10"
                : "text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]"
            )}
            title="Open in viewer"
          >
            <Expand className="w-4 h-4" />
          </button>
        </div>

        {/* File name (only for non-voice messages) */}
        {!isVoiceMessage && (
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className={cn(
              "text-[11px] truncate",
              variant === 'accent'
                ? "text-white/60"
                : "text-[hsl(var(--theme-text-muted))]"
            )}>
              {fileName}
            </span>
            {fileSize != null && (
              <span className={cn(
                "text-[10px] flex-shrink-0 ml-2",
                variant === 'accent'
                  ? "text-white/50"
                  : "text-[hsl(var(--theme-text-muted))]"
              )}>
                {formatFileSize(fileSize)}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Video attachment ──
  if (isVideoFile(fileName)) {
    return (
      <div 
        className="mt-1 mb-1 max-w-xs sm:max-w-sm relative group cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleOpenViewer}
      >
        <video
          preload="metadata"
          className="rounded-xl max-h-[300px] w-full transition-all duration-200 group-hover:brightness-90"
          onClick={(e) => e.stopPropagation()}
        >
          <source src={fullUrl} type={mimeType || `video/${ext}`} />
          Your browser does not support video playback.
        </video>
        {/* Hover overlay with expand icon */}
        <div className={`absolute inset-0 rounded-xl flex items-center justify-center bg-black/40 transition-opacity duration-200 pointer-events-none ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
          <div className="p-3 rounded-full bg-white/20 backdrop-blur-sm">
            <Expand className="w-6 h-6 text-white" />
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px] truncate text-[hsl(var(--theme-text-muted))]">{fileName}</span>
          {fileSize != null && (
            <span className="text-[10px] flex-shrink-0 ml-2 text-[hsl(var(--theme-text-muted))]">
              {formatFileSize(fileSize)}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Generic file (document, archive, etc.) ──
  return (
    <button
      onClick={handleOpenViewer}
      className={`mt-1 mb-1 flex items-center gap-3 p-3 rounded-xl max-w-xs sm:max-w-sm border transition-all text-left w-full ${
        variant === 'accent'
          ? 'bg-white/10 border-white/20 hover:bg-white/15'
          : 'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:bg-[hsl(var(--theme-bg-tertiary))] hover:border-[hsl(var(--theme-border-hover))]'
      }`}
    >
      <div className={`flex-shrink-0 p-2 rounded-lg ${
        variant === 'accent'
          ? 'bg-white/15 text-white'
          : 'bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-accent-primary))]'
      }`}>
        {getFileIcon(fileName)}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${
          variant === 'accent' ? 'text-white' : 'text-[hsl(var(--theme-text-primary))]'
        }`}>
          {fileName}
        </p>
        {fileSize != null && (
          <p className={`text-[11px] ${
            variant === 'accent' ? 'text-white/70' : 'text-[hsl(var(--theme-text-muted))]'
          }`}>
            {formatFileSize(fileSize)} &middot; {ext.toUpperCase()}
          </p>
        )}
      </div>
      <Expand className={`w-4 h-4 flex-shrink-0 ${
        variant === 'accent' ? 'text-white/60' : 'text-[hsl(var(--theme-text-muted))]'
      }`} />
    </button>
  );
};

export default FileAttachment;
