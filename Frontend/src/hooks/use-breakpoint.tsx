import * as React from "react";

/**
 * Returns booleans for each breakpoint band, derived from a single set of
 * matchMedia listeners. Use this instead of bare `window.innerWidth` checks
 * (those don't react to viewport changes without manual resize listeners).
 *
 * Bands match Tailwind defaults:
 *   isMobile  < 768
 *   isTablet  768–1023
 *   isDesktop ≥ 1024
 */
export function useBreakpoint() {
  const [state, setState] = React.useState(() => read());

  React.useEffect(() => {
    const mqlMobile = window.matchMedia("(max-width: 767px)");
    const mqlTablet = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");
    const update = () => setState(read());
    mqlMobile.addEventListener("change", update);
    mqlTablet.addEventListener("change", update);
    update();
    return () => {
      mqlMobile.removeEventListener("change", update);
      mqlTablet.removeEventListener("change", update);
    };
  }, []);

  return state;
}

function read() {
  if (typeof window === "undefined") {
    return { isMobile: false, isTablet: false, isDesktop: true };
  }
  const w = window.innerWidth;
  return {
    isMobile: w < 768,
    isTablet: w >= 768 && w < 1024,
    isDesktop: w >= 1024,
  };
}
