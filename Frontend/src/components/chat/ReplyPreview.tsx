// components/chat/ReplyPreview.tsx - Compact inline reply reference shown above a message
import React from 'react';
import { Reply, ImageIcon, FileIcon, Mic, Video } from 'lucide-react';
import type { ReplyToPreview } from '@/types';

interface ReplyPreviewProps {
  preview: ReplyToPreview;
  /** When true, uses the accent-colored style (for own sent messages in DMs) */
  variant?: 'default' | 'accent';
  /** Scroll-to-parent when clicked */
  onClick?: () => void;
}

const ReplyPreview: React.FC<ReplyPreviewProps> = ({ preview, variant = 'default', onClick }) => {
  const truncated = preview.content.length > 100
    ? preview.content.slice(0, 100) + '…'
    : preview.content;

  // Determine message type properties
  const isImage = preview.message_type === 'image';
  const isFile = preview.message_type === 'file';
  const isVoice = preview.message_type === 'voice';
  const isVideo = preview.message_type === 'video';
  const hasMediaType = isImage || isFile || isVoice || isVideo;

  // Get appropriate icon
  const TypeIcon = isImage ? ImageIcon : isFile ? FileIcon : isVoice ? Mic : isVideo ? Video : null;
  const typeLabel = isImage ? 'Image' : isFile ? 'File' : isVoice ? 'Voice' : isVideo ? 'Video' : null;

  // Check for image preview URL
  const imageUrl = (preview as any).file_url || (preview as any).attachment_url;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-2 text-[11px] mb-1.5 pl-2.5 pr-3 py-1.5 rounded-lg max-w-[320px] cursor-pointer transition-all duration-150 ${
        variant === 'accent'
          ? 'bg-white/10 hover:bg-white/15 text-white/85 border border-white/10'
          : 'bg-[hsl(var(--theme-bg-tertiary)/0.5)] hover:bg-[hsl(var(--theme-bg-tertiary)/0.8)] text-[hsl(var(--theme-text-secondary))] border border-[hsl(var(--theme-border-subtle))]'
      }`}
    >
      {/* Reply Icon */}
      <Reply className={`w-3 h-3 flex-shrink-0 rotate-180 transition-colors ${
        variant === 'accent' 
          ? 'text-white/60 group-hover:text-white/80' 
          : 'text-[hsl(var(--theme-text-muted))] group-hover:text-[hsl(var(--theme-accent-primary))]'
      }`} />
      
      {/* Image Thumbnail (if replying to image with URL) */}
      {isImage && imageUrl && (
        <div className="flex-shrink-0 w-6 h-6 rounded overflow-hidden bg-[hsl(var(--theme-bg-tertiary))]">
          <img 
            src={imageUrl} 
            alt="" 
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      {/* Author Name */}
      <span className={`font-semibold flex-shrink-0 ${
        variant === 'accent' 
          ? 'text-white/95' 
          : 'text-[hsl(var(--theme-accent-primary))]'
      }`}>
        {preview.author}
      </span>
      
      {/* Content or Type Label */}
      <span className="truncate flex items-center gap-1">
        {TypeIcon && hasMediaType && (
          <TypeIcon className={`w-3 h-3 flex-shrink-0 ${
            variant === 'accent' ? 'text-white/50' : 'text-[hsl(var(--theme-text-muted))]'
          }`} />
        )}
        <span className="truncate">
          {typeLabel || truncated}
        </span>
      </span>
    </button>
  );
};

export default ReplyPreview;
