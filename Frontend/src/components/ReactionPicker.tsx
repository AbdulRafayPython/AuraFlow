import { useState, useRef, useEffect } from "react";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { SmilePlus } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface ReactionPickerProps {
  onReactionSelect: (emoji: string) => void;
  buttonClassName?: string;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👏'];

export default function ReactionPicker({ 
  onReactionSelect, 
  buttonClassName = ""
}: ReactionPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const { isDarkMode } = useTheme();

  // Close picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    }

    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPicker]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onReactionSelect(emojiData.emoji);
    setShowPicker(false);
  };

  const handleQuickReaction = (emoji: string) => {
    onReactionSelect(emoji);
  };

  return (
    <div className="relative" ref={pickerRef}>
      {/* Quick Reactions Bar */}
      <div className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border ${
        isDarkMode 
          ? 'bg-slate-800/95 border-slate-700 shadow-xl' 
          : 'bg-white border-gray-200 shadow-lg'
      }`}>
        {/* Quick Reaction Buttons */}
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleQuickReaction(emoji)}
            className={`p-1.5 rounded transition-all hover:scale-125 ${
              isDarkMode 
                ? 'hover:bg-slate-700' 
                : 'hover:bg-gray-100'
            }`}
            title={`React with ${emoji}`}
          >
            <span className="text-lg leading-none">{emoji}</span>
          </button>
        ))}

        {/* Divider */}
        <div className={`w-px h-6 ${isDarkMode ? 'bg-slate-600' : 'bg-gray-300'}`} />

        {/* More Emojis Button */}
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className={buttonClassName || `p-1.5 rounded transition-colors ${
            isDarkMode 
              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
          title="More reactions"
        >
          <SmilePlus className="w-4 h-4" />
        </button>
      </div>

      {/* Full Emoji Picker */}
      {showPicker && (
        <div 
          className="absolute bottom-full mb-2 right-0 z-50"
          style={{
            animation: 'fadeIn 0.15s ease-in-out'
          }}
        >
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            theme={isDarkMode ? Theme.DARK : Theme.LIGHT}
            width={350}
            height={400}
            searchPlaceHolder="Search reactions..."
            previewConfig={{
              showPreview: false
            }}
          />
        </div>
      )}
    </div>
  );
}
