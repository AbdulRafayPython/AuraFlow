# AuraFlow homepage audit and redesign plan

**Context:** Public landing page at `/` for new visitors, with `/signup` and `/login` as entry routes. A signed-in user visiting `/` reaches the main app. The immediate goal is a clear, reliable KYS summit demo on desktop and mobile.

**Review scope:** Visual inspection at 1440×900, 390×844, and 320×700; mobile navigation interaction; source review of `src/pages/LandingPage.tsx`, `src/styles/marketing.css`, and routing. Scores below are a manual design review, not a Lighthouse or screen-reader certification.

## Baseline assessment before the redesign

| Dimension | Score / 10 | Evidence |
| --- | ---: | --- |
| Visual hierarchy | 7 | Strong headline and clear hero buttons; large illustration competes with the product message. |
| Consistency | 5 | Official logo is present, but the illustration's mint loop reads like another mark. The marketing stylesheet contains 114 raw hex color uses. |
| Accessibility | 4 | Heading clips at 320px; keyboard focus skips the opened mobile menu; cyan focus outline has only 1.10:1 contrast against the cyan closing section. |
| Usability | 5 | The static preview is too small to read on mobile, and “How it works” leads to a mock conversation rather than an explanation. |
| Responsiveness | 4 | 390px hero works, but 320px loses headline text and the mobile preview compresses essential detail. |
| Performance | 5 | Hero PNG is 1.76 MB, logo PNG is 1.50 MB, and the later agent illustration is 1.15 MB. No responsive image variants are defined. Actual Web Vitals were not measured. |

**Weighted overall: 5.1/10.** The visual foundation is useful, but the narrow-screen and keyboard issues should be fixed before showcasing it.

## Prioritized findings

| Priority | Location | Finding | Fix |
| --- | --- | --- | --- |
| Critical | Hero at 320px | “CONVERSATIONS” is visibly cut off; `.marketing` clips the overflow. This loses content at narrow widths (WCAG 1.4.10). | Use a short responsive headline or a mobile copy variant; size by available inline space and verify every word at 320px and 200% zoom. Do not rely on clipping. |
| Critical | Mobile menu | After opening the menu, pressing Tab moves to “Create your space” in the hero, bypassing the visible menu links. The nav precedes the toggle in DOM order (WCAG 2.4.3). | Put the toggle before the mobile nav in focus order or move focus to the first menu link on open; support Escape and return focus to the toggle. |
| Critical | Closing CTA focus | The global cyan focus outline (`#89e9f7`) on the light cyan section (`#b4eef7`) has 1.10:1 contrast, making keyboard focus hard to see (WCAG 2.4.7). | Use a dark outline token on light surfaces and a light outline token on dark surfaces; verify at least 3:1 indicator contrast. |
| Major | Mobile product preview | Chat text shrinks to roughly 11px and the summary card covers messages and composer. Product proof becomes hard to understand. | Build a separate mobile composition: one readable chat excerpt plus one summary card below it, with body text at least 14px. |
| Major | Hero and section copy | Phrases such as “A new kind of community space” and “Better together” do not quickly tell visitors what AuraFlow does. | Lead with channels, live conversation, and a specific AI benefit. Keep CTA labels aligned with `/signup` and `/login`. |
| Major | “How it works” anchor | The link goes to a static product illustration with no steps or clear explanation (Nielsen H2 and H4). | Rename the link “See the app,” or make the destination a short, concrete walkthrough. |
| Major | Media delivery | The initial hero and logo PNGs total about 3.25 MB before other page resources. | Export smaller WebP/AVIF variants, responsive `srcSet` and `sizes`, and a compact logo crop. Keep the official artwork intact. Measure LCP on the production build. |
| Minor | Brand system | Indigo, cyan, coral, lilac, and the illustration's mint symbol compete for attention; many colors are hardcoded. | Define semantic marketing tokens and reserve cyan for interaction and emphasis. Treat the mint loop in generated art as decoration or replace it in a later asset pass. |
| Minor | Static preview accessibility | The mock chat is exposed as text inside a generic labeled `div`, despite being an illustration. | Either make it meaningful, readable HTML proof or expose it as one described image and hide decorative internals from assistive tech. |

## Redesign direction

**Mood:** Warm, credible community product with a precise AI layer. Keep the Discord-inspired dark shell and the official blue AuraFlow mark. Use deep indigo, cool white, and one cyan accent. Keep illustration as supporting atmosphere; let real app UI carry the proof.

**Proposed page sequence:**

1. **Hero:** A short, specific headline about bringing a community together, one sentence naming channels and AI summaries, an honest primary `/signup` action, and a clear `/login` action. Show a compact real product scene alongside the illustration.
2. **See the app:** Replace the unreadable fake desktop mockup with a real, readable channel example. On mobile, stack the chat excerpt and AI summary instead of overlaying them.
3. **Three proof points:** Show one concrete example each for summaries, translation, and moderation using actual product states. Avoid unsupported claims or fabricated metrics.
4. **Final action and footer:** One concise invitation, account links, official logo, and essential navigation. Remove repeated slogans and decorative numbering that does not help the visitor.

## Work plan

### Pass 1 — Summit-ready fixes

- Fix 320px headline reflow and test 320, 390, 768, and 1440px widths.
- Repair mobile menu keyboard order, Escape behavior, and focus return.
- Add light-surface and dark-surface focus styles with verified contrast.
- Make the mobile product example readable and remove the covering overlay.
- Tighten hero and navigation copy so each link accurately describes its destination.

### Pass 2 — Full visual redesign

- Establish shared semantic tokens for background, surface, text, accent, focus, radius, and spacing, then migrate the landing page and auth pages together.
- Replace the static mock conversation with actual app captures or a small, self-contained UI demonstration.
- Rebalance desktop hero art and type so the illustration supports the headline; create a deliberate mobile art crop.
- Shorten the page and vary section composition while preserving routes and signup/login flows.

### Pass 3 — Delivery and verification

- Export responsive hero and logo assets and lazy-load below-the-fold artwork.
- Test links, guest signup, login, signed-in `/` behavior, and mobile menu.
- Check keyboard order, focus visibility, text contrast, reduced motion, 200% zoom, and 320px reflow.
- Run the production build and measure LCP/CLS on a representative desktop and mobile device before calling the redesign complete.

## Acceptance criteria

- Every headline word remains visible at 320px; no horizontal page scrolling.
- On opening the mobile menu, the next Tab reaches a menu link; Escape closes it and returns focus to the toggle.
- Text contrast meets 4.5:1 for normal text; visible focus indicators meet 3:1 against adjacent surfaces.
- Product preview remains legible at phone width without one card covering another.
- Primary and secondary calls to action reach the intended signup/login flow, and signed-in users still enter the main app.
- The official logo is the only logo-like brand mark in UI chrome; generated art stays visually subordinate.

## Implementation status

The homepage redesign now includes the shorter hero, clearer signup/login actions, an interactive and labeled product preview, a separate mobile preview layout, revised feature content, a compact footer, corrected mobile menu focus order and Escape behavior, and contrast-safe focus styles. The official logo and hero/agent artwork have small WebP versions for the page; the original files remain available for social previews and other product surfaces.

Verified in the local browser: the headline fits at 320px, the page has no horizontal overflow at tested mobile/tablet/desktop widths, preview controls change their content, the mobile menu's next Tab reaches its first link, Escape restores focus, and both auth screens fit tested desktop/mobile viewports. The production build and scoped ESLint pass.

Remaining production checks: a full screen-reader pass, 200% browser zoom, measured Web Vitals on the summit device/network, and signed-in navigation with a real account.
