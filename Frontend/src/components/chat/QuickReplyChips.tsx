import { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  X,
  CornerDownLeft,
  Hand,
  Heart,
  HelpCircle,
  LifeBuoy,
  CheckCheck,
  HeartHandshake,
  MessageSquareReply,
} from 'lucide-react';
import { useAIAgents } from '@/contexts/AIAgentContext';

interface QuickReplyChipsProps {
  /** Most recent inbound message in the channel — used to derive suggestions */
  lastMessage?: string | null;
  /** Whether the AutoMessage agent is enabled for this scope */
  enabled?: boolean;
  /** Tap handler — fired with the suggestion text. Parent decides whether
   *  to insert into the input or send immediately. */
  onPick: (suggestion: string) => void;
  /** Hide the strip without removing it (parent might toggle visibility) */
  visible?: boolean;
}

/**
 * Intent → how the assistant frames the suggestions. The backend
 * (agents/auto_message.py :: quick_replies) classifies the last inbound
 * message into one of these intents; surfacing it as a short, action-oriented
 * label is what makes the strip read as an *agent that understood the message*
 * rather than an anonymous row of pills. Icon + label share the accent.
 */
const INTENT_META: Record<
  string,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  greeting:     { label: 'Say hi back',          Icon: Hand },
  thanks:       { label: 'Acknowledge thanks',   Icon: Heart },
  question:     { label: 'Reply to their question', Icon: HelpCircle },
  help_request: { label: 'Offer a hand',         Icon: LifeBuoy },
  confirm:      { label: 'Acknowledge',          Icon: CheckCheck },
  apology:      { label: 'Respond kindly',       Icon: HeartHandshake },
  general:      { label: 'Suggested replies',    Icon: MessageSquareReply },
};

export default function QuickReplyChips({
  lastMessage,
  enabled = true,
  onPick,
  visible = true,
}: QuickReplyChipsProps) {
  const { getQuickReplies } = useAIAgents() as any;
  const [chips, setChips] = useState<string[]>([]);
  const [intent, setIntent] = useState<string>('general');
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState(false);
  // Increments on every fresh suggestion set so the card re-plays its
  // entrance/pulse — the visible "the other person just replied" refresh.
  const [refreshKey, setRefreshKey] = useState(0);
  const lastMsgRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !lastMessage) {
      setChips([]);
      setLoading(false);
      return;
    }
    if (lastMessage === lastMsgRef.current) return;
    lastMsgRef.current = lastMessage;

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await getQuickReplies(lastMessage, 3);
        if (cancelled) return;
        const next = Array.isArray(r?.suggestions) ? r.suggestions.slice(0, 3) : [];
        setChips(next);
        setIntent(typeof r?.intent === 'string' ? r.intent : 'general');
        if (next.length) {
          setHidden(false);
          setRefreshKey((k) => k + 1);
        }
      } catch {
        if (!cancelled) setChips([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lastMessage, enabled, getQuickReplies]);

  if (!enabled || hidden || !visible) return null;
  const showSkeleton = loading && chips.length === 0;
  if (!showSkeleton && chips.length === 0) return null;

  const meta = INTENT_META[intent] ?? INTENT_META.general;
  const IntentIcon = meta.Icon;

  return (
    <div className="px-3 pt-2 pb-1" role="group" aria-label="Assistant reply suggestions">
      <div
        key={refreshKey}
        // `--acc` lets the accent drive both static styles and Tailwind hover
        // states declaratively. Fallback keeps the indigo on themes that don't
        // define the agent-accent vars (only aura-calm-ops does).
        style={{ ['--acc' as string]: 'var(--agent-accent-community, 229 56% 65%)' } as React.CSSProperties}
        className={
          'group/card relative flex items-center gap-2.5 overflow-hidden ' +
          'rounded-xl border border-[hsl(var(--acc)/0.28)] ' +
          'bg-[hsl(var(--theme-bg-elevated))] py-1.5 pl-3 pr-2 ' +
          'shadow-[0_1px_2px_hsl(var(--acc)/0.06),0_8px_24px_-12px_hsl(var(--acc)/0.35)] ' +
          'animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none'
        }
      >
        {/* Accent identity rail */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] bg-[hsl(var(--acc))]"
        />

        {/* Live agent presence badge — the pulse signals the assistant is
            watching and just refreshed. */}
        <span
          aria-hidden
          className="relative grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[hsl(var(--acc)/0.14)] text-[hsl(var(--acc))]"
        >
          <Sparkles className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--acc))] opacity-70 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--acc))] ring-2 ring-[hsl(var(--theme-bg-elevated))]" />
          </span>
        </span>

        {/* Intent label — "the assistant understood the message" cue */}
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <IntentIcon className="h-3.5 w-3.5 text-[hsl(var(--acc))]" aria-hidden />
          <span className="text-[11.5px] font-semibold tracking-tight text-[hsl(var(--theme-text-primary))]">
            {meta.label}
          </span>
          <span
            aria-hidden
            className="mx-0.5 h-3.5 w-px bg-[hsl(var(--theme-border-default))]"
          />
        </div>

        {/* Chips (or thinking skeleton) */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {showSkeleton
            ? [64, 92, 76].map((w, i) => (
                <span
                  key={i}
                  aria-hidden
                  style={{ width: w }}
                  className="h-6 rounded-full bg-[hsl(var(--acc)/0.12)] animate-pulse motion-reduce:animate-none"
                />
              ))
            : chips.map((chip, i) => (
                <button
                  key={`${chip}-${i}`}
                  type="button"
                  onClick={() => onPick(chip)}
                  aria-label={`Use suggested reply: ${chip}`}
                  className={
                    'group/chip inline-flex items-center gap-1 rounded-full border ' +
                    'border-[hsl(var(--acc)/0.30)] bg-[hsl(var(--acc)/0.08)] ' +
                    'py-1 pl-3 pr-2.5 text-[12px] font-medium text-[hsl(var(--theme-text-primary))] ' +
                    'transition-all [transition-duration:150ms] ' +
                    'hover:-translate-y-px hover:border-[hsl(var(--acc)/0.6)] hover:bg-[hsl(var(--acc)/0.16)] ' +
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--acc)/0.55)] ' +
                    'motion-reduce:transition-none motion-reduce:hover:translate-y-0'
                  }
                >
                  <span className="truncate">{chip}</span>
                  <CornerDownLeft
                    aria-hidden
                    className="h-3 w-3 shrink-0 text-[hsl(var(--acc))] opacity-40 transition-opacity group-hover/chip:opacity-100"
                  />
                </button>
              ))}
        </div>

        {/* Dismiss */}
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Dismiss suggestions"
          className={
            'ml-auto shrink-0 rounded-md p-1 text-[hsl(var(--theme-text-muted))] ' +
            'transition-colors hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-secondary))] ' +
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--acc)/0.5)]'
          }
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
