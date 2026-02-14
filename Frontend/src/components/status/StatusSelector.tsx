// components/status/StatusSelector.tsx — Presence & custom status picker
// Dropdown to set Online/Idle/DND/Invisible + custom status text + emoji

import React, { useState, useRef, useEffect } from 'react';
import { Circle, Moon, MinusCircle, EyeOff, Smile, X, Check } from 'lucide-react';
import { statusService, type PresenceStatus } from '@/services/statusService';
import { socket } from '@/socket';
import { cn } from '@/lib/utils';

interface StatusSelectorProps {
  currentStatus: PresenceStatus;
  currentCustomStatus?: string | null;
  currentCustomEmoji?: string | null;
  onStatusChange?: (status: PresenceStatus) => void;
  onCustomStatusChange?: (text: string | null, emoji: string | null) => void;
}

const STATUS_OPTIONS: { value: PresenceStatus; label: string; icon: React.ReactNode; color: string; description: string }[] = [
  { value: 'online', label: 'Online', icon: <Circle className="w-3.5 h-3.5 fill-emerald-500 text-emerald-500" />, color: 'text-emerald-500', description: 'You are available' },
  { value: 'idle', label: 'Idle', icon: <Moon className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />, color: 'text-amber-500', description: 'You appear away' },
  { value: 'dnd', label: 'Do Not Disturb', icon: <MinusCircle className="w-3.5 h-3.5 fill-red-500 text-red-500" />, color: 'text-red-500', description: 'Mute notifications' },
  { value: 'offline', label: 'Invisible', icon: <EyeOff className="w-3.5 h-3.5 text-gray-400" />, color: 'text-gray-400', description: 'Appear offline' },
];

const QUICK_EMOJIS = ['😊', '🎯', '💻', '🎮', '📚', '🎵', '☕', '🔥', '✨', '💤', '🏠', '🚀'];

const StatusSelector: React.FC<StatusSelectorProps> = ({
  currentStatus,
  currentCustomStatus,
  currentCustomEmoji,
  onStatusChange,
  onCustomStatusChange,
}) => {
  const [open, setOpen] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState(currentCustomStatus || '');
  const [customEmoji, setCustomEmoji] = useState(currentCustomEmoji || '');
  const [saving, setSaving] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustomInput(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (showCustomInput) {
      inputRef.current?.focus();
    }
  }, [showCustomInput]);

  const handleStatusSelect = async (status: PresenceStatus) => {
    try {
      await statusService.updateMyStatus({ status });
      onStatusChange?.(status);
      setOpen(false);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleSaveCustomStatus = async () => {
    setSaving(true);
    try {
      const text = customText.trim() || null;
      const emoji = customEmoji || null;
      await statusService.updateMyStatus({
        custom_status: text || '',
        custom_status_emoji: emoji || '',
      });

      // Broadcast via socket
      socket.emit('update_custom_status', {
        custom_status: text,
        custom_status_emoji: emoji,
      });

      onCustomStatusChange?.(text, emoji);
      setShowCustomInput(false);
      setOpen(false);
    } catch (err) {
      console.error('Failed to update custom status:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleClearCustomStatus = async () => {
    setCustomText('');
    setCustomEmoji('');
    try {
      await statusService.updateMyStatus({
        custom_status: '',
        custom_status_emoji: '',
      });
      socket.emit('update_custom_status', {
        custom_status: null,
        custom_status_emoji: null,
      });
      onCustomStatusChange?.(null, null);
    } catch (err) {
      console.error('Failed to clear custom status:', err);
    }
  };

  const currentOpt = STATUS_OPTIONS.find(o => o.value === currentStatus) || STATUS_OPTIONS[0];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[hsl(var(--theme-bg-hover))] transition-colors text-left w-full"
      >
        {currentOpt.icon}
        <div className="flex-1 min-w-0">
          <span className="text-sm text-[hsl(var(--theme-text-primary))] font-medium">
            {currentOpt.label}
          </span>
          {currentCustomStatus && (
            <p className="text-xs text-[hsl(var(--theme-text-muted))] truncate">
              {currentCustomEmoji} {currentCustomStatus}
            </p>
          )}
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-[hsl(var(--theme-bg-elevated))] rounded-xl shadow-2xl border border-[hsl(var(--theme-border-subtle))] overflow-hidden z-50 animate-in slide-in-from-bottom-2 fade-in duration-150">
          {/* Custom Status Section */}
          {!showCustomInput ? (
            <button
              onClick={() => setShowCustomInput(true)}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-colors border-b border-[hsl(var(--theme-border-subtle))]"
            >
              <Smile className="w-4 h-4" />
              <span>{currentCustomStatus ? 'Edit' : 'Set'} Custom Status</span>
              {currentCustomStatus && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleClearCustomStatus(); }}
                  className="ml-auto p-1 rounded hover:bg-[hsl(var(--theme-bg-active))] text-[hsl(var(--theme-text-muted))]"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </button>
          ) : (
            <div className="px-4 py-3 border-b border-[hsl(var(--theme-border-subtle))]">
              <h4 className="text-xs font-semibold text-[hsl(var(--theme-text-muted))] uppercase tracking-wider mb-2">
                Custom Status
              </h4>
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => {
                    const idx = QUICK_EMOJIS.indexOf(customEmoji);
                    setCustomEmoji(QUICK_EMOJIS[(idx + 1) % QUICK_EMOJIS.length]);
                  }}
                  className="w-9 h-9 flex items-center justify-center text-lg bg-[hsl(var(--theme-bg-surface))] rounded-lg border border-[hsl(var(--theme-border-subtle))] hover:bg-[hsl(var(--theme-bg-hover))] transition-colors"
                >
                  {customEmoji || '😊'}
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value.slice(0, 128))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCustomStatus(); }}
                  placeholder="What's happening?"
                  maxLength={128}
                  className="flex-1 px-3 py-1.5 text-sm bg-[hsl(var(--theme-bg-surface))] text-[hsl(var(--theme-text-primary))] rounded-lg border border-[hsl(var(--theme-border-subtle))] outline-none focus:border-[hsl(var(--theme-accent-primary))] placeholder:text-[hsl(var(--theme-text-muted))]"
                />
              </div>
              {/* Quick emoji picks */}
              <div className="flex flex-wrap gap-1 mb-2">
                {QUICK_EMOJIS.map(e => (
                  <button
                    key={e}
                    onClick={() => setCustomEmoji(e)}
                    className={cn(
                      'w-7 h-7 text-sm rounded-md flex items-center justify-center transition-colors',
                      customEmoji === e
                        ? 'bg-[hsl(var(--theme-accent-primary)/0.2)] ring-1 ring-[hsl(var(--theme-accent-primary))]'
                        : 'hover:bg-[hsl(var(--theme-bg-hover))]'
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveCustomStatus}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[hsl(var(--theme-accent-primary))] hover:bg-[hsl(var(--theme-accent-primary)/0.85)] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save
                </button>
                <button
                  onClick={() => setShowCustomInput(false)}
                  className="px-3 py-1.5 text-sm text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover))] rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Presence Options */}
          <div className="py-1">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleStatusSelect(opt.value)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  currentStatus === opt.value
                    ? 'bg-[hsl(var(--theme-bg-active))]'
                    : 'hover:bg-[hsl(var(--theme-bg-hover))]'
                )}
              >
                {opt.icon}
                <div>
                  <span className="text-sm font-medium text-[hsl(var(--theme-text-primary))]">{opt.label}</span>
                  <p className="text-xs text-[hsl(var(--theme-text-muted))]">{opt.description}</p>
                </div>
                {currentStatus === opt.value && (
                  <Check className="w-4 h-4 ml-auto text-[hsl(var(--theme-accent-primary))]" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StatusSelector;
