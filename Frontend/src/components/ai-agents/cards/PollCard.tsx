// Frontend/src/components/ai-agents/cards/PollCard.tsx
//
// Interactive poll posted by the engagement agent. Renders inside
// AgentMessageShell's card body (so it stays chrome-light — no second
// border/elevated layer). Each option is a real button with an animated fill
// bar showing its share of the vote; counts + percentages use tabular numerals
// so they never reflow. The caller's pick is marked with an accent ring + check.
//
// Votes are anonymous, persisted, and re-votable. On mount we fetch the current
// tally; we subscribe to `poll_vote_update` so other people's votes update the
// bars live. Clicking optimistically updates, then reconciles with the server.

import { useEffect, useRef, useState, useCallback } from 'react';
import { Check, Loader2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { accentFor } from '../AgentAccent';
import { aiAgentService } from '@/services/aiAgentService';
import { socketService } from '@/services/socketService';

interface PollCardProps {
  messageId: number;
  question: string;
  options: string[];
}

const accent = accentFor('engagement');

export default function PollCard({ messageId, question, options }: PollCardProps) {
  const [tallies, setTallies] = useState<number[]>(() => options.map(() => 0));
  const [total, setTotal] = useState(0);
  const [myVote, setMyVote] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  // Reveal results once the user has voted (anonymous polls hide the split
  // until you commit — keeps the first impression about the question, not the
  // crowd). Bars are always shown if there are already votes.
  const revealed = myVote !== null || total > 0;

  // Snapshot for optimistic-rollback on a failed vote.
  const snapshot = useRef<{ tallies: number[]; total: number; myVote: number | null } | null>(null);

  // Initial tally + the caller's existing vote.
  useEffect(() => {
    let alive = true;
    aiAgentService
      .getPoll(messageId)
      .then((r) => {
        if (!alive) return;
        setTallies(padTo(r.tallies ?? [], options.length));
        setTotal(r.total ?? 0);
        setMyVote(r.my_vote ?? null);
      })
      .catch(() => {/* leave zeros — card still works once voted */});
    return () => {
      alive = false;
    };
  }, [messageId, options.length]);

  // Live tally updates from other voters (authoritative counts; never touches
  // my_vote, which is per-viewer).
  useEffect(() => {
    const off = socketService.onPollVoteUpdate((data) => {
      if (data.message_id !== messageId) return;
      setTallies(padTo(data.tallies ?? [], options.length));
      setTotal(data.total ?? 0);
    });
    return off;
  }, [messageId, options.length]);

  const vote = useCallback(
    async (index: number) => {
      if (pending || index === myVote) return;
      snapshot.current = { tallies, total, myVote };

      // Optimistic: move the vote.
      const next = [...tallies];
      if (myVote != null && next[myVote] > 0) next[myVote] -= 1;
      next[index] = (next[index] ?? 0) + 1;
      setTallies(next);
      setTotal((t) => (myVote == null ? t + 1 : t));
      setMyVote(index);
      setPending(true);

      try {
        const r = await aiAgentService.votePoll(messageId, index);
        setTallies(padTo(r.tallies ?? next, options.length));
        setTotal(r.total ?? total);
        setMyVote(r.my_vote ?? index);
      } catch {
        // Roll back.
        if (snapshot.current) {
          setTallies(snapshot.current.tallies);
          setTotal(snapshot.current.total);
          setMyVote(snapshot.current.myVote);
        }
      } finally {
        setPending(false);
      }
    },
    [pending, myVote, tallies, total, messageId, options.length]
  );

  return (
    <div role="group" aria-label={`Poll: ${question}`}>
      <p className="text-[14px] font-semibold leading-snug text-[hsl(var(--theme-text-primary))]">
        {question}
      </p>

      <div className="mt-3 flex flex-col gap-1.5">
        {options.map((opt, i) => {
          const count = tallies[i] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const mine = myVote === i;
          const leading = revealed && count > 0 && count === Math.max(...tallies);

          return (
            <button
              key={i}
              type="button"
              onClick={() => vote(i)}
              disabled={pending}
              aria-pressed={mine}
              className={cn(
                'group relative w-full overflow-hidden rounded-lg border text-left',
                'px-3 py-2.5 transition-colors [transition-duration:140ms]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
                'focus-visible:ring-offset-transparent disabled:cursor-default',
                mine
                  ? 'border-transparent'
                  : 'border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-text-muted)/0.5)]'
              )}
              style={{
                // The voted option gets a thin accent ring; others stay neutral.
                boxShadow: mine ? `inset 0 0 0 1.5px ${accent}` : undefined,
                ['--tw-ring-color' as string]: accent,
              }}
            >
              {/* Fill bar — width animates to the option's share. Sits behind
                  the label. Reduced-motion users get an instant set. */}
              <span
                aria-hidden
                className={cn(
                  'absolute inset-y-0 left-0 rounded-lg',
                  'transition-[width] [transition-duration:420ms] ease-out motion-reduce:transition-none'
                )}
                style={{
                  width: revealed ? `${pct}%` : '0%',
                  backgroundColor: mine
                    ? `hsl(var(--agent-accent-community) / 0.22)`
                    : `hsl(var(--theme-text-muted) / 0.10)`,
                }}
              />

              {/* Label row sits above the bar. */}
              <span className="relative flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                      mine
                        ? 'border-transparent text-white'
                        : 'border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-muted))]'
                    )}
                    style={mine ? { backgroundColor: accent } : undefined}
                    aria-hidden
                  >
                    {mine ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      'truncate text-[13.5px]',
                      mine
                        ? 'font-medium text-[hsl(var(--theme-text-primary))]'
                        : 'text-[hsl(var(--theme-text-secondary))]'
                    )}
                  >
                    {opt}
                  </span>
                  {leading && (
                    <span
                      className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                      style={{
                        color: accent,
                        backgroundColor: `hsl(var(--agent-accent-community) / 0.14)`,
                      }}
                    >
                      Leading
                    </span>
                  )}
                </span>

                {revealed && (
                  <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                    <span
                      className="text-[12.5px] font-semibold"
                      style={{ color: mine ? accent : 'hsl(var(--theme-text-secondary))' }}
                    >
                      {pct}%
                    </span>
                    <span className="text-[11px] text-[hsl(var(--theme-text-muted))]">
                      {count}
                    </span>
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer: total voters + status. */}
      <div className="mt-2.5 flex items-center gap-2 text-[11px] text-[hsl(var(--theme-text-muted))]">
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" style={{ color: accent }} />
        ) : (
          <BarChart3 className="h-3 w-3" style={{ color: accent }} aria-hidden />
        )}
        <span className="tabular-nums">
          {total === 0 ? 'Be the first to vote' : `${total} ${total === 1 ? 'vote' : 'votes'}`}
        </span>
        {myVote !== null && (
          <>
            <span aria-hidden>·</span>
            <span>you voted · tap to change</span>
          </>
        )}
        <span aria-hidden className="ml-auto">Anonymous</span>
      </div>
    </div>
  );
}

/** Pad/trim a tally array to exactly `n` slots so every option has a count. */
function padTo(arr: number[], n: number): number[] {
  const out = arr.slice(0, n);
  while (out.length < n) out.push(0);
  return out;
}
