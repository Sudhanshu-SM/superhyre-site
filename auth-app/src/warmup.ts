import { useEffect, useState } from "react";

/**
 * Holds a page's first paint for a short beat on fixtures, so the loader is seen to give way to the page instead of
 * flashing. Connected, the page waits on its own requests, not on this.
 */
export function useWarmup(ms = 650): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setReady(true), reduce ? 0 : ms);
    return () => window.clearTimeout(t);
  }, [ms]);
  return ready;
}
