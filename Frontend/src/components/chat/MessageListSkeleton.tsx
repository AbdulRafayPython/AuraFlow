import { cn } from "@/lib/utils";

const WIDTHS = ["72%", "48%", "64%", "36%", "58%", "80%"];

/**
 * Loading state shaped like the real message list: avatar tile, name + time
 * line, one or two text lines. Rows alternate grouped / headed like real chat.
 */
export function MessageListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading messages" className={cn("space-y-4 px-4 py-4", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <div className="h-3.5 w-32 rounded bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />
            <div className="h-3.5 rounded bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" style={{ width: WIDTHS[i % WIDTHS.length] }} />
            {i % 3 === 0 && (
              <div className="h-3.5 rounded bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" style={{ width: WIDTHS[(i + 2) % WIDTHS.length] }} />
            )}
          </div>
        </div>
      ))}
      <span className="sr-only">Loading messages…</span>
    </div>
  );
}

/** Sidebar list placeholder (channels / conversations). */
export function SidebarListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-1 px-1 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-1.5">
          <div className="h-4 w-4 shrink-0 rounded bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />
          <div className="h-3.5 rounded bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" style={{ width: `${48 + ((i * 17) % 40)}%` }} />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
