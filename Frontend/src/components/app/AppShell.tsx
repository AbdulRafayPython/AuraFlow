import * as React from "react";
import { cn } from "@/lib/utils";
import { RightPane, useRightPane } from "./RightPane";

interface AppShellProps {
  /** 56px workspace rail (primary destinations + communities). */
  rail: React.ReactNode;
  /** 260px contextual sidebar: channels of the current community, or DMs. Omit to hide. */
  sidebar?: React.ReactNode;
  /** Main column. */
  children: React.ReactNode;
  /** The floating user panel (desktop): hovers over the bottom of the rail + sidebar. */
  dock?: React.ReactNode;
  /** Overlays that must sit above the shell (settings modal, mobile nav, drawer). */
  overlay?: React.ReactNode;
  className?: string;
}

/**
 * Desktop layout: rail | sidebar | main | right pane (optional).
 * On mobile the rail and sidebar live in the drawer owned by the caller
 * (passed through `overlay`), so only `children` render in the flow.
 */
export function AppShell({ rail, sidebar, dock, children, overlay, className }: AppShellProps) {
  const pane = useRightPane();
  const paneOpen = !!pane.content;
  const closePane = pane.close;

  // Esc closes the right pane
  React.useEffect(() => {
    if (!paneOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePane();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paneOpen, closePane]);

  return (
    <div
      className={cn("relative flex h-screen overflow-hidden text-foreground", className)}
      style={{ background: "var(--theme-bg-gradient)" }}
    >
      <nav aria-label="Workspaces" className="hidden w-rail shrink-0 md:flex">
        {rail}
      </nav>
      {sidebar && <div className="hidden w-sidebar shrink-0 md:flex">{sidebar}</div>}

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>

      {pane.content && (
        <RightPane title={pane.content.title} onClose={pane.close} className="hidden lg:flex">
          {pane.content.body}
        </RightPane>
      )}
      {dock && (
        <div className="absolute bottom-2 left-2 z-30 hidden w-[calc(var(--rail-width)+var(--sidebar-width)-16px)] md:block">
          {dock}
        </div>
      )}
      {overlay}
    </div>
  );
}
