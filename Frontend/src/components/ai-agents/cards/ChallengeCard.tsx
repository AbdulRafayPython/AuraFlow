// Frontend/src/components/ai-agents/cards/ChallengeCard.tsx
//
// A fun challenge with a highlighted theme + optional duration. Rendered inside
// AgentMessageShell — chrome-light. The theme is the call to action and gets an
// accent-tinted callout band.

import { Trophy, Clock } from 'lucide-react';
import { accentFor } from '../AgentAccent';

interface ChallengeCardProps {
  title: string;
  description?: string | null;
  theme?: string | null;
  duration?: string | null;
}

const accent = accentFor('engagement');

export default function ChallengeCard({
  title,
  description,
  theme,
  duration,
}: ChallengeCardProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide"
           style={{ color: accent }}>
        <Trophy className="h-3.5 w-3.5" aria-hidden />
        Challenge
      </div>

      <h4 className="mt-1.5 text-[15px] font-semibold text-[hsl(var(--theme-text-primary))]">
        {title}
      </h4>
      {description && (
        <p className="mt-1 text-[13px] leading-relaxed text-[hsl(var(--theme-text-secondary))]">
          {description}
        </p>
      )}

      {theme && (
        <div
          className="mt-2.5 flex items-center gap-2 rounded-md px-3 py-2"
          style={{
            backgroundColor: `hsl(var(--agent-accent-community) / 0.12)`,
            borderLeft: `2px solid ${accent}`,
          }}
        >
          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: accent }}>
            Theme
          </span>
          <span className="text-[13.5px] font-medium text-[hsl(var(--theme-text-primary))]">
            {theme}
          </span>
        </div>
      )}

      {duration && (
        <div className="mt-2.5 inline-flex items-center gap-1 text-[11px] text-[hsl(var(--theme-text-muted))]">
          <Clock className="h-3 w-3" aria-hidden />
          ~{duration}
        </div>
      )}
    </div>
  );
}
