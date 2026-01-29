import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Reaction } from "@/types";

interface MessageReactionsProps {
  reactions: Reaction[];
  onReactionClick: (emoji: string) => void;
  className?: string;
}

interface TooltipPosition {
  top: number;
  left: number;
}

export default function MessageReactions({ 
  reactions, 
  onReactionClick,
  className = ""
}: MessageReactionsProps) {
  const [hoveredReaction, setHoveredReaction] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Calculate tooltip position when hovering
  useEffect(() => {
    if (hoveredReaction && buttonRefs.current[hoveredReaction]) {
      const button = buttonRefs.current[hoveredReaction];
      const rect = button!.getBoundingClientRect();
      setTooltipPosition({
        top: rect.top - 8, // Position above the button
        left: rect.left,
      });
    } else {
      setTooltipPosition(null);
    }
  }, [hoveredReaction]);

  if (!reactions || reactions.length === 0) return null;

  const hoveredReactionData = reactions.find(r => r.emoji === hoveredReaction);

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {reactions.map((reaction) => (
        <div
          key={reaction.emoji}
          className="relative"
          onMouseEnter={() => setHoveredReaction(reaction.emoji)}
          onMouseLeave={() => setHoveredReaction(null)}
        >
          <button
            ref={(el) => { buttonRefs.current[reaction.emoji] = el; }}
            onClick={() => onReactionClick(reaction.emoji)}
            className={`
              inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm
              transition-all duration-200 hover:scale-105
              ${reaction.reacted_by_current_user
                ? 'bg-[hsl(var(--theme-accent-primary)/0.2)] border border-[hsl(var(--theme-accent-primary)/0.5)] text-[hsl(var(--theme-accent-primary))]'
                : 'bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:border-[hsl(var(--theme-border-hover))]'
              }
            `}
            title={`${reaction.users.map(u => u.display_name || u.username).join(', ')} reacted with ${reaction.emoji}`}
          >
            <span className="text-sm leading-none">{reaction.emoji}</span>
            <span className="text-xs font-medium">{reaction.count}</span>
          </button>
        </div>
      ))}

      {/* Tooltip Portal - renders outside the overflow:hidden container */}
      {hoveredReaction && hoveredReactionData && tooltipPosition && createPortal(
        <div 
          className="fixed px-3 py-2.5 rounded-xl text-xs z-[99999] 
            bg-[hsl(var(--theme-bg-elevated))] text-[hsl(var(--theme-text-primary))] 
            border border-[hsl(var(--theme-border-default))] shadow-xl backdrop-blur-xl
            pointer-events-none"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: 'translateY(-100%)',
            minWidth: '140px',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          <div className="font-semibold mb-1.5 whitespace-nowrap flex items-center gap-1.5 text-[hsl(var(--theme-text-primary))]">
            <span className="text-base">{hoveredReactionData.emoji}</span>
            <span>Reacted by:</span>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {hoveredReactionData.users.map((user, idx) => (
              <div 
                key={idx} 
                className="whitespace-nowrap text-[hsl(var(--theme-text-secondary))] py-0.5"
              >
                {user.display_name || user.username}
              </div>
            ))}
          </div>
          {/* Tooltip arrow */}
          <div 
            className="absolute top-full left-4 w-0 h-0 
              border-x-[6px] border-x-transparent border-t-[6px] 
              border-t-[hsl(var(--theme-bg-elevated))]"
          />
        </div>,
        document.body
      )}
    </div>
  );
}
