// Compatibility shim: the legacy Radix `useToast()` API on top of sonner,
// so the ~40 existing call sites keep working while the app has one toast
// system. New code can import `toast` from "sonner" directly.
import * as React from "react";
import { toast as sonnerToast } from "sonner";

type ToastAction = { label: React.ReactNode; onClick: () => void };

export interface ToastInput {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** "destructive" renders as an error toast. */
  variant?: "default" | "destructive" | "success" | "info" | "warning" | "loading";
  duration?: number;
  action?: ToastAction;
  cancel?: ToastAction;
}

const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 8000;

function toast({ title, description, variant = "default", duration, action, cancel }: ToastInput) {
  const message = title ?? description;
  const body = title ? description : undefined;
  const isError = variant === "destructive";
  const options = {
    description: body,
    // Errors with a recovery action stay until dismissed.
    duration: duration ?? (isError ? (action ? Infinity : ERROR_DURATION) : DEFAULT_DURATION),
    action,
    cancel,
  };
  const id = isError
    ? sonnerToast.error(message, options)
    : variant === "success"
      ? sonnerToast.success(message, options)
      : variant === "info"
        ? sonnerToast.info(message, options)
        : variant === "warning"
          ? sonnerToast.warning(message, options)
          : variant === "loading"
            ? sonnerToast.loading(message, options)
            : sonnerToast(message, options);
  return {
    id,
    dismiss: () => sonnerToast.dismiss(id),
    update: (next: ToastInput) => {
      sonnerToast(next.title ?? next.description, { id, description: next.title ? next.description : undefined });
    },
  };
}

function dismiss(toastId?: string | number) {
  sonnerToast.dismiss(toastId);
}

function useToast() {
  return { toast, dismiss };
}

export { useToast, toast };
