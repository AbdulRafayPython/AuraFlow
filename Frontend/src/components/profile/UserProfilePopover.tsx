// components/profile/UserProfilePopover.tsx — Rich user profile card
// Shows avatar, status, bio, mutual friends, shared communities, actions

import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, UserPlus, Clock, Users, Shield, X, Loader2 } from 'lucide-react';
import { statusService, type UserProfile } from '@/services/statusService';
import { cn, getAvatarUrl } from '@/lib/utils';

interface UserProfilePopoverProps {
  username: string;
  /** Anchor element position for smart placement */
  anchorRect?: DOMRect | null;
  onClose: () => void;
  onSendDM?: (userId: number) => void;
  onAddFriend?: (userId: number) => void;
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  online: { color: 'bg-emerald-500', label: 'Online' },
  idle: { color: 'bg-amber-500', label: 'Idle' },
  dnd: { color: 'bg-red-500', label: 'Do Not Disturb' },
  offline: { color: 'bg-gray-500', label: 'Offline' },
};

function formatMemberSince(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

const UserProfilePopover: React.FC<UserProfilePopoverProps> = ({
  username,
  anchorRect,
  onClose,
  onSendDM,
  onAddFriend,
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);

  // Fetch profile on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    statusService.getUserProfile(username)
      .then(data => { if (!cancelled) setProfile(data); })
      .catch(() => { if (!cancelled) setError('Failed to load profile'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [username]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Smart positioning
  const style: React.CSSProperties = {};
  if (anchorRect) {
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const spaceRight = window.innerWidth - anchorRect.right;

    if (spaceRight > 340) {
      style.left = anchorRect.right + 8;
    } else {
      style.right = window.innerWidth - anchorRect.left + 8;
    }

    if (spaceBelow > 400) {
      style.top = anchorRect.top;
    } else {
      style.bottom = window.innerHeight - anchorRect.bottom;
    }
  } else {
    style.top = '50%';
    style.left = '50%';
    style.transform = 'translate(-50%, -50%)';
  }

  const status = STATUS_CONFIG[profile?.status || 'offline'];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[70]" onClick={onClose} />

      {/* Card */}
      <div
        ref={cardRef}
        style={style}
        className="fixed z-[71] w-80 bg-[hsl(var(--theme-bg-elevated))] rounded-xl shadow-2xl border border-[hsl(var(--theme-border-subtle))] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 text-[hsl(var(--theme-accent-primary))] animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-48 text-sm text-[hsl(var(--theme-text-muted))]">
            <p>{error}</p>
          </div>
        ) : profile ? (
          <>
            {/* Banner / Gradient Header */}
            <div className="relative h-20 bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))]">
              <button
                onClick={onClose}
                className="absolute top-2 right-2 p-1 rounded-full bg-black/20 hover:bg-black/40 text-white/80 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Avatar (overlapping banner) */}
            <div className="relative px-4 -mt-10">
              <div className="relative w-20 h-20 rounded-full border-4 border-[hsl(var(--theme-bg-elevated))]">
                <img
                  src={getAvatarUrl(profile.avatar_url, profile.username)}
                  alt={profile.display_name}
                  className="w-full h-full rounded-full object-cover"
                />
                {/* Status dot */}
                <div className={cn(
                  'absolute bottom-0 right-0 w-5 h-5 rounded-full border-[3px] border-[hsl(var(--theme-bg-elevated))]',
                  status.color
                )} />
              </div>
            </div>

            {/* User Info */}
            <div className="px-4 pt-2 pb-3">
              <h3 className="text-lg font-bold text-[hsl(var(--theme-text-primary))] leading-tight">
                {profile.display_name || profile.username}
              </h3>
              <p className="text-sm text-[hsl(var(--theme-text-muted))]">
                @{profile.username}
              </p>

              {/* Custom Status */}
              {profile.custom_status && (
                <div className="flex items-center gap-1.5 mt-1.5 text-sm text-[hsl(var(--theme-text-secondary))]">
                  {profile.custom_status_emoji && (
                    <span className="text-base">{profile.custom_status_emoji}</span>
                  )}
                  <span className="truncate">{profile.custom_status}</span>
                </div>
              )}

              {/* Presence */}
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className={cn('w-2 h-2 rounded-full', status.color)} />
                <span className="text-xs text-[hsl(var(--theme-text-muted))]">{status.label}</span>
              </div>
            </div>

            {/* Divider */}
            <div className="mx-4 border-t border-[hsl(var(--theme-border-subtle))]" />

            {/* Bio */}
            {profile.bio && (
              <div className="px-4 py-3">
                <h4 className="text-xs font-semibold text-[hsl(var(--theme-text-muted))] uppercase tracking-wider mb-1">About Me</h4>
                <p className="text-sm text-[hsl(var(--theme-text-secondary))] leading-relaxed line-clamp-3">
                  {profile.bio}
                </p>
              </div>
            )}

            {/* Meta Info */}
            <div className="px-4 py-2 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-[hsl(var(--theme-text-muted))]">
                <Clock className="w-3.5 h-3.5" />
                <span>Member since {formatMemberSince(profile.member_since)}</span>
              </div>
              {profile.mutual_friends_count > 0 && (
                <div className="flex items-center gap-2 text-xs text-[hsl(var(--theme-text-muted))]">
                  <Users className="w-3.5 h-3.5" />
                  <span>{profile.mutual_friends_count} mutual friend{profile.mutual_friends_count !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>

            {/* Shared Communities */}
            {profile.shared_communities.length > 0 && (
              <div className="px-4 py-2">
                <h4 className="text-xs font-semibold text-[hsl(var(--theme-text-muted))] uppercase tracking-wider mb-1.5">
                  Shared Communities
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {profile.shared_communities.map(c => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-[hsl(var(--theme-bg-surface))] text-[hsl(var(--theme-text-secondary))] rounded-full"
                    >
                      {c.logo_url ? (
                        <img src={c.logo_url} alt="" className="w-3.5 h-3.5 rounded-full" />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: c.color }}>
                          {c.icon}
                        </span>
                      )}
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {!profile.is_self && (
              <div className="px-4 py-3 flex items-center gap-2">
                <button
                  onClick={() => onSendDM?.(profile.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[hsl(var(--theme-accent-primary))] hover:bg-[hsl(var(--theme-accent-primary)/0.85)] text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  Message
                </button>
                {profile.friendship_status === 'none' && (
                  <button
                    onClick={() => onAddFriend?.(profile.id)}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-[hsl(var(--theme-bg-surface))] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))] text-sm font-medium rounded-lg border border-[hsl(var(--theme-border-subtle))] transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                )}
                {profile.friendship_status === 'pending_sent' && (
                  <span className="px-3 py-2 text-xs text-[hsl(var(--theme-text-muted))] bg-[hsl(var(--theme-bg-surface))] rounded-lg border border-[hsl(var(--theme-border-subtle))]">
                    Request Sent
                  </span>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </>
  );
};

export default UserProfilePopover;
