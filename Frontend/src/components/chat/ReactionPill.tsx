import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ReactionPillProps {
  emoji: string;
  count: number;
  /** The current user has reacted: tinted pill. */
  reacted?: boolean;
  /** Who reacted, for the tooltip. */
  names?: string[];
  onClick: () => void;
}

/** 24px full-round reaction chip. Own reaction gets a soft accent tint. */
export function ReactionPill({ emoji, count, reacted = false, names = [], onClick }: ReactionPillProps) {
  const who = names.length > 0 ? `${names.join(", ")} reacted with ${emoji}` : `React with ${emoji}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-pressed={reacted}
          aria-label={`${emoji} ${count}, ${reacted ? "remove your reaction" : "add your reaction"}`}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors duration-100",
            reacted
              ? "border-[hsl(var(--theme-accent-primary)/0.55)] bg-[hsl(var(--theme-accent-primary)/0.14)] text-foreground"
              : "border-border bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))] hover:border-[hsl(var(--theme-border-hover))]",
          )}
        >
          <span className="text-sm leading-none">{emoji}</span>
          <span className="font-medium tabular-nums">{count}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {who}
      </TooltipContent>
    </Tooltip>
  );
}
