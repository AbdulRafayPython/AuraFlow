// Pure helpers for how a message list is grouped into rows. Shared by the
// channel view and DMs so both group, divide and label identically.

/** Consecutive messages from one sender within this window share a header. */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export interface GroupableMessage {
  sender_id?: number | string | null;
  created_at: string | number | Date;
  message_type?: string;
}

/** Message kinds that are not a person talking: they always break a group. */
const GROUP_BREAKERS = new Set(["system", "ai", "call"]);

const toDate = (d: string | number | Date) => (d instanceof Date ? d : new Date(d));

export function isSameDay(a: string | number | Date, b: string | number | Date): boolean {
  const x = toDate(a);
  const y = toDate(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** A day divider goes before the first message and whenever the calendar day changes. */
export function startsNewDay(prev: GroupableMessage | undefined, cur: GroupableMessage): boolean {
  return !prev || !isSameDay(prev.created_at, cur.created_at);
}

/**
 * True when `cur` needs its own avatar + name + time header, false when it
 * continues the previous sender's group (compact row, time on hover).
 */
export function startsGroup(
  prev: GroupableMessage | undefined,
  cur: GroupableMessage,
  windowMs: number = GROUP_WINDOW_MS,
): boolean {
  if (!prev) return true;
  if (GROUP_BREAKERS.has(prev.message_type ?? "") || GROUP_BREAKERS.has(cur.message_type ?? "")) return true;
  if (startsNewDay(prev, cur)) return true;
  if (prev.sender_id == null || prev.sender_id !== cur.sender_id) return true;
  return toDate(cur.created_at).getTime() - toDate(prev.created_at).getTime() > windowMs;
}

/** "Today", "Yesterday", otherwise "Monday, October 27". */
export function formatDayLabel(date: string | number | Date, now: Date = new Date()): string {
  const d = toDate(date);
  if (isSameDay(d, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/** Map of parent message id -> ids of messages that reply to it (loaded messages only). */
export function indexReplies<T extends { id: number; reply_to_preview?: { id: number } | null }>(
  messages: T[],
): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const m of messages) {
    const parent = m.reply_to_preview?.id;
    if (parent == null) continue;
    const list = out.get(parent);
    if (list) list.push(m.id);
    else out.set(parent, [m.id]);
  }
  return out;
}

/**
 * Id of the first unread message, given how many were unread when the channel
 * was opened: walk back from the newest message counting only messages from
 * other people (your own messages are never unread). Null when there are not
 * enough loaded messages to place it.
 */
export function firstUnreadId<T extends { id: number; sender_id?: number | string | null }>(
  messages: T[],
  unreadCount: number,
  myId: number | string | null | undefined,
): number | null {
  if (unreadCount <= 0) return null;
  let seen = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (myId != null && messages[i].sender_id === myId) continue;
    seen += 1;
    if (seen === unreadCount) return messages[i].id;
  }
  return null;
}
