// hooks/useBrowserNotifications.ts — Unified browser Notification API for all event types
// Shows rich native browser notifications when the tab is hidden/blurred.
// Each notification type shows relevant branding (community logo, user avatar, etc.)
// Mount once in the authenticated tree (via FaviconBadge).

import { useEffect, useRef } from 'react';
import { socketService } from '@/services/socketService';
import { useAuth } from '@/contexts/AuthContext';
import { getAvatarUrl, formatCallPreview } from '@/lib/utils';
import { API_SERVER } from '@/config/api';
import { initPush, subscribeToPush } from '@/services/pushService';

const APP_ICON = '/AuraflowLogo.png';
const AUTO_CLOSE_MS = 6000;

/** Resolve a backend-relative path (e.g. /uploads/logo.png) to a full URL */
function resolveUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return `${API_SERVER}${path.startsWith('/') ? path : `/${path}`}`;
}

export function useBrowserNotifications() {
  const { user, isAuthenticated } = useAuth();
  const permissionRef = useRef<NotificationPermission>('default');

  // ── Request permission once + register service worker ────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!('Notification' in window)) return;

    // Register SW for web push
    initPush().then(() => subscribeToPush()).catch(() => {});

    if (Notification.permission === 'default') {
      Notification.requestPermission().then((p) => { permissionRef.current = p; });
    } else {
      permissionRef.current = Notification.permission;
    }
  }, [isAuthenticated]);

  const canNotify = () =>
    (document.hidden || !document.hasFocus()) && permissionRef.current === 'granted' && 'Notification' in window;

  const show = (title: string, body: string, tag: string, icon?: string, autoCloseMs = AUTO_CLOSE_MS) => {
    if (!canNotify()) return;
    try {
      const n = new Notification(title, {
        body,
        icon: icon || APP_ICON,
        tag,
        silent: false,
      });
      n.onclick = () => { window.focus(); n.close(); };
      if (autoCloseMs > 0) setTimeout(() => n.close(), autoCloseMs);
    } catch { /* Notification API not available */ }
  };

  // ── Direct Messages ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsub = socketService.onDirectMessage((data: any) => {
      if (data.sender_id === user?.id) return;
      const displayName = data.sender?.display_name || data.sender?.username || `User ${data.sender_id}`;
      const body = data.message_type === 'call' ? formatCallPreview(data.content)
        : data.content
        ? data.content.substring(0, 120)
        : data.message_type === 'image' ? '📷 Sent an image'
        : data.message_type === 'file' ? '📎 Sent a file'
        : data.message_type === 'voice' ? '🎙️ Sent a voice message'
        : 'Sent a message';
      const icon = data.sender?.avatar_url
        ? getAvatarUrl(data.sender.avatar_url, data.sender.username || '')
        : APP_ICON;
      show(displayName, body, `dm-${data.sender_id}`, icon);
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  // ── Channel Messages (community) ───────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const channel = d.channel_name || 'general';
      const community = d.community_name || 'Community';
      const sender = d.sender_name || 'Someone';
      const preview = d.content ? d.content.substring(0, 120) : 'sent a message';

      // Use community logo if available, fall back to app icon
      const icon = resolveUrl(d.community_logo) || APP_ICON;

      show(
        `#${channel} · ${community}`,
        `${sender}: ${preview}`,
        `ch-${d.channel_id}`,
        icon,
      );
    };
    window.addEventListener('channelMessageReceived', handler);
    return () => window.removeEventListener('channelMessageReceived', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── Friend Requests ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const displayName = d.display_name || d.username || 'Someone';
      const username = d.username ? `@${d.username}` : '';
      const icon = d.avatar_url ? getAvatarUrl(d.avatar_url, d.username || '') : APP_ICON;
      show(
        'Friend Request',
        `${displayName} ${username} wants to be your friend`,
        `fr-${d.sender_id}`,
        icon,
        8000,
      );
    };
    window.addEventListener('friendRequestReceived', handler);
    return () => window.removeEventListener('friendRequestReceived', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── Friend Request Accepted ─────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const displayName = d.username || 'Someone';
      const icon = d.from?.avatar_url
        ? getAvatarUrl(d.from.avatar_url, d.from.username || '')
        : APP_ICON;
      show(
        'Friend Request Accepted',
        `${displayName} accepted your friend request`,
        `fa-${d.from?.id}`,
        icon,
      );
    };
    window.addEventListener('friendRequestAccepted', handler);
    return () => window.removeEventListener('friendRequestAccepted', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── Community Removal ───────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const communityName = d.data?.community_name || 'a community';
      const icon = resolveUrl(d.data?.community_logo) || APP_ICON;
      show(
        `Removed from ${communityName}`,
        d.message || `You were removed from ${communityName}`,
        `removed-${d.data?.community_id || 'unknown'}`,
        icon,
        10000,
      );
    };
    window.addEventListener('community-removal-notification', handler);
    return () => window.removeEventListener('community-removal-notification', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── Server-pushed notifications (mention, reply, summary, etc.) ─────
  // Only handle types NOT already covered by dedicated listeners above
  // (DM messages, channel messages, friend requests, friend accepted, community removal
  //  are all handled by their own listeners)
  useEffect(() => {
    if (!isAuthenticated) return;
    const handledTypes = new Set(['message', 'channel_message', 'friend_request', 'friend_accepted', 'community_removal']);
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d) return;
      // Skip types already handled by dedicated browser notification listeners
      if (handledTypes.has(d.type)) return;
      const icon = resolveUrl(d.icon_url) || APP_ICON;
      show(
        d.title || 'AuroFlow',
        d.body || '',
        `server-${d.id}`,
        icon,
      );
    };
    window.addEventListener('server-notification', handler);
    return () => window.removeEventListener('server-notification', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── Service Worker click routing ────────────────────────────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICK' && event.data?.url) {
        window.location.href = event.data.url;
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);
}
