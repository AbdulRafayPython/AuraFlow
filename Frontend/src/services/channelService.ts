// services/channelService.ts
import axios from 'axios';

const API_URL = 'http://localhost:5000/api/channels';

// ──────────────────────────────────────────────────────────────
// Types & Interfaces
// ──────────────────────────────────────────────────────────────
export interface Community {
  id: number;
  name: string;
  icon: string;
  color: string;
  banner_url?: string;
  description?: string;
  role: 'owner' | 'admin' | 'member';
}

export interface Channel {
  id: number;
  name: string;
  type: 'text' | 'voice' | 'private';
  description?: string;
  created_at: string;
}

export interface Friend {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  custom_status?: string;
  last_seen?: string;
}

export interface CreateCommunityPayload {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

// New types for community members
export interface User {
  id: number;
  username: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
}

export interface CommunityMember extends User {
  role: 'owner' | 'admin' | 'member';
}

export interface CreateCommunityPayload {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

// ──────────────────────────────────────────────────────────────
// ChannelService Class
// ──────────────────────────────────────────────────────────────
class ChannelService {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }
    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  // ── Existing Methods (unchanged) ───────────────────────────
  async getCommunities(): Promise<Community[]> {
    try {
      const response = await axios.get<Community[]>(`${API_URL}/communities`, this.getAuthHeaders());
      return response.data;
    } catch (error: any) {
      console.error('Error fetching communities:', error);
      throw new Error(error.response?.data?.error || 'Failed to fetch communities');
    }
  }

  async getCommunityChannels(communityId: number): Promise<Channel[]> {
    try {
      const response = await axios.get<Channel[]>(
        `${API_URL}/communities/${communityId}/channels`,
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error fetching community channels:', error);
      throw new Error(error.response?.data?.error || 'Failed to fetch channels');
    }
  }

  async getFriends(): Promise<Friend[]> {
    try {
      const response = await axios.get<Friend[]>(`${API_URL}/friends`, this.getAuthHeaders());
      return response.data;
    } catch (error: any) {
      console.error('Error fetching friends:', error);
      throw new Error(error.response?.data?.error || 'Failed to fetch friends');
    }
  }

  async createCommunity(payload: CreateCommunityPayload): Promise<Community> {
    try {
      const response = await axios.post<Community>(
        `${API_URL}/communities`,
        payload,
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error creating community:', error);
      throw new Error(error.response?.data?.error || 'Failed to create community');
    }
  }

  async createChannel(communityId: number, name: string, type: 'text' | 'voice' = 'text', description?: string): Promise<Channel> {
    try {
      const response = await axios.post<Channel>(
        `${API_URL}/communities/${communityId}/channels`,
        { name, type, description },
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error creating channel:', error);
      throw new Error(error.response?.data?.error || 'Failed to create channel');
    }
  }

  async joinChannel(channelId: number): Promise<void> {
    try {
      await axios.post(`${API_URL}/${channelId}/join`, {}, this.getAuthHeaders());
    } catch (error: any) {
      console.error('Error joining channel:', error);
      throw new Error(error.response?.data?.error || 'Failed to join channel');
    }
  }

  async leaveChannel(channelId: number): Promise<void> {
    try {
      await axios.post(`${API_URL}/${channelId}/leave`, {}, this.getAuthHeaders());
    } catch (error: any) {
      console.error('Error leaving channel:', error);
      throw new Error(error.response?.data?.error || 'Failed to leave channel');
    }
  }

  async deleteChannel(channelId: number): Promise<void> {
    try {
      await axios.delete(`${API_URL}/${channelId}`, this.getAuthHeaders());
    } catch (error: any) {
      console.error('Error deleting channel:', error);
      throw new Error(error.response?.data?.error || 'Failed to delete channel');
    }
  }

  // ── NEW: Community Member Methods (with proper error handling) ──

  /** Search users by username (fuzzy) or email (exact) */
  async searchUsers(query: string): Promise<User[]> {
    if (!query.trim() || query.length < 2) return [];

    try {
      const response = await axios.get<User[]>(
        `${API_URL}/users/search`,
        {
          ...this.getAuthHeaders(),
          params: { query: query.trim() },
          timeout: 8000,
        }
      );
      return response.data || [];
    } catch (error: any) {
      console.error('[ChannelService] searchUsers failed:', error);
      const msg = error.response?.data?.error || 'Search failed';
      throw new Error(msg);
    }
  }

  /** Get all members of a community */
  async getCommunityMembers(communityId: number): Promise<CommunityMember[]> {
    if (!communityId) throw new Error('Community ID is required');

    try {
      const response = await axios.get<CommunityMember[]>(
        `${API_URL}/community/members`,
        {
          ...this.getAuthHeaders(),
          params: { communityId },
          timeout: 10000,
        }
      );
      return response.data || [];
    } catch (error: any) {
      console.error('[ChannelService] getCommunityMembers failed:', error);

      if (error.response?.status === 403) {
        throw new Error("You don't have permission to view members");
      }
      if (error.response?.status === 404) {
        throw new Error('Community not found');
      }

      const msg = error.response?.data?.error || 'Failed to load members';
      throw new Error(msg);
    }
  }

  /** Add a user to a community */
  async addCommunityMember(communityId: number, userId: number): Promise<void> {
    if (!communityId || !userId) {
      throw new Error('Both community ID and user ID are required');
    }

    try {
      await axios.post(
        `${API_URL}/community/add-member`,
        { communityId, userId },
        {
          ...this.getAuthHeaders(),
          timeout: 10000,
        }
      );
    } catch (error: any) {
      console.error('[ChannelService] addCommunityMember failed:', error);

      if (error.response?.status === 403) {
        throw new Error("You don't have permission to add members");
      }
      if (error.response?.status === 404) {
        throw new Error('Community or user not found');
      }
      if (error.response?.status === 409) {
        throw new Error('User is already a member');
      }

      const msg = error.response?.data?.error || 'Failed to add member';
      throw new Error(msg);
    }
  }
}

export const channelService = new ChannelService();