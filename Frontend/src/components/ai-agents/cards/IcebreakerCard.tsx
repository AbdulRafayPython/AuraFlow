// Frontend/src/components/ai-agents/cards/IcebreakerCard.tsx
//
// An ice-breaker activity (prompts + optional example/duration). Rendered
// inside AgentMessageShell — chrome-light. Questions are listed as numbered
// rows; duration shows as a small meta chip.

import { Snowflake, Clock } from 'lucide-react';
import { accentFor } from '../AgentAccent';

interface IcebreakerCardProps {
  title: string;
  description?: string | null;
  questions?: string[];
  example?: string | null;
  duration?: string | null;
}

const accent = accentFor('engagement');

export default function IcebreakerCard({
  title,
  description,
  questions = [],
  example,
  duration,
}: IcebreakerCardProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide"
           style={{ color: accent }}>
        <Snowflake className="h-3.5 w-3.5" aria-hidden />
        Ice-breaker
      </div>

      <h4 className="mt-1.5 text-[15px] font-semibold text-[hsl(var(--theme-text-primary))]">
        {title}
      </h4>
      {description && (
        <p className="mt-1 text-[13px] leading-relaxed text-[hsl(var(--theme-text-secondary))]">
          {description}
        </p>
      )}

      {questions.length > 0 && (
        <ol className="mt-2.5 flex flex-col gap-1.5">
          {questions.map((q, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                style={{
                  color: accent,
                  backgroundColor: `hsl(var(--agent-accent-community) / 0.14)`,
                }}
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="text-[13.5px] leading-relaxed text-[hsl(var(--theme-text-secondary))]">
                {q}
              </span>
            </li>
          ))}
        </ol>
      )}

      {example && (
        <div
          className="mt-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] italic text-[hsl(var(--theme-text-muted))]"
          style={{ backgroundColor: 'hsl(var(--theme-text-muted) / 0.08)' }}
        >
          e.g. {example}
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
