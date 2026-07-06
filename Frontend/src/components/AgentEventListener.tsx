// Frontend/src/components/AgentEventListener.tsx
//
// Mounts once at the App root and subscribes to every Socket.IO event
// produced by the autonomous-agent layer (see Backend/agents/*).
//
// Coverage:
//   - wellness_checkin    → Toast (empathy or de-escalation tone)
//   - support_suggestion  → Toast with "Show me" action
//   - engagement_nudge    → Toast (channel-bound)
//   - summary_checkpoint  → Toast with preview
//   - agent_action        → Forwarded as `auraflow:agent-action` window event
//                           so AgentActivityTimeline can pick it up without
//                           a context bump.
//
// Feedback flows back through POST /api/agents/<name>/feedback (see
// AgentFeedbackButtons below). The action_id is carried on the
// `correlation_id`-keyed toast so the user can tap engage/dismiss.

import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { socket } from '@/socket';

interface WellnessCheckinEvent {
  user_id: number;
  channel_id?: number | null;
  community_id?: number | null;
  message_id?: number | null;
  trigger?: 'mood_escalation' | 'mod_violation' | string;
  text: string;
  primary_mood?: string | null;
  window_mean?: number | null;
  mod_category?: string | null;
  mod_severity?: string | null;
  template_idx?: number;
  correlation_id: string;
}

interface SupportSuggestionEvent {
  channel_id: number;
  community_id?: number | null;
  message_id?: number | null;
  kb_id?: number | null;
  kb_title?: string | null;
  snippet?: string | null;
  score?: number | null;
  correlation_id: string;
}

interface EngagementNudgeEvent {
  channel_id: number;
  community_id?: number | null;
  category?: string | null;
  starter: string;
  silent_minutes?: number | null;
  bucket?: number | null;
  correlation_id: string;
}

interface SummaryCheckpointEvent {
  channel_id: number;
  community_id?: number | null;
  summary: string;
  old_topics?: string[];
  new_topics?: string[];
  msg_count?: number | null;
  method?: string | null;
  correlation_id: string;
}

interface AgentActionEvent {
  id: number;
  agent_name: string;
  community_id?: number | null;
  channel_id?: number | null;
  user_id?: number | null;
  decision: 'act' | 'skip' | 'defer';
  reason: string;
  correlation_id: string;
  created_at?: string | null;
}

/** Fire a feedback POST for an agent action by correlation_id. */
async function postFeedback(
  agentName: string,
  correlationId: string,
  signal: 'positive' | 'negative' | 'engaged' | 'dismissed' | 'ignored',
): Promise<void> {
  try {
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    await fetch(`/api/agents/${agentName}/feedback`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ correlation_id: correlationId, signal }),
    });
  } catch (err) {
    console.warn('[AGENT] feedback POST failed:', err);
  }
}

/**
 * F2 dual-emit: every toast also gets appended to the Channel Intelligence
 * rail's Activity tab by re-emitting the same `auraflow:agent-action` event
 * the timeline already consumes. The synthetic row carries the same
 * correlation_id as the original socket payload so feedback de-dupes if the
 * user votes from either surface.
 */
/** Ring buffer — last 50 agent-action events for late-mounting panels. */
const BUFFER_CAP = 50;
declare global {
  interface Window { __auraAgentActionBuffer?: object[] }
}
function bufferAndDispatch(eventDetail: object): void {
  if (!window.__auraAgentActionBuffer) window.__auraAgentActionBuffer = [];
  window.__auraAgentActionBuffer.push(eventDetail);
  if (window.__auraAgentActionBuffer.length > BUFFER_CAP) {
    window.__auraAgentActionBuffer.shift();
  }
  window.dispatchEvent(new CustomEvent('auraflow:agent-action', { detail: eventDetail }));
}

function emitActivityRow(detail: {
  agent_name: string;
  channel_id?: number | null;
  community_id?: number | null;
  user_id?: number | null;
  correlation_id: string;
  reason: string;
  title?: string;
  visibility?: 'public-in-channel' | 'you-only' | 'admins-only' | 'private-dm';
}): void {
  try {
    const fullDetail = {
      id: Date.now(),
      decision: 'act' as const,
      created_at: new Date().toISOString(),
      ...detail,
    };
    bufferAndDispatch(fullDetail);
  } catch (err) {
    console.warn('[AGENT] failed to dual-emit toast:', err);
  }
}

export function AgentEventListener() {
  const { toast } = useToast();

  useEffect(() => {
    // ── wellness_checkin ────────────────────────────────────────────
    // Explicit Engage/Dismiss buttons give the bandit a clean reward
    // signal. If no button is clicked before the toast's duration
    // elapses we credit `ignored` — distinguishable from an active
    // `dismissed`, which the learn() loop weights more strongly
    // against the template.
    //
    // We can't rely on `onOpenChange` here: the toast factory in
    // use-toast.ts sets its own and would clobber ours. A timer
    // matched to the duration is the simplest correct path.
    const handleWellness = (data: WellnessCheckinEvent) => {
      const isDeesc = data.trigger === 'mod_violation';
      const DURATION_MS = 10000;
      let resolved = false;
      const credit = (signal: 'engaged' | 'dismissed' | 'ignored') => {
        if (resolved) return;
        resolved = true;
        void postFeedback('wellness', data.correlation_id, signal);
      };
      const timer = window.setTimeout(() => credit('ignored'), DURATION_MS + 250);
      const onEngage = () => {
        window.clearTimeout(timer);
        credit('engaged');
      };
      const onDismiss = () => {
        window.clearTimeout(timer);
        credit('dismissed');
      };
      toast({
        title: isDeesc ? '🌱 Quick reset?' : '💚 Wellness check-in',
        description: data.text,
        duration: DURATION_MS,
        action: (
          <div className="flex shrink-0 items-center gap-1">
            <ToastAction altText="Engage" onClick={onEngage}>
              Engage
            </ToastAction>
            <ToastAction altText="Dismiss" onClick={onDismiss} className="text-muted-foreground">
              Dismiss
            </ToastAction>
          </div>
        ),
      });
      emitActivityRow({
        agent_name: 'wellness',
        channel_id: data.channel_id ?? null,
        community_id: data.community_id ?? null,
        user_id: data.user_id,
        correlation_id: data.correlation_id,
        reason: data.text,
        title: isDeesc ? 'Sent de-escalation prompt' : 'Sent wellness check-in',
        visibility: 'you-only',
      });
    };

    // ── support_suggestion ──────────────────────────────────────────
    const handleSupport = (data: SupportSuggestionEvent) => {
      toast({
        title: '📚 Knowledge match',
        description: data.kb_title
          ? `${data.kb_title} — ${(data.snippet ?? '').slice(0, 140)}`
          : (data.snippet ?? '').slice(0, 200),
        duration: 9000,
      });
      emitActivityRow({
        agent_name: 'support',
        channel_id: data.channel_id,
        community_id: data.community_id ?? null,
        correlation_id: data.correlation_id,
        reason: data.kb_title
          ? `Matched: ${data.kb_title}`
          : (data.snippet ?? '').slice(0, 140),
        title: 'Suggested a knowledge match',
        visibility: 'public-in-channel',
      });
    };

    // ── engagement_nudge ────────────────────────────────────────────
    const handleEngagement = (data: EngagementNudgeEvent) => {
      const mins = data.silent_minutes ?? data.bucket ?? 0;
      toast({
        title: `💬 Quiet for ${mins} min`,
        description: data.starter,
        duration: 8000,
      });
      emitActivityRow({
        agent_name: 'engagement',
        channel_id: data.channel_id,
        community_id: data.community_id ?? null,
        correlation_id: data.correlation_id,
        reason: `Channel was quiet for ${mins} min`,
        title: 'Posted a conversation starter',
        visibility: 'public-in-channel',
      });
    };

    // ── summary_checkpoint ──────────────────────────────────────────
    const handleSummary = (data: SummaryCheckpointEvent) => {
      const preview = (data.summary || '').slice(0, 200);
      toast({
        title: '📝 Topic checkpoint',
        description: preview + (data.summary.length > 200 ? '…' : ''),
        duration: 9000,
      });
      emitActivityRow({
        agent_name: 'summarizer',
        channel_id: data.channel_id,
        community_id: data.community_id ?? null,
        correlation_id: data.correlation_id,
        reason: preview,
        title: 'Posted a topic checkpoint',
        visibility: 'public-in-channel',
      });
    };

    // ── agent_action (live decision log; fanned out as DOM event) ──
    const handleAgentAction = (data: AgentActionEvent) => {
      try {
        bufferAndDispatch(data);
      } catch (err) {
        console.warn('[AGENT] failed to fan-out agent_action:', err);
      }
    };

    socket.on('wellness_checkin', handleWellness);
    socket.on('support_suggestion', handleSupport);
    socket.on('engagement_nudge', handleEngagement);
    socket.on('summary_checkpoint', handleSummary);
    socket.on('agent_action', handleAgentAction);

    return () => {
      socket.off('wellness_checkin', handleWellness);
      socket.off('support_suggestion', handleSupport);
      socket.off('engagement_nudge', handleEngagement);
      socket.off('summary_checkpoint', handleSummary);
      socket.off('agent_action', handleAgentAction);
    };
    // `toast` is stable from a Radix hook; eslint may warn but it's fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default AgentEventListener;

// Re-export helper so AgentActivityTimeline (and any future feedback
// UI) doesn't have to duplicate the auth-header dance.
export { postFeedback as postAgentFeedback };
