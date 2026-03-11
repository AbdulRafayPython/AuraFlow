// components/chat/TypingIndicator.tsx — Animated "X is typing..." indicator
import React from 'react';

interface Props {
  name: string;   // display name of the person typing
  avatar?: string; // optional avatar URL
}

const TypingIndicator: React.FC<Props> = ({ name, avatar }) => {
  return (
    <div className="flex items-center gap-2 px-4 py-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {avatar && (
        <img src={avatar} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
      )}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[hsl(var(--theme-bg-secondary)/0.6)]">
        <span className="text-xs text-[hsl(var(--theme-text-muted))]">{name} is typing</span>
        <div className="flex items-center gap-0.5 ml-0.5">
          <span className="w-1 h-1 rounded-full bg-[hsl(var(--theme-text-muted))] animate-[typingDot_1.2s_ease-in-out_infinite_0ms]" />
          <span className="w-1 h-1 rounded-full bg-[hsl(var(--theme-text-muted))] animate-[typingDot_1.2s_ease-in-out_infinite_200ms]" />
          <span className="w-1 h-1 rounded-full bg-[hsl(var(--theme-text-muted))] animate-[typingDot_1.2s_ease-in-out_infinite_400ms]" />
        </div>
      </div>

      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
};

export default TypingIndicator;
