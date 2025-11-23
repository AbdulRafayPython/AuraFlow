// services/friendService.ts
import axios from 'axios';

const API_URL = 'http://localhost:5000/api/friends';

export interface FriendRequest {
  id: number;
  sender_id: number;
  receiver_id: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  created_at: string;
  sender?: {
    username: string;
    display_name: string;
    avatar_url: string;
  };
}

class FriendService {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  // Send friend request
  async sendFriendRequest(username: string): Promise<FriendRequest> {
    try {
      const response = await axios.post<FriendRequest>(
        `${API_URL}/request`,
        { username },
        this.getAuthHeaders()
      );
      return response.data as FriendRequest;
    } catch (error) {
      console.error('Error sending friend request:', error);
      throw error;
    }
  }

  // Get pending friend requests
  async getPendingRequests(): Promise<FriendRequest[]> {
    try {
      const response = await axios.get<FriendRequest[]>(`${API_URL}/requests/pending`, this.getAuthHeaders());
      return response.data;
    } catch (error) {
      console.error('Error fetching friend requests:', error);
      throw error;
    }
  }

  // Accept friend request
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

  // Reject friend request
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

  // Remove friend
  async removeFriend(friendId: number): Promise<void> {
    try {
      await axios.delete(`${API_URL}/${friendId}`, this.getAuthHeaders());
    } catch (error) {
      console.error('Error removing friend:', error);
      throw error;
    }
  }

  // Block user
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

  // Unblock user
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
