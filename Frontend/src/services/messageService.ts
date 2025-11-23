// services/messageService.ts
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

export interface Message {
  id: number;
  channel_id: number;
  sender_id: number;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'system' | 'ai';
  reply_to?: number;
  created_at: string;
  author?: string;
  avatar?: string;
}

export interface SendMessageData {
  channel_id: number;
  content: string;
  message_type?: 'text' | 'image' | 'file';
  reply_to?: number;
}

export interface DirectMessage {
  id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'ai';
  created_at: string;
  is_read: boolean;
}

class MessageService {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
  }

  // Get messages for a channel
  async getChannelMessages(channelId: number, limit = 50, offset = 0): Promise<Message[]> {
    try {
      const response = await axios.get<Message[]>(
        `${API_URL}/messages/channel/${channelId}?limit=${limit}&offset=${offset}`,
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching channel messages:', error);
      throw error;
    }
  }

  // Send a message to a channel
  async sendChannelMessage(data: SendMessageData): Promise<Message> {
    try {
      const response = await axios.post<Message>(
        `${API_URL}/messages/send`,
        data,
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  // Get direct messages with a user
  async getDirectMessages(userId: number, limit = 50, offset = 0): Promise<DirectMessage[]> {
    try {
      const response = await axios.get<DirectMessage[]>(
        `${API_URL}/messages/direct/${userId}?limit=${limit}&offset=${offset}`,
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching direct messages:', error);
      throw error;
    }
  }

  // Send a direct message
  async sendDirectMessage(receiverId: number, content: string, messageType = 'text'): Promise<DirectMessage> {
    try {
      const response = await axios.post<DirectMessage>(
        `${API_URL}/messages/direct/send`,
        {
          receiver_id: receiverId,
          content,
          message_type: messageType,
        },
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error sending direct message:', error);
      throw error;
    }
  }

  // Mark messages as read
  async markAsRead(messageIds: number[]): Promise<void> {
    try {
      await axios.post(
        `${API_URL}/messages/read`,
        { message_ids: messageIds },
        this.getAuthHeaders()
      );
    } catch (error) {
      console.error('Error marking messages as read:', error);
      throw error;
    }
  }

  // Delete a message
  async deleteMessage(messageId: number): Promise<void> {
    try {
      await axios.delete(
        `${API_URL}/messages/${messageId}`,
        this.getAuthHeaders()
      );
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }

  // Edit a message
  async editMessage(messageId: number, content: string): Promise<Message> {
    try {
      const response = await axios.put<Message>(
        `${API_URL}/messages/${messageId}`,
        { content },
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error editing message:', error);
      throw error;
    }
  }
}

export const messageService = new MessageService();
