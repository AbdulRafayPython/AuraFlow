import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Icon } from "./Icon";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? "⌘" : "Ctrl";

export const SHORTCUTS: Array<{ group: string; items: Array<{ keys: string[]; label: string }> }> = [
  {
    group: "Navigate",
    items: [
      { keys: [MOD, "K"], label: "Jump to a channel, person or page" },
      { keys: ["Alt", "↑"], label: "Previous channel" },
      { keys: ["Alt", "↓"], label: "Next channel" },
      { keys: ["Esc"], label: "Close the side panel or dialog" },
    ],
  },
  {
    group: "Messages",
    items: [
      { keys: ["Enter"], label: "Send message" },
      { keys: [":", "name"], label: "Insert an emoji, for example :tada" },
      { keys: ["@"], label: "Mention an agent" },
      { keys: ["/"], label: "Run a command" },
    ],
  },
  {
    group: "Help",
    items: [{ keys: ["?"], label: "Show this list" }],
  },
];

/** The keyboard shortcuts list. Opened with "?" or from the palette. */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[10000] bg-black/60" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[10001] w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-5 shadow-popover">
          <div className="mb-3 flex items-center justify-between">
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">Keyboard shortcuts</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <Icon icon={X} size="md" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">Shortcuts available across AuraFlow.</DialogPrimitive.Description>
          <div className="space-y-4">
            {SHORTCUTS.map((g) => (
              <section key={g.group} aria-label={g.group}>
                <h3 className="mb-1 text-xs font-medium text-muted-foreground">{g.group}</h3>
                <ul>
                  {g.items.map((it) => (
                    <li key={it.label} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-b-0">
                      <span className="text-foreground">{it.label}</span>
                      <span className="flex shrink-0 gap-1">
                        {it.keys.map((k) => (
                          <kbd key={k} className="rounded border border-border bg-[hsl(var(--theme-bg-tertiary))] px-1.5 py-0.5 text-xs font-medium text-[hsl(var(--theme-text-secondary))]">
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
