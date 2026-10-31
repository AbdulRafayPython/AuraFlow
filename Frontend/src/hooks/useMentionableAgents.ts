// Agents that can be @mentioned in a community (Aura, that community's live agents, and your own).
import { useEffect, useState } from 'react';
import agentBuilderService from '@/services/agentBuilderService';
import type { MentionableAgent } from '@/types/agentBuilder';

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; agents: MentionableAgent[] }>();

/** Forget cached lists, e.g. after publishing an agent. */
export function invalidateMentionableAgents(): void {
  cache.clear();
}

export function useMentionableAgents(communityId?: string): MentionableAgent[] {
  const key = communityId ?? '';
  const [agents, setAgents] = useState<MentionableAgent[]>(() => cache.get(key)?.agents ?? []);

  useEffect(() => {
    let cancelled = false;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) {
      setAgents(hit.agents);
      return;
    }
    agentBuilderService.mentionable(communityId)
      .then((list) => {
        cache.set(key, { at: Date.now(), agents: list });
        if (!cancelled) setAgents(list);
      })
      .catch(() => { if (!cancelled) setAgents([]); });   // autocomplete is a convenience: never block typing
    return () => { cancelled = true; };
  }, [key, communityId]);

  return agents;
}
