// "Show the activity panel": the small corner panel that says, in plain words, what the agents are doing.
// Off by default. The choice is saved to the account, and a window event keeps the live panel in step.
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, PanelBottomClose } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getNotificationSettings, updateNotificationSettings } from '@/services/authService';
import { AGENT_ACTIVITY_PREF_EVENT } from '@/components/AgentActivityTimeline';
import { cn } from '@/lib/utils';

const ActivityFeedToggle: React.FC = () => {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    getNotificationSettings()
      .then((s) => { if (alive) setEnabled(Boolean(s?.show_agent_activity)); })
      .catch(() => { if (alive) setEnabled(false); });

    const onPref = (e: Event) => {
      const next = (e as CustomEvent<boolean>).detail;
      if (typeof next === 'boolean') setEnabled(next);
    };
    window.addEventListener(AGENT_ACTIVITY_PREF_EVENT, onPref as EventListener);
    return () => {
      alive = false;
      window.removeEventListener(AGENT_ACTIVITY_PREF_EVENT, onPref as EventListener);
    };
  }, []);

  const change = useCallback((next: boolean) => {
    setEnabled(next);
    window.dispatchEvent(new CustomEvent(AGENT_ACTIVITY_PREF_EVENT, { detail: next }));
    void updateNotificationSettings({ show_agent_activity: next }).catch((err: any) => {
      setEnabled(!next); // roll back on failure
      window.dispatchEvent(new CustomEvent(AGENT_ACTIVITY_PREF_EVENT, { detail: !next }));
      toast({ title: 'Could not save preference', description: err?.message ?? 'Please try again.', variant: 'destructive' });
    });
  }, [toast]);

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
      <div className="flex min-w-0 items-start gap-3">
        <PanelBottomClose className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Show the activity panel</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A small panel in the bottom corner that shows, in plain words, what the agents are doing as it happens.
            Off by default.
          </p>
        </div>
      </div>
      {enabled === null ? (
        <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      ) : (
        <button
          type="button" role="switch" aria-checked={enabled} aria-label="Show the activity panel"
          onClick={() => change(!enabled)}
          className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors', enabled ? 'bg-primary' : 'bg-muted')}
        >
          <span className={cn('inline-block h-5 w-5 rounded-full bg-background transition-transform', enabled ? 'translate-x-5' : 'translate-x-0.5')} />
        </button>
      )}
    </div>
  );
};

export default ActivityFeedToggle;
