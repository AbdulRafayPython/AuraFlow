import * as React from "react";

/**
 * useScrollDirection — tracks the dominant scroll direction of a target
 * element so a sticky / fixed UI chrome (bottom nav, header) can slide
 * out of the way on "down" and reappear on "up".
 *
 *   const ref = useRef<HTMLDivElement>(null);
 *   const dir = useScrollDirection(ref);
 *   <nav className={dir === "down" ? "translate-y-full" : ""}>
 *
 * If no ref is passed, the window is used as the scroll source.
 */

type Direction = "up" | "down" | null;

interface Options {
  /** Ignore deltas smaller than this (in px). Prevents jitter. */
  threshold?: number;
}

export function useScrollDirection(
  target?: React.RefObject<HTMLElement | null>,
  { threshold = 8 }: Options = {},
): Direction {
  const [direction, setDirection] = React.useState<Direction>(null);

  React.useEffect(() => {
    const el: HTMLElement | Window =
      target?.current ?? (typeof window !== "undefined" ? window : (null as any));
    if (!el) return;

    let lastY = getScrollTop(el);
    let ticking = false;

    const handle = () => {
      const y = getScrollTop(el);
      const dy = y - lastY;
      if (Math.abs(dy) >= threshold) {
        setDirection(dy > 0 ? "down" : "up");
        lastY = y;
      }
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(handle);
        ticking = true;
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll as EventListener);
  }, [target, threshold]);

  return direction;
}

function getScrollTop(el: HTMLElement | Window): number {
  if (el instanceof Window) return el.scrollY;
  return el.scrollTop;
}
