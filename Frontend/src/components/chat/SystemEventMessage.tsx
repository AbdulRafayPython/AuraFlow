import { ArrowLeft, ArrowRight, Shield, UserX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Someone joined / was added / left…" as a line in the chat, like Discord's
 * join message: an arrow in the avatar column, a warm sentence with the name
 * in bold, the time, and for newcomers a "Wave to say hi" button.
 *
 * The backend posts plain sentences:
 *   "username joined the community" · "username was added to the community"
 *   "username left the community" · "username was removed from the community"
 *   "username was banned from the community"
 */

export type SystemEventKind = "joined" | "added" | "left" | "removed" | "banned" | "other";

export function parseSystemEvent(content: string): { kind: SystemEventKind; name: string } {
  const text = (content || "").trim();
  const m = /^(.+?)\s+(joined|was added to|left|was removed from|was banned from)\b/i.exec(text);
  if (!m) return { kind: "other", name: "" };
  const verb = m[2].toLowerCase();
  const kind: SystemEventKind = verb === "joined" ? "joined"
    : verb.startsWith("was added") ? "added"
    : verb === "left" ? "left"
    : verb.startsWith("was removed") ? "removed"
    : "banned";
  return { kind, name: m[1] };
}

// A few friendly lines, picked by name so the same person always gets the same one.
const WELCOMES: Array<(n: React.ReactNode) => React.ReactNode> = [
  (n) => <>Welcome, {n}. We hope you brought snacks.</>,
  (n) => <>{n} just joined. Say hi!</>,
  (n) => <>Everyone welcome {n}!</>,
  (n) => <>{n} hopped into the community.</>,
  (n) => <>Glad you're here, {n}.</>,
];

export function welcomeIndex(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % WELCOMES.length;
}

const LOOK: Record<SystemEventKind, { icon: typeof ArrowRight; color: string }> = {
  joined: { icon: ArrowRight, color: "text-success" },
  added: { icon: ArrowRight, color: "text-success" },
  left: { icon: ArrowLeft, color: "text-muted-foreground" },
  removed: { icon: UserX, color: "text-warning" },
  banned: { icon: Shield, color: "text-destructive" },
  other: { icon: ArrowRight, color: "text-muted-foreground" },
};

interface SystemEventMessageProps {
  content: string;
  timestamp?: string;
  /** Newcomers only: put a wave for them in the composer. */
  onWave?: (name: string) => void;
}

export default function SystemEventMessage({ content, timestamp, onWave }: SystemEventMessageProps) {
  const { kind, name } = parseSystemEvent(content);
  const look = LOOK[kind];
  const who = <strong className="font-semibold text-foreground">{name}</strong>;
  const sentence =
    kind === "joined" ? WELCOMES[welcomeIndex(name)](who)
    : kind === "added" ? <>{who} was added to the community. Say hi!</>
    : kind === "left" ? <>{who} left the community.</>
    : kind === "removed" ? <>{who} was removed from the community.</>
    : kind === "banned" ? <>{who} was banned from the community.</>
    : content;
  const newcomer = kind === "joined" || kind === "added";

  return (
    <div className="group flex gap-4 px-4 py-1 transition-colors duration-100 hover:bg-[hsl(var(--theme-bg-hover)/0.5)]" data-testid="system-event">
      <div className="flex w-10 shrink-0 justify-center pt-0.5">
        <look.icon className={cn("h-5 w-5", look.color)} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base leading-6 text-[hsl(var(--theme-text-secondary))]">
          {sentence}
          {timestamp && <time className="ml-2 text-xs text-muted-foreground">{timestamp}</time>}
        </p>
        {newcomer && onWave && name && (
          <button
            type="button"
            onClick={() => onWave(name)}
            className="mt-1.5 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-[hsl(var(--theme-bg-secondary))] px-3 text-sm font-medium text-foreground transition-colors duration-100 hover:border-[hsl(var(--theme-border-hover))] hover:bg-[hsl(var(--theme-bg-tertiary))]"
          >
            <span className="af-wave text-lg leading-none" aria-hidden>👋</span>
            Wave to say hi!
          </button>
        )}
      </div>
    </div>
  );
}
