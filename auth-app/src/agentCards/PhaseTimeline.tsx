import { CaretDown, CaretRight, Check, Minus, Stop } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { FIRST_WORDS, lineNote, running } from "../agentPhases";
import type { PhaseLine } from "../agentPhases";
import type { FeedLine } from "../agentFeed";
import { Loader } from "../components/Loader";
import { SlowNote } from "../components/SlowNote";
import { useSlowState } from "../slowState";
import { Cta } from "./Cta";
import { ThinkingFeed, useReducedMotion } from "./ThinkingFeed";

/** How many lines a working run shows: its newest. */
const IN_VIEW = 3;
/** Before the first paint in a browser (nothing flashes unclipped); a plain effect where there is no page to measure. */
const useBeforePaint = typeof document === "undefined" ? useEffect : useLayoutEffect;

/**
 * Keeps a working run to its newest three lines. The ones before them slide up and out under a soft fade as a
 * new one arrives at the bottom; opening "Thought for …" afterwards shows all of them, unclipped (that list is
 * not wrapped in this). The height is measured, so exactly three rows are in view however tall they are, and
 * the sliding is the rows' own height, so nothing jumps. Still, for someone who has asked for less motion.
 */
function Roll({ children }: { children: ReactNode }): JSX.Element {
  const clip = useRef<HTMLDivElement>(null);
  const seen = useRef(0);
  const still = useReducedMotion();
  useBeforePaint(() => {
    const box = clip.current;
    const list = box?.firstElementChild as HTMLElement | null | undefined;
    if (!box || !list) return;
    const rows = Array.from(list.children) as HTMLElement[];
    const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
    const tall = (some: HTMLElement[]) => some.reduce((n, r) => n + r.offsetHeight, 0) + gap * Math.max(0, some.length - 1);
    box.style.maxHeight = rows.length > IN_VIEW ? `${tall(rows.slice(-IN_VIEW))}px` : "";
    const arrived = rows.length - seen.current;
    if (!still && seen.current > 0 && arrived > 0 && rows.length > IN_VIEW && typeof list.animate === "function") {
      box.classList.add("is-sliding");
      const slide = list.animate(
        [{ transform: `translateY(${tall(rows.slice(-arrived)) + gap}px)` }, { transform: "none" }],
        { duration: 300, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
      const done = () => box.classList.remove("is-sliding");
      slide.onfinish = done;
      slide.oncancel = done;
    }
    seen.current = rows.length;
  });
  return <div className="pt-roll" ref={clip}>{children}</div>;
}

/**
 * What a run is doing, one line per phase: the label, the detail and the count beside it, the loader while it
 * runs and a quiet check when it is done. A phase that did not finish is said calmly and does not shout.
 *
 * A working run always has a label: before the first phase arrives the row says it is getting started, so the
 * person is never looking at a blank spinner or a bare timer.
 */
export function PhaseTimeline({ lines, working, onStop, feed, since }: {
  lines: readonly PhaseLine[];
  /** The turn is still going: with no phases yet, a row says so. */
  working: boolean;
  /** Offered beside the running line while the run can be stopped. */
  onStop?: (() => void) | undefined;
  /** What the search is doing right now, said as lines that rise and fade under the lines while it works. */
  feed?: readonly FeedLine[] | undefined;
  /** When the work began (epoch ms): a run that goes on past the limits says so, calmly, under its lines. */
  since?: number | null | undefined;
}): JSX.Element | null {
  const slow = useSlowState(working ? since : null, { soft: 45_000, hard: 150_000 });
  const late = working && since != null
    ? <SlowNote level={slow} soft="Taking longer than usual." stuck="Still no answer. You can stop this and ask again, or wait a little longer." />
    : null;
  if (lines.length === 0) {
    if (!working) return null;
    return (
      <>
        <p className="pt-first" role="status">
          <Loader size="sm" />
          <span>{FIRST_WORDS}</span>
          {onStop && <Cta small bare icon={Stop} className="lt-stop" onClick={onStop}>Stop</Cta>}
        </p>
        {late}
      </>
    );
  }
  const now = running(lines);
  const list = (
    <ol className="pt" aria-label="What the agent is doing" aria-live="polite">
      {lines.map((l) => {
        const note = lineNote(l);
        return (
          <li key={l.id} className={`pt-line is-${l.state}`}>
            <span className="pt-ico" aria-hidden="true">
              {l.state === "running" ? <Loader size="sm" /> : l.state === "done" ? <Check size={13} weight="bold" /> : <Minus size={13} weight="bold" />}
            </span>
            <span className="pt-text">
              <span className="pt-label">{l.label}</span>
              {note && <span className="pt-note">{note}</span>}
              {l.state === "failed" && <span className="pt-note">Didn't finish</span>}
            </span>
            {onStop && now?.id === l.id && <Cta small bare icon={Stop} className="lt-stop" onClick={onStop}>Stop</Cta>}
            {/* Work with a known size moves while it waits: a sweep over the track, and the filled part grows as each group lands. */}
            {l.state === "running" && l.total !== undefined && l.total > 0 && (
              <span className="pt-bar" aria-hidden="true"><span className="pt-bar-fill" style={{ width: `${Math.max(6, Math.round(((l.done ?? 0) / l.total) * 100))}%` }} /></span>
            )}
          </li>
        );
      })}
    </ol>
  );
  return (
    <>
    {working ? <Roll>{list}</Roll> : list}
    {working && feed && feed.length > 0 && <ThinkingFeed lines={feed} />}
    {late}
    </>
  );
}

/** A finished run's lines, folded behind one quiet row that says how long it took or what it was. */
export function PhaseSummary({ lines, label, lead }: { lines: readonly PhaseLine[]; label: string; lead?: JSX.Element }): JSX.Element {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <>
      <button
        type="button"
        className="rep-thought rep-trace-trigger"
        aria-expanded={open}
        aria-controls={open ? panel : undefined}
        onClick={() => setOpen(!open)}
      >
        {lead}
        {label}
        {open ? <CaretDown size={11} weight="bold" aria-hidden="true" /> : <CaretRight size={11} weight="bold" aria-hidden="true" />}
      </button>
      {open && <div id={panel}><PhaseTimeline lines={lines} working={false} /></div>}
    </>
  );
}
