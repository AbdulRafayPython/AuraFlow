import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned actions next to the heading. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * A titled block on a settings / admin / list page: 15px semibold heading,
 * one muted line of help, content below. The only place a section heading
 * style lives, so pages stop inventing their own.
 */
export function Section({ title, description, actions, children, className }: SectionProps) {
  return (
    <section className={cn("py-4", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
