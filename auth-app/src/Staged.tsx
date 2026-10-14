import { useContext, useEffect, useRef, useState } from "react";
import { TurnContext } from "./agentThread";
import type { ReactNode } from "react";
import { PhaseBlock, writeMs } from "./Sourcing";
import type { Phase } from "./sourcing";

/**
 * Staged — phases first, then whatever the moment produces.
 *
 * The sourcing run's shape, generalised: each phase is a live line that
 * settles into "Did X for Ns ›" with its paragraph, and only once the last
 * one has settled does `children` mount. A moment that needs more phases
 * later (outreach writes its drafts after connectors are sorted) nests a
 * second Staged inside the first one's children.
 *
 * Durations are measured, never printed from the script.
 */
export function Staged({
  phases, n = 0, onBusy, onGrow, children,
}: {
  phases: readonly Phase[];
  /** The number "{n}" stands for in the phase copy. */
  n?: number;
  onBusy?: (busy: boolean) => void;
  onGrow?: () => void;
  children: ReactNode;
}): JSX.Element {
  /* A turn restored from earlier in the session already ran its phases:
     show them settled rather than playing them again. */
  const restored = useContext(TurnContext)?.restored ?? false;
  const [at, setAt] = useState(() => (restored ? phases.length : 0));
  const [took, setTook] = useState<Record<string, number>>(() => (restored ? Object.fromEntries(phases.map((p) => [p.id, p.ms])) : {}));
  const started = useRef(Date.now());
  const phase = phases[at];
  const done = at >= phases.length;

  useEffect(() => {
    if (!phase) return;
    started.current = Date.now();
    let next = 0;
    const hold = window.setTimeout(() => {
      setTook((t) => ({ ...t, [phase.id]: Date.now() - started.current }));
      next = window.setTimeout(() => setAt((a) => a + 1), (phase.says ? writeMs(phase.says) : 0) + 220);
    }, phase.ms);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(next);
    };
  }, [phase]);

  useEffect(() => { onBusy?.(!done); }, [done, onBusy]);
  useEffect(() => { onGrow?.(); }, [at, took, onGrow]);

  return (
    <>
      {phases.slice(0, at + 1).map((p) => (
        <PhaseBlock key={p.id} phase={p} tookMs={took[p.id]} n={n} />
      ))}
      {done && children}
    </>
  );
}
