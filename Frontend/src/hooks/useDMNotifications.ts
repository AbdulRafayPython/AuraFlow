// hooks/useDMNotifications.ts — Browser push notifications for incoming DMs
import { useEffect, useRef } from 'react';
import { socketService } from '@/services/socketService';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Requests Notification permission on mount and shows a browser notification
 * for each incoming DM when the tab is not focused.
 *
 * Mount once in the authenticated tree (e.g. alongside FaviconBadge).
 */
export function useDMNotifications() {
  const { isAuthenticated } = useAuth();
  const permissionRef = useRef<NotificationPermission>('default');

  // Request permission once
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        permissionRef.current = perm;
      });
    } else {
      permissionRef.current = Notification.permission;
    }
  }, [isAuthenticated]);

  // Listen for socket DM events
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsub = socketService.onDirectMessage((data: any) => {
      // Only show when tab is hidden and permission granted
      if (!document.hidden) return;
      if (permissionRef.current !== 'granted') return;

      const senderName = data.sender?.display_name || data.sender?.username || `User ${data.sender_id}`;
      const body = data.content || (data.message_type === 'image' ? '📷 Image' : data.message_type === 'file' ? '📎 File' : 'New message');

      const notification = new Notification(`${senderName} sent you a message`, {
        body,
        icon: data.sender?.avatar_url || '/favicon.ico',
        tag: `dm-${data.sender_id}`, // Collapse notifications from same sender
        silent: false,
      });

      // Focus the tab on click
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    });

    return unsub;
  }, [isAuthenticated]);
}
