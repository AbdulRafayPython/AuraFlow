// services/directMessageService.ts - Direct messaging service
import axios from 'axios';
import type { DirectMessage } from '@/types';

const API_BASE = 'http://localhost:5000/api';

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
      const response = await axios.get<DirectMessage[]>(
        `${API_BASE}/messages/direct/${userId}`,
        {
          params: { limit, offset },
          ...this.getAuthHeaders(),
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching direct messages:', error);
      throw error;
    }
  }

  // Send direct message
  async sendDirectMessage(
    receiverId: number,
    content: string,
    messageType: 'text' | 'image' | 'file' = 'text'
  ): Promise<DirectMessage> {
    try {
      const response = await axios.post<DirectMessage>(
        `${API_BASE}/messages/direct/send`,
        {
          receiver_id: receiverId,
          content,
          message_type: messageType,
        },
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error sending direct message:', error.response?.data?.message || error.message);
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
      const response = await axios.post<{ message: string }>(
        `${API_BASE}/messages/direct/${messageId}/read`,
        {},
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error marking message as read:', error.response?.data?.message || error.message);
      throw error;
    }
  }

  // Mark all messages from user as read
  async markAllAsRead(userId: number): Promise<{ message: string }> {
    try {
      const response = await axios.post<{ message: string }>(
        `${API_BASE}/messages/direct/${userId}/read-all`,
        {},
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error marking messages as read:', error.response?.data?.message || error.message);
      throw error;
    }
  }
}

export const directMessageService = new DirectMessageService();
