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

/* ── a page size the person chooses ──
   The window-fitted size above is "Auto". On top of it a list offers fixed sizes that fit how many people it holds:
   25, 50 and 100 always; 500 once there are more than 500; 1000 once there are more than 1,000. 266 people can have
   pages of at most 100. */

export const SIZE_STEPS = [25, 50, 100, 500, 1000] as const;

/** The fixed page sizes worth offering for a list of `total`; none when everything already fits the smallest. */
export function pageSizeChoices(total: number | null): number[] {
  if (total === null || total <= SIZE_STEPS[0]) return [];
  return SIZE_STEPS.filter((n) => n < total && (n <= 100 || (n === 500 && total > 500) || (n === 1000 && total > 1000)));
}

export type SizeChoice = "auto" | number;

const KEY = (page: string) => `superhyre.pagesize.${page}`;

function readChoice(page: string): SizeChoice {
  try {
    const raw = window.localStorage.getItem(KEY(page));
    const n = Number(raw);
    return raw && (SIZE_STEPS as readonly number[]).includes(n) ? n : "auto";
  } catch {
    return "auto";
  }
}

/** The size a list uses: the chosen one cut to what its count allows, else the window's. Remembered per list. */
export function effectiveSize(choice: SizeChoice, auto: number, choices: readonly number[]): number {
  if (choice === "auto") return auto;
  if (!choices.length) return choice;
  const fits = choices.filter((c) => c <= choice);
  return fits.length ? Math.max(...fits) : (choices[0] as number);
}

export function usePageSizeChoice(page: string, auto: number, total: number | null) {
  const [choice, setChoice] = useState<SizeChoice>(() => (typeof window === "undefined" ? "auto" : readChoice(page)));
  const choices = pageSizeChoices(total);
  const size = effectiveSize(choice, auto, choices);
  const choose = (next: SizeChoice) => {
    setChoice(next);
    try { if (next === "auto") window.localStorage.removeItem(KEY(page)); else window.localStorage.setItem(KEY(page), String(next)); } catch { /* not worth failing over */ }
  };
  const value: SizeChoice = choice === "auto" ? "auto" : size;
  return { size, picker: { choices, value, onChoose: choose } };
}
