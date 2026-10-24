import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
/* Measuring has to happen before paint; on a server there is nothing to measure. */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Rows that move glide to where they now are rather than jumping: pinning one lifts it to the top, a new chat slides
 * in, "View more" brings its rows in one after another. Every element with `data-flip` under the box is followed by that
 * key. It only runs when `signature` (the keys, in order) has changed, so hovering, scrolling and folding a section
 * are left alone, and it does nothing for someone who asked their system for less motion.
 */
export function useFlip(box: RefObject<HTMLElement>, signature: string) {
  const last = useRef<{ signature: string; tops: Map<string, number> } | null>(null);
  useBeforePaint(() => {
    const root = box.current;
    if (!root) return;
    const base = root.getBoundingClientRect().top - root.scrollTop;
    const els = [...root.querySelectorAll<HTMLElement>("[data-flip]")];
    const tops = new Map(els.map((el) => [el.dataset.flip!, el.getBoundingClientRect().top - base]));
    const before = last.current;
    last.current = { signature, tops };
    if (!before || before.signature === signature) return;
    if (typeof Element.prototype.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let fresh = 0;
    for (const el of els) {
      const key = el.dataset.flip!;
      const was = before.tops.get(key);
      if (was === undefined) {
        el.animate(
          [{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }],
          { duration: 280, delay: Math.min(fresh++, 12) * 24, easing: EASE, fill: "backwards" },
        );
      } else {
        const dy = was - tops.get(key)!;
        if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 300, easing: EASE });
      }
    }
  });
}
