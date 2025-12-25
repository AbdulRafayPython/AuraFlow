// services/messageService.ts - Uses shared types ONLY
import axios from 'axios';
import type { Message, DirectMessage, SendMessageData, SendMessageResponse } from '@/types';

const API_URL = 'http://localhost:5000/api';

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

  async getChannelMessages(channelId: number, limit = 50, offset = 0): Promise<Message[]> {
    try {
      const response = await axios.get<Message[]>(
        `${API_URL}/messages/channel/${channelId}?limit=${limit}&offset=${offset}`,
        this.getAuthHeaders()
      );
      
      // Normalize the response
      return response.data.map((msg: any): Message => ({
        id: typeof msg.id === 'string' ? Number(msg.id) : msg.id,
        channel_id: msg.channel_id,
        sender_id: msg.sender_id,
        content: msg.content,
        message_type: msg.message_type || 'text',
        created_at: msg.created_at,
        author: msg.author || msg.username || 'Unknown',
        avatar_url: msg.avatar || msg.avatar_url || '',
        edited_at: msg.edited_at || null,
        reply_to: msg.reply_to || null,
      }));
    } catch (error) {
      console.error('Error fetching channel messages:', error);
      throw error;
    }
  }

  async sendChannelMessage(data: SendMessageData): Promise<SendMessageResponse> {
    try {
      const response = await axios.post<any>(
        `${API_URL}/messages/send`,
        data,
        this.getAuthHeaders()
      );
      const payload: any = response.data;
      const rawMessage = payload.message || (payload.id ? payload : null);
      let normalized: Message | undefined;

      if (rawMessage && rawMessage.id) {
        normalized = {
          id: typeof rawMessage.id === 'string' ? Number(rawMessage.id) : rawMessage.id,
          channel_id: rawMessage.channel_id,
          sender_id: rawMessage.sender_id,
          content: rawMessage.content,
          message_type: rawMessage.message_type || 'text',
          created_at: rawMessage.created_at,
          author: rawMessage.author || rawMessage.username || 'You',
          avatar_url: rawMessage.avatar || rawMessage.avatar_url || '',
          edited_at: rawMessage.edited_at || null,
          reply_to: rawMessage.reply_to || null,
          moderation: rawMessage.moderation,
        } as Message;
      }

      return {
        message: normalized,
        moderation: payload.moderation || rawMessage?.moderation,
      };
    } catch (error) {
      // Surface moderation responses even on non-2xx
      const moderation = error?.response?.data?.moderation;
      if (moderation) {
        return { moderation } as SendMessageResponse;
      }
      console.error('Error sending message:', error);
      throw error;
    }
  }

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