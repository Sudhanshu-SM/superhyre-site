/**
 * Did the sign-in window really open? A browser that blocks a pop-up can still hand back a window object that never
 * shows, so "the page has the window" proves nothing. What does: this page lost focus (the window took it) or is
 * hidden. If, after a few seconds, it still has focus and sits in front, nothing opened, and the sign-in goes in this
 * tab instead (the person is brought back to the chat afterwards: connectReturn.ts).
 */

/** How long a window gets to take focus before it is taken for blocked. */
export const OPEN_MS = 3_000;

export type OpenEnv = {
  onBlur: (fn: () => void) => () => void;
  hasFocus: () => boolean;
  hidden: () => boolean;
  later: (fn: () => void, ms: number) => () => void;
};

const browser = (): OpenEnv => ({
  onBlur: (fn) => {
    window.addEventListener("blur", fn);
    return () => window.removeEventListener("blur", fn);
  },
  hasFocus: () => document.hasFocus(),
  hidden: () => document.visibilityState === "hidden",
  later: (fn, ms) => {
    const id = window.setTimeout(fn, ms);
    return () => window.clearTimeout(id);
  },
});

/** Calls `onNothingOpened` once if no window took focus within `ms`. Returns a way to stop watching. */
export function watchOpened(onNothingOpened: () => void, ms: number = OPEN_MS, env: OpenEnv = browser()): () => void {
  let lost = false;
  const stopBlur = env.onBlur(() => { lost = true; });
  const stopTimer = env.later(() => {
    stopBlur();
    if (!lost && env.hasFocus() && !env.hidden()) onNothingOpened();
  }, ms);
  return () => { stopBlur(); stopTimer(); };
}
