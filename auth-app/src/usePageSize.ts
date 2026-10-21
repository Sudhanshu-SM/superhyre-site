import { useEffect, useLayoutEffect, useState } from "react";
import { scroller } from "./sectionMemory";

/**
 * How many rows a list page holds: as many as fit the window under the list's top, so a page fills the screen without
 * scrolling, between 10 and 30. Where it cannot be measured (no window, the list not drawn yet) it is 15.
 *
 * Measured when the list first appears and when the window is resized, not on scroll: the page size only moves when
 * the room does. A remembered page is kept as a row offset, so a new size lands on the page that holds the first row
 * the person was looking at (`clampedOffset` in sectionState.ts floors to the new page boundary).
 */

export const PAGE_FALLBACK = 15;
export const PAGE_MIN = 10;
export const PAGE_MAX = 30;
/** Pixels the pager under a list takes (its margin, rule and 36px controls), kept free so the bottom pager is on screen with a full page. */
export const PAGER_FOOT = 84;

/** Rows that fit `available` pixels at `rowHeight` each, held between `min` and `max`; the fallback for anything not measurable. */
export function fitRows(available: number, rowHeight: number, min = PAGE_MIN, max = PAGE_MAX, fallback = PAGE_FALLBACK): number {
  if (!Number.isFinite(available) || !Number.isFinite(rowHeight) || rowHeight <= 0 || available <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.floor(available / rowHeight)));
}

type Options = {
  /** False until the list is drawn (not its skeleton): measuring waits for it. */
  ready?: boolean;
  /** Pixels kept free under the list (the page's bottom padding) and any header row inside it. */
  reserve?: number;
  /** The element the list starts at; the page's `[data-pager-list]` by default. */
  selector?: string;
  /** A drawn row, so the real height replaces the one given; `gap` is the space between rows. */
  rowSelector?: string;
  gap?: number;
  min?: number;
  max?: number;
  fallback?: number;
};

const useLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function usePageSize(rowHeight: number, o: Options = {}): number {
  const { ready = true, reserve = 32, selector = "[data-pager-list]", rowSelector, gap = 0, min = PAGE_MIN, max = PAGE_MAX, fallback = PAGE_FALLBACK } = o;
  const [size, setSize] = useState(fallback);

  useLayout(() => {
    if (!ready || typeof document === "undefined") return;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return;
      const row = rowSelector ? el.querySelector<HTMLElement>(rowSelector) : null;
      const each = row && row.offsetHeight > 20 ? row.offsetHeight + gap : rowHeight;
      const top = el.getBoundingClientRect().top + scroller().top;
      const next = fitRows(window.innerHeight - top - reserve, each, min, max, fallback);
      setSize((cur) => (cur === next ? cur : next));
    };
    measure();
    let frame = 0;
    const on = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; measure(); });
    };
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("resize", on); if (frame) window.cancelAnimationFrame(frame); };
  }, [ready, rowHeight, reserve, selector, rowSelector, gap, min, max, fallback]);

  return size;
}
