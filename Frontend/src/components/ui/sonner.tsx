import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Sonner's own styles use attribute selectors, so overrides need `!`.
const icon = (cls: string) => `!h-5 !w-5 ${cls}`;

/**
 * The app's only toast surface (Discord-like): a solid card at the bottom right,
 * a coloured icon and stripe that say what kind of message it is, a bold first
 * line, an optional second line, and a close button. Max 3 visible.
 */
const Toaster = (props: ToasterProps) => {
  const { isDarkMode } = useTheme();

  return (
    <Sonner
      theme={isDarkMode ? "dark" : "light"}
      position="bottom-right"
      visibleToasts={3}
      duration={4000}
      gap={8}
      closeButton
      className="toaster group"
      containerAriaLabel="Notifications"
      icons={{
        success: <CheckCircle2 className={icon("text-success")} />,
        error: <XCircle className={icon("text-destructive")} />,
        warning: <AlertTriangle className={icon("text-warning")} />,
        info: <Info className={icon("text-[hsl(var(--theme-text-accent))]")} />,
        loading: <Loader2 className={icon("animate-spin text-muted-foreground")} />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast !items-start !gap-3 !rounded-lg !border !border-border !border-l-4 !border-l-[hsl(var(--theme-border-hover))] !bg-popover !py-3 !pl-3 !pr-9 !text-popover-foreground !shadow-popover",
          success: "!border-l-success",
          error: "!border-l-destructive",
          warning: "!border-l-warning",
          info: "!border-l-primary",
          icon: "!mt-0.5 !h-5 !w-5 !shrink-0",
          content: "!gap-0.5",
          title: "!text-sm !font-semibold !leading-snug !text-foreground",
          description: "!text-sm !leading-snug !text-muted-foreground",
          closeButton:
            "!left-auto !right-1.5 !top-1.5 !h-6 !w-6 !transform-none !rounded-md !border-0 !bg-transparent !text-muted-foreground hover:!bg-[hsl(var(--theme-bg-hover))] hover:!text-foreground",
          actionButton: "!h-8 !rounded-md !bg-primary !px-3 !text-sm !font-medium !text-primary-foreground",
          cancelButton: "!h-8 !rounded-md !bg-transparent !px-3 !text-sm !font-medium !text-muted-foreground hover:!text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
