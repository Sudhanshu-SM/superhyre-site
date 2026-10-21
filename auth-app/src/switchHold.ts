/**
 * The logic under the calm switches (Outreach's channel switch, Analytics' channel tabs). Pure on purpose: what the
 * page keeps on screen while the next list is read, where the sliding mark goes, and whether the height moves are all
 * decided here and tested without a browser; switchMotion.tsx only wires them to React and the DOM.
 */

/** The mark under the active tab slides in this long, and so does the height of the list. */
export const SLIDE_MS = 200;
/** The new list comes in over this long. */
export const PANE_MS = 180;
/** A switch that takes longer than this says so: the list on screen goes a little paler. Quicker is not shown at all. */
export const SLOW_MS = 250;
/** A switch that has not been answered by now is shown as it is (a loader), not held for ever. */
export const GIVE_UP_MS = 8000;

/* ── what stays on screen while the next list is read ── */

export type HoldState<T> = {
  /** The key of the list the page was last asked for. */
  key: string;
  /** Which switch this is the n-th of: a new one starts whenever the key moves. */
  seq: number;
  /** The scope the held value belongs to (a different campaign is a different list altogether). */
  scope: string;
  /** The key being waited for, or null when nothing is. */
  pending: string | null;
  /** What was last on screen for good. */
  shown: { value: T; key: string } | null;
};

export type HoldInput<T> = {
  /** Which list is wanted now: the filters, in a string. */
  key: string;
  scope: string;
  /** The page's own latest value: loading, ready or anything between. */
  live: T;
  /** The answer to `key` is whole: the lists and the rows under the ones that are open. */
  ready: boolean;
  /** The switch the page has stopped waiting for, if any. */
  giveUpSeq: number | null;
  /** Whether what is on screen can stand in for the next list (a failure, or nothing yet, cannot). */
  holdable: (v: T) => boolean;
};

export function startHold<T>(live: T, key: string, scope: string): HoldState<T> {
  return { key, seq: 0, scope, pending: null, shown: { value: live, key } };
}

/** The number of the switch the state is in once `key` is asked for. */
export const seqFor = <T>(prev: HoldState<T>, key: string): number => (key !== prev.key ? prev.seq + 1 : prev.seq);

export type HoldOut<T> = { state: HoldState<T>; value: T; holding: boolean; seq: number; shownKey: string };

/**
 * One step: given what was committed before and what the page has now, what to show.
 *
 * While a new list is being read the previous one stays (no empty list, no loader), until the new one is whole.
 * It is let go at once when the answer is whole, when the page has given up waiting, when the scope changed, or
 * when there was nothing to hold. A value that moves under the same key (a group opened, a refresh) is shown as it
 * is: only a change of key is a switch.
 */
export function holdStep<T>(prev: HoldState<T>, i: HoldInput<T>): HoldOut<T> {
  const seq = seqFor(prev, i.key);
  const show = (): HoldOut<T> => ({
    state: { key: i.key, seq, scope: i.scope, pending: null, shown: { value: i.live, key: i.key } },
    value: i.live,
    holding: false,
    seq,
    shownKey: i.key,
  });
  if (prev.scope !== i.scope || prev.shown === null) return show();
  const pending = i.key !== prev.key ? i.key : prev.pending;
  const holding = pending !== null && !i.ready && i.giveUpSeq !== seq && i.holdable(prev.shown.value);
  if (!holding) return show();
  return {
    state: { key: i.key, seq, scope: i.scope, pending, shown: prev.shown },
    value: prev.shown.value,
    holding: true,
    seq,
    shownKey: prev.shown.key,
  };
}

/* ── the sliding mark ── */

export type Box = { x: number; y: number; w: number; h: number };

type Measurable = { querySelector(selector: string): { offsetLeft: number; offsetTop: number; offsetWidth: number; offsetHeight: number } | null };

/** Where the active tab is inside its control, or null when it cannot be told (not there, or not laid out yet). */
export function measureActive(host: Measurable, selector: string): Box | null {
  const el = host.querySelector(selector);
  if (!el || el.offsetWidth <= 0 || el.offsetHeight <= 0) return null;
  return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
}

export const sameBox = (a: Box | null, b: Box | null): boolean =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

/** The mark's position as the custom properties its stylesheet reads. */
export const boxVars = (b: Box): Record<string, string> => ({
  "--sw-x": `${b.x}px`, "--sw-y": `${b.y}px`, "--sw-w": `${b.w}px`, "--sw-h": `${b.h}px`,
});

/* ── the list that comes in ── */

/** Whether the height has anywhere to go: not when motion is off, not when it is not known, not for a hair. */
export function heightPlan(from: number | null, to: number, reduced: boolean): { from: number; to: number } | null {
  if (reduced || from === null || !(from > 0) || !(to > 0)) return null;
  return Math.abs(from - to) < 2 ? null : { from, to };
}

/** The classes of the list that is shown: it comes in only once the page has switched, and never with motion off. */
export const paneClass = (switched: boolean, reduced: boolean): string => (switched && !reduced ? "sw-pane is-enter" : "sw-pane");

/** The system's wish for less movement; false wherever it cannot be asked. */
export function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
