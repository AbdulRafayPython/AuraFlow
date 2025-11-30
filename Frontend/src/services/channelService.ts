// services/channelService.ts - Uses shared types ONLY
import axios from 'axios';
import type { 
  Community, 
  Channel, 
  Friend, 
  User, 
  CommunityMember, 
  CreateCommunityPayload 
} from '@/types';

const API_URL = 'http://localhost:5000/api/channels';

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
      
      // Normalize friend data
      return response.data.map((friend: any): Friend => ({
        id: friend.id,
        username: friend.username,
        display_name: friend.display_name || friend.username,
        avatar: friend.avatar || friend.avatar_url || '',
        avatar_url: friend.avatar_url || friend.avatar || '',
        status: friend.status || 'offline',
        custom_status: friend.custom_status,
        last_seen: friend.last_seen,
      }));
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

  async createChannel(
    communityId: number, 
    name: string, 
    type: 'text' | 'voice' = 'text', 
    description?: string
  ): Promise<Channel> {
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

  async updateChannel(
    channelId: number,
    name?: string,
    description?: string,
    type?: 'text' | 'voice'
  ): Promise<Channel> {
    const payload: any = {};
    if (name !== undefined) payload.name = name;
    if (description !== undefined) payload.description = description;
    if (type !== undefined) payload.type = type;

    try {
      const response = await axios.put<Channel>(
        `${API_URL}/${channelId}`,
        payload,
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error updating channel:', error);
      throw new Error(error.response?.data?.error || 'Failed to update channel');
    }
  }

  async deleteCommunity(communityId: number): Promise<void> {
    try {
      await axios.delete(`${API_URL}/communities/${communityId}`, this.getAuthHeaders());
    } catch (error: any) {
      console.error('Error deleting community:', error);
      throw new Error(error.response?.data?.error || 'Failed to delete community');
    }
  }

  async leaveCommunity(communityId: number): Promise<void> {
    try {
      await axios.post(
        `${API_URL}/communities/${communityId}/leave`,
        {},
        this.getAuthHeaders()
      );
    } catch (error: any) {
      console.error('Error leaving community:', error);
      throw new Error(error.response?.data?.error || 'Failed to leave community');
    }
  }

  async discoverCommunities(search: string = '', limit: number = 20, offset: number = 0): Promise<Community[]> {
    try {
      const params = new URLSearchParams({
        ...(search && { search }),
        limit: limit.toString(),
        offset: offset.toString(),
      });
      
      const response = await axios.get<Community[]>(
        `${API_URL}/communities/discover?${params}`,
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error discovering communities:', error);
      throw new Error(error.response?.data?.error || 'Failed to discover communities');
    }
  }

  async joinCommunity(communityId: number): Promise<void> {
    try {
      await axios.post(
        `${API_URL}/communities/${communityId}/join`,
        {},
        this.getAuthHeaders()
      );
    } catch (error: any) {
      console.error('Error joining community:', error);
      throw new Error(error.response?.data?.error || 'Failed to join community');
    }
  }

  async getUserRoleInCommunity(communityId: number, userId: number): Promise<'owner' | 'admin' | 'member'> {
    try {
      const members = await this.getCommunityMembers(communityId);
      const member = members.find(m => m.id === userId);
      return member?.role || 'member';
    } catch (error: any) {
      console.error('Error getting user role:', error);
      // Default to member if we can't fetch
      return 'member';
    }
  }

  async searchUsers(query: string): Promise<any[]> {
    try {
      const response = await axios.get<any[]>(
        `${API_URL}/users/search?query=${encodeURIComponent(query)}`,
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error searching users:', error);
      throw new Error(error.response?.data?.error || 'Failed to search users');
    }
  }
}

export const channelService = new ChannelService();