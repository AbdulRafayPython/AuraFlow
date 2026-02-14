// services/pinService.ts — Pin/unpin messages, fetch pinned list
import axios from 'axios';
import { API_URL } from '@/config/api';

export interface PinnedMessage {
  pin_id: number;
  pinned_at: string;
  pinned_by: { username: string; display_name: string };
  message: {
    id: number;
    sender_id: number;
    content: string;
    message_type: string;
    created_at: string;
    author: string;
    display_name: string;
    avatar_url: string;
    attachment?: {
      file_name: string;
      file_url: string;
      file_size: number;
      mime_type: string;
    };
  };
}

class PinService {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
  }

  async getPinnedMessages(channelId: number): Promise<{ pins: PinnedMessage[]; count: number }> {
    const { data } = await axios.get<{ pins: PinnedMessage[]; count: number }>(`${API_URL}/pins/channel/${channelId}`, this.getAuthHeaders());
    return data;
  }

  async pinMessage(channelId: number, messageId: number): Promise<void> {
    await axios.post(`${API_URL}/pins/pin`, { channel_id: channelId, message_id: messageId }, this.getAuthHeaders());
  }

  async unpinMessage(channelId: number, messageId: number): Promise<void> {
    await axios.post(`${API_URL}/pins/unpin`, { channel_id: channelId, message_id: messageId }, this.getAuthHeaders());
  }
}

export const pinService = new PinService();
