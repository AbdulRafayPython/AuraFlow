import { useState, useRef, useEffect } from "react";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { Smile } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: string) => void;
  buttonClassName?: string;
  pickerPosition?: 'top' | 'bottom';
  disabled?: boolean;
}

export default function EmojiPickerButton({ 
  onEmojiSelect, 
  buttonClassName = "",
  pickerPosition = 'top',
  disabled = false
}: EmojiPickerButtonProps) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const { isDarkMode, currentTheme } = useTheme();

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
    onEmojiSelect(emojiData.emoji);
    setShowPicker(false);
  };

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        disabled={disabled}
        className={buttonClassName || `p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-primary))]`}
        title="Add emoji"
      >
        <Smile className="w-5 h-5" />
      </button>

      {showPicker && (
        <div 
          className={`absolute z-50 ${
            pickerPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          } right-0 rounded-xl shadow-2xl border border-[hsl(var(--theme-border-default))] overflow-hidden`}
          style={{
            animation: 'fadeIn 0.15s ease-in-out',
            backgroundColor: `hsl(var(--theme-bg-secondary))`,
          }}
        >
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            theme={isDarkMode ? Theme.DARK : Theme.LIGHT}
            width={350}
            height={450}
            searchPlaceHolder="Search emojis..."
            previewConfig={{
              showPreview: false
            }}
          />
        </div>
      )}
    </div>
  );
}
