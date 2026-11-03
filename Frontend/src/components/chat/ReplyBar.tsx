// components/chat/ReplyBar.tsx - "Replying to …" line inside the composer (Discord-style):
// one quiet row with the name, the start of the message, and a close button.
import React from 'react';
import { FileIcon, ImageIcon, Mic, Video, X } from 'lucide-react';
import type { DirectMessage, Message } from '@/types';
import { cn } from '@/lib/utils';

interface ReplyBarProps {
  message: Message | DirectMessage;
  /** Display name of the person being replied to */
  authorName: string;
  onCancel: () => void;
  /** Flat row inside the composer box instead of a floating card. */
  attached?: boolean;
}

const KINDS: Record<string, { icon: typeof Mic; label: string }> = {
  image: { icon: ImageIcon, label: 'Image' },
  file: { icon: FileIcon, label: 'File' },
  voice: { icon: Mic, label: 'Voice message' },
  video: { icon: Video, label: 'Video' },
};

const ReplyBar: React.FC<ReplyBarProps> = ({ message, authorName, onCancel, attached = false }) => {
  const kind = KINDS[message.message_type as string];
  const text = message.content?.trim();
  return (
    <div
      data-testid="reply-bar"
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-sm',
        attached ? 'bg-[hsl(var(--theme-bg-secondary)/0.6)]' : 'mx-2 mb-1.5 rounded-lg border border-border bg-[hsl(var(--theme-bg-secondary))]',
      )}
    >
      <p className="flex min-w-0 flex-1 items-center gap-1.5 text-muted-foreground">
        <span className="shrink-0">Replying to</span>
        <span className="shrink-0 font-semibold text-foreground">{authorName}</span>
        {kind && <kind.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
        <span className="truncate">{text || kind?.label}</span>
      </p>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel reply"
        title="Cancel reply (Esc)"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--theme-text-muted)/0.25)] text-foreground transition-colors duration-100 hover:bg-[hsl(var(--theme-text-muted)/0.45)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default ReplyBar;
