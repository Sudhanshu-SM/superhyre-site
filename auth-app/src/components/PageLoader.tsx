import { useEffect, useState } from "react";
import { Loader } from "./Loader";

/* When a page loader was last on screen, so one handed to another does not wait out its beat again and blink. */
let lastOn = Number.NEGATIVE_INFINITY;
const HANDOVER_MS = 700;
/* While the app is still starting it is already being waited on (the start-up loader was on screen): no beat either. */
const STARTING_MS = 4000;

/**
 * A whole page waiting: the SuperHyre loader in the middle of the window and nowhere else.
 *
 * It is the same loader in the same place as the one the app shows while it starts (`.boot`), so from the first frame to the page's
 * own data it never moves. It takes no room and no pointer: what arrives does not push it, and it holds nothing up. (It used to sit
 * in the console's 620px reading column at half the window's height, which is why it jumped when the console arrived and again
 * when the page did.) It stays out of sight for a moment, so a page that arrives at once never shows it flashing, unless a loader
 * was just on screen: then it is in sight at once, so the wait is one wait.
 */
export function PageLoader({ label = "Loading" }: { label?: string }): JSX.Element {
  /* Decided once, when it appears: a later render must not cancel the beat of a loader that began with one. */
  const [immediate] = useState(() => {
    const now = typeof performance === "undefined" ? 0 : performance.now();
    return now - lastOn < HANDOVER_MS || now < STARTING_MS;
  });
  useEffect(() => {
    const t = window.setInterval(() => { lastOn = performance.now(); }, 200);
    lastOn = performance.now();
    return () => { window.clearInterval(t); lastOn = performance.now(); };
  }, []);
  return <div className={`ldr-page${immediate ? " is-now" : ""}`} aria-busy="true"><Loader size="lg" label={label} /></div>;
}
