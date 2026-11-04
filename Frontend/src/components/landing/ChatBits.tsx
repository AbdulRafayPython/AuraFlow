// Small, static pieces of the AuraFlow chat UI for the landing page: a
// message row, an agent (APP) message, a poll, a summary card, a translation
// row and a typing line. They look like the real app (dark theme) without
// pulling in its contexts. Each agent is one of the helper characters.
import { cn } from "@/lib/utils";

export const AGENTS = {
  faq: { name: "Campus FAQ", img: "/landing/faq-sm.webp" },
  quiz: { name: "Quiz Master", img: "/landing/quiz-sm.webp" },
  countdown: { name: "Exam Countdown", img: "/landing/countdown-sm.webp" },
  wellbeing: { name: "Wellbeing Buddy", img: "/landing/wellbeing-sm.webp" },
  safety: { name: "Safe Space", img: "/landing/safety-sm.webp" },
  aura: { name: "Catch me up", img: "/landing/orbi-sm.webp" },
} as const;
export type AgentKey = keyof typeof AGENTS;

const PEOPLE: Record<string, string> = {
  Hamza: "#C9785A",
  Ayesha: "#8FA98A",
  Bilal: "#D8B45A",
  Sana: "#D98C80",
  Zain: "#A39382",
  You: "#B9A48A",
};

export function Avatar({ name }: { name: string }) {
  return (
    <span className="lpc-avatar" style={{ backgroundColor: PEOPLE[name] ?? "#A39382" }} aria-hidden>
      {name.slice(0, 1)}
    </span>
  );
}

export function Msg({ name, time = "10:42", children, className }: { name: string; time?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("lpc-row", className)}>
      <Avatar name={name} />
      <div className="lpc-body">
        <p className="lpc-head"><b>{name}</b><time>{time}</time></p>
        <div className="lpc-text">{children}</div>
      </div>
    </div>
  );
}

export function AgentMsg({ agent, time = "10:43", children, className }: { agent: AgentKey; time?: string; children: React.ReactNode; className?: string }) {
  const a = AGENTS[agent];
  return (
    <div className={cn("lpc-row", className)}>
      <img className="lpc-agent" src={a.img} alt="" width={36} height={36} loading="lazy" />
      <div className="lpc-body">
        <p className="lpc-head"><b>{a.name}</b><span className="lpc-app">APP</span><time>{time}</time></p>
        <div className="lpc-text">{children}</div>
      </div>
    </div>
  );
}

export function Typing({ who }: { who: string }) {
  return (
    <p className="lpc-typing" aria-hidden>
      <span className="lpc-dots"><i /><i /><i /></span> <b>{who}</b> is typing…
    </p>
  );
}

export function Mention({ children }: { children: React.ReactNode }) {
  return <span className="lpc-mention">{children}</span>;
}

export function Reaction({ emoji, count }: { emoji: string; count: number }) {
  return <span className="lpc-reaction">{emoji} {count}</span>;
}

export function Poll({ question, options, votes, voted }: { question: string; options: string[]; votes: number[]; voted?: number }) {
  const total = Math.max(1, votes.reduce((a, b) => a + b, 0));
  return (
    <div className="lpc-card lpc-poll">
      <p className="lpc-card-title">{question}</p>
      {options.map((o, i) => {
        const pct = Math.round((votes[i] / total) * 100);
        return (
          <div key={o} className={cn("lpc-opt", voted === i && "is-voted")}>
            <span className="lpc-opt-bar" style={{ transform: `scaleX(${pct / 100})` }} />
            <span className="lpc-opt-label">{o}</span>
            <span className="lpc-opt-pct">{pct}%</span>
          </div>
        );
      })}
      <p className="lpc-card-meta">{votes.reduce((a, b) => a + b, 0)} votes</p>
    </div>
  );
}

export function SummaryCard({ lines, count }: { lines: string[]; count: number }) {
  return (
    <div className="lpc-card lpc-summary">
      <p className="lpc-card-meta">Summary of {count} messages · only you can see this</p>
      <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}

export function Translation({ original, english }: { original: string; english: string }) {
  return (
    <>
      <span dir="rtl" lang="ur" className="lpc-urdu">{original}</span>
      <span className="lpc-translation"><span className="lpc-tag">Translated from Urdu</span>{english}</span>
    </>
  );
}
