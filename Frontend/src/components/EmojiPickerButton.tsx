import { useState } from "react";
import EmojiPicker, { EmojiClickData, Theme, SuggestionMode } from "emoji-picker-react";
import { Smile } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Icon } from "@/components/app/Icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { recordEmoji } from "@/lib/emoji";
import { cn } from "@/lib/utils";

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: string) => void;
  buttonClassName?: string;
  pickerPosition?: 'top' | 'bottom';
  disabled?: boolean;
}

/**
 * Composer emoji button. The picker opens in a portal (so the composer's
 * rounded box cannot clip it), with search focused and "Frequently used"
 * first; skin tones and a name preview are on. Colours come from the app's
 * tokens (see `.af-emoji` in index.css), like Discord's picker.
 */
export default function EmojiPickerButton({
  onEmojiSelect,
  buttonClassName = "",
  pickerPosition = 'top',
  disabled = false
}: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const { isDarkMode } = useTheme();

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    recordEmoji(emojiData.emoji);
    onEmojiSelect(emojiData.emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Add emoji"
          title="Add emoji"
          className={buttonClassName || cn(
            "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
            open && "text-foreground",
          )}
        >
          <Icon icon={Smile} size="lg" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={pickerPosition}
        align="end"
        sideOffset={10}
        collisionPadding={8}
        className="af-emoji w-auto overflow-hidden p-0"
        // Keep focus in the picker's search box, not on the popover itself.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <EmojiPicker
          onEmojiClick={handleEmojiClick}
          theme={isDarkMode ? Theme.DARK : Theme.LIGHT}
          width={352}
          height={420}
          autoFocusSearch
          lazyLoadEmojis
          skinTonesDisabled={false}
          suggestedEmojisMode={SuggestionMode.FREQUENT}
          searchPlaceHolder="Find the perfect emoji"
          previewConfig={{ showPreview: true, defaultCaption: "Pick an emoji" }}
        />
      </PopoverContent>
    </Popover>
  );
}
