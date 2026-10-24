import type { Verdict } from "./sourcing";

/**
 * Pressing the button of a decision that was already made (shortlisted, or rejected) is a request to take it back, and
 * the server has no such change for a search's people: a shortlisted person is on the pipeline now, and a rejection is
 * kept so matching can learn from it. So the press is answered in words, with where to go, and not left to do nothing.
 */
export type UndoNote = { text: string; toPipeline: boolean };

export function undoNote(was: Verdict | undefined): UndoNote {
  return was === "rejected"
    ? { text: "A rejection can't be taken back from here. Shortlist them to bring them back.", toPipeline: false }
    : { text: "They are on the pipeline now. To take them off the shortlist, move them there.", toPipeline: true };
}
