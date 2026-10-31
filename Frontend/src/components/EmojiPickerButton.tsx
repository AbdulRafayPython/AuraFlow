import { useState, useRef, useEffect } from "react";
import EmojiPicker, { EmojiClickData, Theme, SuggestionMode } from "emoji-picker-react";
import { Smile } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Icon } from "@/components/app/Icon";
import { recordEmoji } from "@/lib/emoji";

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: string) => void;
  buttonClassName?: string;
  pickerPosition?: 'top' | 'bottom';
  disabled?: boolean;
}

/**
 * Composer emoji button. The picker opens with search focused and
 * "Frequently used" first; skin tones and a name preview are on.
 */
export default function EmojiPickerButton({
  onEmojiSelect,
  buttonClassName = "",
  pickerPosition = 'top',
  disabled = false
}: EmojiPickerButtonProps) {
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
    recordEmoji(emojiData.emoji);
    onEmojiSelect(emojiData.emoji);
    setShowPicker(false);
  };

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        disabled={disabled}
        aria-label="Add emoji"
        aria-expanded={showPicker}
        className={buttonClassName || "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"}
        title="Add emoji"
      >
        <Icon icon={Smile} size="lg" />
      </button>

      {showPicker && (
        <div
          className={`absolute z-50 ${
            pickerPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          } right-0 max-sm:right-2 max-sm:left-2 max-sm:max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-border shadow-popover`}
          style={{ backgroundColor: 'hsl(var(--theme-bg-secondary))' }}
        >
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            theme={isDarkMode ? Theme.DARK : Theme.LIGHT}
            width={350}
            height={450}
            autoFocusSearch
            skinTonesDisabled={false}
            suggestedEmojisMode={SuggestionMode.FREQUENT}
            searchPlaceHolder="Search emoji"
            previewConfig={{ showPreview: true }}
          />
        </div>
      )}
    </div>
  );
}
