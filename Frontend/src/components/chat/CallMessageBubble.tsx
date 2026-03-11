// components/chat/CallMessageBubble.tsx — Renders a call log entry inside a DM conversation
import React, { useMemo } from 'react';
import { Phone, Video, PhoneOff, PhoneMissed, PhoneIncoming, PhoneOutgoing } from 'lucide-react';

interface CallLogPayload {
  call_type: 'audio' | 'video';
  status: 'attended' | 'missed' | 'rejected' | 'canceled';
  duration: number;
  call_id: string;
}

interface Props {
  content: string;
  isSent: boolean;
  createdAt: string;
}

function parseCallLog(content: string): CallLogPayload | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && parsed.call_type && parsed.status) return parsed;
    return null;
  } catch {
    return null;
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `0:${seconds.toString().padStart(2, '0')}`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}:${s.toString().padStart(2, '0')}`;
  const h = Math.floor(m / 60);
  return `${h}:${(m % 60).toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const CallMessageBubble: React.FC<Props> = ({ content, isSent, createdAt }) => {
  const log = useMemo(() => parseCallLog(content), [content]);
  if (!log) return null;

  const { call_type, status, duration } = log;

  const label = useMemo(() => {
    switch (status) {
      case 'attended':
        return isSent ? 'Outgoing call' : 'Incoming call';
      case 'missed':
        return isSent ? 'No answer' : 'Missed call';
      case 'rejected':
        return isSent ? 'Call declined' : 'Declined';
      case 'canceled':
        return isSent ? 'Canceled' : 'Missed call';
      default:
        return 'Call';
    }
  }, [status, isSent]);

  const Icon = useMemo(() => {
    if (status === 'attended') return isSent ? PhoneOutgoing : PhoneIncoming;
    if (status === 'missed' || status === 'canceled') return PhoneMissed;
    if (status === 'rejected') return PhoneOff;
    return call_type === 'video' ? Video : Phone;
  }, [status, isSent, call_type]);

  const isNegative = status === 'missed' || status === 'rejected' || status === 'canceled';
  const isAttended = status === 'attended';

  // Refined colors
  const iconBg = isNegative
    ? 'bg-red-500/10'
    : isAttended
    ? 'bg-emerald-500/10'
    : 'bg-[hsl(var(--theme-bg-tertiary))]';

  const iconColor = isNegative
    ? 'text-red-500'
    : isAttended
    ? 'text-emerald-500'
    : 'text-[hsl(var(--theme-text-muted))]';

  const labelColor = isNegative
    ? 'text-red-500'
    : 'text-[hsl(var(--theme-text-primary))]';

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl w-fit max-w-[280px] bg-[hsl(var(--theme-bg-secondary)/0.5)] border border-[hsl(var(--theme-border-default)/0.4)] backdrop-blur-sm transition-all duration-200 hover:bg-[hsl(var(--theme-bg-secondary)/0.7)]">
      {/* Icon circle */}
      <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${iconBg} ${iconColor} transition-colors duration-200`}>
        {call_type === 'video' && status === 'attended' ? (
          <Video className="w-4 h-4" />
        ) : (
          <Icon className="w-4 h-4" />
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col min-w-0 gap-0.5">
        <span className={`text-[13px] font-semibold leading-tight ${labelColor}`}>
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[hsl(var(--theme-text-muted))]">
            {call_type === 'video' ? 'Video' : 'Audio'}
          </span>
          {status === 'attended' && duration > 0 && (
            <>
              <span className="text-[11px] text-[hsl(var(--theme-text-muted)/0.5)]">·</span>
              <span className="text-[11px] font-medium text-[hsl(var(--theme-text-secondary))]">
                {formatDuration(duration)}
              </span>
            </>
          )}
          <span className="text-[11px] text-[hsl(var(--theme-text-muted)/0.5)]">·</span>
          <span className="text-[11px] text-[hsl(var(--theme-text-muted))]">
            {formatTime(createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CallMessageBubble;
