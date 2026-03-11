// services/pinService.ts — Pin/unpin messages with timer support + DM pins
// Includes active-pin endpoints for the pinned message banner
import axios from 'axios';
import { API_URL } from '@/config/api';

export interface PinnedByInfo {
  username: string;
  display_name: string;
  user_id: number;
}

export interface PinnedMessage {
  pin_id: number;
  pinned_at: string;
  expires_at: string | null;
  pinned_by: PinnedByInfo;
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

export interface DMPinnedMessage {
  pin_id: number;
  pinned_at: string;
  expires_at: string | null;
  pinned_by: PinnedByInfo;
  message: {
    id: number;
    sender_id: number;
    receiver_id: number;
    content: string;
    message_type: string;
    created_at: string;
    author: string;
    display_name: string;
    avatar_url: string;
  };
}

/** Duration options in minutes — must match backend ALLOWED_DURATIONS */
export const PIN_DURATION_OPTIONS = [
  { label: '24 Hours', minutes: 1440 },
  { label: '7 Days', minutes: 10080 },
  { label: '1 Month', minutes: 43200 },
] as const;

export type PinDurationMinutes = 1440 | 10080 | 43200;

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

  // ── Channel Pins ──────────────────────────────────────────────────────────

  async getPinnedMessages(channelId: number): Promise<{ pins: PinnedMessage[]; count: number }> {
    const { data } = await axios.get<{ pins: PinnedMessage[]; count: number }>(
      `${API_URL}/pins/channel/${channelId}`, this.getAuthHeaders()
    );
    return data;
  }

  /** Get the single active pinned message for the banner */
  async getActivePin(channelId: number): Promise<PinnedMessage | null> {
    const { data } = await axios.get<{ pin: PinnedMessage | null }>(
      `${API_URL}/pins/channel/${channelId}/active`, this.getAuthHeaders()
    );
    return data.pin;
  }

  async pinMessage(channelId: number, messageId: number, durationMinutes: PinDurationMinutes): Promise<{
    pin_id: number; expires_at: string; pinned_by: string; pinned_by_user_id: number;
  }> {
    const { data } = await axios.post(`${API_URL}/pins/pin`, {
      channel_id: channelId,
      message_id: messageId,
      duration_minutes: durationMinutes,
    }, this.getAuthHeaders());
    return data;
  }

  async unpinMessage(channelId: number, messageId: number): Promise<void> {
    await axios.post(`${API_URL}/pins/unpin`, {
      channel_id: channelId,
      message_id: messageId,
    }, this.getAuthHeaders());
  }

  // ── DM Pins ───────────────────────────────────────────────────────────────

  async getDMPinnedMessages(otherUserId: number): Promise<{ pins: DMPinnedMessage[]; count: number }> {
    const { data } = await axios.get<{ pins: DMPinnedMessage[]; count: number }>(
      `${API_URL}/pins/dm/${otherUserId}`, this.getAuthHeaders()
    );
    return data;
  }

  /** Get the single active DM pinned message for the banner */
  async getDMActivePin(otherUserId: number): Promise<DMPinnedMessage | null> {
    const { data } = await axios.get<{ pin: DMPinnedMessage | null }>(
      `${API_URL}/pins/dm/${otherUserId}/active`, this.getAuthHeaders()
    );
    return data.pin;
  }

  async pinDMMessage(otherUserId: number, messageId: number, durationMinutes: PinDurationMinutes): Promise<{
    pin_id: number; expires_at: string; pinned_by: string; pinned_by_user_id: number;
  }> {
    const { data } = await axios.post(`${API_URL}/pins/dm/pin`, {
      message_id: messageId,
      other_user_id: otherUserId,
      duration_minutes: durationMinutes,
    }, this.getAuthHeaders());
    return data;
  }

  async unpinDMMessage(otherUserId: number, messageId: number): Promise<void> {
    await axios.post(`${API_URL}/pins/dm/unpin`, {
      message_id: messageId,
      other_user_id: otherUserId,
    }, this.getAuthHeaders());
  }
}

export const pinService = new PinService();
