import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { Reaction } from "@/types";

interface MessageReactionsProps {
  reactions: Reaction[];
  onReactionClick: (emoji: string) => void;
  className?: string;
}

export default function MessageReactions({ 
  reactions, 
  onReactionClick,
  className = ""
}: MessageReactionsProps) {
  const { isDarkMode } = useTheme();
  const [hoveredReaction, setHoveredReaction] = useState<string | null>(null);

  if (!reactions || reactions.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 mt-1 ${className}`}>
      {reactions.map((reaction) => (
        <div
          key={reaction.emoji}
          className="relative"
          onMouseEnter={() => setHoveredReaction(reaction.emoji)}
          onMouseLeave={() => setHoveredReaction(null)}
        >
          <button
            onClick={() => onReactionClick(reaction.emoji)}
            className={`
              inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm
              transition-all duration-150 hover:scale-105
              ${reaction.reacted_by_current_user
                ? isDarkMode
                  ? 'bg-blue-600/30 border border-blue-500/50 text-blue-300'
                  : 'bg-blue-100 border border-blue-300 text-blue-700'
                : isDarkMode
                  ? 'bg-slate-700/50 border border-slate-600/50 text-slate-300 hover:bg-slate-600/50'
                  : 'bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200'
              }
            `}
            title={`${reaction.users.map(u => u.display_name || u.username).join(', ')} reacted with ${reaction.emoji}`}
          >
            <span className="text-base leading-none">{reaction.emoji}</span>
            <span className="text-xs font-medium">{reaction.count}</span>
          </button>

          {/* Tooltip showing who reacted */}
          {hoveredReaction === reaction.emoji && reaction.users.length > 0 && (
            <div 
              className={`
                absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 
                px-3 py-2 rounded-lg text-xs whitespace-nowrap z-50
                ${isDarkMode 
                  ? 'bg-slate-900 text-slate-100 border border-slate-700' 
                  : 'bg-white text-gray-900 border border-gray-200'
                }
                shadow-lg pointer-events-none
              `}
              style={{
                animation: 'fadeIn 0.1s ease-in-out'
              }}
            >
              <div className="font-semibold mb-1">{reaction.emoji} Reacted by:</div>
              <div className="max-h-32 overflow-y-auto">
                {reaction.users.map((user, idx) => (
                  <div key={idx} className={isDarkMode ? 'text-slate-300' : 'text-gray-600'}>
                    {user.display_name || user.username}
                  </div>
                ))}
              </div>
              {/* Tooltip arrow */}
              <div 
                className={`
                  absolute top-full left-1/2 transform -translate-x-1/2 
                  w-0 h-0 border-x-4 border-x-transparent border-t-4
                  ${isDarkMode ? 'border-t-slate-900' : 'border-t-white'}
                `}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
