// components/chat/JumpToLatest.tsx — Sticky "↓ Jump to latest" button
import React from 'react';
import { ArrowDown } from 'lucide-react';

interface Props {
  onClick: () => void;
  unreadCount?: number;
}

const JumpToLatest: React.FC<Props> = ({ onClick, unreadCount = 0 }) => {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg border
        bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))]
        text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-text-primary))]
        hover:shadow-xl hover:bg-[hsl(var(--theme-bg-hover))]
        transition-all duration-200 animate-in fade-in slide-in-from-bottom-3"
    >
      <ArrowDown className="w-3.5 h-3.5" />
      <span className="text-xs font-medium">
        {unreadCount > 0 ? `${unreadCount} new message${unreadCount > 1 ? 's' : ''}` : 'Jump to latest'}
      </span>
    </button>
  );
};

export default JumpToLatest;
