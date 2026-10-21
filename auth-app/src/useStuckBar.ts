import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * Marks a sticky bar `is-stuck` while it is pinned (it has been scrolled to its sticky offset), so the page can draw
 * its hairline only then. Set on the element directly: scrolling never re-renders the page.
 */
export function useStuckBar<E extends HTMLElement>(): RefObject<E> {
  const ref = useRef<E>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const pinned = parseFloat(getComputedStyle(el).top);
      el.classList.toggle("is-stuck", Number.isFinite(pinned) && el.getBoundingClientRect().top <= pinned + 0.5);
    };
    const on = () => { if (!frame) frame = window.requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", on, { passive: true, capture: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return ref;
}
