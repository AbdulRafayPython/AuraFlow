// components/pins/PinnedMessagesPanel.tsx — Slide-out panel for pinned messages
import React, { useState, useEffect } from 'react';
import { Pin, X, Loader2, MessageSquare, Trash2 } from 'lucide-react';
import { pinService, type PinnedMessage } from '@/services/pinService';
import { cn } from '@/lib/utils';

interface PinnedMessagesPanelProps {
  channelId: number;
  channelName?: string;
  isOpen: boolean;
  onClose: () => void;
  onUnpin?: (messageId: number) => void;
  onJumpToMessage?: (messageId: number) => void;
  canManagePins?: boolean;
}

function formatPinnedDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const PinnedMessagesPanel: React.FC<PinnedMessagesPanelProps> = ({
  channelId,
  channelName,
  isOpen,
  onClose,
  onUnpin,
  onJumpToMessage,
  canManagePins = false,
}) => {
  const [pins, setPins] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isOpen || !channelId) return;
    let cancelled = false;
    setLoading(true);

    pinService.getPinnedMessages(channelId)
      .then(data => {
        if (!cancelled) {
          setPins(data.pins);
          setCount(data.count);
        }
      })
      .catch(err => console.error('Failed to load pins:', err))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [isOpen, channelId]);

  const handleUnpin = async (messageId: number) => {
    try {
      await pinService.unpinMessage(channelId, messageId);
      setPins(prev => prev.filter(p => p.message.id !== messageId));
      setCount(prev => prev - 1);
      onUnpin?.(messageId);
    } catch (err) {
      console.error('Failed to unpin:', err);
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
            <div className="divide-y divide-[hsl(var(--theme-border-subtle)/0.5)]">
              {pins.map(pin => (
                <div
                  key={pin.pin_id}
                  className="group relative px-4 py-3 hover:bg-[hsl(var(--theme-bg-hover)/0.5)] transition-colors"
                >
                  {/* Pin meta */}
                  <div className="flex items-center gap-2 text-xs text-[hsl(var(--theme-text-muted))] mb-1.5">
                    <Pin className="w-3 h-3" />
                    <span>
                      Pinned by <span className="font-medium text-[hsl(var(--theme-text-secondary))]">{pin.pinned_by.display_name}</span>
                    </span>
                    <span className="ml-auto">{formatPinnedDate(pin.pinned_at)}</span>
                  </div>

                  {/* Message content */}
                  <div className="flex items-start gap-3">
                    <img
                      src={pin.message.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${pin.message.author}`}
                      alt=""
                      className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
                          {pin.message.display_name}
                        </span>
                        <span className="text-xs text-[hsl(var(--theme-text-muted))]">
                          {formatPinnedDate(pin.message.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-[hsl(var(--theme-text-secondary))] leading-relaxed line-clamp-4">
                        {pin.message.content}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onJumpToMessage?.(pin.message.id)}
                      className="p-1.5 rounded-md bg-[hsl(var(--theme-bg-surface))] hover:bg-[hsl(var(--theme-bg-active))] text-[hsl(var(--theme-text-muted))] border border-[hsl(var(--theme-border-subtle))] transition-colors"
                      title="Jump to message"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                    {canManagePins && (
                      <button
                        onClick={() => handleUnpin(pin.message.id)}
                        className="p-1.5 rounded-md bg-[hsl(var(--theme-bg-surface))] hover:bg-red-500/10 text-[hsl(var(--theme-text-muted))] hover:text-red-400 border border-[hsl(var(--theme-border-subtle))] transition-colors"
                        title="Unpin message"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
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
