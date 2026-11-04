import type { Verdict } from "./sourcing";

/**
 * Pressing the button of a decision that was already made is a request to take it back. A shortlist can be taken back
 * (off the board, still in Candidates); a rejection is kept so matching can learn from it, and shortlisting brings the
 * person back instead. Where a surface cannot take a shortlist back itself, the press is answered in words, with where
 * to go, and not left to do nothing.
 */
export type UndoNote = { text: string; toPipeline: boolean };

export function undoNote(was: Verdict | undefined): UndoNote {
  return was === "rejected"
    ? { text: "A rejection can't be taken back from here. Shortlist them to bring them back.", toPipeline: false }
    : { text: "Take them off the shortlist from the campaign's Sourced list or its pipeline.", toPipeline: true };
}

/** What a shortlist taken back says: done, or why the person stayed (already contacted: rejecting them still works). */
export function takenBackNote(first: string, r: { removed: number; stayed: number }): { text: string; done: boolean } {
  if (r.removed > 0) return { text: `${first} is off the shortlist and still in Candidates.`, done: true };
  if (r.stayed > 0) return { text: `${first} has already been contacted, so they stay on the pipeline. Reject them, or move them there.`, done: false };
  return { text: `${first} wasn't on the shortlist any more.`, done: true };
}

/** What a rejection of someone hired says: a hire is changed on the pipeline, where it is asked about first. */
export function hiredKeptNote(first: string): string {
  return `${first} is hired, so they stay on the pipeline. Change that there.`;
}

/** The decisions a found list holds, without one person's: what the list shows the moment a shortlist is taken back. */
export function withoutDecision<T extends string>(decisions: Readonly<Record<string, T>> | undefined, id: string): Record<string, T> {
  const next = { ...(decisions ?? {}) };
  delete next[id];
  return next;
}
