// services/reactionService.ts - API calls for emoji reactions
import api from './appService';
import { Reaction } from '@/types';

const REACTIONS_PREFIX = '/api';

export const reactionService = {
  // ============================================================================
  // Community Message Reactions
  // ============================================================================
  
  /**
   * Get all reactions for a community message
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
   * Add or remove a reaction to/from a community message (toggle)
   */
  async toggleMessageReaction(messageId: number, emoji: string): Promise<{ message: string; action: 'added' | 'removed'; reaction?: any }> {
    try {
      const response = await api.post(`${REACTIONS_PREFIX}/messages/${messageId}/reactions`, {
        emoji
      });
      return response as { message: string; action: 'added' | 'removed'; reaction?: any };
    } catch (error) {
      console.error('Error toggling message reaction:', error);
      throw error;
    }
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
   * Get all reactions for a direct message
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
   * Add or remove a reaction to/from a direct message (toggle)
   */
  async toggleDMReaction(dmId: number, emoji: string): Promise<{ message: string; action: 'added' | 'removed'; reaction?: any }> {
    try {
      const response = await api.post(`${REACTIONS_PREFIX}/direct-messages/${dmId}/reactions`, {
        emoji
      });
      return response as { message: string; action: 'added' | 'removed'; reaction?: any };
    } catch (error) {
      console.error('Error toggling DM reaction:', error);
      throw error;
    }
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
