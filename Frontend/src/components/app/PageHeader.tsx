import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface PageHeaderProps {
  title: React.ReactNode;
  /** One line of context next to the title. Truncates; full text in a tooltip. */
  description?: string;
  /** Leading icon (e.g. the channel `#`). */
  icon?: React.ReactNode;
  /** Right-aligned actions: search, members, buttons. */
  actions?: React.ReactNode;
  /** Extra inline content between the title block and actions (e.g. connection state). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Standard 48px page / channel header: icon + title, a one-line description
 * (truncated, full text in a tooltip) and right-side actions.
 */
export function PageHeader({ title, description, icon, actions, children, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-4",
        className,
      )}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        {icon && <span className="flex shrink-0 items-center text-muted-foreground">{icon}</span>}
        <h1 className="max-w-[24ch] truncate text-base font-semibold text-foreground">{title}</h1>
      </div>
      {description && (
        <>
          <span aria-hidden className="hidden h-4 w-px shrink-0 bg-border sm:block" />
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground sm:block">
                {description}
              </p>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-sm whitespace-pre-wrap">
              {description}
            </TooltipContent>
          </Tooltip>
        </>
      )}
      {children}
      {!description && <div className="flex-1" />}
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}
