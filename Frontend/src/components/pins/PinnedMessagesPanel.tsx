// components/pins/PinnedMessagesPanel.tsx — Slide-out panel for pinned messages with countdown timers
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Pin, PinOff, X, Loader2, MessageSquare, Trash2, Clock, Timer } from 'lucide-react';
import { pinService, type PinnedMessage } from '@/services/pinService';
import { socketService } from '@/services/socketService';
import { cn } from '@/lib/utils';

interface PinnedMessagesPanelProps {
  channelId: number;
  channelName?: string;
  isOpen: boolean;
  onClose: () => void;
  onUnpin?: (messageId: number) => Promise<void> | void;
  onJumpToMessage?: (messageId: number) => void;
  canManagePins?: boolean;
  /** Current user's ID — used to show unpin only for pins the user created */
  currentUserId?: number;
}

function formatPinnedDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Formats remaining seconds into a human-readable countdown string */
function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Hook that ticks every second and returns remaining seconds for a given expiry ISO string */
function useCountdown(expiresAt: string | null | undefined): number | null {
  const [remaining, setRemaining] = useState<number | null>(() => {
    if (!expiresAt) return null;
    return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!expiresAt) { setRemaining(null); return; }
    const target = new Date(expiresAt).getTime();
    const tick = () => setRemaining(Math.max(0, Math.floor((target - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

/** Small badge component showing live countdown */
const CountdownBadge: React.FC<{ expiresAt: string }> = ({ expiresAt }) => {
  const remaining = useCountdown(expiresAt);
  if (remaining == null) return null;

  const isUrgent = remaining <= 60; // last minute
  const isWarning = remaining <= 300 && !isUrgent; // last 5 min

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors',
        isUrgent && 'bg-red-500/20 text-red-400 animate-pulse',
        isWarning && 'bg-amber-500/15 text-amber-400',
        !isUrgent && !isWarning && 'bg-[hsl(var(--theme-accent-primary)/0.12)] text-[hsl(var(--theme-accent-primary))]',
      )}
    >
      <Timer className="w-3 h-3" />
      {remaining === 0 ? 'Expired' : formatCountdown(remaining)}
    </span>
  );
};

const PinnedMessagesPanel: React.FC<PinnedMessagesPanelProps> = ({
  channelId,
  channelName,
  isOpen,
  onClose,
  onUnpin,
  onJumpToMessage,
  canManagePins = false,
  currentUserId,
}) => {
  const [pins, setPins] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);

  const loadPins = useCallback(() => {
    if (!channelId) return;
    setLoading(true);
    pinService.getPinnedMessages(channelId)
      .then(data => {
        setPins(data.pins);
        setCount(data.count);
      })
      .catch(err => console.error('Failed to load pins:', err))
      .finally(() => setLoading(false));
  }, [channelId]);

  useEffect(() => {
    if (!isOpen || !channelId) return;
    loadPins();
  }, [isOpen, channelId, loadPins]);

  // Listen for real-time pin events (pin_expired, message_pinned, message_unpinned)
  useEffect(() => {
    if (!isOpen) return;

    const unsubPinEvent = socketService.onPinEvent((data) => {
      if (data.type === 'expired' && data.channel_id === channelId) {
        setPins(prev => prev.filter(p => p.message.id !== data.message_id));
        setCount(prev => Math.max(0, prev - 1));
      }
    });

    // Also listen for generic pin/unpin message_pinned / message_unpinned from channel room
    const socket = socketService.getSocket();
    const handlePinned = (data: any) => {
      if (data.channel_id === channelId) loadPins();
    };
    const handleUnpinned = (data: any) => {
      if (data.channel_id === channelId) {
        setPins(prev => prev.filter(p => p.message.id !== data.message_id));
        setCount(prev => Math.max(0, prev - 1));
      }
    };

    socket?.on('message_pinned', handlePinned);
    socket?.on('message_unpinned', handleUnpinned);

    return () => {
      unsubPinEvent();
      socket?.off('message_pinned', handlePinned);
      socket?.off('message_unpinned', handleUnpinned);
    };
  }, [isOpen, channelId, loadPins]);

  const handleUnpin = async (messageId: number) => {
    // Optimistic local removal for instant feedback
    setPins(prev => prev.filter(p => p.message.id !== messageId));
    setCount(prev => Math.max(0, prev - 1));
    if (onUnpin) {
      // Delegate API call + state sync to parent (Dashboard)
      try { await onUnpin(messageId); } catch { /* toast handled by parent */ }
    } else {
      // Standalone fallback
      try {
        await pinService.unpinMessage(channelId, messageId);
      } catch (err) {
        console.error('Failed to unpin:', err);
        loadPins(); // revert on failure
      }
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-[hsl(var(--theme-bg-elevated))] shadow-2xl border-l border-[hsl(var(--theme-border-subtle))] flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[hsl(var(--theme-border-subtle))]">
          <Pin className="w-5 h-5 text-[hsl(var(--theme-accent-primary))]" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">Pinned Messages</h3>
            <p className="text-xs text-[hsl(var(--theme-text-muted))]">
              {channelName ? `#${channelName} · ` : ''}{count} pin{count !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 text-[hsl(var(--theme-accent-primary))] animate-spin" />
            </div>
          ) : pins.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center px-8">
              <Pin className="w-10 h-10 text-[hsl(var(--theme-text-muted))] mb-3 opacity-30" />
              <p className="text-sm text-[hsl(var(--theme-text-muted))]">No pinned messages</p>
              <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-1 opacity-60">
                Pin important messages to keep them easily accessible
              </p>
            </div>
          ) : (
            <div className="p-3 space-y-2.5">
              {pins.map(pin => (
                <div
                  key={pin.pin_id}
                  className="group relative rounded-xl border border-[hsl(var(--theme-border-subtle)/0.5)] bg-[hsl(var(--theme-bg-surface)/0.4)] hover:bg-[hsl(var(--theme-bg-hover)/0.5)] transition-colors overflow-hidden"
                >
                  {/* Accent top bar */}
                  <div className="h-[2px] bg-gradient-to-r from-[hsl(var(--theme-accent-primary)/0.6)] to-transparent" />

                  <div className="px-3.5 pt-2.5 pb-3">
                    {/* Row 1: Pin meta — who pinned + date */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Pin className="w-3 h-3 text-[hsl(var(--theme-accent-primary)/0.7)] flex-shrink-0" />
                        <span className="text-[11px] text-[hsl(var(--theme-text-muted))] truncate">
                          Pinned by <span className="font-medium text-[hsl(var(--theme-text-secondary))]">{pin.pinned_by.display_name}</span>
                        </span>
                      </div>
                      <span className="text-[11px] text-[hsl(var(--theme-text-muted)/0.7)] flex-shrink-0 ml-3">
                        {formatPinnedDate(pin.pinned_at)}
                      </span>
                    </div>

                    {/* Row 2: Message content */}
                    <div className="flex items-start gap-2.5">
                      <img
                        src={pin.message.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${pin.message.author}`}
                        alt=""
                        className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[13px] font-semibold text-[hsl(var(--theme-text-primary))] truncate">
                            {pin.message.display_name}
                          </span>
                          <span className="text-[10px] text-[hsl(var(--theme-text-muted)/0.6)] flex-shrink-0">
                            {formatPinnedDate(pin.message.created_at)}
                          </span>
                        </div>
                        <p className="text-[13px] text-[hsl(var(--theme-text-secondary))] leading-relaxed line-clamp-3">
                          {pin.message.content}
                        </p>
                      </div>
                    </div>

                    {/* Row 3: Footer — countdown + actions */}
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[hsl(var(--theme-border-subtle)/0.3)]">
                      {/* Left: countdown timer */}
                      <div className="flex-shrink-0">
                        {pin.expires_at ? (
                          <CountdownBadge expiresAt={pin.expires_at} />
                        ) : (
                          <span className="text-[10px] text-[hsl(var(--theme-text-muted)/0.5)]">No expiry</span>
                        )}
                      </div>

                      {/* Right: action buttons — always visible, subtle */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onJumpToMessage?.(pin.message.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-colors"
                          title="Jump to message"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span className="hidden sm:inline">Jump</span>
                        </button>
                        {(canManagePins || (currentUserId && pin.pinned_by?.user_id === currentUserId)) && (
                          <button
                            onClick={() => handleUnpin(pin.message.id)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Unpin message"
                          >
                            <PinOff className="w-3 h-3" />
                            <span className="hidden sm:inline">Unpin</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PinnedMessagesPanel;
