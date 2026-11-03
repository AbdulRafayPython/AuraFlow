// components/chat/FileAttachment.tsx
// Renders file attachments inside message bubbles (images, audio, video, docs)

import React, { useState, useCallback } from 'react';
import { FileText, Image as ImageIcon, Music, Film, Archive, File, Expand } from 'lucide-react';
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
import VoicePlayer from './VoicePlayer';

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
          <div className="p-2.5 rounded-full bg-white/20">
            <Expand className="w-5 h-5 text-white" />
          </div>
        </div>
        {fileSize != null && (
          <span className="text-xs mt-1 block text-[hsl(var(--theme-text-muted))]">
            {formatFileSize(fileSize)}
          </span>
        )}
      </div>
    );
  }

  // ── Audio / Voice Message attachment ──
  // Real waveform from the file itself (VoicePlayer), speed and seeking.
  if (isAudioFile(fileName)) {
    const isVoiceMessage = fileName.startsWith('voice_message');
    return (
      <div className={cn(
        "mt-1 mb-1 w-full rounded-lg border border-border bg-[hsl(var(--theme-bg-secondary))] px-2.5 py-2",
        isVoiceMessage ? "max-w-[340px]" : "max-w-sm",
      )}>
        <VoicePlayer src={fullUrl} duration={savedDuration} />
        {!isVoiceMessage && (
          <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5 text-xs text-muted-foreground">
            <span className="truncate">{fileName}</span>
            {fileSize != null && <span className="shrink-0">{formatFileSize(fileSize)}</span>}
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
          <div className="p-3 rounded-full bg-white/20">
            <Expand className="w-6 h-6 text-white" />
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs truncate text-[hsl(var(--theme-text-muted))]">{fileName}</span>
          {fileSize != null && (
            <span className="text-xs flex-shrink-0 ml-2 text-[hsl(var(--theme-text-muted))]">
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
          : 'bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-text-accent))]'
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
          <p className={`text-xs ${
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
