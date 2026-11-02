import { describe, expect, it } from 'vitest';
import type { DirectMessage, User } from '@/types';
import { conversationFromMessage, mergeConversations, withFriends, type Conversation } from './dmConversations';

const msg = (id: number, sender_id: number, receiver_id = 2): DirectMessage => ({
  id, sender_id, receiver_id, content: `m${id}`, message_type: 'text', created_at: `2026-11-02T10:0${id}:00`, is_read: false,
});
const friend = (id: number): User => ({ id, username: `u${id}`, email: '' });
const conv = (id: number, last?: DirectMessage): Conversation => ({
  user_id: id, user: friend(id), last_message: last, unread_count: 0, last_message_time: last?.created_at ?? '',
});
const aura = { id: 12, public_id: 'aura-uuid', username: 'aura', display_name: 'Aura', avatar_url: null, is_bot: true };

describe('mergeConversations', () => {
  it('adds an agent that wrote to you, marked as a bot', () => {
    const out = mergeConversations([conv(3)], [{ partner_id: 12, partner: aura, last_message: msg(5, 12), unread_count: 1 }]);
    expect(out.map((c) => c.user_id)).toEqual([3, 12]);
    expect(out[1].user).toMatchObject({ public_id: 'aura-uuid', display_name: 'Aura', is_bot: true });
    expect(out[1].unread_count).toBe(1);
  });

  it('only moves a known conversation forward to a newer message', () => {
    const [kept] = mergeConversations([conv(3, msg(7, 3))], [{ partner_id: 3, last_message: msg(4, 3) }]);
    expect(kept.last_message?.id).toBe(7);
    const [moved] = mergeConversations([conv(3, msg(4, 3))], [{ partner_id: 3, last_message: msg(7, 3) }]);
    expect(moved.last_message?.id).toBe(7);
  });
});

describe('withFriends', () => {
  it('keeps agents and ex-friends with messages, drops empty non-friends', () => {
    const prev = [conv(3), { ...conv(12, msg(5, 12)), user: { ...friend(12), is_bot: true } }, conv(9)];
    const out = withFriends(prev, [friend(3), friend(4)]);
    expect(out.map((c) => c.user_id)).toEqual([3, 4, 12]);
    expect(out[2].user.is_bot).toBe(true);
  });
});

describe('conversationFromMessage', () => {
  it('starts a conversation for a first DM from someone new', () => {
    const c = conversationFromMessage({ ...msg(6, 12), sender: { ...aura, avatar_url: undefined } }, 2);
    expect(c).toMatchObject({ user_id: 12, unread_count: 1, user: { is_bot: true, public_id: 'aura-uuid' } });
  });

  it('ignores your own messages and messages without a sender', () => {
    expect(conversationFromMessage({ ...msg(6, 2, 12), sender: { ...aura, id: 2, avatar_url: undefined } }, 2)).toBeNull();
    expect(conversationFromMessage(msg(6, 12), 2)).toBeNull();
  });
});
