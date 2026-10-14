import { createContext } from "react";

/**
 * The agent conversation, kept for the session.
 *
 * Turns used to live only in the Agent's component state, so leaving the
 * chat for the form builder (Open in builder, Share) and coming back showed
 * an empty page: the draft card and every answered question were gone. The
 * thread now lives here, mirrored to sessionStorage, and is cleared only by
 * "New chat". Each turn's answered questions are kept beside it, so a
 * guided flow comes back exactly as it was left instead of asking again.
 */

export type SavedTurn = {
  id: number;
  said: string;
  mode: string;
  kind: string;
  replyIndex: number;
  thoughtMs: number | null;
  startedAt: number;
};
export type SavedStep = { qid: string; ids: readonly string[]; auto: false | "remember" | "preset" };

const KEY = "sh.agent.thread";
type Thread = { turns: SavedTurn[]; trails: Record<string, SavedStep[]>; made: Record<string, string> };
let thread: Thread = { turns: [], trails: {}, made: {} };

const store = (): Storage | null => {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; }
};

(function load() {
  try {
    const raw = store()?.getItem(KEY);
    if (!raw) return;
    const v = JSON.parse(raw) as Thread;
    if (Array.isArray(v.turns)) thread = { turns: v.turns, trails: v.trails ?? {}, made: v.made ?? {} };
  } catch { /* a bad or blocked store starts fresh */ }
})();

const write = () => {
  try { store()?.setItem(KEY, JSON.stringify(thread)); } catch { /* the chat still works, it just won't come back */ }
};

/** The turns saved this session, oldest first. */
export const savedTurns = (): readonly SavedTurn[] => thread.turns;

export function saveTurns(turns: readonly SavedTurn[]): void {
  const keep = new Set(turns.map((t) => String(t.id)));
  const trails: Record<string, SavedStep[]> = {};
  for (const [k, v] of Object.entries(thread.trails)) if (keep.has(k)) trails[k] = v;
  const made: Record<string, string> = {};
  for (const [k, v] of Object.entries(thread.made)) if (keep.has(k)) made[k] = v;
  thread = { turns: turns.map((t) => ({ ...t })), trails, made };
  write();
}

export const savedTrail = (turnId: number): readonly SavedStep[] => thread.trails[String(turnId)] ?? [];

export function saveTrail(turnId: number, steps: readonly SavedStep[]): void {
  thread = { ...thread, trails: { ...thread.trails, [String(turnId)]: steps.map((s) => ({ ...s, ids: [...s.ids] })) } };
  write();
}

/** The record a turn's card made (a campaign's id), so a restored card shows it done instead of offering Create again. */
export const savedMade = (turnId: number): string | null => thread.made[String(turnId)] ?? null;

export function saveMade(turnId: number, id: string): void {
  thread = { ...thread, made: { ...thread.made, [String(turnId)]: id } };
  write();
}

/** "New chat". */
export function clearThread(): void {
  thread = { turns: [], trails: {}, made: {} };
  write();
}

/**
 * The turn a moment belongs to, for anything inside it that keeps state:
 * `restored` is true when the turn came back from an earlier visit, so
 * phases that already ran show as done instead of playing again.
 */
export const TurnContext = createContext<{ id: number; restored: boolean } | null>(null);
