// services/statusService.ts — Presence, custom status, user profile, unread tracking
import axios from 'axios';
import { API_URL } from '@/config/api';

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

export interface UserProfile {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  bio: string | null;
  status: PresenceStatus;
  custom_status: string | null;
  custom_status_emoji: string | null;
  last_seen: string | null;
  member_since: string | null;
  friendship_status: 'none' | 'friends' | 'pending_sent' | 'pending_received';
  mutual_friends_count: number;
  shared_communities: { id: number; name: string; icon: string; color: string; logo_url: string | null }[];
  is_self: boolean;
}

export type UnreadCounts = Record<string, {
  unread_count: number;
  last_message_id: number;
  last_message_at: string | null;
}>;

class StatusService {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
  }

  // ---- Presence & Status ----

  async updateMyStatus(data: {
    status?: PresenceStatus;
    custom_status?: string;
    custom_status_emoji?: string;
  }): Promise<{ status: PresenceStatus; custom_status: string | null; custom_status_emoji: string | null }> {
    const resp = await axios.put<{ status: PresenceStatus; custom_status: string; custom_status_emoji: string }>(`${API_URL}/status/me`, data, this.getAuthHeaders());
    return resp.data;
  }

  async getMyStatus(): Promise<{
    id: number; username: string; display_name: string; avatar_url: string;
    bio: string; status: PresenceStatus; custom_status: string | null;
    custom_status_emoji: string | null; last_seen: string | null;
  }> {
    const resp = await axios.get<{ id: number; username: string; display_name: string; avatar_url: string; bio: string; status: PresenceStatus; custom_status: string | null; custom_status_emoji: string | null; last_seen: string | null }>(`${API_URL}/status/me`, this.getAuthHeaders());
    return resp.data;
  }

  // ---- User Profile (for popover) ----

  async getUserProfile(username: string): Promise<UserProfile> {
    const resp = await axios.get<UserProfile>(`${API_URL}/status/user/${username}`, this.getAuthHeaders());
    return resp.data;
  }

  // ---- Unread Tracking ----

  async getUnreadCounts(): Promise<UnreadCounts> {
    const resp = await axios.get<UnreadCounts>(`${API_URL}/status/unread`, this.getAuthHeaders());
    return resp.data;
  }

  async markChannelRead(channelId: number, messageId?: number): Promise<void> {
    await axios.post(`${API_URL}/status/unread/mark-read`, {
      channel_id: channelId,
      message_id: messageId,
    }, this.getAuthHeaders());
  }
}

export const statusService = new StatusService();
