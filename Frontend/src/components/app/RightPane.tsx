import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

/* ── Context: any screen can open content in the shell's right pane ── */

export interface RightPaneContent {
  /** Stable key; opening the same key again replaces the content. */
  key: string;
  title: React.ReactNode;
  body: React.ReactNode;
  onClose?: () => void;
}

interface RightPaneContextValue {
  content: RightPaneContent | null;
  open: (content: RightPaneContent) => void;
  close: () => void;
}

const RightPaneContext = React.createContext<RightPaneContextValue | null>(null);

export function RightPaneProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = React.useState<RightPaneContent | null>(null);
  const contentRef = React.useRef<RightPaneContent | null>(null);
  const open = React.useCallback((next: RightPaneContent) => {
    const prev = contentRef.current;
    // A different panel replaces the current one: let it clean up its own state.
    if (prev && prev.key !== next.key) prev.onClose?.();
    contentRef.current = next;
    setContent(next);
  }, []);
  const close = React.useCallback(() => {
    const current = contentRef.current;
    contentRef.current = null;
    setContent(null);
    // Outside the state updater, so callers may set their own state in onClose.
    current?.onClose?.();
  }, []);
  const value = React.useMemo(() => ({ content, open, close }), [content, open, close]);
  return <RightPaneContext.Provider value={value}>{children}</RightPaneContext.Provider>;
}

export function useRightPane() {
  const ctx = React.useContext(RightPaneContext);
  if (!ctx) throw new Error("useRightPane must be used within RightPaneProvider");
  return ctx;
}

/* ── Presentation ───────────────────────────────────────────────────── */

interface RightPaneProps {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

/** Slack-style side pane (thread, agent details, profile): header + scrollable body. */
export function RightPane({ title, onClose, children, className }: RightPaneProps) {
  return (
    <aside
      aria-label={typeof title === "string" ? title : "Details"}
      className={cn(
        "flex h-full w-right-pane max-w-full shrink-0 flex-col border-l border-border bg-background",
        className,
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          title="Close (Esc)"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-smooth hover:bg-accent hover:text-foreground"
        >
          <Icon icon={X} size="md" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
