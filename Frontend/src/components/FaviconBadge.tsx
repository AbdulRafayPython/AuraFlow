// components/FaviconBadge.tsx — Headless global hooks inside the authenticated tree
import { useFaviconBadge } from '@/hooks/useFaviconBadge';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications';

/**
 * Headless component — renders nothing, but keeps:
 *  1) Favicon badge + document.title in sync with unread counts
 *  2) Browser notifications for all event types when tab is blurred
 *
 * Mount once inside the authenticated provider tree.
 */
export default function FaviconBadge() {
  const { totalUnread } = useUnreadCounts();
  useFaviconBadge(totalUnread);
  useBrowserNotifications();
  return null;
}
