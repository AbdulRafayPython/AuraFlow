import * as React from "react";

/**
 * useEdgeSwipe — fires a callback when the user starts a touch near
 * the left edge of the viewport and swipes right far enough.
 *
 * Useful for opening a left-side drawer from inside a full-screen chat
 * view on mobile (iOS-style edge-pull).
 *
 *   const onSwipe = React.useCallback(() => setOpen(true), []);
 *   useEdgeSwipe({ onSwipe, enabled: isMobile });
 */

interface Options {
  /** Called once the gesture is confirmed. */
  onSwipe: () => void;
  /** Disable the listener entirely (e.g. on desktop). */
  enabled?: boolean;
  /** Max distance from the left edge where a touch can start (px). */
  edgeWidth?: number;
  /** Min horizontal travel before the gesture is recognized (px). */
  threshold?: number;
  /** Max vertical drift allowed during the gesture (px). */
  maxVerticalDrift?: number;
}

export function useEdgeSwipe({
  onSwipe,
  enabled = true,
  edgeWidth = 24,
  threshold = 60,
  maxVerticalDrift = 40,
}: Options) {
  // Stash callback in a ref so listeners are stable.
  const onSwipeRef = React.useRef(onSwipe);
  React.useEffect(() => {
    onSwipeRef.current = onSwipe;
  }, [onSwipe]);

  React.useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let fired = false;

    const handleStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX > edgeWidth) return;
      tracking = true;
      fired = false;
      startX = t.clientX;
      startY = t.clientY;
    };

    const handleMove = (e: TouchEvent) => {
      if (!tracking || fired) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dy > maxVerticalDrift) {
        tracking = false;
        return;
      }
      if (dx >= threshold) {
        fired = true;
        tracking = false;
        onSwipeRef.current();
      }
    };

    const handleEnd = () => {
      tracking = false;
    };

    document.addEventListener("touchstart", handleStart, { passive: true });
    document.addEventListener("touchmove", handleMove, { passive: true });
    document.addEventListener("touchend", handleEnd, { passive: true });
    document.addEventListener("touchcancel", handleEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleStart);
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleEnd);
      document.removeEventListener("touchcancel", handleEnd);
    };
  }, [enabled, edgeWidth, threshold, maxVerticalDrift]);
}
