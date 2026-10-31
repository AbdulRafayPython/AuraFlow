import * as React from "react";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState } from "./EmptyState";

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer. */
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Right-align numbers. */
  align?: "left" | "right";
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: { title: string; description?: string; action?: React.ReactNode };
  onRowClick?: (row: T) => void;
  caption?: string;
}

/**
 * Plain table with the four list states built in: loading (skeleton rows
 * shaped like the table), error (retry), empty (with next step), data.
 */
export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, empty, onRowClick, caption }: DataTableProps<T>) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!loading && rows.length === 0) {
    return <EmptyState title={empty?.title ?? "Nothing here yet"} description={empty?.description} action={empty?.action} />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-border bg-[hsl(var(--theme-bg-secondary))]">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn("px-4 py-2 text-xs font-medium text-muted-foreground", c.align === "right" ? "text-right" : "text-left", c.className)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      <div className="h-4 w-3/4 rounded bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-border last:border-b-0",
                    onRowClick && "cursor-pointer transition-colors hover:bg-[hsl(var(--theme-bg-hover)/0.5)]",
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-3 text-foreground", c.align === "right" && "text-right tabular-nums", c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
