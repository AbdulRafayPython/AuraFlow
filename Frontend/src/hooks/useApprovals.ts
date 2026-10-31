// Pending agent approvals, shared by the Agents page and the sidebar badge.
import { useEffect, useSyncExternalStore } from 'react';
import { socketService } from '@/services/socketService';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import { useToast } from '@/hooks/use-toast';
import { approvalAlertTitle } from '@/lib/agentBuilder';
import type { AgentApproval, ApprovalResolvedEvent } from '@/types/agentBuilder';

interface State {
  items: AgentApproval[];
  loaded: boolean;
  error: string | null;
}

let state: State = { items: [], loaded: false, error: null };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export async function refreshApprovals(): Promise<void> {
  try {
    set({ items: await agentBuilderService.approvals('pending'), loaded: true, error: null });
  } catch (e) {
    set({ loaded: true, error: errorMessage(e) });
  }
}

/** Approve or reject, taking the card off the list right away. */
export async function decideApproval(id: number, approve: boolean): Promise<void> {
  const before = state.items;
  set({ items: before.filter((a) => a.id !== id) });
  try {
    await (approve ? agentBuilderService.approve(id) : agentBuilderService.reject(id));
  } catch (e) {
    set({ items: before });
    throw e;
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/**
 * `alerts` should be true in exactly one always-mounted component: it shows the
 * toasts. Every user of the hook keeps the list fresh from socket events.
 */
export function useApprovals(options: { alerts?: boolean } = {}) {
  const { toast } = useToast();
  const snapshot = useSyncExternalStore(subscribe, () => state);
  const alerts = !!options.alerts;

  useEffect(() => {
    if (!state.loaded) void refreshApprovals();
    return socketService.onAgentApproval((phase, data) => {
      if (phase === 'requested') {
        const item = data as AgentApproval;
        set({ items: [item, ...state.items.filter((a) => a.id !== item.id)] });
        if (alerts) toast({ title: approvalAlertTitle(item.agent.name), description: item.summary });
        return;
      }
      const done = data as ApprovalResolvedEvent;
      set({ items: state.items.filter((a) => a.id !== done.id) });
      if (alerts && done.status === 'failed') {
        toast({ title: 'The approved action failed', description: done.error ?? undefined, variant: 'destructive' });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts]);

  return { approvals: snapshot.items, loaded: snapshot.loaded, error: snapshot.error, refresh: refreshApprovals };
}
