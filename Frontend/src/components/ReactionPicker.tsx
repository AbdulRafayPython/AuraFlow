import { useState, useRef, useEffect } from "react";
import EmojiPicker, { EmojiClickData, Theme, SuggestionMode } from "emoji-picker-react";
import { SmilePlus } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Icon } from "@/components/app/Icon";
import { getRecentEmoji, recordEmoji } from "@/lib/emoji";

interface ReactionPickerProps {
  onReactionSelect: (emoji: string) => void;
  buttonClassName?: string;
}

const FALLBACK_QUICK = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👏'];

/** Quick-reaction strip with a full emoji picker behind "more". */
export default function ReactionPicker({
  onReactionSelect,
  buttonClassName = ""
}: ReactionPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const { isDarkMode } = useTheme();
  // Recent emoji first, topped up with the stock set.
  const quick = [...new Set([...getRecentEmoji(3), ...FALLBACK_QUICK])].slice(0, 8);

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

  const select = (emoji: string) => {
    recordEmoji(emoji);
    onReactionSelect(emoji);
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    select(emojiData.emoji);
    setShowPicker(false);
  };

  return (
    <div className="relative" ref={pickerRef}>
      <div
        role="toolbar"
        aria-label="Quick reactions"
        className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-popover"
      >
        {quick.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => select(emoji)}
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-[hsl(var(--theme-bg-hover))]"
            title={`React with ${emoji}`}
            aria-label={`React with ${emoji}`}
          >
            <span className="text-lg leading-none">{emoji}</span>
          </button>
        ))}

        <div aria-hidden className="mx-0.5 h-5 w-px bg-border" />

        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className={buttonClassName || "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground"}
          title="More reactions"
          aria-label="More reactions"
          aria-expanded={showPicker}
        >
          <Icon icon={SmilePlus} size="md" />
        </button>
      </div>

      {/* Full emoji picker: search focused, frequently used first, skin tones, name preview */}
      {showPicker && (
        <div className="absolute bottom-full right-0 z-50 mb-2">
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            theme={isDarkMode ? Theme.DARK : Theme.LIGHT}
            width={350}
            height={400}
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
