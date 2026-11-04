// Presence colours, words and "last seen" text shared by the Friends page and the profile card.
import type { Friend } from "@/types";

export const PRESENCE_DOT: Record<Friend["status"], string> = {
  online: "bg-success",
  idle: "bg-warning",
  dnd: "bg-destructive",
  offline: "bg-[hsl(var(--theme-text-muted))]",
};

export const PRESENCE_LABEL: Record<Friend["status"], string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  offline: "Offline",
};

/** "just now", "5m ago", "3h ago", "yesterday", "4d ago", or a date. Null without a time. */
export function lastSeenText(iso?: string, now: number = Date.now()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString();
}

/** Online, idle and do-not-disturb all count as "online" for the Online tab (Discord). */
export const isOnline = (f: Pick<Friend, "status">) => f.status !== "offline";
