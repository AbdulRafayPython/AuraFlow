// The scroll-driven scenes of the landing page:
// - CatchUpScene: pinned; a clay video scrubs with scroll while three steps
//   cross-fade ("Were you away? We kept notes.").
// - BuildScene: pinned; the agent builder fills itself in, step by step.
// - AgentTabs: Slack-style tabs, one per helper, auto-advancing.
// - Marquee: the big ASK • LEARN • PLAN • HANG OUT band.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion, range, useInView, useScrollProgress } from "./motion";
import { AGENTS, AgentMsg, Mention, Msg, Poll, SummaryCard, type AgentKey } from "./ChatBits";

/* ── Video that follows scroll ─────────────────────────────────────────── */
// Small screens don't pin, so the clip simply plays once when it comes into view.
const isSmall = () => typeof window !== "undefined" && window.matchMedia?.("(max-width: 900px)").matches;

function ScrubVideo({ src, poster, progress, label }: { src: string; poster: string; progress: number; label: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [small] = useState(isSmall);
  const [wrap, inView] = useInView<HTMLDivElement>(0.5);
  useEffect(() => {
    const v = video.current;
    if (!small || !v || !inView || prefersReducedMotion()) return;
    void v.play().catch(() => {});
  }, [small, inView]);
  useEffect(() => {
    const v = video.current;
    if (small || !v || !ready || !v.duration) return;
    const target = prefersReducedMotion() ? v.duration - 0.05 : progress * (v.duration - 0.05);
    if (Math.abs(v.currentTime - target) > 0.02) v.currentTime = target;
  }, [progress, ready, small]);
  return (
    <div ref={wrap} className="lp-scrub-wrap">
    <video
      ref={video}
      className="lp-scrub"
      src={src}
      poster={poster}
      muted
      playsInline
      preload="auto"
      aria-label={label}
      onLoadedMetadata={() => setReady(true)}
    />
    </div>
  );
}

const CATCHUP_STEPS = [
  { k: "142 new messages", t: "You were away for a day. #general kept going." },
  { k: "Ask to catch up", t: "Type /catchup, or press the button at the top of the channel." },
  { k: "Three lines", t: "Everything that matters, in the order it happened. Only you see it." },
];

export function CatchUpScene() {
  const [ref, p] = useScrollProgress<HTMLElement>("pin");
  const step = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
  return (
    <section ref={ref} className="lp-pin lp-dark" style={{ height: "300vh" }} aria-labelledby="lp-catchup-h">
      <div className="lp-pin-stage">
        <div className="lp-wrap lp-catchup">
          <div className="lp-catchup-media">
            <ScrubVideo
              src="/landing/catchup.mp4"
              poster="/landing/catchup-poster.webp"
              progress={range(p, 0.02, 0.92)}
              label="Orbi watches chat bubbles pile up, hugs them together and holds up one neat summary card."
            />
          </div>
          <div className="lp-catchup-copy">
            <h2 id="lp-catchup-h" className="lp-h2">Were you away?<br />We kept notes.</h2>
            <ol className="lp-steps">
              {CATCHUP_STEPS.map((s, i) => (
                <li key={s.k} className={cn("lp-step", i === step && "is-on", i < step && "is-done")}>
                  <span className="lp-step-k">{s.k}</span>
                  <span className="lp-step-t">{s.t}</span>
                </li>
              ))}
            </ol>
            <div className={cn("lp-catchup-card", step === 2 && "is-on")} aria-hidden>
              <SummaryCard count={142} lines={["Demo day moved to Thursday, 2 pm.", "Slide templates are in #resources.", "Bilal's team still needs a tester."]} />
            </div>
          </div>
        </div>
        <div className="lp-pin-bar" aria-hidden><span style={{ transform: `scaleX(${p})` }} /></div>
      </div>
    </section>
  );
}

/* ── Build your own helper ─────────────────────────────────────────────── */
const SKILLS = ["Answer from your files", "Post reminders", "Run quick polls", "Welcome new members"];

export function BuildScene() {
  const [ref, p] = useScrollProgress<HTMLElement>("pin");
  const reduced = prefersReducedMotion();
  const nameP = reduced ? 1 : range(p, 0.05, 0.3);
  const skillsOn = reduced ? 4 : Math.floor(range(p, 0.35, 0.62) * 4.999);
  const testOn = reduced || p > 0.7;
  const name = "Lab Buddy".slice(0, Math.round(nameP * 9));
  const step = p < 0.33 ? 0 : p < 0.66 ? 1 : 2;
  return (
    <section ref={ref} className="lp-pin lp-dark" style={{ height: "280vh" }} aria-labelledby="lp-build-h">
      <div className="lp-pin-stage">
        <div className="lp-wrap lp-build">
          <div className="lp-build-copy">
            <h2 id="lp-build-h" className="lp-h2">Make a helper<br />in five minutes.<br /><span className="lp-dim">No code.</span></h2>
            <ol className="lp-steps">
              {["Name it", "Pick what it can do", "Test it, then share it"].map((s, i) => (
                <li key={s} className={cn("lp-step", i === step && "is-on", i < step && "is-done")}>
                  <span className="lp-step-k">{i + 1}. {s}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="lp-builder" aria-hidden>
            <div className="lpb-top">
              <img src="/landing/builder-sm.webp" alt="" className="lpb-pic" />
              <div>
                <p className="lpb-label">Name</p>
                <p className="lpb-name">{name}<span className={cn("lpb-caret", nameP >= 1 && "is-off")} /></p>
              </div>
            </div>
            <p className="lpb-label">What it can do</p>
            <ul className="lpb-skills">
              {SKILLS.map((s, i) => (
                <li key={s}><span>{s}</span><span className={cn("lpb-switch", i < skillsOn && "is-on")}><i /></span></li>
              ))}
            </ul>
            <div className={cn("lpb-test", testOn && "is-on")}>
              <p className="lpb-label">Try it</p>
              <Msg name="You" time="now">When is the lab report due?</Msg>
              <div className="lpb-reply">
                <span className="lpb-reply-name">{"Lab Buddy"}<span className="lpc-app">APP</span></span>
                Thursday before midnight. The template is pinned in #lab-3.
              </div>
            </div>
          </div>
        </div>
        <div className="lp-pin-bar" aria-hidden><span style={{ transform: `scaleX(${p})` }} /></div>
      </div>
    </section>
  );
}

/* ── Agents, one tab each ──────────────────────────────────────────────── */
interface Tab { id: AgentKey; label: string; claim: string; body: string; image: string; demo: React.ReactNode }

const TABS: Tab[] = [
  {
    id: "faq", label: "Answers", claim: "Questions get answered at 2 a.m.",
    body: "Give it your handbook, syllabus or notes. It answers in the channel and says where the answer came from.",
    image: "/landing/faq.webp",
    demo: <><Msg name="Sana" time="02:11"><Mention>@Campus FAQ</Mention> is the library open on Sunday?</Msg><AgentMsg agent="faq" time="02:11">Yes, 10 am to 6 pm on Sundays. Exam weeks run until 10 pm.<span className="lpc-source">From Student Guide 2026</span></AgentMsg></>,
  },
  {
    id: "quiz", label: "Quizzes", claim: "Revise together, right in the chat.",
    body: "Ask for a quick quiz on any topic. Everyone votes, the right answer shows when the poll closes.",
    image: "/landing/quiz.webp",
    demo: <AgentMsg agent="quiz" time="21:10"><Poll question="What does a hash table look up in, on average?" options={["O(1)", "O(log n)", "O(n)"]} votes={[14, 3, 1]} voted={0} /></AgentMsg>,
  },
  {
    id: "countdown", label: "Deadlines", claim: "Nobody misses the deadline again.",
    body: "Add the dates once. It reminds the channel a week before, a day before, and on the morning of.",
    image: "/landing/countdown.webp",
    demo: <AgentMsg agent="countdown" time="08:00"><b>3 days</b> until the Database mid-term (Thursday, 10 am, Hall B). Revision session tonight at 8 in #study-room.</AgentMsg>,
  },
  {
    id: "wellbeing", label: "Wellbeing", claim: "Someone checks in when it's quiet.",
    body: "A gentle DM during heavy weeks, with tips and where to find real help. Private, and you can turn it off.",
    image: "/landing/wellbeing.webp",
    demo: <AgentMsg agent="wellbeing" time="23:40">Long week? You've been up late three nights in a row. Want a 5-minute breathing break, or the counselling office hours?</AgentMsg>,
  },
  {
    id: "safety", label: "Safety", claim: "Spam is gone before you see it.",
    body: "It flags spam and harmful messages for your moderators. People decide; the helper just points.",
    image: "/landing/safety.webp",
    demo: <AgentMsg agent="safety" time="14:05"><span className="lpc-flag">Held for review</span> A message with 6 unknown links was posted in #general. A moderator can approve or remove it.</AgentMsg>,
  },
];

export function AgentTabs() {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const [idx, setIdx] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!inView || !auto || prefersReducedMotion()) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % TABS.length), 6000);
    return () => clearTimeout(t);
  }, [inView, auto, idx]);
  const tab = TABS[idx];
  return (
    <div ref={ref} className="lp-tabs">
      <div className="lp-tablist" role="tablist" aria-label="Helpers">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            id={`lp-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={i === idx}
            aria-controls="lp-tabpanel"
            className={cn("lp-tab", i === idx && "is-on")}
            onClick={() => { setAuto(false); setIdx(i); }}
          >
            {t.label}
            {i === idx && auto && inView && <span className="lp-tab-timer" key={idx} aria-hidden />}
          </button>
        ))}
      </div>
      <div id="lp-tabpanel" role="tabpanel" aria-labelledby={`lp-tab-${tab.id}`} className="lp-tabpanel" key={tab.id}>
        <figure className="lp-tab-photo">
          <img src={tab.image} alt="" width={720} height={720} loading="lazy" />
          <figcaption>{AGENTS[tab.id].name}</figcaption>
        </figure>
        <div className="lp-tab-copy">
          <h3 className="lp-h3">{tab.claim}</h3>
          <p className="lp-lead">{tab.body}</p>
          <div className="lp-mini-chat" aria-hidden>{tab.demo}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Marquee ───────────────────────────────────────────────────────────── */
export function Marquee() {
  const words = ["Ask", "Learn", "Plan", "Hang out"];
  const row = (
    <span className="lp-marquee-row">
      {words.map((w, i) => (
        <span key={w} className={cn("lp-marquee-word", i % 2 === 1 && "is-outline")}>{w}<span className="lp-marquee-dot" aria-hidden /></span>
      ))}
    </span>
  );
  return (
    <div className="lp-marquee" aria-label="Ask, learn, plan, hang out">
      <div className="lp-marquee-track" aria-hidden>{row}{row}{row}{row}</div>
    </div>
  );
}
