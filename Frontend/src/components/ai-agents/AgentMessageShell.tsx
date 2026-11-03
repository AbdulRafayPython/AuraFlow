// Frontend/src/components/ai-agents/AgentMessageShell.tsx
//
// Inline channel/DM "an agent posted something" row. It is a normal
// MessageRow (flat, same avatar size, same name/time header) with a small APP
// badge. Identity comes from the agent's icon tint only: no coloured border,
// no tinted card, no glow.
//
// Per-agent accent resolution lives in AgentAccent.ts.
//
// Variants:
//   - default  : `children` is the agent's content.
//   - skeleton : "<Agent> is working…" line with three dots while a result is
//                generated. Dots pulse (skeleton exception), and stop for
//                prefers-reduced-motion.

import { ReactNode } from 'react';
import {
  FileText,
  BookOpen,
  Bot,
  Languages,
  Heart,
  Target,
  Shield,
  Users,
  MessageSquare,
  Eye,
} from 'lucide-react';
import { MessageRow } from '@/components/chat/MessageRow';
import AgentLogo from './AgentLogo';
import { accentFor, agentLabel, type AgentName } from './AgentAccent';

export type AgentMessageVariant = 'default' | 'skeleton';

export interface AgentMessageShellProps {
  /** Agent name slug: drives icon tint, icon and default label. */
  agentName: string;
  /** Optional override; defaults to agentLabel(agentName). */
  displayName?: string;
  /** Optional override icon. Defaults to the agent-specific lucide icon. */
  icon?: ReactNode;
  /** "Scheduled" badge instead of "APP". */
  isScheduled?: boolean;
  /** Show the "Only visible to you" note. */
  isPrivate?: boolean;
  /** Optional formatted timestamp string (caller controls formatting). */
  timestamp?: string;
  /** Status text while in skeleton variant. */
  skeletonLabel?: string;
  variant?: AgentMessageVariant;
  /** Message body. Ignored when variant === 'skeleton'. */
  children?: ReactNode;
  /** Optional dismiss action: renders a "Dismiss" link under the body. */
  onDismiss?: () => void;
  /** Open the agent's detail pane (name and avatar become clickable). */
  onOpenAgent?: () => void;
  /** Continues the same agent's previous message: no avatar or header. */
  grouped?: boolean;
  /** Short time shown in the gutter of a grouped row on hover. */
  shortTimeLabel?: string;
}

const ICONS: Record<string, typeof Bot> = {
  summarizer: FileText,
  knowledge_builder: BookOpen,
  knowledge_builder_v2: BookOpen,
  assistant: Bot,
  translator: Languages,
  mood_tracker: Heart,
  wellness: Heart,
  focus: Target,
  moderation: Shield,
  engagement: Users,
  support: MessageSquare,
  auto_message: MessageSquare,
};

/** Neutral chip that marks a message as coming from an app / agent. */
export function AppBadge({ label = 'APP' }: { label?: string }) {
  return (
    <span className="rounded border border-border bg-[hsl(var(--theme-bg-tertiary))] px-1.5 text-xs font-medium leading-4 text-muted-foreground">
      {label}
    </span>
  );
}

/** Agent avatar: its app logo (a custom `icon` still wins, e.g. for special shells). */
export function AgentAvatar({ agentName, name, username, builtin, icon, size = 'md' }: { agentName?: string; name?: string; username?: string; builtin?: boolean; icon?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  if (icon) {
    return (
      <div aria-hidden className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-[hsl(var(--theme-bg-tertiary))]" style={{ color: accentFor(agentName ?? '') }}>
        {icon}
      </div>
    );
  }
  return <AgentLogo slug={agentName} name={name} username={username} builtin={builtin} size={size === 'sm' ? 'xs' : size} />;
}

/** Neutral bordered frame for structured agent output (polls, icebreakers, recaps). */
export function AgentCardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1 max-w-xl rounded-lg border border-border bg-[hsl(var(--theme-bg-secondary))] p-3">
      {children}
    </div>
  );
}

/** "<Agent> is working…" with three dots. Used while a run is in flight. */
export function WorkingLine({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground" role="status">
      {label}
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {[0, 200, 400].map((delay) => (
          <span
            key={delay}
            className="h-1 w-1 rounded-full bg-current animate-skeleton motion-reduce:animate-none"
            style={{ animationDelay: `${delay}ms`, animationDuration: '1.2s' }}
          />
        ))}
      </span>
    </span>
  );
}

export default function AgentMessageShell({
  agentName,
  displayName,
  icon,
  isScheduled = false,
  isPrivate = false,
  timestamp,
  skeletonLabel,
  variant = 'default',
  children,
  onDismiss,
  onOpenAgent,
  grouped = false,
  shortTimeLabel,
}: AgentMessageShellProps) {
  const label = displayName ?? agentLabel(agentName as AgentName);

  return (
    <MessageRow
      className="cv-auto"
      authorName={label}
      timeLabel={timestamp ?? ''}
      grouped={grouped}
      shortTimeLabel={shortTimeLabel}
      onAuthorClick={onOpenAgent ? () => onOpenAgent() : undefined}
      avatar={
        onOpenAgent ? (
          <button type="button" onClick={onOpenAgent} aria-label={`About ${label}`} className="block rounded-lg">
            <AgentAvatar agentName={agentName} name={label} icon={icon} />
          </button>
        ) : (
          <AgentAvatar agentName={agentName} name={label} icon={icon} />
        )
      }
      badge={<AppBadge label={isScheduled ? 'Scheduled' : 'APP'} />}
      headerExtra={
        isPrivate ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Eye width={12} height={12} strokeWidth={1.75} aria-hidden /> Only visible to you
          </span>
        ) : undefined
      }
    >
      {variant === 'skeleton' ? (
        <div className="py-0.5">
          <WorkingLine label={`${skeletonLabel ?? 'Working'}…`} />
        </div>
      ) : (
        children
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 block text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Dismiss
        </button>
      )}
    </MessageRow>
  );
}
