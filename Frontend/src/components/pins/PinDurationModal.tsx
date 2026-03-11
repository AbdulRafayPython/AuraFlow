// components/pins/PinDurationModal.tsx — Unified pin/unpin modal
// When the target message is NOT pinned → show duration selection (pin flow)
// When the target message IS pinned → show pin info + unpin option
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Pin, PinOff, Clock, X, Loader2, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PIN_DURATION_OPTIONS, type PinDurationMinutes } from '@/services/pinService';

export interface PinModalContext {
  /** true when the target message is already pinned */
  isPinned: boolean;
  /** user_id of whoever pinned it (for owner-only unpin) */
  pinnedByUserId?: number | null;
  /** username of the pinner */
  pinnedByUsername?: string | null;
  /** when the pin expires */
  expiresAt?: string | null;
}

interface PinDurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when user selects a duration to pin */
  onConfirm: (durationMinutes: PinDurationMinutes) => Promise<void>;
  /** Called when user clicks Unpin */
  onUnpin?: () => Promise<void>;
  messagePreview?: string;
  /** Additional context about the pin state of the target message */
  pinContext?: PinModalContext;
  /** Current user id — used to check if user owns the pin */
  currentUserId?: number | null;
}

const DURATION_ICONS: Record<number, string> = {
  1440: '24h',
  10080: '7d',
  43200: '30d',
};

const DURATION_DESCRIPTIONS: Record<number, string> = {
  1440: 'Quick highlight for today',
  10080: 'Keep visible for the week',
  43200: 'Long-term reference',
};

/** Human-readable remaining time */
function formatTimeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m remaining`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m remaining`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h remaining`;
}

const PinDurationModal: React.FC<PinDurationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onUnpin,
  messagePreview,
  pinContext,
  currentUserId,
}) => {
  const [selected, setSelected] = useState<PinDurationMinutes | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  const isPinnedFlow = pinContext?.isPinned === true;
  const isOwner = isPinnedFlow && currentUserId != null && pinContext.pinnedByUserId === currentUserId;

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelected(null);
      setIsSubmitting(false);
      setError(null);
      // Focus first option for keyboard accessibility
      setTimeout(() => firstButtonRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Close on click outside
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  }, [onClose]);

  const handleConfirm = useCallback(async () => {
    if (!selected || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(selected);
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to pin message';
      setError(msg);
      setIsSubmitting(false);
    }
  }, [selected, isSubmitting, onConfirm, onClose]);

  const handleUnpin = useCallback(async () => {
    if (!onUnpin || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onUnpin();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to unpin message';
      setError(msg);
      setIsSubmitting(false);
    }
  }, [onUnpin, isSubmitting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150" />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-modal-title"
        className={cn(
          'relative z-10 w-full max-w-[380px] mx-4',
          'bg-[hsl(var(--theme-bg-elevated))] rounded-2xl',
          'border border-[hsl(var(--theme-border-subtle)/0.6)]',
          'shadow-[0_24px_80px_-12px_rgba(0,0,0,0.35)]',
          'animate-in fade-in zoom-in-95 duration-200',
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-2">
          <div className={cn(
            'flex items-center justify-center w-9 h-9 rounded-xl',
            isPinnedFlow
              ? 'bg-amber-500/12'
              : 'bg-[hsl(var(--theme-accent-primary)/0.12)]',
          )}>
            {isPinnedFlow
              ? <Pin className="w-[18px] h-[18px] text-amber-400" />
              : <Pin className="w-[18px] h-[18px] text-[hsl(var(--theme-accent-primary))]" />
            }
          </div>
          <div className="flex-1">
            <h2 id="pin-modal-title" className="text-[15px] font-semibold text-[hsl(var(--theme-text-primary))]">
              {isPinnedFlow ? 'Pinned Message' : 'Pin Message'}
            </h2>
            <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5">
              {isPinnedFlow
                ? 'This message is currently pinned'
                : 'Select how long this message should stay pinned'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message preview */}
        {messagePreview && (
          <div className="mx-5 mt-2 px-3 py-2 rounded-lg bg-[hsl(var(--theme-bg-secondary)/0.6)] border border-[hsl(var(--theme-border-subtle)/0.4)]">
            <p className="text-xs text-[hsl(var(--theme-text-muted))] line-clamp-2 leading-relaxed">
              {messagePreview}
            </p>
          </div>
        )}

        {/* ─── PINNED FLOW: Show pin info + unpin ─── */}
        {isPinnedFlow ? (
          <div className="px-5 py-4 space-y-3">
            {/* Pin metadata */}
            <div className="flex flex-col gap-2 px-4 py-3 rounded-xl bg-[hsl(var(--theme-bg-surface)/0.5)] border border-[hsl(var(--theme-border-subtle)/0.4)]">
              {pinContext.pinnedByUsername && (
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="w-3.5 h-3.5 text-[hsl(var(--theme-text-muted))]" />
                  <span className="text-[hsl(var(--theme-text-muted))]">Pinned by</span>
                  <span className="font-medium text-[hsl(var(--theme-text-primary))]">{pinContext.pinnedByUsername}</span>
                </div>
              )}
              {pinContext.expiresAt && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-3.5 h-3.5 text-[hsl(var(--theme-text-muted))]" />
                  <span className="text-[hsl(var(--theme-text-muted))]">{formatTimeRemaining(pinContext.expiresAt)}</span>
                </div>
              )}
            </div>

            {/* Unpin button */}
            {isOwner && onUnpin ? (
              <button
                ref={firstButtonRef}
                onClick={handleUnpin}
                disabled={isSubmitting}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150',
                  'bg-red-500/10 text-red-400 border border-red-500/20',
                  'hover:bg-red-500/20 hover:border-red-500/30',
                  isSubmitting && 'opacity-60 cursor-not-allowed',
                )}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Unpinning…
                  </>
                ) : (
                  <>
                    <PinOff className="w-4 h-4" />
                    Unpin Message
                  </>
                )}
              </button>
            ) : (
              <p className="text-xs text-center text-[hsl(var(--theme-text-muted))]">
                Only the person who pinned this message can unpin it.
              </p>
            )}
          </div>
        ) : (
          /* ─── PIN FLOW: Duration selection ─── */
          <div className="px-5 py-4 space-y-2">
            {PIN_DURATION_OPTIONS.map((opt, idx) => {
              const isActive = selected === opt.minutes;
              return (
                <button
                  key={opt.minutes}
                  ref={idx === 0 ? firstButtonRef : undefined}
                  onClick={() => setSelected(opt.minutes)}
                  disabled={isSubmitting}
                  className={cn(
                    'w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-150',
                    'border text-left group',
                    isActive
                      ? 'bg-[hsl(var(--theme-accent-primary)/0.1)] border-[hsl(var(--theme-accent-primary)/0.4)] shadow-[0_0_0_1px_hsl(var(--theme-accent-primary)/0.15)]'
                      : 'bg-[hsl(var(--theme-bg-surface)/0.5)] border-[hsl(var(--theme-border-subtle)/0.4)] hover:bg-[hsl(var(--theme-bg-hover)/0.8)] hover:border-[hsl(var(--theme-border-subtle)/0.7)]',
                    isSubmitting && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  {/* Duration badge */}
                  <div className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-lg text-xs font-bold tracking-wide transition-colors',
                    isActive
                      ? 'bg-[hsl(var(--theme-accent-primary)/0.18)] text-[hsl(var(--theme-accent-primary))]'
                      : 'bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-muted))] group-hover:text-[hsl(var(--theme-text-secondary))]',
                  )}>
                    {DURATION_ICONS[opt.minutes]}
                  </div>

                  {/* Label + description */}
                  <div className="flex-1 min-w-0">
                    <span className={cn(
                      'block text-sm font-medium transition-colors',
                      isActive
                        ? 'text-[hsl(var(--theme-accent-primary))]'
                        : 'text-[hsl(var(--theme-text-primary))]',
                    )}>
                      {opt.label}
                    </span>
                    <span className="block text-[11px] text-[hsl(var(--theme-text-muted))] mt-0.5">
                      {DURATION_DESCRIPTIONS[opt.minutes]}
                    </span>
                  </div>

                  {/* Selection indicator */}
                  <div className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                    isActive
                      ? 'border-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-accent-primary))]'
                      : 'border-[hsl(var(--theme-border-default))]',
                  )}>
                    {isActive && (
                      <div className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mx-5 mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Footer actions — only shown for pin flow */}
        {!isPinnedFlow && (
          <div className="flex items-center gap-2 px-5 pb-5">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className={cn(
                'flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
                'text-[hsl(var(--theme-text-secondary))] bg-[hsl(var(--theme-bg-secondary)/0.6)]',
                'hover:bg-[hsl(var(--theme-bg-hover))] border border-[hsl(var(--theme-border-subtle)/0.4)]',
                isSubmitting && 'opacity-60 cursor-not-allowed',
              )}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selected || isSubmitting}
              className={cn(
                'flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                'flex items-center justify-center gap-2',
                selected && !isSubmitting
                  ? 'bg-[hsl(var(--theme-accent-primary))] text-white hover:brightness-110 shadow-sm'
                  : 'bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-muted))] cursor-not-allowed',
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Pinning…
                </>
              ) : (
                <>
                  <Pin className="w-3.5 h-3.5" />
                  Pin Message
                </>
              )}
            </button>
          </div>
        )}

        {/* Close button footer — pinned flow */}
        {isPinnedFlow && (
          <div className="px-5 pb-5">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className={cn(
                'w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
                'text-[hsl(var(--theme-text-secondary))] bg-[hsl(var(--theme-bg-secondary)/0.6)]',
                'hover:bg-[hsl(var(--theme-bg-hover))] border border-[hsl(var(--theme-border-subtle)/0.4)]',
              )}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PinDurationModal;
export type { PinDurationModalProps };
