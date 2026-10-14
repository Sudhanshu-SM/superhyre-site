import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { PhaseBlock } from "../Sourcing";

/**
 * The console's phase line ("Read 3 profiles ›"), tied to work that is really happening: a
 * spinner and a ticking clock while the calls are out, then the same line settled with the
 * time they took and what was found. The demo's `Staged` plays a script on a timer; here the
 * line only settles when the data has arrived.
 */

/** The live line on its own, while a lookup runs. */
export function Working({ label }: { label: string }): JSX.Element {
  return <PhaseBlock phase={{ id: `w-${label}`, live: label, done: label, ms: 0, steps: [], says: "" }} n={0} />;
}

export function PhaseRun({
  id, live, done, steps = [], running, onGrow, children,
}: {
  id: string;
  /** Present tense, while the work runs. */
  live: string;
  /** Past tense, once it has: "Compared 2 people". */
  done: string;
  /** What was found, behind the disclosure. */
  steps?: readonly string[];
  running: boolean;
  onGrow?: () => void;
  /** Shown once the work has settled. */
  children?: ReactNode;
}): JSX.Element {
  const started = useRef(Date.now());
  const [took, setTook] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!running && took === undefined) setTook(Math.max(100, Date.now() - started.current));
  }, [running, took]);
  useEffect(() => { onGrow?.(); }, [running, took, onGrow]);
  return (
    <>
      <PhaseBlock phase={{ id, live, done, ms: 0, steps, says: "" }} tookMs={running ? undefined : (took ?? 100)} n={0} />
      {!running && children}
    </>
  );
}
