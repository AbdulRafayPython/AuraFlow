// services/friendService.ts - Comprehensive friend management service
import axios from 'axios';
import type { Friend, FriendRequest, User, BlockedUser } from '@/types';

const API_BASE = 'http://localhost:5000/api';

class FriendService {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  // Get all friends
  async getFriends(): Promise<Friend[]> {
    try {
      const response = await axios.get<Friend[]>(
        `${API_BASE}/friends`,
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching friends:', error);
      throw error;
    }
  }

  // Send friend request
  async sendFriendRequest(username: string): Promise<FriendRequest> {
    try {
      const response = await axios.post<FriendRequest>(
        `${API_BASE}/friends/request`,
        { username },
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error sending friend request:', error.response?.data?.message || error.message);
      throw error;
    }
  }

  // Get pending friend requests (received)
  async getPendingRequests(): Promise<FriendRequest[]> {
    try {
      const response = await axios.get<FriendRequest[]>(
        `${API_BASE}/friends/requests/pending`,
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching pending requests:', error);
      throw error;
    }
  }

  // Get sent friend requests
  async getSentRequests(): Promise<FriendRequest[]> {
    try {
      const response = await axios.get<FriendRequest[]>(
        `${API_BASE}/friends/requests/sent`,
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching sent requests:', error);
      throw error;
    }
  }

  // Accept friend request
  async acceptFriendRequest(requestId: number): Promise<{ message: string }> {
    try {
      const response = await axios.post<{ message: string }>(
        `${API_BASE}/friends/request/${requestId}/accept`,
        {},
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error accepting friend request:', error.response?.data?.message || error.message);
      throw error;
    }
  }

  // Reject friend request
  async rejectFriendRequest(requestId: number): Promise<{ message: string }> {
    try {
      const response = await axios.post<{ message: string }>(
        `${API_BASE}/friends/request/${requestId}/reject`,
        {},
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error rejecting friend request:', error.response?.data?.message || error.message);
      throw error;
    }
  }

  // Cancel sent friend request
  async cancelFriendRequest(requestId: number): Promise<{ message: string }> {
    try {
      const response = await axios.post<{ message: string }>(
        `${API_BASE}/friends/request/${requestId}/cancel`,
        {},
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error canceling friend request:', error.response?.data?.message || error.message);
      throw error;
    }
  }

  // Remove friend / Unfriend
  async removeFriend(friendId: number): Promise<{ message: string }> {
    try {
      const response = await axios.delete<{ message: string }>(
        `${API_BASE}/friends/${friendId}`,
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error removing friend:', error.response?.data?.message || error.message);
      throw error;
    }
  }

  // Block user
  async blockUser(userId: number): Promise<{ message: string }> {
    try {
      const response = await axios.post<{ message: string }>(
        `${API_BASE}/friends/block/${userId}`,
        {},
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error blocking user:', error.response?.data?.message || error.message);
      throw error;
    }
  }

  // Unblock user
  async unblockUser(userId: number): Promise<{ message: string }> {
    try {
      const response = await axios.post<{ message: string }>(
        `${API_BASE}/friends/unblock/${userId}`,
        {},
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error: any) {
      console.error('Error unblocking user:', error.response?.data?.message || error.message);
      throw error;
    }
  }

  // Get blocked users
  async getBlockedUsers(): Promise<BlockedUser[]> {
    try {
      const response = await axios.get<BlockedUser[]>(
        `${API_BASE}/friends/blocked`,
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching blocked users:', error);
      throw error;
    }
  }

  // Search users
  async searchUsers(query: string): Promise<User[]> {
    try {
      const response = await axios.get<User[]>(
        `${API_BASE}/users/search`,
        {
          params: { query },
          ...this.getAuthHeaders(),
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error searching users:', error);
      throw error;
    }
  }

  // Get user by ID
  async getUserById(userId: number): Promise<User> {
    try {
      const response = await axios.get<User>(
        `${API_BASE}/users/${userId}`,
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching user:', error);
      throw error;
    }
  }
}

export const friendService = new FriendService();