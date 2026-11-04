// The hero's live AuraFlow window: a scripted conversation that plays when
// it is on screen. Pills above switch the story (like Slack's hero); stories
// advance on their own until someone picks one. Built in HTML so it stays
// sharp, light and accessible (the script is aria-hidden; a plain sentence
// describes it for screen readers).
import { useEffect, useState } from "react";
import { Hash, Plus, Smile, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion, useInView } from "./motion";
import { AgentMsg, Mention, Msg, Poll, Reaction, SummaryCard, Translation, Typing } from "./ChatBits";

type Step = { node: React.ReactNode; wait: number };
interface Story { id: string; label: string; channel: string; steps: Step[] }

const STORIES: Story[] = [
  {
    id: "ask",
    label: "Ask a question",
    channel: "fyp-help",
    steps: [
      { wait: 400, node: <Msg name="Hamza" time="11:02">Does anyone know when the proposal is due? 😅</Msg> },
      { wait: 900, node: <Msg name="Ayesha" time="11:02"><Mention>@Campus FAQ</Mention> when is the FYP proposal due?</Msg> },
      { wait: 700, node: <Typing who="Campus FAQ" /> },
      {
        wait: 1300,
        node: (
          <AgentMsg agent="faq" time="11:02">
            Proposals are due <b>Friday, 14 Nov at 5 pm</b>. Submit them on the portal under <b>FYP → Proposals</b>.
            <span className="lpc-source">From FYP Handbook.pdf</span>
            <span className="lpc-reactions"><Reaction emoji="🙏" count={4} /><Reaction emoji="👍" count={2} /></span>
          </AgentMsg>
        ),
      },
    ],
  },
  {
    id: "catchup",
    label: "Catch me up",
    channel: "general",
    steps: [
      { wait: 400, node: <p className="lpc-unread">142 new messages since you left</p> },
      { wait: 900, node: <Msg name="You" time="18:30">/catchup</Msg> },
      { wait: 700, node: <Typing who="Catch me up" /> },
      {
        wait: 1300,
        node: (
          <AgentMsg agent="aura" time="18:30">
            <SummaryCard
              count={142}
              lines={[
                "Demo day moved to Thursday, 2 pm in Lab 3.",
                "Sana is sharing slide templates in #resources.",
                "Teams still need a tester. Reply to Bilal's thread.",
              ]}
            />
          </AgentMsg>
        ),
      },
    ],
  },
  {
    id: "quiz",
    label: "Run a quiz",
    channel: "dsa-revision",
    steps: [
      { wait: 400, node: <Msg name="Zain" time="21:10"><Mention>@Quiz Master</Mention> one quick question before the mid?</Msg> },
      { wait: 700, node: <Typing who="Quiz Master" /> },
      { wait: 1100, node: <AgentMsg agent="quiz" time="21:10"><Poll question="Which sort is O(n log n) even in the worst case?" options={["Quick sort", "Merge sort", "Bubble sort"]} votes={[3, 1, 0]} /></AgentMsg> },
      { wait: 1400, node: <AgentMsg agent="quiz" time="21:11"><Poll question="Which sort is O(n log n) even in the worst case?" options={["Quick sort", "Merge sort", "Bubble sort"]} votes={[4, 11, 1]} voted={1} /></AgentMsg> },
    ],
  },
  {
    id: "translate",
    label: "Translate",
    channel: "announcements",
    steps: [
      { wait: 400, node: <Msg name="Bilal" time="09:15"><Translation original="کیا کل کی کلاس کینسل ہو گئی ہے؟" english="Has tomorrow's class been cancelled?" /></Msg> },
      { wait: 1200, node: <Msg name="Sana" time="09:16">Yes, it moved to Monday. Same room 👍</Msg> },
    ],
  },
];

export default function ProductWindow() {
  const [ref, inView] = useInView<HTMLDivElement>(0.35);
  const [storyIdx, setStoryIdx] = useState(0);
  const [shown, setShown] = useState(0);
  const [auto, setAuto] = useState(true);
  const story = STORIES[storyIdx];
  // While the last step is a "typing" line, the next one replaces it.
  const visible = story.steps.slice(0, shown).filter((s, i) => !(i < shown - 1 && isTyping(s)));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(story.steps.length);
      return;
    }
    if (!inView) return;
    if (shown < story.steps.length) {
      const t = setTimeout(() => setShown((n) => n + 1), story.steps[shown].wait);
      return () => clearTimeout(t);
    }
    if (!auto) return;
    const t = setTimeout(() => { setStoryIdx((i) => (i + 1) % STORIES.length); setShown(0); }, 3600);
    return () => clearTimeout(t);
  }, [inView, shown, story, auto]);

  const pick = (i: number) => {
    setAuto(false);
    setStoryIdx(i);
    setShown(0);
  };

  return (
    <div ref={ref} className="lp-window-wrap">
      <div className="lp-pills" role="tablist" aria-label="See AuraFlow in action">
        {STORIES.map((s, i) => (
          <button key={s.id} type="button" role="tab" aria-selected={i === storyIdx} className={cn("lp-pill", i === storyIdx && "is-on")} onClick={() => pick(i)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="lp-window" role="img" aria-label={`AuraFlow showing a ${story.label.toLowerCase()} example in #${story.channel}`}>
        <div className="lp-window-bar" aria-hidden>
          <i /><i /><i />
        </div>
        <div className="lp-window-app" aria-hidden>
          <nav className="lpw-rail">
            <span className="lpw-logo"><img src="/marketing/auraflow-logo-mark-144.webp" alt="" /></span>
            <span className="lpw-sep" />
            <span className="lpw-server is-on">CS</span>
            <span className="lpw-server">FY</span>
            <span className="lpw-server">TT</span>
          </nav>
          <aside className="lpw-side">
            <p className="lpw-community">CS Department</p>
            <p className="lpw-group">Text channels</p>
            {["general", "fyp-help", "dsa-revision", "announcements"].map((c) => (
              <span key={c} className={cn("lpw-chan", c === story.channel && "is-on")}><Hash size={15} />{c}</span>
            ))}
            <p className="lpw-group">Voice</p>
            <span className="lpw-chan"><Volume2 size={15} />study-room</span>
            <span className="lpw-voice"><i style={{ background: "#8FA98A" }} />Ayesha</span>
            <span className="lpw-voice"><i style={{ background: "#D8B45A" }} />Bilal</span>
          </aside>
          <section className="lpw-chat">
            <header className="lpw-head"><Hash size={17} /><b>{story.channel}</b></header>
            <div className="lpw-log" key={story.id}>
              {visible.map((s, i) => (
                <div key={i} className="lpw-step">{s.node}</div>
              ))}
            </div>
            <div className="lpw-composer"><Plus size={16} /><span>Message #{story.channel}</span><Smile size={16} /></div>
          </section>
        </div>
      </div>
    </div>
  );
}

function isTyping(s: Step) {
  return (s.node as React.ReactElement)?.type === Typing;
}
