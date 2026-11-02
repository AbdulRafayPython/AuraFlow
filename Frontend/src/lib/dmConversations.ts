// The DM list: friends, plus anyone else you have messages with (an agent that wrote to you,
// someone who is no longer a friend). The server's list of last messages is the source for those.
import type { DirectMessage, User } from '@/types';

export interface ConversationRow {
  partner_id: number;
  partner?: { id: number; public_id?: string; username: string; display_name?: string; avatar_url?: string | null; is_bot?: boolean };
  last_message: DirectMessage;
  unread_count?: number;
}

export interface Conversation {
  user_id: number;
  user: User;
  last_message?: DirectMessage;
  unread_count: number;
  last_message_time: string;
}

function userFrom(p: NonNullable<ConversationRow['partner']>): User {
  return {
    id: p.id, public_id: p.public_id, username: p.username, display_name: p.display_name || p.username,
    avatar_url: p.avatar_url ?? undefined, email: '', is_bot: !!p.is_bot,
  };
}

/** Newer last messages update known conversations; partners not in the list yet are added. */
export function mergeConversations(prev: Conversation[], rows: ConversationRow[]): Conversation[] {
  const byPartner = new Map(rows.map((r) => [r.partner_id, r]));
  const known = new Set(prev.map((c) => c.user_id));
  const updated = prev.map((c) => {
    const row = byPartner.get(c.user_id);
    if (!row) return c;
    const user = row.partner?.is_bot ? { ...c.user, is_bot: true } : c.user;
    if (row.last_message && (!c.last_message || row.last_message.id > (c.last_message.id ?? 0))) {
      return { ...c, user, last_message: row.last_message, last_message_time: row.last_message.created_at };
    }
    return { ...c, user };
  });
  const added = rows
    .filter((r) => !known.has(r.partner_id) && r.partner && r.last_message)
    .map((r) => ({
      user_id: r.partner_id, user: userFrom(r.partner!), last_message: r.last_message,
      unread_count: r.unread_count ?? 0, last_message_time: r.last_message.created_at,
    }));
  return [...updated, ...added];
}

/** Rebuild from the friends list, keeping other partners (agents, ex-friends) that have messages. */
type FriendLike = Pick<User, 'id' | 'username'> & { public_id?: string; display_name?: string; avatar_url?: string };

export function withFriends(prev: Conversation[], friends: FriendLike[]): Conversation[] {
  const existing = new Map(prev.map((c) => [c.user_id, c]));
  const friendIds = new Set(friends.map((f) => f.id));
  const fromFriends = friends.map((f) => {
    const e = existing.get(f.id);
    return {
      user_id: f.id,
      user: { id: f.id, public_id: f.public_id, username: f.username, display_name: f.display_name,
              avatar_url: f.avatar_url, email: '' } as User,
      unread_count: e?.unread_count ?? 0,
      last_message_time: e?.last_message_time ?? new Date().toISOString(),
      last_message: e?.last_message,
    };
  });
  return [...fromFriends, ...prev.filter((c) => !friendIds.has(c.user_id) && c.last_message)];
}

/** A message from someone not in the list yet (e.g. an agent's first DM) starts a conversation. */
export function conversationFromMessage(message: DirectMessage & { sender?: Partial<User> & { is_bot?: boolean } },
                                        meId: number | null): Conversation | null {
  const s = message.sender;
  if (!s || !s.id || message.sender_id === meId) return null;
  return {
    user_id: message.sender_id,
    user: userFrom({ id: s.id, public_id: s.public_id, username: s.username || 'agent', display_name: s.display_name,
                     avatar_url: s.avatar_url, is_bot: s.is_bot }),
    last_message: message, unread_count: 1, last_message_time: message.created_at,
  };
}
