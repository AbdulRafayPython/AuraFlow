import { Shield, AlertTriangle, Flag, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModerationWarningBannerProps {
  action: 'warn' | 'flag' | 'remove_user' | 'block' | 'remove_message' | 'block_user';
  severity?: 'none' | 'low' | 'medium' | 'high' | 'critical';
  reasons?: string[];
  username?: string;
  violationCount?: number;
  maxViolations?: number;
  message?: string;
  explanation?: string;
}

export function ModerationWarningBanner({
  action,
  severity = 'low',
  reasons = [],
  username = 'User',
  violationCount = 0,
  maxViolations = 3,
  message,
  explanation,
}: ModerationWarningBannerProps) {
  if (action === 'allow') return null;

  const reasonText = reasons.length > 0 ? reasons.join(', ').replace(/_/g, ' ') : 'content violation';

  // ── STRIKE 3: User Removed ──
  if (action === 'remove_user') {
    return (
      <div className="moderation-remove-enter mx-2 sm:mx-4 my-2 rounded-lg overflow-hidden border border-red-400/40 dark:border-red-500/30">
        <div className="bg-gradient-to-r from-red-50 via-rose-50 to-red-50 dark:from-red-950/40 dark:via-rose-950/30 dark:to-red-950/40 px-4 py-3 border-l-[3px] border-l-red-500">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-red-500/20 dark:bg-red-500/30 flex items-center justify-center">
                <Shield className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              </div>
              <span className="text-xs font-semibold text-red-700 dark:text-red-300 tracking-wide uppercase">
                AuraFlow Moderation Agent
              </span>
            </div>
          </div>
          {/* Body */}
          <div className="flex items-start gap-2 ml-8">
            <UserX className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                <span className="font-semibold">@{username}</span> has been removed from this community by the Moderation Agent for repeated violations.
              </p>
              <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-1">
                Reason: {reasonText} ({violationCount} strikes)
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── STRIKE 2: Flagged ──
  if (action === 'flag' || action === 'remove_message') {
    return (
      <div className="moderation-flag-enter mx-2 sm:mx-4 my-1.5 rounded-lg overflow-hidden border border-orange-300/40 dark:border-orange-500/25">
        <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 dark:from-orange-950/30 dark:via-amber-950/20 dark:to-orange-950/30 px-4 py-2.5 border-l-[3px] border-l-orange-500">
          {/* Header */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-orange-500/20 dark:bg-orange-500/30 flex items-center justify-center">
                <Shield className="w-3 h-3 text-orange-600 dark:text-orange-400" />
              </div>
              <span className="text-[11px] font-semibold text-orange-700 dark:text-orange-300 tracking-wide uppercase">
                AuraFlow Moderation Agent
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-400 border border-red-400/30">
                Flagged
              </span>
              <span className="text-[10px] font-semibold text-orange-600/70 dark:text-orange-400/60">
                Strike {violationCount}/{maxViolations}
              </span>
            </div>
          </div>
          {/* Body */}
          <div className="flex items-start gap-2 ml-7">
            <Flag className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
            <p className="text-[13px] text-orange-800 dark:text-orange-200 leading-snug">
              {message || (
                <>
                  <span className="font-semibold">@{username}</span>, your content has been flagged for repeated violations ({violationCount}/{maxViolations}).
                  One more violation will result in removal from this community.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── STRIKE 1: Warning ──
  if (action === 'warn') {
    return (
      <div className="moderation-warn-enter mx-2 sm:mx-4 my-1.5 rounded-lg overflow-hidden border border-amber-300/40 dark:border-amber-500/25">
        <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 dark:from-amber-950/30 dark:via-yellow-950/20 dark:to-amber-950/30 px-4 py-2.5 border-l-[3px] border-l-amber-400">
          {/* Header */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-amber-500/20 dark:bg-amber-500/30 flex items-center justify-center">
                <Shield className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 tracking-wide uppercase">
                AuraFlow Moderation Agent
              </span>
            </div>
            <span className="text-[10px] font-semibold text-amber-600/70 dark:text-amber-400/60">
              Warning {violationCount}/{maxViolations}
            </span>
          </div>
          {/* Body */}
          <div className="flex items-start gap-2 ml-7">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[13px] text-amber-800 dark:text-amber-200 leading-snug">
              {message || (
                <>
                  <span className="font-semibold">@{username}</span>, this message may violate community guidelines ({reasonText}). Please be mindful of the community rules.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── BLOCK (high-confidence, no strike count shown to others) ──
  if (action === 'block' || action === 'block_user') {
    return (
      <div className="moderation-remove-enter mx-2 sm:mx-4 my-1.5 rounded-lg overflow-hidden border border-red-400/40 dark:border-red-500/30">
        <div className="bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 px-4 py-2.5 border-l-[3px] border-l-red-500">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-red-500/20 dark:bg-red-500/30 flex items-center justify-center">
              <Shield className="w-3 h-3 text-red-600 dark:text-red-400" />
            </div>
            <span className="text-[11px] font-semibold text-red-700 dark:text-red-300 tracking-wide uppercase">
              AuraFlow Moderation Agent
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-400 border border-red-400/30">
              Blocked
            </span>
          </div>
          <p className="text-[13px] text-red-800 dark:text-red-200 leading-snug mt-1.5 ml-7">
            A message from <span className="font-semibold">@{username}</span> was blocked ({reasonText}).
          </p>
        </div>
      </div>
    );
  }

  return null;
}
