// Frontend/src/components/ai-agents/AgentMessageShell.tsx
//
// Inline channel/DM "agent posted something" shell. Renders the avatar +
// name row + bordered card that every inline agent surface in Dashboard.tsx
// and DirectMessageView.tsx now shares.
//
// Replaces five duplicated render sites that each hard-coded the older
// purple-to-blue gradient avatar and glow shadow. This is the calm-ops
// equivalent: matte avatar, accent-tinted icon, accent border-left, no glow,
// no gradient, 140ms transitions. Identity comes from icon + accent, not
// from a colorful avatar fill.
//
// Per-agent accent resolution lives in AgentAccent.ts (single source of
// truth for the 11-agent → 6-domain mapping); this component just calls
// `accentFor` and applies it where identity is expected.
//
// Variants:
//   - default  : populated card; `children` is the agent's content.
//   - skeleton : pre-result placeholder; renders a single subtle pulse
//                line plus a "Generating…" status row. No staggered shimmer.

import { ReactNode } from 'react';
import {
  FileText,
  BookOpen,
  Sparkles,
  Languages,
  Heart,
  Target,
  Shield,
  Users,
  MessageSquare,
  Bot,
} from 'lucide-react';
import { accentFor, agentLabel, domainFor, type AgentName } from './AgentAccent';

export type AgentMessageVariant = 'default' | 'skeleton';

export interface AgentMessageShellProps {
  /** Agent name slug — drives accent + icon + default label. */
  agentName: string;
  /** Optional override; defaults to agentLabel(agentName). */
  displayName?: string;
  /** Optional override icon. Defaults to the agent-specific lucide icon. */
  icon?: ReactNode;
  /** "SCHEDULED" chip instead of "BOT". */
  isScheduled?: boolean;
  /** Show the emerald "Only visible to you" chip. */
  isPrivate?: boolean;
  /** Optional formatted timestamp string (caller controls formatting). */
  timestamp?: string;
  /** Status line shown under the card while in skeleton variant. */
  skeletonLabel?: string;
  variant?: AgentMessageVariant;
  /** Card body. Ignored when variant === 'skeleton'. */
  children?: ReactNode;
  /** Optional dismiss action — renders a "Dismiss" link under the card. */
  onDismiss?: () => void;
}

const DEFAULT_ICON: Record<string, ReactNode> = {
  summarizer:           <FileText className="h-4 w-4 sm:h-5 sm:w-5" />,
  knowledge_builder:    <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />,
  knowledge_builder_v2: <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />,
  assistant:            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />,
  translator:           <Languages className="h-4 w-4 sm:h-5 sm:w-5" />,
  mood_tracker:         <Heart className="h-4 w-4 sm:h-5 sm:w-5" />,
  wellness:             <Heart className="h-4 w-4 sm:h-5 sm:w-5" />,
  focus:                <Target className="h-4 w-4 sm:h-5 sm:w-5" />,
  moderation:           <Shield className="h-4 w-4 sm:h-5 sm:w-5" />,
  engagement:           <Users className="h-4 w-4 sm:h-5 sm:w-5" />,
  support:              <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />,
  auto_message:         <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />,
};

function iconFor(agentName: string): ReactNode {
  return DEFAULT_ICON[agentName] ?? <Bot className="h-4 w-4 sm:h-5 sm:w-5" />;
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
}: AgentMessageShellProps) {
  const accent = accentFor(agentName);
  const domain = domainFor(agentName);
  const label = displayName ?? agentLabel(agentName as AgentName);
  const statusPillLabel = isScheduled ? 'SCHEDULED' : 'BOT';
  const renderedIcon = icon ?? iconFor(agentName);

  return (
    <div className="cv-auto group relative flex py-2 pr-4 sm:pr-12 pl-14 sm:pl-[72px] mt-[17px] hover:bg-[hsl(var(--theme-bg-hover)/0.3)] transition-colors [transition-duration:140ms]">
      {/* Avatar — matte, accent-tinted icon. No gradient, no glow. */}
      <div className="absolute left-2 sm:left-4 mt-0.5">
        <div
          className={
            'flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg ' +
            'border border-[hsl(var(--theme-border-default))] ' +
            'bg-[hsl(var(--theme-bg-elevated))] ' +
            (variant === 'skeleton' ? 'animate-pulse motion-reduce:animate-none ' : '') +
            'transition-colors [transition-duration:140ms]'
          }
          style={{ color: accent }}
          aria-hidden
        >
          {renderedIcon}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-semibold text-[15px]" style={{ color: accent }}>
            {label}
          </span>
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border"
            style={{
              backgroundColor: `hsl(var(--agent-accent-${domain}) / 0.15)`,
              color: accent,
              borderColor: `hsl(var(--agent-accent-${domain}) / 0.25)`,
            }}
          >
            {statusPillLabel}
          </span>
          {isPrivate && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Only visible to you
            </span>
          )}
          {timestamp && (
            <span className="text-[11px] ml-1 text-[hsl(var(--theme-text-muted))]">
              {timestamp}
            </span>
          )}
        </div>

        {/* Card — accent border-left, matte surface */}
        <div
          className={
            'p-4 rounded-lg border bg-[hsl(var(--theme-bg-elevated))] ' +
            'border-[hsl(var(--theme-border-default))] ' +
            'transition-colors [transition-duration:140ms]'
          }
          style={{ borderLeft: `2px solid ${accent}` }}
        >
          {variant === 'skeleton' ? (
            <SkeletonBody
              accent={accent}
              label={skeletonLabel ?? 'Working'}
            />
          ) : (
            children
          )}
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="mt-2 text-[11px] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] transition-colors [transition-duration:140ms]"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Calm skeleton body — a single subtle pulse on a card-sized placeholder
 * plus a "{label}…" status row with three dots. Honors prefers-reduced-motion
 * via motion-reduce.
 *
 * The pre-redesign skeleton stacked five staggered animationDelay shimmer
 * bars, which the user described as "very bad" — judder-prone and
 * AI-themepark-looking. This is the calm replacement.
 */
function SkeletonBody({ accent, label }: { accent: string; label: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className="h-3 w-[78%] rounded animate-pulse motion-reduce:animate-none"
        style={{ backgroundColor: 'hsl(var(--theme-text-muted) / 0.12)' }}
      />
      <div
        className="h-3 w-[58%] rounded animate-pulse motion-reduce:animate-none"
        style={{ backgroundColor: 'hsl(var(--theme-text-muted) / 0.10)' }}
      />
      <div className="mt-1 flex items-center gap-2 text-[12px]" style={{ color: accent }}>
        <span>{label}</span>
        <div className="inline-flex items-center gap-0.5" aria-hidden>
          <span
            className="h-1 w-1 rounded-full animate-bounce motion-reduce:animate-none"
            style={{ backgroundColor: accent, animationDelay: '0ms', animationDuration: '1s' }}
          />
          <span
            className="h-1 w-1 rounded-full animate-bounce motion-reduce:animate-none"
            style={{ backgroundColor: accent, animationDelay: '200ms', animationDuration: '1s' }}
          />
          <span
            className="h-1 w-1 rounded-full animate-bounce motion-reduce:animate-none"
            style={{ backgroundColor: accent, animationDelay: '400ms', animationDuration: '1s' }}
          />
        </div>
      </div>
    </div>
  );
}
