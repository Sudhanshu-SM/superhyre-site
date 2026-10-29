import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
/* Measuring has to happen before paint; on a server there is nothing to measure. */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** What one row does when the list changed: slide in (the nth new one, so they come one after another), or glide `dy` px to where it now is. */
export type Glide = { key: string; kind: "in"; nth: number } | { key: string; kind: "move"; dy: number };

/** A section is measured and never moved: its rows glide on their own, and moving both would carry each row twice as far. */
const isSection = (key: string) => key.startsWith("sec:");

/**
 * What every row should do, from where each was (`before`) and is now (`now`), both measured on the layout alone (not on a glide that
 * was still running), and from how far a glide that is still running had already carried each (`carried`, so a row that is interrupted
 * carries on from where it was seen to be). `keys` are in document order and `parent` names the nearest row or card that holds each one:
 * a row inside a card that moves rides with it, so it glides only the distance it moves more than the card, and inside a card that
 * slides in it needs no glide of its own. A key held by more than one element (two lists showing the same chat) is left alone rather
 * than guessed at.
 */
export function planGlides(
  keys: readonly string[],
  before: ReadonlyMap<string, number>,
  now: ReadonlyMap<string, number>,
  parent: ReadonlyMap<string, string | null> = new Map(),
  carried: ReadonlyMap<string, number> = new Map(),
): Glide[] {
  const counted = new Map<string, number>();
  for (const key of keys) counted.set(key, (counted.get(key) ?? 0) + 1);
  const out: Glide[] = [];
  /* How far the layout moved the row, or the card around it that moves: what a row inside rides along with. */
  const ride = new Map<string, number>();
  const entering = new Set<string>();
  let nth = 0;
  for (const key of keys) {
    if (isSection(key) || (counted.get(key) ?? 0) > 1) continue;
    const holder = parent.get(key) ?? null;
    if (holder !== null && entering.has(holder)) {
      entering.add(key);
      continue;
    }
    const along = holder !== null ? (ride.get(holder) ?? 0) : 0;
    const was = before.get(key);
    if (was === undefined) {
      entering.add(key);
      out.push({ key, kind: "in", nth: Math.min(nth++, 12) });
      continue;
    }
    const shift = was - (now.get(key) ?? was);
    const dy = shift - along + (carried.get(key) ?? 0);
    if (Math.abs(dy) > 1) {
      ride.set(key, shift);
      out.push({ key, kind: "move", dy });
    } else {
      ride.set(key, along);
    }
  }
  return out;
}

/** How far a glide that is still running has carried the element down the page. */
function carriedBy(el: HTMLElement): number {
  const transform = getComputedStyle(el).transform;
  if (!transform || transform === "none" || typeof DOMMatrixReadOnly === "undefined") return 0;
  return new DOMMatrixReadOnly(transform).m42;
}

/** The nearest element above this one that is itself followed (sections are not rows: they are skipped). */
function holderOf(el: HTMLElement): string | null {
  let up = el.parentElement?.closest<HTMLElement>("[data-flip]") ?? null;
  while (up && isSection(up.dataset.flip ?? "")) up = up.parentElement?.closest<HTMLElement>("[data-flip]") ?? null;
  return up?.dataset.flip ?? null;
}

/**
 * Rows that move glide to where they now are rather than jumping: pinning one lifts it to the top, a new chat slides
 * in, "View more" brings its rows in one after another. Every element with `data-flip` under the box is followed by that
 * key, so a key is held by one element only. It only runs when `signature` (the keys, in order) has changed, so hovering,
 * scrolling and folding a section are left alone, and it does nothing for someone who asked their system for less motion.
 */
export function useFlip(box: RefObject<HTMLElement>, signature: string) {
  const last = useRef<{ signature: string; tops: Map<string, number> } | null>(null);
  useBeforePaint(() => {
    const root = box.current;
    if (!root) return;
    const base = root.getBoundingClientRect().top - root.scrollTop;
    const els = [...root.querySelectorAll<HTMLElement>("[data-flip]")];
    const carried = new Map(els.map((el) => [el.dataset.flip!, carriedBy(el)]));
    /* The layout's own place: a glide still running moves the element, and that is not where the list put it. */
    const tops = new Map(els.map((el) => [el.dataset.flip!, el.getBoundingClientRect().top - base - (carried.get(el.dataset.flip!) ?? 0)]));
    const before = last.current;
    last.current = { signature, tops };
    if (!before || before.signature === signature) return;
    if (typeof Element.prototype.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const byKey = new Map(els.map((el) => [el.dataset.flip!, el]));
    const glides = planGlides(
      els.map((el) => el.dataset.flip!),
      before.tops,
      tops,
      new Map(els.map((el) => [el.dataset.flip!, holderOf(el)])),
      carried,
    );
    for (const g of glides) {
      const el = byKey.get(g.key);
      if (!el) continue;
      if (g.kind === "in") {
        el.animate(
          [{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }],
          { duration: 280, delay: g.nth * 24, easing: EASE, fill: "backwards" },
        );
      } else {
        el.animate([{ transform: `translateY(${g.dy}px)` }, { transform: "none" }], { duration: 300, easing: EASE });
      }
    }
  });
}
