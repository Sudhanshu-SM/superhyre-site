import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Keyboard focus for things that sit over the page (dialogs, the quick find, a side sheet).
 *
 * Three promises, each of them was broken: Tab goes round inside the overlay instead of into the sidebar behind it,
 * focus is inside it while it is open, and when it closes focus goes back to what opened it (the button the person
 * clicked, not the top of the page). The pure parts are exported so they can be pinned without a browser.
 */

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type=\"hidden\"])", "select:not([disabled])",
  "textarea:not([disabled])", "summary", "[tabindex]:not([tabindex=\"-1\"])", "[contenteditable=\"true\"]",
].join(",");

/** The tab stops inside `root`, in document order: visible ones only, none inside something hidden or inert. */
export function tabStops(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.closest("[inert], [aria-hidden=\"true\"]")) return false;
    if (el.tabIndex < 0) return false;
    const rects = el.getClientRects();
    return rects.length > 0 && getComputedStyle(el).visibility !== "hidden";
  });
}

/**
 * Where Tab (or Shift+Tab) goes from `active`, when it must stay inside: the other end of the list from the
 * edge it is leaving, or null when the browser's own step is already inside.
 */
export function wrapTarget<T>(stops: readonly T[], active: T | null, backwards: boolean): T | null {
  if (stops.length === 0) return null;
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  if (active === null || !stops.includes(active)) return backwards ? last : first;
  if (backwards && active === first) return last;
  if (!backwards && active === last) return first;
  return null;
}

/** Called from a keydown on the overlay (or the document while it is open); true when it moved focus. */
export function trapTab(root: HTMLElement, e: KeyboardEvent): boolean {
  if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return false;
  const active = document.activeElement as HTMLElement | null;
  // Focus is in something that opened above this overlay (a menu, a picker, a second dialog: all portalled to the
  // page, outside the app's own root): that one is holding it, so leave it alone. Anywhere else in the app (the
  // sidebar behind the overlay) is pulled back in.
  const app = document.getElementById("root");
  if (active && active !== document.body && !root.contains(active) && !(app && app.contains(active))) return false;
  const stops = tabStops(root);
  if (stops.length === 0) {
    e.preventDefault();
    root.focus({ preventScroll: true });
    return true;
  }
  const to = wrapTarget(stops, root.contains(active) ? active : null, e.shiftKey);
  if (!to) return false;
  e.preventDefault();
  to.focus({ preventScroll: true });
  return true;
}

/* ── what opened it ── */

let lastActivated: HTMLElement | null = null;
if (typeof document !== "undefined") {
  // A click that does not focus (a script's, a touch's) still says which control was used.
  document.addEventListener(
    "click",
    (e) => {
      const hit = (e.target as Element | null)?.closest?.("button, a[href], [role=\"button\"], [role=\"menuitem\"], summary");
      if (hit) lastActivated = hit as HTMLElement;
    },
    true,
  );
}

/** The control that is opening something now: the focused one, else the one just activated. */
export function openerNow(): HTMLElement | null {
  const a = document.activeElement as HTMLElement | null;
  if (a && a !== document.body && a !== document.documentElement) return a;
  return lastActivated && lastActivated.isConnected ? lastActivated : null;
}

/** Puts focus back on what opened an overlay; on the page's main area when that has gone. */
export function restoreFocus(opener: HTMLElement | null): void {
  if (opener && opener.isConnected) {
    opener.focus({ preventScroll: true });
    return;
  }
  document.getElementById("con-main")?.focus({ preventScroll: true });
}

/**
 * Holds Tab inside `ref` while `active`, puts focus inside when it opens (unless it already is), and returns it to
 * the opener when it closes.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, opts: { focusFirst?: boolean; restore?: boolean } = {}): void {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const opener = openerNow();
    if (!root.contains(document.activeElement)) {
      if (opts.focusFirst) (tabStops(root)[0] ?? root).focus({ preventScroll: true });
      else if (root.tabIndex >= 0) root.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => { trapTab(root, e); };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (opts.restore !== false) restoreFocus(opener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
