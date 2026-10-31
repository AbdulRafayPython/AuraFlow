import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** The next step: a primary button or link. */
  action?: React.ReactNode;
  className?: string;
}

/** Empty list: what this is, why it is empty, what to do next. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-10 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--theme-bg-tertiary))] text-muted-foreground">
          <Icon icon={icon} size="lg" />
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Error state with a retry action. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-destructive/10"
        >
          Retry
        </button>
      )}
    </div>
  );
}
