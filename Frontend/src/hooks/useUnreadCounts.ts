// hooks/useUnreadCounts.ts — Real-time unread counter driven by socket events
//
// Architecture:
//   PRIMARY:   channel_activity   — emitted to community room on every new message.
//              Client-side filter: skip if sender===me or channel===activeChannel.
//              Instant, zero-latency, proven transport.
//
//   SECONDARY: unread_update      — emitted per-user room from increment_channel_unread.
//              Server-authoritative counts. Used to reconcile / correct drift.
//
//   INIT:      initial_unreads    — full snapshot on connect / reconnect / requestUnreads().
//
//   DM:        dm_unread_update   — direct message unread increments.
//
// Dedup: channel_activity and unread_update can arrive for the same message.
//        We track the last seen message_id per channel to avoid double-counting.

import { useState, useEffect, useCallback, useRef } from 'react';
import { socketService } from '@/services/socketService';
import { useAuth } from '@/contexts/AuthContext';

export interface UnreadState {
  channels: Record<number, number>;
  communities: Record<number, number>;
  dms: Record<number, number>;
  totalChannelUnread: number;
  totalDMUnread: number;
  totalUnread: number;
}

const EMPTY_STATE: UnreadState = {
  channels: {},
  communities: {},
  dms: {},
  totalChannelUnread: 0,
  totalDMUnread: 0,
  totalUnread: 0,
};

/**
 * Centralised unread state driven by socket events.
 * Every component that needs unread data should use this hook.
 */
export function useUnreadCounts() {
  const { isAuthenticated, user } = useAuth();
  const [state, setState] = useState<UnreadState>(EMPTY_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Track last processed message_id per channel to dedup between
  // channel_activity (primary) and unread_update (secondary).
  const lastSeenRef = useRef<Record<number, number>>({});

  // ── INIT: Full snapshot from backend ────────────────────────────────
  const handleInitialUnreads = useCallback(
    (data: {
      channels: Record<string, number>;
      communities: Record<string, number>;
      dms: Record<string, number>;
      total_unread: number;
    }) => {
      console.log(`[UNREAD-HOOK] 🔄 handleInitialUnreads called:`, JSON.stringify(data));
      const channels: Record<number, number> = {};
      const communities: Record<number, number> = {};
      const dms: Record<number, number> = {};
      let totalChannel = 0;
      let totalDM = 0;

      for (const [id, count] of Object.entries(data.channels || {})) {
        channels[Number(id)] = count;
        totalChannel += count;
      }
      for (const [id, count] of Object.entries(data.communities || {})) {
        communities[Number(id)] = count;
      }
      for (const [id, count] of Object.entries(data.dms || {})) {
        dms[Number(id)] = count;
        totalDM += count;
      }

      const newState = {
        channels,
        communities,
        dms,
        totalChannelUnread: totalChannel,
        totalDMUnread: totalDM,
        totalUnread: totalChannel + totalDM,
      };
      console.log(`[UNREAD-HOOK] 📦 Setting initial state:`, JSON.stringify(newState));
      setState(newState);

      // Reset dedup tracker — server snapshot is authoritative
      lastSeenRef.current = {};
    },
    [],
  );

  // ── PRIMARY: channel_activity from community room ───────────────────
  // Lightweight event: { channel_id, community_id, sender_id, message_id }
  // Emitted to the community room, so ALL community members receive it.
  // We filter client-side: skip self-sent, skip active channel.
  const handleChannelActivity = useCallback(
    (data: {
      channel_id: number;
      community_id: number;
      sender_id: number;
      message_id: number;
    }) => {
      const myId = user?.id;
      console.log(`[UNREAD-HOOK] ⚡ handleChannelActivity called:`, data, `myId=${myId}`);

      // Skip messages I sent
      if (myId != null && data.sender_id === myId) {
        console.log(`[UNREAD-HOOK] ⏭️ SKIPPED: sender is me (${myId})`);
        return;
      }

      // Skip if I'm currently viewing this channel
      const activeChannel = socketService.getCurrentChannel();
      if (activeChannel === data.channel_id) {
        console.log(`[UNREAD-HOOK] ⏭️ SKIPPED: currently viewing channel ${activeChannel}`);
        return;
      }

      // Dedup: if we already processed this message_id for this channel, skip.
      if (data.message_id != null && data.message_id > 0) {
        const lastSeen = lastSeenRef.current[data.channel_id] || 0;
        if (data.message_id <= lastSeen) {
          console.log(`[UNREAD-HOOK] ⏭️ SKIPPED: dedup msg ${data.message_id} <= lastSeen ${lastSeen}`);
          return;
        }
        lastSeenRef.current[data.channel_id] = data.message_id;
      }

      console.log(`[UNREAD-HOOK] ✅ INCREMENTING ch=${data.channel_id} comm=${data.community_id}`);

      setState((prev) => {
        const next = {
          ...prev,
          channels: { ...prev.channels },
          communities: { ...prev.communities },
        };

        // Increment channel unread by 1
        const oldChCount = prev.channels[data.channel_id] || 0;
        next.channels[data.channel_id] = oldChCount + 1;
        next.totalChannelUnread = prev.totalChannelUnread + 1;

        // Increment community unread by 1
        if (data.community_id) {
          const oldCommCount = prev.communities[data.community_id] || 0;
          next.communities[data.community_id] = oldCommCount + 1;
        }

        next.totalUnread = next.totalChannelUnread + next.totalDMUnread;
        console.log(`[UNREAD-HOOK] 📊 New state: ch[${data.channel_id}]=${next.channels[data.channel_id]}, comm[${data.community_id}]=${next.communities[data.community_id]}, total=${next.totalUnread}`);
        return next;
      });
    },
    // user?.id is stable across renders; re-create only if it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id],
  );

  // ── SECONDARY: unread_update from per-user room ─────────────────────
  // Server-authoritative absolute counts. Used to reconcile drift.
  const handleUnreadUpdate = useCallback(
    (data: {
      channel_id?: number;
      community_id?: number;
      channel_unread?: number;
      community_unread?: number;
      total_unread?: number;
    }) => {
      console.log(`[UNREAD-HOOK] 🔔 handleUnreadUpdate called:`, JSON.stringify(data));
      setState((prev) => {
        const next = {
          ...prev,
          channels: { ...prev.channels },
          communities: { ...prev.communities },
        };
        if (data.channel_id != null && data.channel_unread != null) {
          // Server says the channel count is X — trust it (server-authoritative).
          // Only apply if it's >= our current count (avoid regressing after optimistic update).
          const current = prev.channels[data.channel_id] || 0;
          if (data.channel_unread >= current) {
            const delta = data.channel_unread - current;
            next.channels[data.channel_id] = data.channel_unread;
            next.totalChannelUnread = Math.max(0, prev.totalChannelUnread + delta);
          }
        }
        if (data.community_id != null && data.community_unread != null) {
          next.communities[data.community_id] = data.community_unread;
        }
        next.totalUnread = next.totalChannelUnread + next.totalDMUnread;
        return next;
      });
    },
    [],
  );

  // ── DM unread ───────────────────────────────────────────────────────
  const handleDMUnreadUpdate = useCallback(
    (data: {
      sender_id: number;
      unread_count: number;
      total_dm_unread: number;
      total_unread: number;
    }) => {
      setState((prev) => {
        const next = { ...prev, dms: { ...prev.dms } };
        next.dms[data.sender_id] = data.unread_count;
        next.totalDMUnread = data.total_dm_unread;
        next.totalUnread = next.totalChannelUnread + next.totalDMUnread;
        return next;
      });
    },
    [],
  );

  // ── Subscriptions ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      console.log('[UNREAD-HOOK] ❌ Not authenticated — resetting state');
      setState(EMPTY_STATE);
      lastSeenRef.current = {};
      return;
    }

    console.log('[UNREAD-HOOK] 🔌 Subscribing to socket events (user authenticated)');

    const unsubs = [
      socketService.onInitialUnreads(handleInitialUnreads),
      socketService.onChannelActivity(handleChannelActivity),
      socketService.onUnreadUpdate(handleUnreadUpdate),
      socketService.onDMUnreadUpdate(handleDMUnreadUpdate),
    ];

    console.log('[UNREAD-HOOK] ✅ Registered 4 handlers. Requesting unreads...');
    // Request snapshot in case we missed the initial emission
    socketService.requestUnreads();

    return () => {
      console.log('[UNREAD-HOOK] 🧹 Cleaning up — unsubscribing 4 handlers');
      unsubs.forEach((u) => u());
    };
  }, [
    isAuthenticated,
    handleInitialUnreads,
    handleChannelActivity,
    handleUnreadUpdate,
    handleDMUnreadUpdate,
  ]);

  // ── Mark-as-read helpers (optimistic + emit) ────────────────────────

  const markChannelRead = useCallback(
    (channelId: number, communityId?: number, messageId?: number) => {
      socketService.markChannelRead(channelId, messageId);
      setState((prev) => {
        const oldCount = prev.channels[channelId] || 0;
        if (oldCount === 0) return prev;
        const next = {
          ...prev,
          channels: { ...prev.channels },
          communities: { ...prev.communities },
        };
        next.channels[channelId] = 0;
        next.totalChannelUnread = Math.max(0, prev.totalChannelUnread - oldCount);

        // Decrement community unread by the same amount
        if (communityId) {
          const oldComm = prev.communities[communityId] || 0;
          next.communities[communityId] = Math.max(0, oldComm - oldCount);
        }

        next.totalUnread = next.totalChannelUnread + next.totalDMUnread;
        return next;
      });
    },
    [],
  );

  const markDMRead = useCallback((otherUserId: number) => {
    socketService.markDMRead(otherUserId);
    setState((prev) => {
      const oldCount = prev.dms[otherUserId] || 0;
      if (oldCount === 0) return prev;
      const next = { ...prev, dms: { ...prev.dms } };
      next.dms[otherUserId] = 0;
      next.totalDMUnread = Math.max(0, prev.totalDMUnread - oldCount);
      next.totalUnread = next.totalChannelUnread + next.totalDMUnread;
      return next;
    });
  }, []);

  // ── Accessors (use stateRef for latest value without re-render dep) ─
  const getChannelUnread = useCallback(
    (channelId: number) => stateRef.current.channels[channelId] || 0,
    [],
  );

  const getCommunityUnread = useCallback(
    (communityId: number) => stateRef.current.communities[communityId] || 0,
    [],
  );

  const getDMUnread = useCallback(
    (userId: number) => stateRef.current.dms[userId] || 0,
    [],
  );

  return {
    ...state,
    markChannelRead,
    markDMRead,
    getChannelUnread,
    getCommunityUnread,
    getDMUnread,
  };
}
