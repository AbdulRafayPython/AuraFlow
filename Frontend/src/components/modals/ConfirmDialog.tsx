// The app's one "Are you sure?" box. Plain words, the safe choice on the left,
// and a red button only for things that cannot be undone.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: ReactNode;
  cancelText?: string;
  confirmText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isDangerous?: boolean;
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  cancelText = 'Cancel',
  confirmText = 'Confirm',
  onConfirm,
  onCancel,
  isDangerous = false,
  isLoading = false,
}: ConfirmDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const busy = isProcessing || isLoading;

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirm();
    } finally {
      setIsProcessing(false);
      // Close once it is done (callers only clear their state in onCancel).
      onCancel();
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && !busy && onCancel()}>
      <AlertDialogContent data-testid="confirm-dialog">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            {isDangerous && (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive" aria-hidden>
                <AlertTriangle className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0 space-y-1.5">
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription>{description}</AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={busy}>{cancelText}</AlertDialogCancel>
          {/* A plain button (not AlertDialogAction) so the box stays open while the action runs. */}
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy}
            data-testid="confirm-dialog-confirm"
            className={cn(buttonVariants({ variant: isDangerous ? 'destructive' : 'default', size: 'sm' }), 'h-9 px-4')}
          >
            {busy && <Loader2 className="animate-spin" />}
            {confirmText}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ─── useConfirm(): an awaitable replacement for window.confirm ─────────── */

export interface ConfirmOptions {
  title: string;
  description: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** Red button and warning icon, for things that cannot be undone. */
  danger?: boolean;
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((next) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <ConfirmDialog
        isOpen={options !== null}
        title={options?.title ?? ''}
        description={options?.description ?? ''}
        confirmText={options?.confirmText}
        cancelText={options?.cancelText}
        isDangerous={options?.danger}
        onConfirm={() => finish(true)}
        onCancel={() => finish(false)}
      />
    </ConfirmContext.Provider>
  );
}

/** `if (!(await confirm({ title, description, danger: true }))) return;` */
// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  // Outside the provider (tests, isolated renders) fall back to the browser's box.
  return ask ?? (async (o) => window.confirm(`${o.title}\n\n${typeof o.description === 'string' ? o.description : ''}`));
}
