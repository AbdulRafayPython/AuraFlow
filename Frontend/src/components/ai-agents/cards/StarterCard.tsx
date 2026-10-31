// Frontend/src/components/ai-agents/cards/StarterCard.tsx
//
// A conversation starter the engagement agent dropped to revive a quiet
// channel. Rendered inside AgentMessageShell — kept chrome-light. The prompt is
// the hero: a large, quotable question with a thin accent rule on the left.

import { MessagesSquare } from 'lucide-react';
import { accentFor } from '../AgentAccent';

interface StarterCardProps {
  text: string;
}

const accent = accentFor('engagement');

export default function StarterCard({ text }: StarterCardProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-medium "
           style={{ color: accent }}>
        <MessagesSquare className="h-3.5 w-3.5" aria-hidden />
        Conversation starter
      </div>
      <p
        className="mt-2 pl-3 text-base leading-relaxed text-[hsl(var(--theme-text-primary))]"
        style={{ borderLeft: `2px solid hsl(var(--agent-accent-community) / 0.4)` }}
      >
        {text}
      </p>
      <p className="mt-2 text-xs text-[hsl(var(--theme-text-muted))]">
        Reply to get things going 👇
      </p>
    </div>
  );
}
