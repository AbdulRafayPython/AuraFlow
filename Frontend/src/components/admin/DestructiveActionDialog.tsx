/**
 * DestructiveActionDialog
 *
 * Shared confirm dialog for destructive admin actions (ban, kick, mute,
 * delete announcement, bulk-resolve, …). Replaces ad-hoc `window.confirm()`
 * and one-off AlertDialog blocks scattered across `Frontend/src/pages/admin/*`.
 *
 * Built on the existing radix `AlertDialog` primitive — same shape as
 * `BlockedUsers.tsx:440–456` so the dialog feels native to the dashboard.
 *
 * Severity tuning:
 *   - `severity="destructive"` (default) → red confirm button, danger icon
 *   - `severity="warn"`                  → yellow confirm button, warn icon
 *
 * Phase 1.5 ships this component pulled forward from Phase 3.1 because the
 * Ban/Mute/Kick flow in UserManagement.tsx needs it first. Subsequent
 * adopters: Announcements.tsx (2.5), FlaggedContent.tsx bulk-action (2.2).
 */

import React from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

export type DestructiveSeverity = 'warn' | 'destructive';

export interface DestructiveActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /**
   * Plain-text description. Use `extra` for richer content (a member
   * snapshot, a textarea, etc.) that needs to render *below* the
   * description but inside the dialog body.
   */
  description: React.ReactNode;
  /** Slot for extra body content (e.g. an inline note, reason textarea). */
  extra?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: DestructiveSeverity;
  /** Show spinner copy + disable confirm while the action is in flight. */
  loading?: boolean;
  /** Disable confirm independently of `loading` (e.g. required field empty). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
}

export function DestructiveActionDialog({
  open,
  onOpenChange,
  title,
  description,
  extra,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  severity = 'destructive',
  loading = false,
  confirmDisabled = false,
  onConfirm,
}: DestructiveActionDialogProps) {
  const Icon = severity === 'warn' ? AlertTriangle : ShieldAlert;
  const accent =
    severity === 'warn'
      ? 'text-yellow-500'
      : 'text-destructive';
  const confirmClass =
    severity === 'warn'
      ? 'bg-yellow-500 text-yellow-50 hover:bg-yellow-500/90'
      : 'bg-destructive text-destructive-foreground hover:bg-destructive/90';

  return (
    <AlertDialog
      open={open}
      onOpenChange={o => {
        // Prevent close while the action is mid-flight — avoids race where
        // the user clicks Cancel after Confirm and we still fire the callback.
        if (loading && !o) return;
        onOpenChange(o);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icon className={cn('h-5 w-5', accent)} />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {extra ? <div className="space-y-2">{extra}</div> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={e => {
              // Don't auto-close — the parent owns the open state and will
              // flip it once the async action resolves. This lets us keep the
              // dialog visible (with a spinner) until the server confirms.
              e.preventDefault();
              if (loading || confirmDisabled) return;
              onConfirm();
            }}
            disabled={loading || confirmDisabled}
            className={confirmClass}
          >
            {loading ? 'Working…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default DestructiveActionDialog;
