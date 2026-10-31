import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { SmilePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRecentEmoji } from "@/lib/emoji";
import { Icon } from "@/components/app/Icon";

export interface ToolbarAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  /** Toggled-on state (e.g. pinned). */
  active?: boolean;
}

interface MessageToolbarProps {
  /** React with one of the quick emoji. */
  onReact: (emoji: string) => void;
  /** Open the full reaction picker. */
  onOpenPicker: () => void;
  actions?: ToolbarAction[];
  /** Quick emoji; defaults to the user's 3 most recent. */
  quickEmoji?: string[];
  /** Force-visible (e.g. the row is selected on touch). Otherwise shown on hover / focus. */
  visible?: boolean;
  className?: string;
}

const buttonClass =
  "flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-muted-foreground transition-colors duration-100 hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground";

// Native `title` instead of a Radix tooltip: a long channel renders hundreds of
// toolbars and each tooltip would mount extra components per row.
function ToolbarButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(buttonClass, active && "bg-[hsl(var(--theme-accent-primary)/0.14)] text-[hsl(var(--theme-text-accent))]")}
    >
      {children}
    </button>
  );
}

/**
 * Floating action bar that appears on message hover or keyboard focus:
 * 3 recent emoji, "React" (full picker), then the row's own actions.
 */
export function MessageToolbar({ onReact, onOpenPicker, actions = [], quickEmoji, visible = false, className }: MessageToolbarProps) {
  const emoji = React.useMemo(() => quickEmoji ?? getRecentEmoji(3), [quickEmoji]);

  return (
    <div
      role="toolbar"
      aria-label="Message actions"
      className={cn(
        "absolute -top-4 right-3 z-10 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-0.5 shadow-popover",
        "transition-opacity duration-100",
        visible ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
        className,
      )}
    >
      {emoji.map((e) => (
        <ToolbarButton key={e} label={`React with ${e}`} onClick={() => onReact(e)}>
          <span className="text-base leading-none">{e}</span>
        </ToolbarButton>
      ))}
      <ToolbarButton label="Add reaction" onClick={onOpenPicker}>
        <Icon icon={SmilePlus} size="md" />
      </ToolbarButton>
      {actions.length > 0 && <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />}
      {actions.map((a) => (
        <ToolbarButton key={a.key} label={a.label} onClick={a.onClick} active={a.active}>
          <Icon icon={a.icon} size="md" />
        </ToolbarButton>
      ))}
    </div>
  );
}
