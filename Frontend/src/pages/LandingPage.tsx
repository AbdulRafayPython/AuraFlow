import { ArrowRight, Hash, Languages, Menu, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingBrand from '@/components/marketing/MarketingBrand';
import '@/styles/marketing.css';
import '@/styles/landing.css';

type PreviewMode = 'summary' | 'translation' | 'safety';

const previewModes: { id: PreviewMode; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'translation', label: 'Translate' },
  { id: 'safety', label: 'Safety' },
];

const previews = {
  summary: {
    channel: 'project-ideas',
    people: [
      { initials: 'JD', name: 'Jamie', time: '10:42', message: 'What if everyone had a place to share their projects?' },
      { initials: 'AK', name: 'Areeba', time: '10:44', message: 'Yes! We could use this channel for feedback and updates.' },
      { initials: 'MK', name: 'Mika', time: '10:46', message: 'I have something to share this week.' },
    ],
    eyebrow: 'Channel summary',
    title: 'Just joined?',
    detail: 'The group is planning a project sharing space. Join the discussion in #project-ideas.',
  },
  translation: {
    channel: 'introductions',
    people: [
      { initials: 'AK', name: 'Areeba', time: '11:08', message: '¡Hola! Me alegra estar aquí.' },
      { initials: 'JD', name: 'Jamie', time: '11:09', message: 'Welcome, Areeba! Tell us what you are working on.' },
      { initials: 'MK', name: 'Mika', time: '11:10', message: 'Glad you found us.' },
    ],
    eyebrow: 'Inline translation',
    title: 'Follow the conversation.',
    detail: '“Hi! I’m happy to be here.” Read a translation beside the original message.',
  },
  safety: {
    channel: 'general',
    people: [
      { initials: 'JD', name: 'Jamie', time: '12:14', message: 'Let’s keep feedback useful and kind.' },
      { initials: 'AK', name: 'Areeba', time: '12:15', message: 'Agreed. I can help review the new posts.' },
      { initials: 'MK', name: 'Mika', time: '12:17', message: 'Thanks for making this a welcoming space.' },
    ],
    eyebrow: 'Moderation support',
    title: 'More room for care.',
    detail: 'Moderation tools help community leaders review conversations that need attention.',
  },
} satisfies Record<PreviewMode, {
  channel: string;
  people: { initials: string; name: string; time: string; message: string }[];
  eyebrow: string;
  title: string;
  detail: string;
}>;

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activePreview, setActivePreview] = useState<PreviewMode>('summary');
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const preview = previews[activePreview];

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  return (
    <div className="marketing marketing-landing af-home">
      <a className="marketing-skip" href="#main">Skip to content</a>
      <header className="af-home-header">
        <MarketingBrand />
        <button
          ref={menuButtonRef}
          className="af-home-menu-button"
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="af-home-navigation"
        >
          {menuOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
        </button>
        <nav id="af-home-navigation" className={`af-home-nav${menuOpen ? ' af-home-nav--open' : ''}`} aria-label="Main navigation">
          <a href="#demo" onClick={() => setMenuOpen(false)}>Preview the app</a>
          <a href="#features" onClick={() => setMenuOpen(false)}>What it can do</a>
          <Link className="af-home-nav__mobile" to="/login">Log in</Link>
          <Link className="af-home-nav__mobile af-home-nav__mobile-cta" to="/signup">Get started <ArrowRight size={16} aria-hidden="true" /></Link>
        </nav>
        <div className="af-home-header__actions">
          <Link className="af-home-header__login" to="/login">Log in</Link>
          <Link className="af-home-header__cta" to="/signup">Get started <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
      </header>

      <main id="main">
        <section className="af-home-hero" aria-labelledby="af-home-hero-heading">
          <div className="af-home-hero__inner">
            <div className="af-home-hero__copy">
              <p className="af-home-kicker af-home-kicker--light"><span aria-hidden="true" /> Community chat, with AI built in</p>
              <h1 id="af-home-hero-heading">Your people.<br /><span>In the loop.</span></h1>
              <p className="af-home-hero__description">Bring everyone together in live channels. AI summaries and inline translation help your community keep up and take part.</p>
              <div className="af-home-hero__actions">
                <Link className="af-home-button af-home-button--light" to="/signup">Create an account <ArrowRight size={19} aria-hidden="true" /></Link>
                <Link className="af-home-button af-home-button--ghost" to="/login">Log in to the app</Link>
              </div>
              <p className="af-home-hero__details">Channels <span aria-hidden="true">/</span> Direct messages <span aria-hidden="true">/</span> AI help</p>
            </div>
            <div className="af-home-hero__art">
              <img
                src="/marketing/auraflow-community-hero-1280.webp"
                srcSet="/marketing/auraflow-community-hero-720.webp 720w, /marketing/auraflow-community-hero-1280.webp 1280w"
                sizes="(max-width: 600px) 565px, (max-width: 820px) 88vw, 62vw"
                alt="Friends gathered around a shared chat space"
                width="1280"
                height="853"
                fetchPriority="high"
              />
            </div>
          </div>
        </section>

        <section className="af-home-demo af-home-light" id="demo" aria-labelledby="af-home-demo-heading">
          <div className="af-home-section-head">
            <div>
              <p className="af-home-kicker">Inside AuraFlow</p>
              <h2 id="af-home-demo-heading">See what happened.<br /><span>Join right in.</span></h2>
            </div>
            <p>Conversations stay easy to follow, even when your channel gets busy. Explore an example of the tools beside the chat.</p>
          </div>
          <div className="af-home-demo__toolbar">
            <span>Illustrative product preview</span>
            <div className="af-home-demo__modes" role="group" aria-label="Choose preview feature">
              {previewModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={activePreview === mode.id}
                  className={activePreview === mode.id ? 'af-home-demo__mode af-home-demo__mode--active' : 'af-home-demo__mode'}
                  onClick={() => setActivePreview(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <div className="af-home-demo__stage">
            <div className="af-home-demo__app">
              <div className="af-home-demo__sidebar" aria-hidden="true">
                <div className="af-home-demo__app-logo"><img src="/marketing/auraflow-logo-mark-144.webp" alt="" width="144" height="144" /></div>
                <strong>Your space</strong>
                <span><Hash size={16} /> general</span>
                <span className="af-home-demo__sidebar-active"><Hash size={16} /> {preview.channel}</span>
                <span><Hash size={16} /> introductions</span>
              </div>
              <div className="af-home-demo__chat">
                <div className="af-home-demo__channel"><Hash size={19} aria-hidden="true" /><strong>{preview.channel}</strong><span>A place to share ideas</span></div>
                <div className="af-home-demo__messages">
                  {preview.people.map((person) => (
                    <div className="af-home-demo__message" key={person.name}>
                      <span className="af-home-demo__avatar" aria-hidden="true">{person.initials}</span>
                      <div><strong>{person.name} <small>{person.time}</small></strong><p>{person.message}</p></div>
                    </div>
                  ))}
                </div>
                <div className="af-home-demo__composer" aria-hidden="true">Message #{preview.channel}<span>＋</span></div>
              </div>
            </div>
            <aside className="af-home-demo__insight" aria-live="polite">
              <span className="af-home-demo__insight-icon"><Sparkles size={22} aria-hidden="true" /></span>
              <div>
                <p>{preview.eyebrow}</p>
                <h3>{preview.title}</h3>
                <span>{preview.detail}</span>
              </div>
            </aside>
          </div>
        </section>

        <section className="af-home-features" id="features" aria-labelledby="af-home-features-heading">
          <div className="af-home-section-head af-home-section-head--dark">
            <div>
              <p className="af-home-kicker af-home-kicker--light">Built into the conversation</p>
              <h2 id="af-home-features-heading">More time with people.<br /><span>Less catching up.</span></h2>
            </div>
            <p>AuraFlow's helpers work alongside your community, right where the conversation happens.</p>
          </div>
          <div className="af-home-features__grid">
            <article className="af-home-feature af-home-feature--main">
              <div className="af-home-feature__copy">
                <span className="af-home-feature__icon"><Sparkles size={25} aria-hidden="true" /></span>
                <h3>Know what you missed.</h3>
                <p>Get a concise recap of a busy channel before jumping back into the discussion.</p>
              </div>
              <img src="/marketing/auraflow-ai-agents-768.webp" alt="" width="768" height="768" loading="lazy" />
            </article>
            <article className="af-home-feature af-home-feature--cyan">
              <span className="af-home-feature__icon"><Languages size={26} aria-hidden="true" /></span>
              <div><h3>Follow every language.</h3><p>Read translations in the conversation, beside the original message.</p></div>
            </article>
            <article className="af-home-feature af-home-feature--pale">
              <span className="af-home-feature__icon"><ShieldCheck size={26} aria-hidden="true" /></span>
              <div><h3>Make room for care.</h3><p>Moderation tools help community leaders review what needs attention.</p></div>
            </article>
          </div>
        </section>

        <section className="af-home-final af-home-light" aria-labelledby="af-home-final-heading">
          <p className="af-home-kicker">Your community starts here</p>
          <h2 id="af-home-final-heading">Make space for<br />your people.</h2>
          <p>Start a community, open a channel, and let the conversation grow.</p>
          <div className="af-home-final__actions">
            <Link className="af-home-button af-home-button--dark" to="/signup">Get started <ArrowRight size={19} aria-hidden="true" /></Link>
            <Link className="af-home-final__login" to="/login">Already have an account? Log in</Link>
          </div>
        </section>
      </main>

      <footer className="af-home-footer">
        <MarketingBrand />
        <p>Good conversations have a place here.</p>
        <Link to="/login">Log in to the app <ArrowRight size={17} aria-hidden="true" /></Link>
        <small>© {new Date().getFullYear()} AuraFlow</small>
      </footer>
    </div>
  );
}
