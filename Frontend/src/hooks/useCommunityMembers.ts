// Members of a community, shared by the channel sidebar and the member list
// so both read one request and refresh together.
import { useCallback, useEffect, useState } from 'react';
import { channelService } from '@/services/channelService';
import type { CommunityMember } from '@/types';

interface Entry {
  members: CommunityMember[];
  loading: boolean;
  /** When the last load finished; older than STALE_MS refreshes in the background. */
  at: number;
}

const STALE_MS = 60_000;

const store = new Map<string, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load(communityId: string): Promise<void> {
  const prev = store.get(communityId);
  store.set(communityId, { members: prev?.members ?? [], loading: true, at: prev?.at ?? 0 });
  emit();
  return channelService
    .getCommunityMembers(communityId)
    .then((members) => {
      store.set(communityId, { members, loading: false, at: Date.now() });
    })
    .catch((err) => {
      console.error('Failed to load members:', err);
      store.set(communityId, { members: prev?.members ?? [], loading: false, at: Date.now() });
    })
    .finally(emit);
}

export function useCommunityMembers(communityId?: string) {
  const [, force] = useState(0);

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!communityId) return;
    const e = store.get(communityId);
    if (!e || (!e.loading && Date.now() - e.at > STALE_MS)) load(communityId);
  }, [communityId]);

  const reload = useCallback(() => (communityId ? load(communityId) : Promise.resolve()), [communityId]);
  const entry = communityId ? store.get(communityId) : undefined;
  return { members: entry?.members ?? [], loading: entry?.loading ?? !!communityId, reload };
}
