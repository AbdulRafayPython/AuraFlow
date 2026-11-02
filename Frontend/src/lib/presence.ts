import type { Presence } from "@/hooks/usePresence";

/** Status dot colour for each presence, shared by every list and header. */
export const PRESENCE_DOT: Record<Presence, string> = {
  online: "bg-success",
  idle: "bg-warning",
  dnd: "bg-destructive",
  offline: "bg-muted-foreground",
};
