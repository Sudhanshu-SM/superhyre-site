import { useCallback, useEffect, useState } from "react";
import { useFlight } from "../setup/lean/flight";

/**
 * When the first-run tour shows, and what it remembers.
 *
 *   pending   set (in this tab's session) when someone finishes set-up or joins a team: "show them around once".
 *   seen      kept in localStorage per person: once they have started, finished or skipped it, never again on its own.
 *
 * The seeded accounts and anyone who signs in as usual never have the pending mark, so the tour does not pop up on
 * every login; "Take the tour" (the account menu, Support) asks for it by name and ignores both marks.
 * Every storage call can throw (a private window, blocked site data), so each is wrapped and the tour simply does
 * not show rather than the console failing.
 */

const PENDING_KEY = "superhyre.tour.pending";
const seenKey = (userId: string): string => `superhyre.tour.seen.${userId}`;
/** The one event "Take the tour" fires; the console's tour host listens for it. */
export const TOUR_EVENT = "superhyre:tour";

export type TourStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function local(): TourStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
function session(): TourStore | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Someone has just finished set-up or joined a team: the next time the console is up, show them around. */
export function markPending(userId: string | null | undefined, store: TourStore | null = session()): void {
  if (!userId || !store) return;
  try {
    store.setItem(PENDING_KEY, userId);
  } catch {
    /* the tour just does not show */
  }
}

export function hasSeen(userId: string, store: TourStore | null = local()): boolean {
  try {
    return store?.getItem(seenKey(userId)) === "1";
  } catch {
    return false;
  }
}

/** Started, finished or skipped: remembered for this person, and the pending mark is spent. */
export function markSeen(userId: string, store: TourStore | null = local(), pending: TourStore | null = session()): void {
  try {
    store?.setItem(seenKey(userId), "1");
  } catch {
    /* not worth failing over */
  }
  try {
    if (pending?.getItem(PENDING_KEY) === userId) pending.removeItem(PENDING_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Whether the tour starts by itself for this person now: they are new here, and have not seen it. */
export function shouldAutoStart(userId: string | null | undefined, store: TourStore | null = local(), pending: TourStore | null = session()): boolean {
  if (!userId) return false;
  try {
    return pending?.getItem(PENDING_KEY) === userId && !hasSeen(userId, store);
  } catch {
    return false;
  }
}

/** "Take the tour": opens it again, whether or not it has been seen. */
export function requestTour(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TOUR_EVENT));
}

export type TourPhase = "off" | "intro" | "guided";

/**
 * The tour's state: off, the three slides, or the guided walk. It starts by itself once the arrival scene has
 * gone (so it never opens under it), only for someone who was just let in, and only once.
 */
export function useTour(userId: string | null | undefined): {
  phase: TourPhase;
  guide: () => void;
  close: () => void;
} {
  const [phase, setPhase] = useState<TourPhase>("off");
  const flying = useFlight().phase !== "idle";

  useEffect(() => {
    if (!userId || flying || phase !== "off" || !shouldAutoStart(userId)) return;
    // A beat after the console has settled, so it does not land on top of the page's own first paint.
    const t = window.setTimeout(() => {
      markSeen(userId);
      setPhase("intro");
    }, 700);
    return () => window.clearTimeout(t);
  }, [userId, flying, phase]);

  useEffect(() => {
    const on = () => setPhase("intro");
    window.addEventListener(TOUR_EVENT, on);
    return () => window.removeEventListener(TOUR_EVENT, on);
  }, []);

  const guide = useCallback(() => setPhase("guided"), []);
  const close = useCallback(() => {
    if (userId) markSeen(userId);
    setPhase("off");
  }, [userId]);
  return { phase, guide, close };
}
