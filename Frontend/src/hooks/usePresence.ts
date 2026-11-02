// One presence lookup for every place that shows a person's status dot, so the
// DM list, the DM header and the member list never disagree.
import { useCallback, useEffect, useState } from 'react';
import { socketService } from '@/services/socketService';
import { useRealtime } from '@/hooks/useRealtime';

export type Presence = 'online' | 'idle' | 'dnd' | 'offline';

// user id -> status: the `friends_bulk_status` snapshot, updated by every
// later `user_status` event, so it is always the newest value we have. Kept at
// module level so a component that mounts after the snapshot still sees it.
let byId: Record<number, string> = {};
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!unsubscribe) {
    const notify = () => listeners.forEach((l) => l());
    const offBulk = socketService.onFriendsBulkStatus((data: Record<number, string>) => {
      byId = { ...byId, ...(data || {}) };
      notify();
    });
    const offStatus = socketService.onUserStatus((status: any) => {
      if (status?.user_id == null) return;
      byId = { ...byId, [status.user_id]: status.status };
      notify();
    });
    unsubscribe = () => {
      offBulk();
      offStatus();
    };
  }
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Returns `presenceOf(username, userId?, fallback?)`: the newest status by
 * user id (bulk snapshot + live events), then by username (friends list +
 * live events), then the caller's fallback (e.g. a status the API returned),
 * then offline.
 */
export function usePresence() {
  const { userStatuses } = useRealtime();
  const [version, force] = useState(0);

  useEffect(() => subscribe(() => force((n) => n + 1)), []);

  return useCallback(
    (username?: string, userId?: number, fallback?: string | null): Presence => {
      const byUserId = userId != null ? byId[userId] : undefined;
      const byName = username ? userStatuses.get(username) : undefined;
      return (byUserId || byName || fallback || 'offline') as Presence;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version: byId changed
    [userStatuses, version],
  );
}
