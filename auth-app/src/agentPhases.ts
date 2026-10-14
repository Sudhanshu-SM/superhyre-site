import { phaseOf } from "./agentEvents";
import type { AgentPhase, AgentPhaseState } from "./agentEvents";
import type { RunEvent } from "./api/events";

/**
 * A run's narration as lines on screen: one line per phase, in the order each first appeared.
 *
 * Pure, and safe to replay: a line is replaced only by a later event for the same id, so a doubled or out-of-order
 * event changes nothing, and a reopened chat that replays every event from the start rebuilds the same lines.
 */

export type PhaseLine = {
  id: string;
  phase: string;
  state: AgentPhaseState;
  label: string;
  detail?: string;
  done?: number;
  total?: number;
  found?: number;
  /** The sequence number of the event this line shows. */
  seq: number;
};

/** One phase event folded into the lines. */
export function applyPhase(lines: readonly PhaseLine[], p: AgentPhase, seq: number): readonly PhaseLine[] {
  const at = lines.findIndex((l) => l.id === p.id);
  const was = at >= 0 ? lines[at] : undefined;
  // A line only moves forward: an event no newer than the one it shows is a replay or arrived late.
  if (was && seq <= was.seq) return lines;
  const next: PhaseLine = {
    id: p.id,
    phase: p.phase,
    state: p.state,
    label: p.label,
    ...(p.detail !== undefined ? { detail: p.detail } : was?.detail !== undefined ? { detail: was.detail } : {}),
    ...(p.done !== undefined ? { done: p.done } : {}),
    ...(p.total !== undefined ? { total: p.total } : {}),
    ...(p.found !== undefined ? { found: p.found } : {}),
    seq,
  };
  if (at < 0) return [...lines, next];
  return lines.map((l, i) => (i === at ? next : l));
}

/** The event folded in, when it is a phase event; the same lines otherwise. */
export function applyPhaseEvent(lines: readonly PhaseLine[], e: RunEvent): readonly PhaseLine[] {
  const p = phaseOf(e);
  return p ? applyPhase(lines, p, e.seq) : lines;
}

/** A run that ended closes any line it left running, so no screen shows a phase that never ends. */
export function closePhases(lines: readonly PhaseLine[], state: Exclude<AgentPhaseState, "running">): readonly PhaseLine[] {
  return lines.some((l) => l.state === "running") ? lines.map((l) => (l.state === "running" ? { ...l, state } : l)) : lines;
}

/**
 * What the line says: its label, and the numbers the label doesn't already carry ("12 of 30" while matching, "30 found"
 * when the label is only "Looked through the pool").
 */
export function lineCount(l: PhaseLine): string | null {
  if (l.total !== undefined && l.done !== undefined && l.total > 0) {
    const text = `${l.done} of ${l.total}`;
    return l.label.includes(text) ? null : text;
  }
  if (l.found !== undefined && !new RegExp(`\\b${l.found}\\b`).test(l.label)) return `${l.found} found`;
  return null;
}

/** "Software Engineer, Remote, 5+ years · 12 of 30": the quiet line under or beside the label. */
export function lineNote(l: PhaseLine): string | null {
  return [l.detail ?? null, lineCount(l)].filter(Boolean).join(" · ") || null;
}

/**
 * The line that says the search is ready for the person's call ("Ready for your call · 3 good fits, 2 partial
 * fits"): the last phase of a search, finished in the same moment the run ends. It is the outcome, so it is
 * kept in view when the rest of the lines fold away.
 */
export const verdictOf = (lines: readonly PhaseLine[]): PhaseLine | undefined =>
  [...lines].reverse().find((l) => l.phase === "decide" && l.state === "done");

/** The line that is working now: the newest running one. */
export const running = (lines: readonly PhaseLine[]): PhaseLine | undefined => [...lines].reverse().find((l) => l.state === "running");

/** What a working row says when there is nothing more specific: never blank. */
export const FIRST_WORDS = "Getting started";

/**
 * The lines an approved action wrote while it ran: `approval:<seq>` and the steps under it
 * (`approval:<seq>:draft`), so the card that was approved can show them in place of one word.
 */
export const approvalLines = (lines: readonly PhaseLine[], seq: number): readonly PhaseLine[] =>
  lines.filter((l) => l.id === `approval:${seq}` || l.id.startsWith(`approval:${seq}:`));
