// AuraFlow's landing page. Direction: a warm studio. Off-white and near-black
// sections take turns (Apple), headlines are short, heavy and feeling-first
// (Discord), the product itself does the explaining (Slack). Helpers are a
// family of soft 3D characters in Orbi's style (our DM mascot), never robots. Motion: reveal on scroll, two pinned scenes,
// a scripted live window, small prop parallax; all of it calms down for
// people who ask for reduced motion.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Hash, Menu, MessageSquareText, Mic, MicOff, X } from "lucide-react";
import MarketingBrand from "@/components/marketing/MarketingBrand";
import ProductWindow from "@/components/landing/ProductWindow";
import { AgentTabs, BuildScene, CatchUpScene, Marquee } from "@/components/landing/Scenes";
import { Msg, Translation } from "@/components/landing/ChatBits";
import { prefersReducedMotion, useReveal, useScrollProgress } from "@/components/landing/motion";
import { cn } from "@/lib/utils";
import "@/styles/marketing.css";
import "@/styles/home.css";

const MADE_FOR = ["Study groups", "Class sections", "Societies", "FYP teams", "Hackathons", "Clubs", "Hostels", "Alumni"];

function Header() {
  const [solid, setSolid] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setSolid(y > 40);
      setHidden(y > 400 && y > last.current + 4);
      if (y < last.current - 4) setHidden(false);
      last.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  const links = [
    { href: "#product", label: "Product" },
    { href: "#helpers", label: "Helpers" },
    { href: "#build", label: "Build your own" },
    { href: "#safety", label: "Safety" },
  ];
  return (
    <header className={cn("lp-header", solid && "is-solid", hidden && !open && "is-hidden")}>
      <div className="lp-header-inner">
        <MarketingBrand tone="light" />
        <nav className={cn("lp-nav", open && "is-open")} aria-label="Main">
          {links.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>)}
          <Link to="/login" className="lp-nav-mobile">Log in</Link>
        </nav>
        <div className="lp-header-actions">
          <Link to="/login" className="lp-login">Log in</Link>
          <Link to="/signup" className="lp-btn lp-btn-ink lp-btn-sm">Get started</Link>
          <button type="button" className="lp-menu" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const [ref, p] = useScrollProgress<HTMLDivElement>("pass");
  const reduced = prefersReducedMotion();
  // The window starts tilted back and lies flat as you scroll into it.
  const t = reduced ? 1 : Math.min(1, Math.max(0, (p - 0.18) / 0.32));
  const tilt = 14 * (1 - t);
  const scale = 0.9 + 0.1 * t;
  const drift = reduced ? 0 : (p - 0.4) * 80;
  return (
    <section className="lp-hero" aria-labelledby="lp-hero-h">
      <div className="lp-wrap lp-hero-copy">
        <h1 id="lp-hero-h" className="lp-h1">
          <span data-reveal>Your people talk.</span>
          <span data-reveal data-delay="80"><span className="lp-hero-accent">Your helpers</span> handle</span>
          <span data-reveal data-delay="160">the rest.</span>
        </h1>
        <p className="lp-lead lp-hero-lead" data-reveal data-delay="240">
          Channels, DMs and voice for your community, plus helpers that answer questions, run quizzes and remind everyone before the deadline.
        </p>
        <div className="lp-cta-row" data-reveal data-delay="320">
          <Link to="/signup" className="lp-btn lp-btn-ink">Get started, it's free <ArrowRight size={18} /></Link>
          <Link to="/login" className="lp-btn lp-btn-line">Open in browser</Link>
        </div>
      </div>
      <div ref={ref} className="lp-wrap lp-hero-stage" data-reveal data-delay="380">
        <img className="lp-prop lp-prop-a" src="/landing/orbi.webp" alt="" width={720} height={720} style={{ transform: `translate3d(0, ${-drift}px, 0)` }} />
        <img className="lp-prop lp-prop-b" src="/landing/faq.webp" alt="" width={720} height={720} style={{ transform: `translate3d(0, ${drift * 0.6}px, 0)` }} />
        <div className="lp-tilt" style={{ transform: `perspective(1600px) rotateX(${tilt}deg) scale(${scale})` }}>
          <ProductWindow />
        </div>
      </div>
    </section>
  );
}

function MadeFor() {
  const row = MADE_FOR.map((m) => <span key={m} className="lp-chip">{m}</span>);
  return (
    <section className="lp-madefor" aria-label="Made for">
      <p className="lp-kicker">Made for</p>
      <div className="lp-madefor-mask">
        <div className="lp-madefor-track">{row}{row}</div>
      </div>
    </section>
  );
}

function FeatureCard({ title, body, prop, side, children, delay = 0 }: { title: React.ReactNode; body: string; prop?: string; side: "left" | "right"; children: React.ReactNode; delay?: number }) {
  const [ref, p] = useScrollProgress<HTMLDivElement>("pass");
  const drift = prefersReducedMotion() ? 0 : (p - 0.5) * -60;
  return (
    <article ref={ref} className={cn("lp-feature", side === "right" && "is-flipped")} data-reveal data-delay={delay}>
      <div className="lp-feature-ui" aria-hidden>{children}</div>
      <div className="lp-feature-copy">
        <h3 className="lp-h3">{title}</h3>
        <p className="lp-lead">{body}</p>
      </div>
      {prop && <img className="lp-feature-prop" src={prop} alt="" width={400} height={400} loading="lazy" style={{ transform: `translate3d(0, ${drift}px, 0)` }} />}
    </article>
  );
}

/** Orbi waving: a transparent (VP9 alpha) clip. Safari can't show WebM alpha
 *  and reduced motion means no movement, so both get the still cut-out. */
function WavingOrbi() {
  const [still] = useState(() => {
    if (prefersReducedMotion()) return true;
    const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
    return /Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua);
  });
  return still ? (
    <img className="lpf-orbi" src="/landing/orbi-sm.webp" alt="" width={360} height={418} />
  ) : (
    <video className="lpf-orbi" src="/landing/orbi-wave.webm" poster="/landing/orbi-sm.webp" autoPlay muted loop playsInline aria-hidden />
  );
}

function Features() {
  return (
    <section id="product" className="lp-section" aria-labelledby="lp-features-h">
      <div className="lp-wrap">
        <h2 id="lp-features-h" className="lp-h2" data-reveal>Everything your<br />group chat was missing.</h2>
        <div className="lp-features">
          <FeatureCard side="left" title={<>Every topic gets<br />its own room.</>} body="Channels for each subject, threads for each question. The important bits don't get buried under memes." prop="/landing/channels-sm.webp">
            <div className="lpf-channels">
              {["general", "fyp-help", "dsa-revision", "resources", "memes"].map((c, i) => (
                <span key={c} className={cn("lpw-chan", i === 1 && "is-on")}><Hash size={15} />{c}{i === 3 && <b className="lpf-badge">3</b>}</span>
              ))}
              <div className="lpf-thread">
                <p className="lpf-thread-t"><MessageSquareText size={14} /> Proposal format?</p>
                <p className="lpf-thread-m">12 replies · last one 4m ago</p>
              </div>
            </div>
          </FeatureCard>
          <FeatureCard side="right" title={<>Hop in.<br />No need to call.</>} body="Voice rooms stay open. Join when you're free, leave when you're done, nobody has to ring anyone." prop="/landing/voice-sm.webp">
            <div className="lpf-voice">
              {[["Ayesha", "#8FA98A", true], ["Bilal", "#D8B45A", false], ["Sana", "#D98C80", false], ["Zain", "#A39382", true]].map(([n, c, talking]) => (
                <div key={n as string} className={cn("lpf-tile", talking && "is-talking")}>
                  <span className="lpc-avatar lpf-tile-av" style={{ backgroundColor: c as string }}>{(n as string)[0]}</span>
                  <span className="lpf-tile-n">{talking ? <Mic size={13} /> : <MicOff size={13} />}{n as string}</span>
                </div>
              ))}
            </div>
          </FeatureCard>
          <FeatureCard side="left" title={<>Write in Urdu.<br />They read in English.</>} body="Translations sit right under the message, and the original stays too. Everyone keeps up, in their own words." prop="/landing/translate-sm.webp">
            <div className="lpf-chat">
              <Msg name="Bilal" time="09:15"><Translation original="کیا کل کی کلاس کینسل ہو گئی ہے؟" english="Has tomorrow's class been cancelled?" /></Msg>
              <Msg name="Sana" time="09:16">Yes, moved to Monday. Same room 👍</Msg>
            </div>
          </FeatureCard>
          <FeatureCard side="right" title={<>Say hi<br />in one click.</>} body="New DM? Wave first. Orbi takes care of the awkward part.">
            <div className="lpf-wave">
              <WavingOrbi />
              <span className="lp-btn lp-btn-paper lp-btn-sm">👋 Wave to Ayesha</span>
            </div>
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

function Trust() {
  const points = [
    ["Private stays private.", "Private communities and DMs are only for the people in them."],
    ["Helpers see what you allow.", "Each helper only reads the channels you switch on."],
    ["People make the call.", "Helpers flag things for moderators. They never ban anyone on their own."],
  ];
  return (
    <section id="safety" className="lp-section" aria-labelledby="lp-trust-h">
      <div className="lp-wrap">
        <figure className="lp-wide" data-reveal>
          <img src="/landing/trust.webp" srcSet="/landing/trust-sm.webp 960w, /landing/trust.webp 1920w" sizes="(max-width: 900px) 100vw, 1200px" alt="" width={1920} height={1072} loading="lazy" />
          <h2 id="lp-trust-h" className="lp-h2 lp-wide-h">Your space.<br />Your rules.</h2>
        </figure>
        <div className="lp-trust">
          {points.map(([h, b], i) => (
            <div key={h} data-reveal data-delay={i * 80}>
              <h3 className="lp-h4">{h}</h3>
              <p className="lp-body">{b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Finale() {
  return (
    <section className="lp-final lp-dark" aria-labelledby="lp-final-h">
      <div className="lp-wrap">
        <h2 id="lp-final-h" className="lp-h1 lp-final-h" data-reveal>That's the tour.<br />Your people are waiting.</h2>
        <div className="lp-cta-row lp-final-cta" data-reveal data-delay="120">
          <Link to="/signup" className="lp-btn lp-btn-paper">Get started, it's free <ArrowRight size={18} /></Link>
          <Link to="/login" className="lp-btn lp-btn-line-light">Log in</Link>
        </div>
        <img className="lp-final-img" data-reveal data-delay="200" src="/landing/group.webp" srcSet="/landing/group-sm.webp 960w, /landing/group.webp 1920w" sizes="(max-width: 900px) 100vw, 1200px" alt="" width={1920} height={1072} loading="lazy" />
      </div>
    </section>
  );
}

function Footer() {
  const cols: [string, [string, string][]][] = [
    ["Product", [["Channels & DMs", "#product"], ["Helpers", "#helpers"], ["Build your own", "#build"]]],
    ["Community", [["Discover communities", "/discover"], ["Safety", "#safety"]]],
    ["Account", [["Log in", "/login"], ["Create an account", "/signup"]]],
  ];
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-inner">
        <div>
          <MarketingBrand tone="light" />
          <p className="lp-body lp-footer-note">A place for your people, with helpers for the boring parts.</p>
        </div>
        {cols.map(([h, links]) => (
          <nav key={h} aria-label={h}>
            <p className="lp-footer-h">{h}</p>
            {links.map(([label, href]) => href.startsWith("#") ? <a key={label} href={href}>{label}</a> : <Link key={label} to={href}>{label}</Link>)}
          </nav>
        ))}
      </div>
      <p className="lp-wrap lp-footer-legal">© {new Date().getFullYear()} AuraFlow</p>
    </footer>
  );
}

export default function LandingPage() {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div ref={root} className="lp">
      <a className="marketing-skip" href="#main">Skip to content</a>
      <Header />
      <main id="main">
        <Hero />
        <MadeFor />
        <CatchUpScene />
        <Features />
        <Marquee />
        <section id="helpers" className="lp-section" aria-labelledby="lp-helpers-h">
          <div className="lp-wrap">
            <h2 id="lp-helpers-h" className="lp-h2" data-reveal>Helpers for<br />the boring parts.</h2>
            <p className="lp-lead lp-section-lead" data-reveal data-delay="80">Add a helper to your community and it works where you already talk. No new app, no new tab.</p>
            <div data-reveal data-delay="140"><AgentTabs /></div>
          </div>
        </section>
        <div id="build"><BuildScene /></div>
        <Trust />
        <Finale />
      </main>
      <Footer />
    </div>
  );
}
