import type { RunEvent } from "./api/events";

/**
 * What a run says about what it is doing and what it changed (docs/agent-framework.md sections 4 and 5).
 * A copy of the shapes in packages/shared/src/agent.ts: change both together.
 *
 * A run narrates itself in `progress` events with `step: "phase"`; every write says which views it left stale in
 * one with `step: "effect"`. Both are read here without trusting the server: a payload that is not one of these
 * is `null`, never a throw, so an older or a newer server cannot break the chat.
 */

/** The fixed vocabulary of a run's phases, so the console draws them without per-skill code. */
export const AGENT_PHASES = ["understand", "search", "enrich", "match", "decide", "write", "wait"] as const;
export type AgentPhaseName = (typeof AGENT_PHASES)[number];

export type AgentPhaseState = "running" | "done" | "failed";

export type AgentPhase = {
  step: "phase";
  /** Which line this event updates; the same id later arrives as done or failed. */
  id: string;
  phase: AgentPhaseName | (string & {});
  state: AgentPhaseState;
  /** Present tense while running, past once done: "Looking through our pool of candidates". */
  label: string;
  /** "Software Engineer, Remote, 5+ years" */
  detail?: string;
  /** "Scoring 12 of 30" */
  done?: number;
  total?: number;
  /** "Got 30 candidates" */
  found?: number;
};

/**
 * One line of what a search is doing right now (a `progress` event with `step: "feed"`), for the lines that
 * rise and fade under the matching phase. A copy of `AgentFeed` in packages/shared/src/agent.ts.
 */
export type AgentFeed = { step: "feed"; phase: string; kind: string; text: string };

/** The views a write can leave stale. `invalidate()` refetches exactly these. */
export const CAPABILITY_EFFECTS = [
  "campaign", "pipeline", "candidates", "clients", "team", "connections", "memory", "schedules", "spec", "sourcing", "calls", "meetings",
] as const;
export type CapabilityEffect = (typeof CAPABILITY_EFFECTS)[number];

export type AgentEffect = {
  step: "effect";
  capability: string;
  effects: CapabilityEffect[];
  campaignId?: string;
  summary: string;
  counts?: Record<string, number>;
};

export type ConnectProvider = "google" | "slack" | "notion";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const count = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

const STATES: readonly AgentPhaseState[] = ["running", "done", "failed"];

/** A run's phase event, or null when the event is anything else (or too malformed to draw). */
export function phaseOf(e: RunEvent): AgentPhase | null {
  if (e.type !== "progress" || e.step !== "phase") return null;
  const phase = str(e.phase);
  const label = str(e.label);
  if (!phase || !label) return null;
  const state = STATES.find((s) => s === e.state) ?? "running";
  const detail = str(e.detail);
  const done = count(e.done);
  const total = count(e.total);
  const found = count(e.found);
  return {
    step: "phase",
    id: str(e.id) ?? phase,
    phase,
    state,
    label,
    ...(detail ? { detail } : {}),
    ...(done !== undefined ? { done } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(found !== undefined ? { found } : {}),
  };
}

/** A write's effect event, or null. Effects the console does not know are dropped from the list. */
export function effectOf(e: RunEvent): AgentEffect | null {
  if (e.type !== "progress" || e.step !== "effect") return null;
  const effects = Array.isArray(e.effects)
    ? e.effects.filter((x): x is CapabilityEffect => CAPABILITY_EFFECTS.some((k) => k === x))
    : [];
  const campaignId = str(e.campaignId);
  const counts = e.counts && typeof e.counts === "object"
    ? Object.fromEntries(Object.entries(e.counts as Record<string, unknown>).flatMap(([k, v]) => (count(v) !== undefined ? [[k, count(v) as number]] : [])))
    : undefined;
  return {
    step: "effect",
    capability: str(e.capability) ?? "",
    effects,
    ...(campaignId ? { campaignId } : {}),
    summary: str(e.summary) ?? "",
    ...(counts && Object.keys(counts).length ? { counts } : {}),
  };
}

/** A search's feed line, or null when the event is anything else (or has no words to show). */
export function feedOf(e: RunEvent): AgentFeed | null {
  if (e.type !== "progress" || e.step !== "feed") return null;
  const text = str(e.text);
  if (!text) return null;
  return { step: "feed", phase: str(e.phase) ?? "match", kind: str(e.kind) ?? "", text };
}
