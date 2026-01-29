// contexts/NotificationsContext.tsx - Real-time notifications system with persistence
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { socketService } from '@/services/socketService';
import { useAuth } from './AuthContext';
import { useNotifications as useToast } from '@/hooks/useNotifications';

export interface Notification {
  id: string;
  type: 'friend_request' | 'message' | 'friend_accepted' | 'system' | 'community_removal';
  title: string;
  message: string;
  from?: {
    id: number;
    username: string;
    display_name?: string;
    avatar_url?: string;
  };
  timestamp: Date;
  read: boolean;
  data?: any;
}

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  clearNotification: (notificationId: string) => void;
  clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

// Storage key prefix for localStorage
const STORAGE_KEY_PREFIX = 'auroflow_notifications_';

// Helper to get storage key for a user
const getStorageKey = (userId: number) => `${STORAGE_KEY_PREFIX}${userId}`;

// Load notifications from localStorage
const loadNotificationsFromStorage = (userId: number): Notification[] => {
  try {
    const stored = localStorage.getItem(getStorageKey(userId));
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert timestamp strings back to Date objects
      return parsed.map((n: any) => ({
        ...n,
        timestamp: new Date(n.timestamp),
      }));
    }
  } catch (e) {
    console.error('[NotificationsContext] Error loading from localStorage:', e);
  }
  return [];
};

// Save notifications to localStorage
const saveNotificationsToStorage = (userId: number, notifications: Notification[]) => {
  try {
    // Keep only the last 50 notifications to avoid storage bloat
    const toSave = notifications.slice(0, 50);
    localStorage.setItem(getStorageKey(userId), JSON.stringify(toSave));
  } catch (e) {
    console.error('[NotificationsContext] Error saving to localStorage:', e);
  }
};

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const { showInfo, showSuccess } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const processedIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  // Load notifications from storage when user logs in
  useEffect(() => {
    if (isAuthenticated && user?.id && !initializedRef.current) {
      console.log('[NotificationsContext] Loading persisted notifications for user:', user.id);
      const stored = loadNotificationsFromStorage(user.id);
      if (stored.length > 0) {
        setNotifications(stored);
        // Add existing IDs to processed set to avoid duplicates
        stored.forEach(n => processedIdsRef.current.add(n.id));
      }
      initializedRef.current = true;
    } else if (!isAuthenticated) {
      // Reset when logged out
      initializedRef.current = false;
      processedIdsRef.current.clear();
      setNotifications([]);
    }
  }, [isAuthenticated, user?.id]);

  // Save notifications to storage whenever they change
  useEffect(() => {
    if (isAuthenticated && user?.id && initializedRef.current) {
      saveNotificationsToStorage(user.id, notifications);
    }
  }, [notifications, isAuthenticated, user?.id]);

  // Listen for community removal notifications from custom event
  useEffect(() => {
    const handleCommunityRemoval = (event: CustomEvent) => {
      console.log('[NotificationsContext] Community removal notification received:', event.detail);
      addNotification(event.detail);
    };

    window.addEventListener('community-removal-notification', handleCommunityRemoval as EventListener);
    return () => {
      window.removeEventListener('community-removal-notification', handleCommunityRemoval as EventListener);
    };
  }, []);

  // Add notification with duplicate prevention
  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    // Generate a unique ID based on notification content for deduplication
    const contentHash = `${notification.type}-${notification.from?.id || ''}-${notification.data?.request_id || notification.data?.id || Date.now()}`;
    
    // Check if we've already processed this notification
    if (processedIdsRef.current.has(contentHash)) {
      console.log('[NotificationsContext] Duplicate notification ignored:', contentHash);
      return '';
    }
    
    const newNotification: Notification = {
      ...notification,
      id: contentHash,
      timestamp: new Date(),
      read: false,
    };

    processedIdsRef.current.add(contentHash);
    setNotifications(prev => [newNotification, ...prev]);

    // Show toast notification
    if (notification.type === 'friend_request') {
      showInfo({
        title: notification.title,
        description: notification.message,
        duration: 5000,
      });
    } else if (notification.type === 'message') {
      showInfo({
        title: notification.title,
        description: notification.message,
        duration: 4000,
      });
    } else if (notification.type === 'friend_accepted') {
      showSuccess({
        title: notification.title,
        description: notification.message,
        duration: 4000,
      });
    } else if (notification.type === 'system' || notification.type === 'community_removal') {
      showInfo({
        title: notification.title,
        description: notification.message,
        duration: 6000,
      });
    }

    // Play notification sound (optional)
    try {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => {
        // Ignore errors if sound can't play
      });
    } catch (e) {
      // Ignore sound errors
    }

    return newNotification.id;
  }, [showInfo, showSuccess]);

  // Mark as read
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, read: true } : n))
    );
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  // Clear notification
  const clearNotification = useCallback((notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    processedIdsRef.current.delete(notificationId);
  }, []);

  // Clear all
  const clearAll = useCallback(() => {
    setNotifications([]);
    processedIdsRef.current.clear();
  }, []);

  // Setup socket listeners for real-time notifications
  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    console.log('[NotificationsContext] Setting up real-time listeners');

    // Listen for friend requests
    const handleFriendRequest = (event: CustomEvent) => {
      const request = event.detail;
      console.log('[NotificationsContext] Friend request received:', request);
      
      addNotification({
        type: 'friend_request',
        title: 'New Friend Request',
        message: `${request.display_name || request.username} sent you a friend request`,
        from: {
          id: request.sender_id,
          username: request.username,
          display_name: request.display_name,
          avatar_url: request.avatar_url,
        },
        data: request,
      });
    };

    // Listen for new messages
    const handleNewMessage = (event: CustomEvent) => {
      const message = event.detail;
      console.log('[NotificationsContext] New message notification:', message);
      
      // Don't notify for own messages
      if (message.sender_id === user.id) {
        return;
      }

      addNotification({
        type: 'message',
        title: 'New Message',
        message: `${message.senderName}: ${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}`,
        from: {
          id: message.sender_id,
          username: message.senderUsername || 'Unknown',
          display_name: message.senderName,
          avatar_url: message.senderAvatar,
        },
        data: message,
      });
    };

    // Listen for friend request accepted
    const handleFriendAccepted = (event: CustomEvent) => {
      const data = event.detail;
      console.log('[NotificationsContext] Friend request accepted:', data);
      
      addNotification({
        type: 'friend_accepted',
        title: 'Friend Request Accepted',
        message: `${data.username} accepted your friend request`,
        from: data.from,
        data,
      });
    };

    // Add event listeners
    window.addEventListener('friendRequestReceived' as any, handleFriendRequest);
    window.addEventListener('newMessageReceived' as any, handleNewMessage);
    window.addEventListener('friendRequestAccepted' as any, handleFriendAccepted);

    return () => {
      window.removeEventListener('friendRequestReceived' as any, handleFriendRequest);
      window.removeEventListener('newMessageReceived' as any, handleNewMessage);
      window.removeEventListener('friendRequestAccepted' as any, handleFriendAccepted);
    };
  }, [isAuthenticated, user, addNotification]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const value: NotificationsContextType = {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAll,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotificationsContext must be used within NotificationsProvider');
  }
  return context;
}
