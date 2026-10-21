import { useEffect, useRef } from "react";
import { forgetSection, loadSection, saveSection } from "./sectionState";

/**
 * The React side of sectionState.ts: write a section's state as it changes, and put the scroll back where it was.
 * Both are quiet and best-effort; a page works the same with no storage at all.
 */

/** Writes `state` for `section` shortly after it stops changing, and once more as the page goes away. `enabled` false keeps it from writing (before the first restore has landed, say). */
export function useSectionSave(section: string, state: object, enabled = true): void {
  const latest = useRef(state);
  latest.current = state;
  const text = JSON.stringify(state);
  useEffect(() => {
    if (!enabled) return;
    const id = window.setTimeout(() => saveSection(section, latest.current), 120);
    return () => window.clearTimeout(id);
  }, [section, text, enabled]);
  useEffect(() => {
    if (!enabled) return;
    const flush = () => saveSection(section, latest.current);
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [section, enabled]);
}

/** The element that scrolls the page: one named by `selector` (a list with its own scroller), else the main area when it has the scrollbar, else the document. */
export function scroller(selector?: string): { top: number; set: (y: number) => void } {
  const own = selector ? document.querySelector<HTMLElement>(selector) : null;
  if (own) return { top: own.scrollTop, set: (y) => { own.scrollTop = y; } };
  const main = document.querySelector<HTMLElement>(".con-main");
  if (main && main.scrollHeight > main.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(main).overflowY)) {
    return { top: main.scrollTop, set: (y) => { main.scrollTop = y; } };
  }
  const doc = document.scrollingElement ?? document.documentElement;
  return { top: doc.scrollTop, set: (y) => { doc.scrollTop = y; } };
}

const scrollKey = (section: string) => `${section}~scroll`;

/**
 * Remembers how far down `section` was scrolled, and brings it back once `ready` (the rows are on screen, so the page is
 * tall enough to go there). Nothing is restored over a deep link (`restore` false), and what a person does first (a
 * scroll of their own before the restore lands) wins.
 */
export function useScrollMemory(section: string, ready: boolean, restore = true, selector?: string): void {
  const y = useRef(0);
  const done = useRef(false);
  const touched = useRef(false);

  useEffect(() => {
    done.current = false;
    touched.current = false;
    y.current = 0;
  }, [section]);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    if (!restore) { forgetSection(scrollKey(section)); return; }
    const want = loadSection(scrollKey(section), (r) => (typeof r.y === "number" && r.y > 0 && r.y < 1e6 ? r.y : 0), 0);
    if (!want) return;
    const id = window.requestAnimationFrame(() => {
      if (touched.current) return;
      const s = scroller(selector);
      s.set(want);
      y.current = want;
    });
    return () => window.cancelAnimationFrame(id);
  }, [section, ready, restore, selector]);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      if (!done.current) { touched.current = true; return; }
      y.current = scroller(selector).top;
    };
    const on = () => { if (!frame) frame = window.requestAnimationFrame(read); };
    window.addEventListener("scroll", on, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", on, true);
      if (frame) window.cancelAnimationFrame(frame);
      if (done.current) saveSection(scrollKey(section), { y: Math.max(0, Math.round(y.current)) });
    };
  }, [section, selector]);
}
