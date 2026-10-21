/**
 * Watching an email that is going out. Approving, trying again or cancelling answers at once, but the send itself
 * happens a moment later (a second or two for one that is due now), so the page that asked has to look again until the
 * email is sent or has failed. Quick at first, then slower, then it stops: a send that is still not settled after
 * the last look is left to the next time the page is read.
 */

export const SEND_POLL_MS: readonly number[] = [1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 10000, 15000, 15000, 15000, 15000];

/** An email due within this long is going out now; one set up for later is just waiting. */
export const GOING_OUT_MS = 90_000;
/** A send due within this long has started as far as the person can tell: it is no longer theirs to cancel. */
const CANCEL_UNTIL_MS = 5_000;

/**
 * Whether an outgoing email is on its way: approved or scheduled (the API says "scheduled" for both, and for one being
 * sent) with its time not more than a moment ahead. `when` is the time it is due, null when the API gave none.
 */
export function isGoingOut(email: { direction: string; status: string }, when: string | null, now = Date.now()): boolean {
  if (email.direction !== "out" || email.status !== "scheduled") return false;
  const at = when ? Date.parse(when) : Number.NaN;
  return !Number.isFinite(at) || at - now <= GOING_OUT_MS;
}

/** Whether "Cancel the send" may still be offered: only for a send that is clearly still ahead, never one that is due or started. */
export function mayCancelSend(canCancel: boolean, when: string | null, now = Date.now()): boolean {
  const at = when ? Date.parse(when) : Number.NaN;
  return canCancel && Number.isFinite(at) && at - now > CANCEL_UNTIL_MS;
}

type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (id: unknown) => void };
const real: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) };

/**
 * Calls `look` after each delay, for as long as it says the email is still going out, and stops when it says it is not
 * (sent or failed), when the delays are used up, or when the returned function is called. A look that throws counts as
 * "still going out": a network blip must not end the watch.
 */
export function watchSend(look: () => Promise<boolean> | boolean, delays: readonly number[] = SEND_POLL_MS, timers: Timers = real): () => void {
  let stopped = false;
  let step = 0;
  let timer: unknown;
  const next = () => {
    const wait = delays[step++];
    if (stopped || wait === undefined) return;
    timer = timers.set(() => {
      void (async () => {
        let again = true;
        try { again = await look(); } catch { again = true; }
        if (again && !stopped) next();
      })();
    }, wait);
  };
  next();
  return () => { stopped = true; timers.clear(timer); };
}
