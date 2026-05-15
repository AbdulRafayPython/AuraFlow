import { useToast } from "@/hooks/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  type ToastVariant,
} from "@/components/ui/toast";
import { CheckCircle2, AlertTriangle, Info, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const VARIANT_ICON: Record<ToastVariant, React.ComponentType<{ className?: string }>> = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
  loading: Loader2,
};

const VARIANT_ICON_TONE: Record<ToastVariant, string> = {
  default: "bg-primary/15 text-primary",
  info: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
  loading: "bg-accent/15 text-accent",
};

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const resolvedVariant: ToastVariant = (variant as ToastVariant) ?? "default";
        const Icon = VARIANT_ICON[resolvedVariant] ?? Info;
        const iconTone = VARIANT_ICON_TONE[resolvedVariant] ?? VARIANT_ICON_TONE.default;
        const isLoading = resolvedVariant === "loading";

        return (
          <Toast key={id} variant={resolvedVariant} {...props}>
            <span
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                iconTone,
              )}
              aria-hidden="true"
            >
              <Icon className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </span>
            <div className="min-w-0 flex-1 pr-2">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
              {action && <div className="mt-2 flex gap-2">{action}</div>}
            </div>
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
