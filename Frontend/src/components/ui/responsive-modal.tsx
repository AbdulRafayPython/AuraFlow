import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

/**
 * ResponsiveModal — one modal API, two transports.
 *
 *  • Desktop (md+): centered Radix Dialog card
 *  • Mobile (<md): Vaul-based bottom Drawer with drag-to-dismiss
 *
 * Adopts the project's theme tokens (hsl(var(--theme-bg-*))) so it
 * matches the rest of the chrome regardless of which transport is
 * being used.
 *
 *   <ResponsiveModal open={open} onOpenChange={setOpen}>
 *     <ResponsiveModalContent size="md">
 *       <ResponsiveModalHeader>
 *         <ResponsiveModalTitle>...</ResponsiveModalTitle>
 *         <ResponsiveModalDescription>...</ResponsiveModalDescription>
 *       </ResponsiveModalHeader>
 *       <ResponsiveModalBody>...</ResponsiveModalBody>
 *       <ResponsiveModalFooter>...</ResponsiveModalFooter>
 *     </ResponsiveModalContent>
 *   </ResponsiveModal>
 */

type Size = "sm" | "md" | "lg" | "xl" | "2xl";

const DESKTOP_SIZE: Record<Size, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
  "2xl": "sm:max-w-3xl",
};

// ── Context ─────────────────────────────────────────────────────
// Lets the sub-components know whether they're being rendered into
// the Dialog or Drawer transport without prop-drilling.
type Mode = "drawer" | "dialog";
const ModeContext = React.createContext<Mode>("dialog");

// ── Root ────────────────────────────────────────────────────────
interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function ResponsiveModal({ open, onOpenChange, children }: ResponsiveModalProps) {
  const isMobile = useIsMobile();
  const mode: Mode = isMobile ? "drawer" : "dialog";

  return (
    <ModeContext.Provider value={mode}>
      {mode === "drawer" ? (
        <Drawer open={open} onOpenChange={onOpenChange}>
          {children}
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          {children}
        </Dialog>
      )}
    </ModeContext.Provider>
  );
}

// ── Content ─────────────────────────────────────────────────────
interface ContentProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: Size;
}

export const ResponsiveModalContent = React.forwardRef<HTMLDivElement, ContentProps>(
  ({ size = "md", className, children, ...props }, ref) => {
    const mode = React.useContext(ModeContext);

    if (mode === "drawer") {
      return (
        <DrawerContent
          ref={ref}
          className={cn(
            // Theme + safe-area aware. max-height respects mobile viewport.
            "bg-[hsl(var(--theme-bg-primary))] text-[hsl(var(--theme-text-primary))] border-[hsl(var(--theme-border-default)/0.6)]",
            "max-h-[92vh] pb-[max(var(--safe-bottom),0.5rem)]",
            className,
          )}
          {...props}
        >
          {/* Built-in close affordance — the drag handle from drawer.tsx is
              already rendered. We add a small X for parity with desktop. */}
          <DrawerClose
            className="absolute right-3 top-3 rounded-md p-1.5 text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))] transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </DrawerClose>
          {children}
        </DrawerContent>
      );
    }

    return (
      <DialogContent
        ref={ref}
        className={cn(
          // Override the shadcn default max-w-lg with our size mapping.
          // We also re-theme bg/border to match the rest of the app.
          "bg-[hsl(var(--theme-bg-primary))] text-[hsl(var(--theme-text-primary))] border-[hsl(var(--theme-border-default)/0.6)]",
          "max-w-[calc(100vw-2rem)]",
          DESKTOP_SIZE[size],
          // Generous max-height with a scrollable body inside.
          "max-h-[90vh] p-0 gap-0 overflow-hidden",
          className,
        )}
        {...props}
      >
        {children}
      </DialogContent>
    );
  },
);
ResponsiveModalContent.displayName = "ResponsiveModalContent";

// ── Header ──────────────────────────────────────────────────────
export function ResponsiveModalHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const mode = React.useContext(ModeContext);
  if (mode === "drawer") {
    return (
      <DrawerHeader
        className={cn(
          "px-5 pt-5 pb-3 text-left border-b border-[hsl(var(--theme-border-default)/0.5)]",
          className,
        )}
        {...props}
      />
    );
  }
  return (
    <DialogHeader
      className={cn(
        "px-6 pt-5 pb-4 text-left border-b border-[hsl(var(--theme-border-default)/0.5)]",
        className,
      )}
      {...props}
    />
  );
}

// ── Title ───────────────────────────────────────────────────────
export const ResponsiveModalTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => {
  const mode = React.useContext(ModeContext);
  const cls = cn(
    "text-base font-semibold tracking-tight text-[hsl(var(--theme-text-primary))]",
    className,
  );
  return mode === "drawer" ? (
    <DrawerTitle ref={ref} className={cls} {...props} />
  ) : (
    <DialogTitle ref={ref} className={cls} {...props} />
  );
});
ResponsiveModalTitle.displayName = "ResponsiveModalTitle";

// ── Description ─────────────────────────────────────────────────
export const ResponsiveModalDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const mode = React.useContext(ModeContext);
  const cls = cn("text-xs text-[hsl(var(--theme-text-muted))] mt-1", className);
  return mode === "drawer" ? (
    <DrawerDescription ref={ref} className={cls} {...props} />
  ) : (
    <DialogDescription ref={ref} className={cls} {...props} />
  );
});
ResponsiveModalDescription.displayName = "ResponsiveModalDescription";

// ── Body ────────────────────────────────────────────────────────
export function ResponsiveModalBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const mode = React.useContext(ModeContext);
  return (
    <div
      className={cn(
        "overflow-y-auto overscroll-contain",
        mode === "drawer" ? "px-5 py-4" : "px-6 py-5",
        // The drawer max-h is set on content; here we just allow scroll.
        // Inside dialog the content has max-h-[90vh] minus header/footer.
        "max-h-[70vh]",
        className,
      )}
      {...props}
    />
  );
}

// ── Footer ──────────────────────────────────────────────────────
export function ResponsiveModalFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const mode = React.useContext(ModeContext);
  if (mode === "drawer") {
    return (
      <DrawerFooter
        className={cn(
          "px-5 pt-3 pb-4 border-t border-[hsl(var(--theme-border-default)/0.5)] flex-row justify-end gap-2",
          className,
        )}
        {...props}
      />
    );
  }
  return (
    <div
      className={cn(
        "px-6 pt-3 pb-5 border-t border-[hsl(var(--theme-border-default)/0.5)] flex justify-end gap-2",
        className,
      )}
      {...props}
    />
  );
}

// ── Convenience close (works in either mode) ────────────────────
// The drawer close is built in; for dialogs we expose a button.
export function ResponsiveModalClose({
  onClick,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium border border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-colors",
        className,
      )}
      {...props}
    />
  );
}
