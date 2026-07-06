import { UserPlus, UserMinus, UserX, Shield } from "lucide-react";

/**
 * Parses the system message content to determine the event type and display label.
 * Backend posts messages in the format:
 *   "username joined the community"
 *   "username was added to the community"
 *   "username left the community"
 *   "username was removed from the community"
 *   "username was banned from the community"
 */
function parseSystemEvent(content: string): {
  icon: React.ReactNode;
  label: string;
  colorClass: string;
  dotClass: string;
} {
  const lower = content.toLowerCase();

  if (lower.includes("banned")) {
    return {
      icon: <Shield size={13} />,
      label: content,
      colorClass: "text-red-400",
      dotClass: "bg-red-500",
    };
  }
  if (lower.includes("removed")) {
    return {
      icon: <UserX size={13} />,
      label: content,
      colorClass: "text-orange-400",
      dotClass: "bg-orange-500",
    };
  }
  if (lower.includes("left")) {
    return {
      icon: <UserMinus size={13} />,
      label: content,
      colorClass: "text-[hsl(var(--theme-text-muted))]",
      dotClass: "bg-[hsl(var(--theme-text-muted))]",
    };
  }
  // joined / added
  return {
    icon: <UserPlus size={13} />,
    label: content,
    colorClass: "text-emerald-400",
    dotClass: "bg-emerald-500",
  };
}

interface SystemEventMessageProps {
  content: string;
  timestamp?: string;
}

/**
 * Renders a Discord-style system event label inline in the chat feed.
 * Displays as a centered pill with flanking horizontal rules.
 */
export default function SystemEventMessage({ content, timestamp }: SystemEventMessageProps) {
  const { icon, label, colorClass, dotClass } = parseSystemEvent(content);

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-1 my-1 select-none">
      {/* Left rule */}
      <div className="flex-1 h-px bg-[hsl(var(--theme-border-default)/0.4)]" />

      {/* Pill */}
      <div
        className={`flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11.5px] font-medium leading-5 ${colorClass} bg-[hsl(var(--theme-bg-secondary)/0.6)] border border-[hsl(var(--theme-border-default)/0.4)]`}
        title={timestamp}
      >
        {/* Colored dot */}
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
        {/* Icon */}
        <span className="flex-shrink-0 opacity-80">{icon}</span>
        {/* Label */}
        <span>{label}</span>
      </div>

      {/* Right rule */}
      <div className="flex-1 h-px bg-[hsl(var(--theme-border-default)/0.4)]" />
    </div>
  );
}
