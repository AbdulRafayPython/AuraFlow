// Scroll motion for the landing page, kept tiny and dependency-free.
// - useReveal(): elements with [data-reveal] rise + fade in once when they
//   enter the viewport (class "is-in"; delay from data-delay in ms).
// - useScrollProgress(): 0..1 progress of an element. "pin" = through a tall
//   section whose child is position: sticky; "pass" = from entering the
//   bottom of the screen to leaving the top (for parallax / tilt).
// Native scrolling is never taken over; everything reads scroll position in
// one rAF per frame. Reduced motion: reveals are instant, progress still
// reports (callers decide to freeze).
import { useEffect, useRef, useState } from "react";

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function useReveal(root: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-reveal]"));
    items.forEach((item) => {
      const d = item.dataset.delay;
      if (d) item.style.setProperty("--reveal-delay", `${d}ms`);
    });
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      items.forEach((item) => item.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    items.forEach((item) => io.observe(item));
    return () => io.disconnect();
  }, [root]);
}

export function useScrollProgress<T extends HTMLElement>(mode: "pin" | "pass" = "pin") {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      let p: number;
      if (mode === "pin") {
        const travel = r.height - vh;
        p = travel > 0 ? -r.top / travel : r.top < 0 ? 1 : 0;
      } else {
        p = (vh - r.top) / (vh + r.height);
      }
      p = Math.min(1, Math.max(0, p));
      setProgress((prev) => (Math.abs(prev - p) < 0.001 ? prev : p));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [mode]);
  return [ref, progress] as const;
}

/** True once the element has been on screen (for one-shot scripted demos). */
export function useInView<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

/** Map a 0..1 progress onto a sub-range, clamped (e.g. step 2 of 3). */
export const range = (p: number, from: number, to: number) => Math.min(1, Math.max(0, (p - from) / (to - from)));
