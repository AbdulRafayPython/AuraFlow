// services/reactionService.ts - Optimized API calls for emoji reactions
//
// Key improvements over original:
//   1. Bulk endpoint: fetchMessageReactionsBulk() — 1 API call for N messages
//   2. Toggle returns full aggregation — no follow-up GET needed
//   3. Client-side debounce map prevents rapid-fire duplicate calls

import api from './appService';
import { Reaction } from '@/types';

const REACTIONS_PREFIX = '/api';

// ── Debounce guard ─────────────────────────────────────────────────────
// Prevents the same (messageId, emoji) pair from firing more than once
// within a short window (e.g. double-click / spam).
const _inflight = new Map<string, boolean>();
const DEBOUNCE_MS = 350;

function _debouncedToggle<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (_inflight.get(key)) {
    return Promise.reject(new Error('debounced'));
  }
  _inflight.set(key, true);
  setTimeout(() => _inflight.delete(key), DEBOUNCE_MS);
  return fn();
}

export const reactionService = {
  // ============================================================================
  // Community Message Reactions
  // ============================================================================
  
  /**
   * Get all reactions for a community message (single)
   */
  async getMessageReactions(messageId: number): Promise<{ reactions: Reaction[] }> {
    try {
      const response = await api.get(`${REACTIONS_PREFIX}/messages/${messageId}/reactions`);
      return response as { reactions: Reaction[] };
    } catch (error) {
      console.error('Error fetching message reactions:', error);
      throw error;
    }
  },

  /**
   * Bulk-fetch reactions for many messages in ONE request.
   * Returns { reactions: { "123": [...], "456": [...] } }
   */
  async getMessageReactionsBulk(
    messageIds: number[],
  ): Promise<Record<number, Reaction[]>> {
    if (messageIds.length === 0) return {};
    try {
      const response = (await api.post(
        `${REACTIONS_PREFIX}/messages/reactions/bulk`,
        { message_ids: messageIds },
      )) as { reactions: Record<string, Reaction[]> };

      // Convert string keys back to numbers
      const out: Record<number, Reaction[]> = {};
      for (const [k, v] of Object.entries(response.reactions || {})) {
        if (v && v.length > 0) out[Number(k)] = v;
      }
      return out;
    } catch (error) {
      console.error('Error bulk-fetching message reactions:', error);
      return {};
    }
  },

  /**
   * Toggle (add/remove) a reaction.  Returns the full aggregated reactions
   * so the caller can replace local state without a follow-up GET.
   */
  async toggleMessageReaction(
    messageId: number,
    emoji: string,
  ): Promise<{ message: string; action: 'added' | 'removed'; reactions?: Reaction[]; reaction?: any }> {
    const key = `msg:${messageId}:${emoji}`;
    return _debouncedToggle(key, async () => {
      const response = await api.post(
        `${REACTIONS_PREFIX}/messages/${messageId}/reactions`,
        { emoji },
      );
      return response as {
        message: string;
        action: 'added' | 'removed';
        reactions?: Reaction[];
        reaction?: any;
      };
    });
  },

  /**
   * Remove a specific reaction from a community message
   */
  async removeMessageReaction(messageId: number, emoji: string): Promise<{ message: string }> {
    try {
      const response = await api.del(`${REACTIONS_PREFIX}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
      return response as { message: string };
    } catch (error) {
      console.error('Error removing message reaction:', error);
      throw error;
    }
  },

  // ============================================================================
  // Direct Message Reactions
  // ============================================================================

  /**
   * Get all reactions for a direct message (single)
   */
  async getDMReactions(dmId: number): Promise<{ reactions: Reaction[] }> {
    try {
      const response = await api.get(`${REACTIONS_PREFIX}/direct-messages/${dmId}/reactions`);
      return response as { reactions: Reaction[] };
    } catch (error) {
      console.error('Error fetching DM reactions:', error);
      throw error;
    }
  },

  /**
   * Bulk-fetch reactions for many DMs in ONE request.
   */
  async getDMReactionsBulk(
    messageIds: number[],
  ): Promise<Record<number, Reaction[]>> {
    if (messageIds.length === 0) return {};
    try {
      const response = (await api.post(
        `${REACTIONS_PREFIX}/direct-messages/reactions/bulk`,
        { message_ids: messageIds },
      )) as { reactions: Record<string, Reaction[]> };

      const out: Record<number, Reaction[]> = {};
      for (const [k, v] of Object.entries(response.reactions || {})) {
        if (v && v.length > 0) out[Number(k)] = v;
      }
      return out;
    } catch (error) {
      console.error('Error bulk-fetching DM reactions:', error);
      return {};
    }
  },

  /**
   * Toggle a DM reaction.  Returns full aggregation.
   */
  async toggleDMReaction(
    dmId: number,
    emoji: string,
  ): Promise<{ message: string; action: 'added' | 'removed'; reactions?: Reaction[]; reaction?: any }> {
    const key = `dm:${dmId}:${emoji}`;
    return _debouncedToggle(key, async () => {
      const response = await api.post(
        `${REACTIONS_PREFIX}/direct-messages/${dmId}/reactions`,
        { emoji },
      );
      return response as {
        message: string;
        action: 'added' | 'removed';
        reactions?: Reaction[];
        reaction?: any;
      };
    });
  },

  /**
   * Remove a specific reaction from a direct message
   */
  async removeDMReaction(dmId: number, emoji: string): Promise<{ message: string }> {
    try {
      const response = await api.del(`${REACTIONS_PREFIX}/direct-messages/${dmId}/reactions/${encodeURIComponent(emoji)}`);
      return response as { message: string };
    } catch (error) {
      console.error('Error removing DM reaction:', error);
      throw error;
    }
  }
};

export default reactionService;
