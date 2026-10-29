import { Check, Crosshair, Gavel, MagnifyingGlass, Scales } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import "./stages.css";

/**
 * Stages — the sourcing run as a goal with three legs.
 *
 *   Finding people   read the brief, build the search, wait for Run, look for people who fit
 *   Matching         match them to the role on the campaign's criteria
 *   Deciding    the recruiter calls the first profiles; the goal is reached
 *               when every one of them has a verdict
 *
 * The line between two stages fills as the left one progresses, and during a
 * running phase it creeps forward over that phase's own duration, so the bar
 * moves at the pace of the work rather than jumping at the end. Waiting on the
 * recruiter is its own state, not a stall: the node says so and stops moving.
 *
 * It is the first block of the run, in the flow: it scrolls with the run and
 * never floats over the lines and cards under it.
 */

export type StageId = "search" | "match" | "decide";

export type StageView = {
  id: StageId;
  /** 0..1 through this stage; "creep" is where a running phase will reach. */
  progress: number;
  creep?: { to: number; ms: number };
  state: "todo" | "live" | "wait" | "done";
  /** One short line under the label: what is happening, or what came of it. */
  note: string;
};

const META: Readonly<Record<StageId, { label: string; Icon: typeof MagnifyingGlass }>> = {
  search: { label: "Finding people", Icon: MagnifyingGlass },
  match: { label: "Matching", Icon: Scales },
  decide: { label: "Deciding", Icon: Gavel },
};

export function Stages({
  goal, stages, reached, summary,
}: {
  goal: string;
  stages: readonly StageView[];
  reached: boolean;
  summary: string;
}) {
  const liveAt = stages.findIndex((s) => s.state === "live" || s.state === "wait");
  /* Only the finish is celebrated, and only once per mount. */
  const [burst, setBurst] = useState(false);
  const was = useRef(reached);
  useEffect(() => {
    if (reached && !was.current) setBurst(true);
    was.current = reached;
  }, [reached]);

  return (
    <section className={`stg${reached ? " is-reached" : ""}`} aria-label="Sourcing progress">
      <header className="stg-head">
        <span className="stg-goal">
          <Crosshair size={14} weight="bold" aria-hidden="true" />
          <span className="stg-goal-k">Goal</span>
          <span className="stg-goal-v">{goal}</span>
        </span>
        <span className="stg-status" aria-live="polite">
          {reached ? (
            <span className="stg-reached"><Check size={12} weight="bold" /> {summary}</span>
          ) : liveAt >= 0 ? (
            <span className="stg-step">Step {liveAt + 1} of 3</span>
          ) : null}
        </span>
      </header>

      <ol className="stg-track">
        {stages.map((s, i) => {
          const { label, Icon } = META[s.id];
          const next = stages[i + 1];
          return (
            <li key={s.id} className={`stg-stage is-${s.state}`} aria-current={s.state === "live" || s.state === "wait" ? "step" : undefined}>
              <span className="stg-node" aria-hidden="true">
                <span className="stg-node-ico"><Icon size={15} weight="bold" /></span>
                <span className="stg-node-ok"><Check size={14} weight="bold" /></span>
                {s.state === "live" && <span className="stg-pulse" />}
                {i === stages.length - 1 && burst && (
                  <span className="stg-burst">
                    {Array.from({ length: 10 }, (_, k) => <i key={k} style={{ ["--a" as string]: `${k * 36}deg` }} />)}
                  </span>
                )}
              </span>
              <span className="stg-text">
                <span className="stg-label">{label}</span>
                <span className="stg-note" key={s.note}>{s.note}</span>
              </span>
              {next && <Rail from={s} />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* The connector after a stage. Width is the stage's progress; while a phase
   runs, the fill transitions to where that phase ends over its duration. */
function Rail({ from }: { from: StageView }) {
  const [w, setW] = useState(from.progress);
  const [ms, setMs] = useState(0);
  useEffect(() => {
    setMs(0);
    setW(from.progress);
    if (!from.creep) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => {
      setMs(from.creep!.ms);
      setW(from.creep!.to);
    }));
    return () => cancelAnimationFrame(id);
  }, [from.progress, from.creep?.to, from.creep?.ms]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className="stg-rail" aria-hidden="true">
      <span
        className="stg-rail-fill"
        style={{ transform: `scaleX(${from.state === "done" ? 1 : w})`, transitionDuration: ms ? `${ms}ms` : undefined, transitionTimingFunction: ms ? "linear" : undefined }}
      />
    </span>
  );
}
