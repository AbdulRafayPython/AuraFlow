// services/directMessageService.ts - Direct messaging service
import axios from 'axios';
import type { DirectMessage } from '@/types';
import { API_SERVER } from '@/config/api';

const API_BASE = `${API_SERVER}/api`;

class DirectMessageService {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  // Get direct messages with a user
  async getDirectMessages(
    userId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<DirectMessage[]> {
    try {
      console.log('[directMessageService] Fetching DMs for user:', userId, { limit, offset });
      const response = await axios.get<DirectMessage[]>(
        `${API_BASE}/messages/direct/${userId}`,
        {
          params: { limit, offset },
          ...this.getAuthHeaders(),
        }
      );
      console.log('[directMessageService] API Response:', response.data);
      return response.data;
    } catch (error) {
      console.error('[directMessageService] Error fetching direct messages:', error);
      throw error;
    }
  }

  // Send direct message
  async sendDirectMessage(
    receiverId: number,
    content: string,
    messageType: 'text' | 'image' | 'file' = 'text',
    replyTo?: number
  ): Promise<DirectMessage> {
    try {
      console.log('[directMessageService] Sending DM to user:', receiverId, { content, messageType, replyTo });
      const response = await axios.post<DirectMessage>(
        `${API_BASE}/messages/direct/send`,
        {
          receiver_id: receiverId,
          content,
          message_type: messageType,
          ...(replyTo ? { reply_to: replyTo } : {}),
        },
        this.getAuthHeaders()
      );
      console.log('[directMessageService] Send response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('[directMessageService] Error sending direct message:', error.response?.data?.message || error.message);
      throw error;
    }
  }

  // Delete direct message (for me)
  async deleteDirectMessage(messageId: number): Promise<{ message: string }> {
    try {
      const response = await axios.delete<{ message: string }>(
        `${API_BASE}/messages/direct/${messageId}`,
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error deleting message:', error.response?.data?.message || error.message);
      throw error;
    }
  }

  // Edit direct message
  async editDirectMessage(
    messageId: number,
    content: string
  ): Promise<DirectMessage> {
    try {
      const response = await axios.put<DirectMessage>(
        `${API_BASE}/messages/direct/${messageId}`,
        { content },
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error editing message:', error.response?.data?.message || error.message);
      throw error;
    }
  }

  // Mark message as read
  async markAsRead(messageId: number): Promise<{ message: string }> {
    try {
      console.log('[directMessageService] Marking message as read:', messageId);
      const response = await axios.post<{ message: string }>(
        `${API_BASE}/messages/read`,
        { message_ids: [messageId] },
        this.getAuthHeaders()
      );
      console.log('[directMessageService] Mark as read response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('[directMessageService] Error marking message as read:', error.response?.data?.message || error.message);
      throw error;
    }
  }

  // Mark all messages from user as read
  async markAllAsRead(userId: number): Promise<{ message: string }> {
    try {
      console.log('[directMessageService] Marking all messages as read from user:', userId);
      // Get all unread message IDs for this user first
      const messages = await this.getDirectMessages(userId);
      const unreadIds = messages
        .filter(m => !m.is_read && m.receiver_id === (JSON.parse(localStorage.getItem('user') || '{}')?.id || 0))
        .map(m => m.id);
      
      if (unreadIds.length === 0) {
        return { message: 'No unread messages' };
      }
      
      const response = await axios.post<{ message: string }>(
        `${API_BASE}/messages/read`,
        { message_ids: unreadIds },
        this.getAuthHeaders()
      );
      console.log('[directMessageService] Mark all as read response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('[directMessageService] Error marking all messages as read:', error.response?.data?.message || error.message);
      throw error;
    }
  }
}

export const directMessageService = new DirectMessageService();
