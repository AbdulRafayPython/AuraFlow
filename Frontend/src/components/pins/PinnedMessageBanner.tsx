// components/pins/PinnedMessageBanner.tsx — Fixed banner below header showing the active pinned message
// Includes real-time countdown timer that updates every minute for performance
// Smooth slide-in/out animation, responsive, HCI-compliant
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Pin, X, Clock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActivePinData {
  pin_id: number;
  pinned_at: string;
  expires_at: string | null;
  pinned_by: {
    username: string;
    display_name: string;
    user_id: number;
  };
  message: {
    id: number;
    sender_id: number;
    content: string;
    message_type: string;
    created_at: string;
    author: string;
    display_name: string;
    avatar_url?: string;
  };
}

interface PinnedMessageBannerProps {
  pin: ActivePinData | null;
  currentUserId: number | null;
  onUnpin: (messageId: number) => void;
  onJumpToMessage?: (messageId: number) => void;
  className?: string;
}

/** Format remaining time as human-readable countdown (ticks every 60s) */
function formatTimeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Hook: countdown that ticks every 60 seconds (perf-optimized) */
function useBannerCountdown(expiresAt: string | null | undefined): string | null {
  const [display, setDisplay] = useState<string | null>(() => {
    if (!expiresAt) return null;
    return formatTimeRemaining(expiresAt);
  });

  useEffect(() => {
    if (!expiresAt) {
      setDisplay(null);
      return;
    }
    const update = () => setDisplay(formatTimeRemaining(expiresAt));
    update();
    // Tick every 60 seconds — no need for per-second updates
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return display;
}

const PinnedMessageBanner: React.FC<PinnedMessageBannerProps> = memo(({
  pin,
  currentUserId,
  onUnpin,
  onJumpToMessage,
  className,
}) => {
  const [visible, setVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const prevPinRef = useRef<ActivePinData | null>(null);
  const countdown = useBannerCountdown(pin?.expires_at);

  // Animate in/out
  useEffect(() => {
    if (pin) {
      setShouldRender(true);
      // Small delay to trigger CSS transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      prevPinRef.current = pin;
    } else {
      setVisible(false);
      // Wait for exit animation
      const timeout = setTimeout(() => setShouldRender(false), 200);
      return () => clearTimeout(timeout);
    }
  }, [pin]);

  // Can this user unpin? Only the pinner can
  const canUnpin = pin && currentUserId && pin.pinned_by.user_id === currentUserId;

  // Truncate message content for preview
  const preview = pin?.message.content
    ? pin.message.content.length > 120
      ? pin.message.content.slice(0, 120) + '…'
      : pin.message.content
    : 'Pinned message';

  if (!shouldRender || !pin) return null;

  return (
    <div
      className={cn(
        'relative overflow-hidden transition-all duration-200 ease-out',
        visible
          ? 'max-h-20 opacity-100 translate-y-0'
          : 'max-h-0 opacity-0 -translate-y-2',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-2',
          'bg-[hsl(var(--theme-accent-primary)/0.06)]',
          'border-b border-[hsl(var(--theme-accent-primary)/0.12)]',
          'backdrop-blur-sm',
        )}
      >
        {/* Pin icon */}
        <div className="flex-shrink-0">
          <Pin className="w-4 h-4 text-[hsl(var(--theme-accent-primary))] rotate-45" />
        </div>

        {/* Clickable content area — jump to message */}
        <button
          onClick={() => onJumpToMessage?.(pin.message.id)}
          className="flex-1 min-w-0 text-left group cursor-pointer"
        >
          {/* Author + countdown row */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[hsl(var(--theme-accent-primary))] truncate">
              {pin.message.display_name}
            </span>

            {/* Countdown timer */}
            {countdown && (
              <span className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0',
                countdown === 'Expired'
                  ? 'bg-red-500/15 text-red-400'
                  : 'bg-[hsl(var(--theme-accent-primary)/0.1)] text-[hsl(var(--theme-accent-primary)/0.8)]',
              )}>
                <Clock className="w-2.5 h-2.5" />
                {countdown}
              </span>
            )}

            <ChevronRight className="w-3 h-3 text-[hsl(var(--theme-text-muted))] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-auto" />
          </div>

          {/* Message preview */}
          <p className="text-xs text-[hsl(var(--theme-text-secondary))] truncate mt-0.5 leading-relaxed group-hover:text-[hsl(var(--theme-text-primary))] transition-colors">
            {preview}
          </p>
        </button>

        {/* Unpin button — only visible to the pinner */}
        {canUnpin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUnpin(pin.message.id);
            }}
            className={cn(
              'flex-shrink-0 p-1.5 rounded-lg transition-colors',
              'text-[hsl(var(--theme-text-muted))] hover:text-red-400',
              'hover:bg-red-500/10',
            )}
            title="Unpin message"
            aria-label="Unpin message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});

PinnedMessageBanner.displayName = 'PinnedMessageBanner';

export default PinnedMessageBanner;
