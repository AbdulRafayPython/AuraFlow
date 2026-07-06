// Frontend/src/components/ai-agents/VisibilityChip.tsx
//
// The four-state visibility primitive defined in
// docs/AUTONOMOUS_AGENT_FRONTEND_REDESIGN.md §13.3.
//
// Every autonomous-agent surface that announces an action must show one
// of these chips. The chip is intentionally small and uncolored — it
// communicates scope, not priority. Priority is carried by the agent
// accent on the row's icon, not by the visibility chip.

import { Eye, EyeOff, Shield, MessageSquare } from 'lucide-react';

export type AgentVisibility =
  | 'public-in-channel'
  | 'you-only'
  | 'admins-only'
  | 'private-dm';

interface VisibilityChipProps {
  visibility: AgentVisibility;
  /** Compact mode renders icon-only with a tooltip. Use in dense rows. */
  compact?: boolean;
  className?: string;
}

const COPY: Record<AgentVisibility, { label: string; help: string; Icon: typeof Eye }> = {
  'public-in-channel': {
    label: 'Public in channel',
    help:  'Everyone in this channel can see this',
    Icon:  Eye,
  },
  'you-only': {
    label: 'Visible to you',
    help:  'Only you can see this',
    Icon:  EyeOff,
  },
  'admins-only': {
    label: 'Admins only',
    help:  'Only community admins can see this',
    Icon:  Shield,
  },
  'private-dm': {
    label: 'Private message',
    help:  'Sent to you in a direct message',
    Icon:  MessageSquare,
  },
};

export default function VisibilityChip({
  visibility,
  compact = false,
  className = '',
}: VisibilityChipProps) {
  const { label, help, Icon } = COPY[visibility];

  if (compact) {
    return (
      <span
        title={help}
        aria-label={help}
        className={`inline-flex h-4 w-4 items-center justify-center text-[hsl(var(--theme-text-muted))] ${className}`}
      >
        <Icon className="h-3 w-3" aria-hidden />
      </span>
    );
  }

  return (
    <span
      title={help}
      className={
        'inline-flex items-center gap-1 rounded border border-[hsl(var(--theme-border-default))] ' +
        'bg-[hsl(var(--theme-bg-secondary))] px-1.5 py-0.5 text-[10px] font-medium ' +
        'text-[hsl(var(--theme-text-muted))] ' +
        className
      }
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
