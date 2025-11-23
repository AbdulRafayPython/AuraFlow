// services/channelService.ts
import axios from 'axios';

const API_URL = 'http://localhost:5000/api/channels';

export interface Community {
  id: number;
  name: string;
  icon: string;
  color: string;
  banner_url?: string;
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

class ChannelService {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  // Get all communities for the user
    async getCommunities(): Promise<Community[]> {
      try {
        const response = await axios.get<Community[]>(`${API_URL}/communities`, this.getAuthHeaders());
        return response.data;
      } catch (error) {
        console.error('Error fetching communities:', error);
        throw error;
      }
    }

  // Get channels in a community
    async getCommunityChannels(communityId: number): Promise<Channel[]> {
      try {
        const response = await axios.get<Channel[]>(
          `${API_URL}/communities/${communityId}/channels`,
          this.getAuthHeaders()
        );
        return response.data;
      } catch (error) {
        console.error('Error fetching community channels:', error);
        throw error;
      }
    }

  // Get friends list
    async getFriends(): Promise<Friend[]> {
      try {
        const response = await axios.get<Friend[]>(`${API_URL}/friends`, this.getAuthHeaders());
        return response.data;
      } catch (error) {
        console.error('Error fetching friends:', error);
        throw error;
      }
    }

  // Create a new channel
    async createChannel(communityId: number, name: string, type: 'text' | 'voice' = 'text', description?: string): Promise<Channel> {
      try {
        const response = await axios.post<Channel>(
          `${API_URL}/communities/${communityId}/channels`,
          { name, type, description },
          this.getAuthHeaders()
        );
        return response.data;
      } catch (error) {
        console.error('Error creating channel:', error);
        throw error;
      }
    }

  // Join a channel
  async joinChannel(channelId: number): Promise<void> {
    try {
      await axios.post(
        `${API_URL}/channels/${channelId}/join`,
        {},
        this.getAuthHeaders()
      );
    } catch (error) {
      console.error('Error joining channel:', error);
      throw error;
    }
  }

  // Leave a channel
  async leaveChannel(channelId: number): Promise<void> {
    try {
      await axios.post(
        `${API_URL}/channels/${channelId}/leave`,
        {},
        this.getAuthHeaders()
      );
    } catch (error) {
      console.error('Error leaving channel:', error);
      throw error;
    }
  }
}

export const channelService = new ChannelService();
