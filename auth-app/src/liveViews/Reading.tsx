import { useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { TurnContext } from "../agentThread";
import { PhaseBlock } from "../Sourcing";

/**
 * The line the agent shows while it reads: live while the data is on its way, settled into
 * "Read X for 0.8s ›" with what it read behind the disclosure, and only then the view. The
 * time is measured from the first frame to the data arriving, and the steps are written from
 * what came back, so nothing here is scripted. The view owns the data; this only shows it.
 */
export function Reading({
  ready, live, done, steps, onBusy, onGrow, children,
}: {
  ready: boolean;
  /** Present tense, while it runs. */
  live: string;
  /** Past tense, once the data is in. */
  done: string;
  /** What it read, as sentences from the data. */
  steps: readonly string[];
  onBusy?: (busy: boolean) => void;
  onGrow?: () => void;
  children: ReactNode;
}): JSX.Element {
  /* A turn restored from earlier already read: show it settled, with no time. */
  const restored = useContext(TurnContext)?.restored ?? false;
  const started = useRef(Date.now());
  const [took, setTook] = useState<number | undefined>(restored ? 0 : undefined);

  useEffect(() => {
    if (ready && took === undefined) setTook(Date.now() - started.current);
  }, [ready, took]);
  useEffect(() => { onBusy?.(took === undefined); }, [took, onBusy]);
  useEffect(() => { if (took !== undefined) onGrow?.(); }, [took, onGrow]);

  return (
    <>
      <PhaseBlock phase={{ id: "read", live, done, ms: 0, steps, says: "", timed: !restored }} tookMs={took} n={0} />
      {took !== undefined && children}
    </>
  );
}
