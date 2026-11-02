import * as React from "react";
import { Plus, SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyShortcode, findShortcodeToken, searchShortcodes } from "@/lib/emoji";
import { Icon } from "@/components/app/Icon";

export interface ComposerProps {
  value: string;
  /** Receives the raw input event (callers keep their own typing / mention logic). */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Programmatic text change (shortcode insertion). */
  onValueChange: (value: string) => void;
  onSend: () => void;
  /** Enables the send button; it stays dim until there is something to send. */
  canSend: boolean;
  placeholder: string;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  /** Extra input props: onKeyDown, onSelect, onKeyPress... */
  inputProps?: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "placeholder" | "disabled" | "ref" | "className">;
  /** Click handler for the leading "+" (attach) button. Omit to hide it. */
  onAttach?: () => void;
  /** Right-side controls: emoji, voice, attach... */
  trailing?: React.ReactNode;
  /** Rendered above the box: upload preview, popups. */
  above?: React.ReactNode;
  /** Rendered inside the box, on top of the input (Discord-style): reply bar, suggested replies. */
  attached?: React.ReactNode;
  /** Slash-command mode: tints the box and input. */
  commandMode?: boolean;
  className?: string;
}

/**
 * The one message composer for channels and DMs: attach "+", input, emoji /
 * voice slot, and a send button that stays dim until there is text. Typing
 * `:tada` offers emoji shortcodes. The Enter hint only shows while typing.
 */
export function Composer({
  value,
  onChange,
  onValueChange,
  onSend,
  canSend,
  placeholder,
  disabled = false,
  inputRef,
  inputProps,
  onAttach,
  trailing,
  above,
  attached,
  commandMode = false,
  className,
}: ComposerProps) {
  const localRef = React.useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const [shortcodeIndex, setShortcodeIndex] = React.useState(0);

  const caret = ref.current?.selectionStart ?? value.length;
  const token = React.useMemo(() => findShortcodeToken(value, caret), [value, caret]);
  const suggestions = React.useMemo(() => (token ? searchShortcodes(token.query) : []), [token]);
  const shortcodeOpen = suggestions.length > 0;

  React.useEffect(() => setShortcodeIndex(0), [token?.query]);

  const pickShortcode = (emoji: string) => {
    if (!token) return;
    const next = applyShortcode(value, token, caret, emoji);
    onValueChange(next.value);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (shortcodeOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setShortcodeIndex((i) => (i + step + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        pickShortcode(suggestions[shortcodeIndex].emoji);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onValueChange(value + " ");
        return;
      }
    }
    inputProps?.onKeyDown?.(e);
  };

  const ready = canSend && !disabled;

  return (
    <div className={cn("relative", className)}>
      {above}

      {shortcodeOpen && (
        <ul
          role="listbox"
          aria-label="Emoji suggestions"
          className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-lg border border-border bg-popover p-1 shadow-popover"
        >
          {suggestions.map((s, i) => (
            <li key={s.name} role="option" aria-selected={i === shortcodeIndex}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickShortcode(s.emoji);
                }}
                onMouseEnter={() => setShortcodeIndex(i)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
                  i === shortcodeIndex ? "bg-[hsl(var(--theme-bg-active))] text-foreground" : "text-[hsl(var(--theme-text-secondary))]",
                )}
              >
                <span className="text-lg leading-none">{s.emoji}</span>
                <span>:{s.name}:</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        className={cn(
          "overflow-hidden rounded-lg border transition-colors duration-100",
          commandMode
            ? "border-[hsl(var(--theme-accent-primary)/0.6)] bg-[hsl(var(--theme-accent-primary)/0.08)]"
            : "border-border bg-[hsl(var(--theme-input-bg))] focus-within:border-[hsl(var(--theme-border-hover))]",
        )}
      >
        {attached && <div className="divide-y divide-border border-b border-border empty:hidden">{attached}</div>}
        <div className="flex items-center gap-1 px-1.5">
        {onAttach && (
          <button
            type="button"
            onClick={onAttach}
            disabled={disabled}
            aria-label="Attach a file"
            title="Attach a file"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground disabled:opacity-50"
          >
            <Icon icon={Plus} size="lg" />
          </button>
        )}

        <input
          ref={ref}
          type="text"
          enterKeyHint="send"
          inputMode="text"
          autoCapitalize="sentences"
          autoComplete="off"
          autoCorrect="on"
          aria-label={placeholder}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          {...inputProps}
          onKeyDown={handleKeyDown}
          className={cn(
            "min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-muted-foreground disabled:opacity-50",
            commandMode ? "text-[hsl(var(--theme-text-accent))]" : "text-foreground",
          )}
        />

        <div className="flex shrink-0 items-center gap-0.5">{trailing}</div>

        <button
          type="button"
          onClick={onSend}
          disabled={!ready}
          aria-label="Send message"
          title="Send message (Enter)"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors duration-100",
            ready
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : "cursor-not-allowed text-[hsl(var(--theme-text-muted)/0.5)]",
          )}
        >
          <Icon icon={SendHorizontal} size="md" />
        </button>
        </div>
      </div>

      <p
        aria-hidden={!value}
        className={cn(
          "hidden h-4 px-1 pt-0.5 text-right text-xs text-muted-foreground transition-opacity duration-100 sm:block",
          value ? "opacity-100" : "opacity-0",
        )}
      >
        <kbd className="font-sans font-semibold">Enter</kbd> to send
      </p>
    </div>
  );
}
