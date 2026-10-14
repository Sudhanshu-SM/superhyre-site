import { CaretDown, CaretRight, Check, Minus } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { FIRST_WORDS, lineNote, running } from "../agentPhases";
import type { PhaseLine } from "../agentPhases";
import type { FeedLine } from "../agentFeed";
import { Loader } from "../components/Loader";
import { ThinkingFeed } from "./ThinkingFeed";

/**
 * What a run is doing, one line per phase: the label, the detail and the count beside it, the loader while it
 * runs and a quiet check when it is done. A phase that did not finish is said calmly and does not shout.
 *
 * A working run always has a label: before the first phase arrives the row says it is getting started, so the
 * person is never looking at a blank spinner or a bare timer.
 */
export function PhaseTimeline({ lines, working, onStop, feed }: {
  lines: readonly PhaseLine[];
  /** The turn is still going: with no phases yet, a row says so. */
  working: boolean;
  /** Offered beside the running line while the run can be stopped. */
  onStop?: (() => void) | undefined;
  /** What the search is doing right now, said as lines that rise and fade under the lines while it works. */
  feed?: readonly FeedLine[] | undefined;
}): JSX.Element | null {
  if (lines.length === 0) {
    if (!working) return null;
    return (
      <p className="pt-first" role="status">
        <Loader size="sm" />
        <span>{FIRST_WORDS}</span>
        {onStop && <button type="button" className="lt-link lt-stop" onClick={onStop}>Stop</button>}
      </p>
    );
  }
  const now = running(lines);
  return (
    <>
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
            {onStop && now?.id === l.id && <button type="button" className="lt-link lt-stop" onClick={onStop}>Stop</button>}
          </li>
        );
      })}
    </ol>
    {working && feed && feed.length > 0 && <ThinkingFeed lines={feed} />}
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
