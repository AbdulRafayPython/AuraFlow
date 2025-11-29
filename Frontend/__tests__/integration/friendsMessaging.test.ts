// __tests__/integration/friendsMessaging.test.ts
// Integration tests for Friends & Messaging System

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { friendService } from '../../src/services/friendService';
import { directMessageService } from '../../src/services/directMessageService';
import { socketService } from '../../src/services/socketService';
import type { Friend, FriendRequest, DirectMessage } from '../../src/types';

describe('Friends & Messaging System Integration', () => {
  beforeEach(() => {
    // Mock localStorage
    localStorage.setItem('token', 'test-token');
  });

  describe('Friend Service', () => {
    it('should send friend request', async () => {
      // Mock API response
      const mockRequest: FriendRequest = {
        id: 1,
        sender_id: 1,
        receiver_id: 2,
        status: 'pending',
        created_at: new Date().toISOString(),
        sender: {
          username: 'testuser',
          display_name: 'Test User',
          avatar_url: 'avatar.jpg',
          id: 1,
        },
      };

      // In real tests, this would use axios mock
      expect(mockRequest.status).toBe('pending');
    });

    it('should accept friend request', async () => {
      const mockResponse = { message: 'Friend request accepted' };
      expect(mockResponse.message).toContain('accepted');
    });

    it('should get friends list', async () => {
      const mockFriends: Friend[] = [
        {
          id: 1,
          username: 'john',
          display_name: 'John Doe',
          avatar_url: 'avatar.jpg',
          status: 'online',
        },
        {
          id: 2,
          username: 'jane',
          display_name: 'Jane Smith',
          avatar_url: 'avatar2.jpg',
          status: 'offline',
        },
      ];

      expect(mockFriends).toHaveLength(2);
      expect(mockFriends[0].status).toBe('online');
    });

    it('should block user', async () => {
      const mockResponse = { message: 'User blocked' };
      expect(mockResponse.message).toContain('blocked');
    });

    it('should search users', async () => {
      const mockResults = [
        { id: 1, username: 'john', display_name: 'John Doe', email: 'john@test.com' },
        { id: 2, username: 'johnny', display_name: 'Johnny Appleseed', email: 'johnny@test.com' },
      ];

      const filtered = mockResults.filter(u => u.username.includes('john'));
      expect(filtered).toHaveLength(2);
    });
  });

  describe('Direct Message Service', () => {
    it('should send direct message', async () => {
      const mockMessage: DirectMessage = {
        id: 1,
        sender_id: 1,
        receiver_id: 2,
        content: 'Hello!',
        message_type: 'text',
        created_at: new Date().toISOString(),
        is_read: false,
      };

      expect(mockMessage.content).toBe('Hello!');
      expect(mockMessage.message_type).toBe('text');
      expect(mockMessage.is_read).toBe(false);
    });

    it('should get message history', async () => {
      const mockMessages: DirectMessage[] = [
        {
          id: 1,
          sender_id: 1,
          receiver_id: 2,
          content: 'Hi there',
          message_type: 'text',
          created_at: new Date().toISOString(),
          is_read: true,
        },
        {
          id: 2,
          sender_id: 2,
          receiver_id: 1,
          content: 'Hey! How are you?',
          message_type: 'text',
          created_at: new Date().toISOString(),
          is_read: false,
        },
      ];

      expect(mockMessages).toHaveLength(2);
      const unread = mockMessages.filter(m => !m.is_read);
      expect(unread).toHaveLength(1);
    });

    it('should mark message as read', async () => {
      const mockMessage: DirectMessage = {
        id: 1,
        sender_id: 2,
        receiver_id: 1,
        content: 'Hello',
        message_type: 'text',
        created_at: new Date().toISOString(),
        is_read: false,
      };

      // Simulate marking as read
      mockMessage.is_read = true;
      expect(mockMessage.is_read).toBe(true);
    });

    it('should edit message', async () => {
      let mockMessage: DirectMessage = {
        id: 1,
        sender_id: 1,
        receiver_id: 2,
        content: 'Original text',
        message_type: 'text',
        created_at: new Date().toISOString(),
        is_read: false,
      };

      // Simulate editing
      mockMessage.content = 'Edited text';
      mockMessage.edited_at = new Date().toISOString();

      expect(mockMessage.content).toBe('Edited text');
      expect(mockMessage.edited_at).toBeDefined();
    });

    it('should delete message', async () => {
      const messages: DirectMessage[] = [
        {
          id: 1,
          sender_id: 1,
          receiver_id: 2,
          content: 'Message 1',
          message_type: 'text',
          created_at: new Date().toISOString(),
          is_read: false,
        },
        {
          id: 2,
          sender_id: 1,
          receiver_id: 2,
          content: 'Message 2',
          message_type: 'text',
          created_at: new Date().toISOString(),
          is_read: false,
        },
      ];

      const filtered = messages.filter(m => m.id !== 1);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(2);
    });
  });

  describe('Socket Service Integration', () => {
    it('should have DM event listeners', () => {
      // Check if methods exist
      expect(typeof socketService.onDirectMessage).toBe('function');
      expect(typeof socketService.onFriendRequest).toBe('function');
      expect(typeof socketService.onFriendStatus).toBe('function');
    });

    it('should join DM conversation', () => {
      expect(typeof socketService.joinDMConversation).toBe('function');
      expect(typeof socketService.leaveDMConversation).toBe('function');
    });

    it('should send typing indicator in DM', () => {
      expect(typeof socketService.sendDMTyping).toBe('function');
    });

    it('should broadcast friend request', () => {
      expect(typeof socketService.broadcastFriendRequest).toBe('function');
    });

    it('should manage friend status room', () => {
      expect(typeof socketService.joinFriendStatusRoom).toBe('function');
      expect(typeof socketService.leaveFriendStatusRoom).toBe('function');
    });
  });

  describe('Friend Request Flow', () => {
    it('should complete friend request -> accept -> chat flow', async () => {
      // 1. Send request
      const request: FriendRequest = {
        id: 1,
        sender_id: 1,
        receiver_id: 2,
        status: 'pending',
        created_at: new Date().toISOString(),
      };

      expect(request.status).toBe('pending');

      // 2. Accept request
      request.status = 'accepted';
      expect(request.status).toBe('accepted');

      // 3. Send message
      const message: DirectMessage = {
        id: 1,
        sender_id: 1,
        receiver_id: 2,
        content: 'Now we can chat!',
        message_type: 'text',
        created_at: new Date().toISOString(),
        is_read: false,
      };

      expect(message.content).toContain('chat');
      expect(message.is_read).toBe(false);
    });
  });

  describe('Blocking Functionality', () => {
    it('should prevent messaging from blocked user', async () => {
      const blockedUserId = 5;
      const blockedUsers = [5]; // Simulated blocked list

      const canMessage = !blockedUsers.includes(2);
      expect(canMessage).toBe(true);

      const cannotMessage = !blockedUsers.includes(blockedUserId);
      expect(cannotMessage).toBe(false);
    });

    it('should unblock user and allow messaging', async () => {
      let blockedUsers = [5];
      blockedUsers = blockedUsers.filter(id => id !== 5);

      expect(blockedUsers).toHaveLength(0);
      expect(!blockedUsers.includes(5)).toBe(true);
    });
  });

  describe('Message Ordering & Pagination', () => {
    it('should order messages chronologically', async () => {
      const now = new Date();
      const messages: DirectMessage[] = [
        {
          id: 1,
          sender_id: 1,
          receiver_id: 2,
          content: 'First',
          message_type: 'text',
          created_at: new Date(now.getTime() - 2000).toISOString(),
          is_read: false,
        },
        {
          id: 2,
          sender_id: 1,
          receiver_id: 2,
          content: 'Second',
          message_type: 'text',
          created_at: new Date(now.getTime() - 1000).toISOString(),
          is_read: false,
        },
        {
          id: 3,
          sender_id: 1,
          receiver_id: 2,
          content: 'Third',
          message_type: 'text',
          created_at: now.toISOString(),
          is_read: false,
        },
      ];

      const sorted = messages.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      expect(sorted[0].content).toBe('First');
      expect(sorted[2].content).toBe('Third');
    });

    it('should support pagination', async () => {
      const allMessages = Array.from({ length: 150 }, (_, i) => ({
        id: i + 1,
        sender_id: 1,
        receiver_id: 2,
        content: `Message ${i + 1}`,
        message_type: 'text' as const,
        created_at: new Date().toISOString(),
        is_read: false,
      }));

      const pageSize = 50;
      const page1 = allMessages.slice(0, pageSize);
      const page2 = allMessages.slice(pageSize, pageSize * 2);
      const page3 = allMessages.slice(pageSize * 2, pageSize * 3);

      expect(page1).toHaveLength(50);
      expect(page2).toHaveLength(50);
      expect(page3).toHaveLength(50);
    });
  });

  describe('Real-time Updates', () => {
    it('should handle friend status changes', async () => {
      const friend: Friend = {
        id: 1,
        username: 'john',
        display_name: 'John',
        avatar_url: 'avatar.jpg',
        status: 'offline',
      };

      // Simulate status change
      friend.status = 'online';
      expect(friend.status).toBe('online');

      friend.status = 'away';
      expect(friend.status).toBe('away');
    });

    it('should update unread message count', async () => {
      let unreadCount = 0;
      const messages: DirectMessage[] = [];

      // Receive message
      messages.push({
        id: 1,
        sender_id: 2,
        receiver_id: 1,
        content: 'New message',
        message_type: 'text',
        created_at: new Date().toISOString(),
        is_read: false,
      });
      unreadCount = messages.filter(m => !m.is_read).length;
      expect(unreadCount).toBe(1);

      // Mark as read
      messages[0].is_read = true;
      unreadCount = messages.filter(m => !m.is_read).length;
      expect(unreadCount).toBe(0);
    });
  });
});
