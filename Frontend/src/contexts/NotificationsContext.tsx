// contexts/NotificationsContext.tsx - Real-time notifications system with persistence
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useNotifications as useToast } from '@/hooks/useNotifications';
import { API_URL } from '@/config/api';
import { formatCallPreview } from '@/lib/utils';

// Generate a pleasant notification chime using Web Audio API (no file dependency)
let _audioCtx: AudioContext | null = null;
function playNotificationSound() {
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    const ctx = _audioCtx;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    // Two-tone chime: C6 then E6
    [1047, 1319].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now + i * 0.12);
      osc.stop(now + 0.5 + i * 0.12);
    });
  } catch {
    // Web Audio not available — silent fallback
  }
}

export interface Notification {
  id: string;
  serverId?: number;  // DB id from backend (if persisted)
  type: 'friend_request' | 'message' | 'friend_accepted' | 'system' | 'community_removal' | 'channel_message' | 'mention' | 'reply' | 'summary_ready';
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
  refreshFromServer: () => Promise<void>;
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

  // Convert a backend notification row into our local Notification shape
  const serverToLocal = useCallback((row: any): Notification => {
    const typeMap: Record<string, Notification['type']> = {
      friend_request: 'friend_request',
      friend_accepted: 'friend_accepted',
      message: 'message',
      channel_message: 'channel_message',
      community_removal: 'community_removal',
      mention: 'mention',
      reply: 'reply',
      summary_ready: 'summary_ready',
      system: 'system',
    };
    return {
      id: `server-${row.id}`,
      serverId: row.id,
      type: typeMap[row.type] || 'system',
      title: row.title,
      message: row.body,
      timestamp: new Date(row.created_at),
      read: row.is_read,
      data: { link: row.link, related_id: row.related_id, icon_url: row.icon_url },
    };
  }, []);

  // Fetch notifications from backend API
  const refreshFromServer = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/notifications?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data: any[] = await res.json();
      const serverNotifs = data.map(serverToLocal);

      setNotifications(prev => {
        // Merge: keep server-sourced as canonical, add any local-only ones that don't collide
        const serverIds = new Set(serverNotifs.map(n => n.id));
        const localOnly = prev.filter(n => !n.serverId && !serverIds.has(n.id));
        const merged = [...serverNotifs, ...localOnly].slice(0, 50);
        merged.forEach(n => processedIdsRef.current.add(n.id));
        return merged;
      });
    } catch (e) {
      console.error('[NotificationsContext] Failed to fetch from server:', e);
    }
  }, [serverToLocal]);

  // Load notifications from storage + server when user logs in
  useEffect(() => {
    if (isAuthenticated && user?.id && !initializedRef.current) {
      console.log('[NotificationsContext] Loading persisted notifications for user:', user.id);
      const stored = loadNotificationsFromStorage(user.id);
      if (stored.length > 0) {
        setNotifications(stored);
        stored.forEach(n => processedIdsRef.current.add(n.id));
      }
      initializedRef.current = true;
      // Also fetch from server to get cross-device notifications
      refreshFromServer();
    } else if (!isAuthenticated) {
      initializedRef.current = false;
      processedIdsRef.current.clear();
      setNotifications([]);
    }
  }, [isAuthenticated, user?.id, refreshFromServer]);

  // Listen for real-time server-pushed notifications (from notification_service)
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleServerNotification = (event: CustomEvent) => {
      const row = event.detail;
      const notif = serverToLocal(row);
      if (processedIdsRef.current.has(notif.id)) return;
      processedIdsRef.current.add(notif.id);
      setNotifications(prev => [notif, ...prev].slice(0, 50));
      playNotificationSound();
    };

    window.addEventListener('server-notification', handleServerNotification as EventListener);
    return () => {
      window.removeEventListener('server-notification', handleServerNotification as EventListener);
    };
  }, [isAuthenticated, serverToLocal]);

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
    } else if (notification.type === 'channel_message') {
      showInfo({
        title: notification.title,
        description: notification.message,
        duration: 4000,
      });
    } else if (notification.type === 'mention') {
      showInfo({
        title: notification.title,
        description: notification.message,
        duration: 5000,
      });
    } else if (notification.type === 'reply') {
      showInfo({
        title: notification.title,
        description: notification.message,
        duration: 5000,
      });
    } else if (notification.type === 'summary_ready') {
      showSuccess({
        title: notification.title,
        description: notification.message,
        duration: 6000,
      });
    }

    // Play notification sound
    playNotificationSound();

    return newNotification.id;
  }, [showInfo, showSuccess]);

  // Mark as read (local + server)
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev => {
      const target = prev.find(n => n.id === notificationId);
      if (target?.serverId) {
        const token = localStorage.getItem('token');
        if (token) {
          fetch(`${API_URL}/notifications/read`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [target.serverId] }),
          }).catch(() => {});
        }
      }
      return prev.map(n => (n.id === notificationId ? { ...n, read: true } : n));
    });
  }, []);

  // Mark all as read (local + server)
  const markAllAsRead = useCallback(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${API_URL}/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  // Clear notification (local + server)
  const clearNotification = useCallback((notificationId: string) => {
    setNotifications(prev => {
      const target = prev.find(n => n.id === notificationId);
      if (target?.serverId) {
        const token = localStorage.getItem('token');
        if (token) {
          fetch(`${API_URL}/notifications/${target.serverId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
      }
      return prev.filter(n => n.id !== notificationId);
    });
    processedIdsRef.current.delete(notificationId);
  }, []);

  // Clear all (local + server)
  const clearAll = useCallback(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${API_URL}/notifications`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
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
        title: message.senderName || 'Direct Message',
        message: message.message_type === 'call' ? formatCallPreview(message.content)
          : message.content
          ? `${message.content.substring(0, 80)}${message.content.length > 80 ? '…' : ''}`
          : message.message_type === 'image' ? '📷 Sent an image'
          : message.message_type === 'file' ? '📎 Sent a file'
          : message.message_type === 'voice' ? '🎙️ Sent a voice message'
          : 'Sent a message',
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

    // Listen for channel messages (community)
    const handleChannelMessage = (event: CustomEvent) => {
      const data = event.detail;
      if (data.sender_id === user.id) return;
      const channel = data.channel_name || 'general';
      const community = data.community_name || 'Community';
      const sender = data.sender_name || 'Someone';
      const preview = data.content ? data.content.substring(0, 80) : 'sent a message';
      addNotification({
        type: 'channel_message',
        title: `#${channel} · ${community}`,
        message: `${sender}: ${preview}`,
        from: {
          id: data.sender_id,
          username: sender,
          avatar_url: data.sender_avatar,
        },
        data: {
          ...data,
          community_name: community,
          community_logo: data.community_logo,
          community_icon: data.community_icon,
          community_color: data.community_color,
        },
      });
    };

    // Add event listeners
    window.addEventListener('friendRequestReceived' as any, handleFriendRequest);
    window.addEventListener('newMessageReceived' as any, handleNewMessage);
    window.addEventListener('friendRequestAccepted' as any, handleFriendAccepted);
    window.addEventListener('channelMessageReceived' as any, handleChannelMessage);

    return () => {
      window.removeEventListener('friendRequestReceived' as any, handleFriendRequest);
      window.removeEventListener('newMessageReceived' as any, handleNewMessage);
      window.removeEventListener('friendRequestAccepted' as any, handleFriendAccepted);
      window.removeEventListener('channelMessageReceived' as any, handleChannelMessage);
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
    refreshFromServer,
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
