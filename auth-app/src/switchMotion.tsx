import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, Ref } from "react";
import {
  boxVars, GIVE_UP_MS, heightPlan, holdStep, measureActive, paneClass, reducedMotion, sameBox, SLIDE_MS, SLOW_MS, startHold,
} from "./switchHold";
import type { Box, HoldState } from "./switchHold";
import "./switchMotion.css";

/**
 * The calm way to switch between tabs. Three small parts, used by every channel switch so they all feel the same:
 *
 *   - `useSlide`: the mark under the active tab slides to the new one (the fill is a child of the control, moved with
 *     a transform), and the labels ease their colour;
 *   - `useHeldView`: while the next list is read, the previous one stays, so there is no empty list and no loader;
 *   - `SwitchPane`: the list that arrives comes in with a short fade and a few pixels of rise, and the height of what
 *     is below the tabs moves to the new height instead of jumping.
 *
 * Plain CSS transitions and a little state. With the system's wish for less motion (`prefers-reduced-motion`) nothing
 * moves: the mark and the list are simply where they should be.
 */

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** The system's wish for less movement, kept up to date. */
export function useReducedMotion(): boolean {
  const [on, setOn] = useState(reducedMotion);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setOn(mq.matches);
    read();
    mq.addEventListener?.("change", read);
    return () => mq.removeEventListener?.("change", read);
  }, []);
  return on;
}

/* ── the sliding mark ── */

/**
 * For a control whose active tab is told apart by `selector` (its own `aria-pressed` or `aria-checked`). Spread
 * `host` on the control (with the `sw-host` class) and put `mark` first inside it. Until the tab has been measured
 * (before the first paint, or where nothing is laid out) the control looks as it always did: the active button is
 * filled itself.
 */
export function useSlide<E extends HTMLElement>(selector: string): {
  host: { ref: Ref<E>; "data-sw"?: "on" | "live"; style?: CSSProperties };
  mark: JSX.Element;
} {
  const ref = useRef<E>(null);
  const [slide, setSlide] = useState<{ box: Box | null; live: boolean }>({ box: null, live: false });
  /* A measure that keeps finding a different box (the layout moving under its own answer) is stopped after a few in one
     frame: the mark may be a pixel off, the page does not loop. A measure that finds the same box does nothing at all. */
  const burst = useRef({ n: 0, frame: 0 });
  const last = useRef<Box | null>(null);
  const measure = () => {
    const host = ref.current;
    if (!host) return;
    const box = measureActive(host, selector);
    if (sameBox(last.current, box)) return;
    const b = burst.current;
    if (b.n >= 6) return;
    if (!b.frame) b.frame = window.requestAnimationFrame(() => { b.n = 0; b.frame = 0; });
    b.n += 1;
    last.current = box;
    setSlide((s) => (sameBox(s.box, box) ? s : { ...s, box }));
  };

  // After every commit: a count that grew or a label that changed moves the tabs without moving this component.
  useIsoLayoutEffect(measure);

  // And whenever the control or one of its tabs changes size by itself (a font arriving, the window, a breakpoint).
  useEffect(() => {
    const host = ref.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    host.querySelectorAll("button").forEach((b) => ro.observe(b));
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector]);

  // The first placement is not an animation: only moves after it are.
  const placed = slide.box !== null;
  useEffect(() => {
    if (!placed || slide.live) return;
    const id = window.requestAnimationFrame(() => setSlide((s) => ({ ...s, live: true })));
    return () => window.cancelAnimationFrame(id);
  }, [placed, slide.live]);

  const host: { ref: Ref<E>; "data-sw"?: "on" | "live"; style?: CSSProperties } = { ref };
  if (slide.box) {
    host["data-sw"] = slide.live ? "live" : "on";
    host.style = boxVars(slide.box) as CSSProperties;
  }
  return { host, mark: <span className="sw-ind" aria-hidden="true" /> };
}

/* ── what stays while the next list is read ── */

/**
 * `live` is the page's own value; `key` says which list it is (the filters, in a string) and `ready` that the list
 * for `key` has arrived whole. While a new key is read the value returned is the one that was on screen, so a switch
 * never shows an empty list or a loader. Past `SLOW_MS` `slow` is true (the list goes a little paler), and past
 * `GIVE_UP_MS` the live value is shown as it is. A different `scope` is a different list: nothing is held across it.
 */
export function useHeldView<T>(live: T, o: {
  key: string;
  scope?: string;
  ready: boolean;
  holdable?: (v: T) => boolean;
}): { value: T; shownKey: string; holding: boolean; slow: boolean } {
  const scope = o.scope ?? "";
  const committed = useRef<HoldState<T> | null>(null);
  const [late, setLate] = useState<{ seq: number; slow: boolean; gaveUp: boolean } | null>(null);
  const out = holdStep(committed.current ?? startHold(live, o.key, scope), {
    key: o.key, scope, live, ready: o.ready, giveUpSeq: late?.gaveUp ? late.seq : null, holdable: o.holdable ?? (() => true),
  });
  useIsoLayoutEffect(() => { committed.current = out.state; });

  const { holding, seq } = out;
  useEffect(() => {
    if (!holding) return;
    const slow = window.setTimeout(() => setLate((l) => ({ seq, slow: true, gaveUp: l?.seq === seq && l.gaveUp })), SLOW_MS);
    const giveUp = window.setTimeout(() => setLate({ seq, slow: true, gaveUp: true }), GIVE_UP_MS);
    return () => { window.clearTimeout(slow); window.clearTimeout(giveUp); };
  }, [holding, seq]);

  return { value: out.value, shownKey: out.shownKey, holding, slow: holding && late?.seq === seq && late.slow };
}

/* ── the list that comes in ── */

/**
 * The list under a switch. `k` names what is in it: when it changes the new content comes in with a short fade and a
 * few pixels of rise, and never the first time it is drawn. `settle` (by default `k`) names the moment its height may
 * change: the box moves from the height it had to the height the new content needs, instead of jumping. `busy` is a
 * slow switch under way: the content stays, a little paler.
 */
export function SwitchPane({ k, settle = k, busy = false, children }: {
  k: string;
  settle?: string;
  busy?: boolean;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const lastK = useRef(k);
  const lastSettle = useRef(settle);
  const switched = useRef(false);
  const from = useRef<number | null>(null);
  if (lastK.current !== k) { lastK.current = k; switched.current = true; }
  // Read while the DOM still shows what is going away: this is the height the box moves from.
  if (lastSettle.current !== settle) { lastSettle.current = settle; from.current = box.current ? box.current.offsetHeight : null; }

  useIsoLayoutEffect(() => {
    const el = box.current;
    const was = from.current;
    from.current = null;
    if (!el || was === null) return;
    el.style.transition = "none";
    el.style.height = "";
    const plan = heightPlan(was, el.offsetHeight, reduced);
    if (!plan) { el.style.transition = ""; return; }
    el.style.overflow = "hidden";
    el.style.height = `${plan.from}px`;
    void el.offsetHeight; // the box is at its old height before it is told to move
    el.style.transition = `height ${SLIDE_MS}ms var(--ease-out)`;
    el.style.height = `${plan.to}px`;
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      el.removeEventListener("transitionend", onEnd);
      el.style.height = "";
      el.style.overflow = "";
      el.style.transition = "";
    };
    const onEnd = (e: TransitionEvent) => { if (e.target === el && e.propertyName === "height") end(); };
    const timer = window.setTimeout(end, SLIDE_MS + 80);
    el.addEventListener("transitionend", onEnd);
    return end;
  }, [settle]);

  return (
    <div ref={box} className={`sw-box${busy ? " is-busy" : ""}`}>
      <div key={k} className={paneClass(switched.current, reduced)}>{children}</div>
    </div>
  );
}
