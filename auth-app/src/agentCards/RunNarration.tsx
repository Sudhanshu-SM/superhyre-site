import { Check } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { applyFeed } from "../agentFeed";
import type { FeedLine } from "../agentFeed";
import { applyPhaseEvent, closePhases, lineNote, verdictOf } from "../agentPhases";
import type { PhaseLine } from "../agentPhases";
import { follow } from "../api/events";
import { PhaseSummary, PhaseTimeline } from "./PhaseTimeline";

/**
 * A search or a ranking that was started from somewhere other than the chat (approving a role spec, the first
 * campaign), followed by its run: the same lines and the same rising feed the chat shows, then how it went.
 * Nothing here starts anything; it only reads the run's own events.
 */
export function RunNarration({ runId }: { runId: string }): JSX.Element | null {
  const [lines, setLines] = useState<readonly PhaseLine[]>([]);
  const [feed, setFeed] = useState<readonly FeedLine[]>([]);
  const [state, setState] = useState<"running" | "done" | "failed">("running");

  useEffect(() => {
    setLines([]);
    setFeed([]);
    setState("running");
    return follow({ runId }, 0, (e) => {
      setLines((l) => applyPhaseEvent(l, e));
      setFeed((f) => applyFeed(f, e));
      if (e.type === "done") {
        setState("done");
        setLines((l) => closePhases(l, "done"));
      } else if (e.type === "error") {
        setState("failed");
        setLines((l) => closePhases(l, "failed"));
      }
    });
  }, [runId]);

  if (state === "running") return <PhaseTimeline lines={lines} working feed={feed} />;
  const verdict = verdictOf(lines);
  const rest = verdict ? lines.filter((l) => l.id !== verdict.id) : lines;
  if (!verdict && rest.length === 0) return null;
  return (
    <>
      {rest.length > 0 && <PhaseSummary lines={rest} label="How it went" />}
      {verdict && (
        <p className="pt-verdict" role="status">
          <Check size={13} weight="bold" aria-hidden="true" />
          <span>{verdict.label}</span>
          {lineNote(verdict) && <span className="pt-note">{lineNote(verdict)}</span>}
        </p>
      )}
    </>
  );
}
