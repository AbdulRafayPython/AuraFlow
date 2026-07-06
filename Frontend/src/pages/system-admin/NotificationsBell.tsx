/**
 * System Admin — Notifications Bell
 *
 * Self-contained notification dropdown for the system-admin header. Pulls a
 * live platform-wide feed (moderation flags, new communities, new members)
 * from GET /api/admin/system/notifications.
 *
 * Read/unread state is tracked client-side: we persist the timestamp of the
 * newest notification the admin has seen in localStorage, so the unread dot and
 * count reflect anything that arrived since they last opened the panel. This
 * keeps the backend stateless (no per-admin notification storage to maintain).
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Shield, Building2, UserPlus, Loader2, CheckCheck, AlertTriangle,
} from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import adminService, { SystemNotification } from '@/services/adminService';
import { cn } from '@/lib/utils';

const SEEN_KEY = 'sysadmin_notifications_seen_at';

const TYPE_ICON: Record<SystemNotification['type'], React.ElementType> = {
  moderation: Shield,
  community: Building2,
  user: UserPlus,
};

const SEVERITY_STYLE: Record<SystemNotification['severity'], string> = {
  critical: 'bg-red-500/15 text-red-400',
  high: 'bg-amber-500/15 text-amber-400',
  info: 'bg-sky-500/15 text-sky-400',
};

const relativeTime = (iso: string | null): string => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function NotificationsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [seenAt, setSeenAt] = useState<string>(() => localStorage.getItem(SEEN_KEY) || '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNotifications(await adminService.getSystemNotifications());
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch so the unread dot is accurate before the panel is opened.
  useEffect(() => { load(); }, [load]);

  const unreadCount = notifications.filter(
    (n) => n.created_at && (!seenAt || n.created_at > seenAt),
  ).length;

  const markAllRead = () => {
    const newest = notifications[0]?.created_at;
    if (newest) {
      localStorage.setItem(SEEN_KEY, newest);
      setSeenAt(newest);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) load();
  };

  const handleClick = (n: SystemNotification) => {
    markAllRead();
    setOpen(false);
    navigate(n.link);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="w-10 h-10 flex items-center justify-center text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))] rounded-lg transition-colors relative"
          title="Notifications"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 rounded-xl border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-primary))] shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--theme-border-default))]">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-accent-primary))] transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--theme-accent-primary))]" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-10 px-4">
              <Bell className="w-8 h-8 text-[hsl(var(--theme-text-muted))] mx-auto mb-2" />
              <p className="text-sm text-[hsl(var(--theme-text-secondary))]">You're all caught up</p>
              <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5">New platform activity will appear here</p>
            </div>
          ) : (
            <ul className="divide-y divide-[hsl(var(--theme-border-default))]">
              {notifications.map((n) => {
                const Icon = n.severity === 'critical' ? AlertTriangle : TYPE_ICON[n.type];
                const isUnread = n.created_at && (!seenAt || n.created_at > seenAt);
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => handleClick(n)}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[hsl(var(--theme-bg-hover))]',
                        isUnread && 'bg-[hsl(var(--theme-accent-primary)/0.06)]',
                      )}
                    >
                      <span className={cn('mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center', SEVERITY_STYLE[n.severity])}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{n.title}</span>
                          {isUnread && <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[hsl(var(--theme-accent-primary))]" />}
                        </span>
                        <span className="block text-xs text-[hsl(var(--theme-text-secondary))] line-clamp-2 mt-0.5">{n.message}</span>
                        <span className="block text-[11px] text-[hsl(var(--theme-text-muted))] mt-1">{relativeTime(n.created_at)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
