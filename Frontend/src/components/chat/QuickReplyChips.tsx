import { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
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

export default function QuickReplyChips({
  lastMessage,
  enabled = true,
  onPick,
  visible = true,
}: QuickReplyChipsProps) {
  const { getQuickReplies } = useAIAgents() as any;
  const [chips, setChips] = useState<string[]>([]);
  const [hidden, setHidden] = useState(false);
  const lastMsgRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !lastMessage) {
      setChips([]);
      return;
    }
    if (lastMessage === lastMsgRef.current) return;
    lastMsgRef.current = lastMessage;

    let cancelled = false;
    (async () => {
      try {
        const r = await getQuickReplies(lastMessage, 3);
        if (cancelled) return;
        setChips(Array.isArray(r?.suggestions) ? r.suggestions.slice(0, 3) : []);
        setHidden(false);
      } catch {
        if (!cancelled) setChips([]);
      }
    })();
    return () => { cancelled = true; };
  }, [lastMessage, enabled, getQuickReplies]);

  if (!enabled || hidden || !visible || chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 pt-2 pb-1.5 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip, i) => (
          <button
            key={`${chip}-${i}`}
            onClick={() => onPick(chip)}
            className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/30 hover:bg-violet-500/20 hover:border-violet-500/50 transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>
      <button
        onClick={() => setHidden(true)}
        className="ml-auto text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-secondary))] p-0.5 rounded"
        aria-label="Hide suggestions"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
