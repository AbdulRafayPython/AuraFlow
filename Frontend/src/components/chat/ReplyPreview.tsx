// components/chat/ReplyPreview.tsx - the one-line "replying to" reference above a message.
// Discord-style: no box; @name in the accent colour, then the start of the
// original message (or what it was: image, voice...). MessageRow draws the
// curved line that joins it to the avatar. Click jumps to the original.
import React from 'react';
import { FileIcon, ImageIcon, Mic, Video } from 'lucide-react';
import type { ReplyToPreview } from '@/types';
import { cn } from '@/lib/utils';

interface ReplyPreviewProps {
  preview: ReplyToPreview;
  /** Accent style (own messages in accent-coloured contexts). */
  variant?: 'default' | 'accent';
  /** Scroll to the original when clicked. */
  onClick?: () => void;
}

const TYPES: Record<string, { icon: typeof Mic; label: string }> = {
  image: { icon: ImageIcon, label: 'Click to see the image' },
  file: { icon: FileIcon, label: 'Click to see the file' },
  voice: { icon: Mic, label: 'Voice message' },
  video: { icon: Video, label: 'Click to see the video' },
};

const ReplyPreview: React.FC<ReplyPreviewProps> = ({ preview, variant = 'default', onClick }) => {
  const kind = TYPES[preview.message_type];
  const text = preview.content?.trim();
  return (
    <button
      type="button"
      onClick={onClick}
      title="Jump to the original message"
      data-testid="reply-preview"
      className={cn(
        'group/reply flex min-w-0 max-w-full items-center gap-1.5 text-left text-sm leading-5',
        variant === 'accent' ? 'text-white/80' : 'text-[hsl(var(--theme-text-secondary))]',
      )}
    >
      <span className={cn('shrink-0 font-semibold', variant === 'accent' ? 'text-white' : 'text-[hsl(var(--theme-text-accent))]')}>
        @{preview.author}
      </span>
      {kind && <kind.icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />}
      <span className="truncate opacity-90 transition-opacity duration-100 group-hover/reply:opacity-100">
        {text && preview.message_type === 'text' ? text : kind ? (text || kind.label) : text || 'Original message'}
      </span>
    </button>
  );
};

export default ReplyPreview;
