// services/friendService.ts - Uses shared types ONLY
import axios from 'axios';
import type { FriendRequest } from '@/types';

const API_URL = 'http://localhost:5000/api/friends';

class FriendService {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  async sendFriendRequest(username: string): Promise<FriendRequest> {
    try {
      const response = await axios.post<FriendRequest>(
        `${API_URL}/request`,
        { username },
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error sending friend request:', error);
      throw error;
    }
  }

  async getPendingRequests(): Promise<FriendRequest[]> {
    try {
      const response = await axios.get<FriendRequest[]>(
        `${API_URL}/requests/pending`, 
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching friend requests:', error);
      throw error;
    }
  }

  async acceptFriendRequest(requestId: number): Promise<void> {
    try {
      await axios.post(
        `${API_URL}/request/${requestId}/accept`,
        {},
        this.getAuthHeaders()
      );
    } catch (error) {
      console.error('Error accepting friend request:', error);
      throw error;
    }
  }

  async rejectFriendRequest(requestId: number): Promise<void> {
    try {
      await axios.post(
        `${API_URL}/request/${requestId}/reject`,
        {},
        this.getAuthHeaders()
      );
    } catch (error) {
      console.error('Error rejecting friend request:', error);
      throw error;
    }
  }

  async removeFriend(friendId: number): Promise<void> {
    try {
      await axios.delete(`${API_URL}/${friendId}`, this.getAuthHeaders());
    } catch (error) {
      console.error('Error removing friend:', error);
      throw error;
    }
  }

  async blockUser(userId: number): Promise<void> {
    try {
      await axios.post(
        `${API_URL}/block/${userId}`,
        {},
        this.getAuthHeaders()
      );
    } catch (error) {
      console.error('Error blocking user:', error);
      throw error;
    }
  }

  async unblockUser(userId: number): Promise<void> {
    try {
      await axios.post(
        `${API_URL}/unblock/${userId}`,
        {},
        this.getAuthHeaders()
      );
    } catch (error) {
      console.error('Error unblocking user:', error);
      throw error;
    }
  }
}

export const friendService = new FriendService();