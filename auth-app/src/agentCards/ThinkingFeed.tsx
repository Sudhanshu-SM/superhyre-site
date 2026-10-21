import { ArrowRight } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { FEED_LIFE_MS, visibleFeed } from "../agentFeed";
import type { FeedLine } from "../agentFeed";

/**
 * What the search is doing right now, as short lines that rise and fade under "Matching candidates to the role":
 * the must-haves it matches on, whose profile it is reading, how a group went, who is a strong fit. The newest
 * line is at the bottom; each fades in, drifts up and is gone in about six seconds, three to five on screen.
 *
 * Every line is made by the search from what it really did (the server says it in `feed` events), so this is
 * narration of the work, not a show. With reduced motion it is one line, the latest, standing still.
 */

/** Whether the person asked for less motion. Read once, and again if they change it. */
export function useReducedMotion(): boolean {
  const query = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  const [reduced, setReduced] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const q = query();
    if (!q) return;
    const on = () => setReduced(q.matches);
    on();
    q.addEventListener?.("change", on);
    return () => q.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** The clock, ticking while there is something on screen to fade. */
function useClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 400);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

export function ThinkingFeed({ lines, now: at, reduced: still }: {
  lines: readonly FeedLine[];
  /** The time to draw at; the clock's, unless a test sets it. */
  now?: number;
  /** Whether to hold still; the person's setting, unless a test sets it. */
  reduced?: boolean;
}): JSX.Element | null {
  const asked = useReducedMotion();
  const reduced = still ?? asked;
  const alive = lines.some((l) => l.at > 0);
  const clock = useClock(alive && at === undefined);
  const now = at ?? clock;
  const shown = visibleFeed(lines, now);
  /* Between two lines, while the search still works, the slot keeps its height: the box collapsing and opening
     again every few seconds moved everything above it (and, with the transcript following its end, hopped the
     whole run up and down). It is gone with the run, which is when PhaseTimeline stops drawing it. */
  if (!shown.length) return reduced || lines.length === 0 ? null : <ul className="pt-feed" aria-hidden="true" />;
  const rows = reduced ? shown.slice(-1) : shown;
  return (
    <ul className={`pt-feed${reduced ? " is-still" : ""}`} aria-hidden="true" style={{ ["--feed-life" as string]: `${FEED_LIFE_MS}ms` }}>
      {rows.map((l) => (
        <li key={l.seq} className="pt-feed-line">
          <ArrowRight size={11} weight="bold" aria-hidden="true" />
          <span>{l.text}</span>
        </li>
      ))}
    </ul>
  );
}
