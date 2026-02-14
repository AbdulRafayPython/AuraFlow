// components/chat/ReplyBar.tsx - Bar shown above input when replying to a message
import React from 'react';
import { X, Reply, ImageIcon, FileIcon, Mic, Video } from 'lucide-react';
import type { Message, DirectMessage } from '@/types';

interface ReplyBarProps {
  message: Message | DirectMessage;
  /** Display name of the user being replied to */
  authorName: string;
  onCancel: () => void;
}

const ReplyBar: React.FC<ReplyBarProps> = ({ message, authorName, onCancel }) => {
  const truncated = message.content.length > 120
    ? message.content.slice(0, 120) + '…'
    : message.content;

  // Check if the message has an attachment URL (image/file)
  const fileUrl = (message as any).file_url || (message as any).attachment_url;
  const isImageType = message.message_type === 'image';
  const isFileType = message.message_type === 'file';
  const isVoiceType = message.message_type === 'voice';
  const isVideoType = message.message_type === 'video';

  // Determine the type icon and label
  const TypeIcon = isImageType ? ImageIcon : isFileType ? FileIcon : isVoiceType ? Mic : isVideoType ? Video : null;
  const typeLabel = isImageType ? 'Image' : isFileType ? 'File' : isVoiceType ? 'Voice message' : isVideoType ? 'Video' : null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 mx-2 mb-1.5 rounded-xl border-l-[3px] border-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-bg-secondary)/0.6)] backdrop-blur-sm shadow-sm transition-all duration-200 animate-in slide-in-from-bottom-1 fade-in">
      {/* Reply Icon */}
      <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-[hsl(var(--theme-accent-primary)/0.1)] flex items-center justify-center">
        <Reply className="w-3.5 h-3.5 rotate-180 text-[hsl(var(--theme-accent-primary))]" />
      </div>
      
      {/* Content Area */}
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        {/* Image Thumbnail Preview (if replying to image) */}
        {isImageType && fileUrl && (
          <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-[hsl(var(--theme-bg-tertiary))] border border-[hsl(var(--theme-border-subtle))] shadow-sm">
            <img 
              src={fileUrl} 
              alt="Reply preview" 
              className="w-full h-full object-cover"
            />
          </div>
        )}
        
        {/* Text Content */}
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-semibold text-[hsl(var(--theme-accent-primary))] tracking-wide uppercase">
            Replying to {authorName}
          </span>
          <p className="text-[12px] truncate text-[hsl(var(--theme-text-secondary))] leading-snug mt-0.5 flex items-center gap-1.5">
            {TypeIcon && (
              <TypeIcon className="w-3 h-3 flex-shrink-0 text-[hsl(var(--theme-text-muted))]" />
            )}
            <span className="truncate">
              {typeLabel || truncated}
            </span>
          </p>
        </div>
      </div>
      
      {/* Cancel Button */}
      <button
        onClick={onCancel}
        className="flex-shrink-0 p-1.5 rounded-lg transition-all duration-150 text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))] active:scale-95"
        title="Cancel reply"
        aria-label="Cancel reply"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ReplyBar;
