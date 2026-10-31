import * as React from "react";
import { Pin } from "lucide-react";
import { cn, getAvatarUrl } from "@/lib/utils";
import { Icon } from "@/components/app/Icon";

export interface MessageRowProps {
  /** DOM id (scroll-to-message target). */
  domId?: string;
  authorName: string;
  /** Raw avatar path/URL; resolved with getAvatarUrl. */
  avatarUrl?: string | null;
  /** Username used for the generated avatar fallback. */
  username?: string;
  /** Custom 36px avatar slot (agents). Overrides avatarUrl and initials. */
  avatar?: React.ReactNode;
  /** Full header time, e.g. "2:14 PM". */
  timeLabel: string;
  /** Short hover time shown in the gutter of grouped rows, e.g. "14:14". */
  shortTimeLabel?: string;
  /** Continuation of the previous sender's group: no avatar/name, time on hover. */
  grouped?: boolean;
  pinned?: boolean;
  /** Touch: row is selected, so the toolbar is forced visible. */
  selected?: boolean;
  /** Small badge next to the name (e.g. APP / BOT). */
  badge?: React.ReactNode;
  /** Extra header content after the time (moderation badge, pinned chip). */
  headerExtra?: React.ReactNode;
  onAuthorClick?: (e: React.MouseEvent) => void;
  onClick?: () => void;
  /** Message body. */
  children: React.ReactNode;
  /** Reaction pills row. */
  reactions?: React.ReactNode;
  /** "3 replies" footer. */
  footer?: React.ReactNode;
  /** Floating toolbar. */
  toolbar?: React.ReactNode;
  /** Anchored overlays such as the reaction picker. */
  overlay?: React.ReactNode;
  className?: string;
}

/**
 * One flat message row, used by channels and DMs: 36px rounded-square avatar,
 * bold name, time, body. No bubbles. Hover tints the row and reveals the
 * toolbar. Hover is pure CSS (`group`), so rows do not re-render on mouse move.
 */
export function MessageRow({
  domId,
  authorName,
  avatarUrl,
  username,
  avatar,
  timeLabel,
  shortTimeLabel,
  grouped = false,
  pinned = false,
  selected = false,
  badge,
  headerExtra,
  onAuthorClick,
  onClick,
  children,
  reactions,
  footer,
  toolbar,
  overlay,
  className,
}: MessageRowProps) {
  const initials = (authorName || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      id={domId}
      data-grouped={grouped || undefined}
      onClick={onClick}
      className={cn(
        "group relative flex gap-3 px-4 py-0.5 transition-colors duration-100",
        grouped ? "mt-0" : "mt-3",
        pinned
          ? "border-l-2 border-l-[hsl(var(--theme-accent-primary)/0.6)] bg-[hsl(var(--theme-accent-primary)/0.05)] hover:bg-[hsl(var(--theme-accent-primary)/0.08)]"
          : "hover:bg-[hsl(var(--theme-bg-hover)/0.5)]",
        selected && "bg-[hsl(var(--theme-bg-hover)/0.5)]",
        className,
      )}
    >
      <div className="w-9 shrink-0 pt-0.5">
        {grouped ? (
          <time className="block select-none text-right text-xs leading-[22px] text-muted-foreground opacity-0 transition-opacity duration-100 group-hover:opacity-100">
            {shortTimeLabel ?? timeLabel}
          </time>
        ) : avatar ? (
          avatar
        ) : avatarUrl ? (
          <img
            src={getAvatarUrl(avatarUrl, username || authorName)}
            alt=""
            onClick={onAuthorClick}
            className={cn("h-9 w-9 rounded-lg object-cover", onAuthorClick && "cursor-pointer")}
          />
        ) : (
          <div
            onClick={onAuthorClick}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--theme-bg-tertiary))] text-sm font-semibold text-foreground",
              onAuthorClick && "cursor-pointer",
            )}
          >
            {initials}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <button
              type="button"
              onClick={onAuthorClick}
              disabled={!onAuthorClick}
              className="py-0.5 text-base font-bold text-foreground hover:underline disabled:no-underline"
            >
              {authorName}
            </button>
            {badge}
            <time className="text-xs text-muted-foreground">{timeLabel}</time>
            {pinned && (
              <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--theme-text-accent))]" title="Pinned message">
                <Icon icon={Pin} size="sm" />
                Pinned
              </span>
            )}
            {headerExtra}
          </div>
        )}
        <div className="break-words text-base text-foreground [overflow-wrap:anywhere]">{children}</div>
        {reactions && <div className="mt-1">{reactions}</div>}
        {footer}
      </div>

      {toolbar}
      {overlay}
    </div>
  );
}

/** Day divider line with a centered label. */
export function DayDivider({ label }: { label: string }) {
  return (
    <div role="separator" className="relative mx-4 my-4 flex items-center justify-center">
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      <span className="relative rounded-full border border-border bg-background px-3 py-0.5 text-xs font-semibold text-[hsl(var(--theme-text-secondary))]">
        {label}
      </span>
    </div>
  );
}

/** Small "N replies" link under a message; opens the thread pane. */
export function RepliesLink({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="mt-1 text-sm font-medium text-[hsl(var(--theme-text-accent))] hover:underline"
    >
      {count} {count === 1 ? "reply" : "replies"}
    </button>
  );
}

/** "New messages" marker placed before the first message you had not read. */
export function NewMessagesLine() {
  return (
    <div role="separator" aria-label="New messages" className="relative mx-4 my-3 flex items-center">
      <div className="h-px flex-1 bg-[hsl(var(--theme-accent-primary)/0.6)]" />
      <span className="ml-2 rounded-full bg-[hsl(var(--theme-accent-primary))] px-2 py-0.5 text-xs font-semibold text-white">New</span>
    </div>
  );
}
