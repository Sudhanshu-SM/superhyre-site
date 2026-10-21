import { useEffect, useSyncExternalStore } from "react";
import { LIVE } from "./api/client";
import { onWorkspaceChange } from "./api/identity";
import { type Meeting, type MeetingQuery, meetingsApi } from "./api/meetings";

/**
 * Meetings as live state: one list per question asked (a campaign, a candidate's card, everything coming up), kept
 * side by side so Home, a campaign's Overview and the candidate sheet agree. A list that is on screen is read again
 * when the agent books, moves or cancels something (`meetingsChanged`, told by the effect `meetings`), and what is
 * shown stays until the answer replaces it. A server without the route reads as "no meetings", never as an error.
 */

export type MeetingsEntry = { phase: "idle" | "loading" | "ready" | "failed"; meetings: readonly Meeting[] };
const IDLE: MeetingsEntry = { phase: "idle", meetings: [] };

const entries = new Map<string, MeetingsEntry>();
const queries = new Map<string, MeetingQuery>();
/** How many components are reading each list: only these are read again when something changes. */
const watching = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;

const keyOf = (q: MeetingQuery): string =>
  `${q.campaignId ?? ""}|${q.campaignCandidateId ?? ""}|${q.when ?? "upcoming"}|${q.limit ?? ""}`;

const tell = () => {
  version += 1;
  for (const l of listeners) l();
};
const put = (key: string, entry: MeetingsEntry) => {
  entries.set(key, entry);
  tell();
};

async function read(key: string): Promise<void> {
  const q = queries.get(key);
  if (!q || !LIVE) return;
  const had = entries.get(key) ?? IDLE;
  if (had.phase === "idle") put(key, { phase: "loading", meetings: [] });
  try {
    put(key, { phase: "ready", meetings: await meetingsApi.list(q) });
  } catch {
    // What was on screen stays; with nothing yet, the list reads as empty rather than broken.
    put(key, { phase: "failed", meetings: had.meetings });
  }
}

/** The agent (or anyone) changed a meeting: the lists on screen are read again, quietly. */
export function meetingsChanged(): void {
  for (const [key, n] of watching) if (n > 0) void read(key);
}

onWorkspaceChange(() => {
  entries.clear();
  tell();
  meetingsChanged();
});

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** The meetings for a question, read once when first asked for and kept fresh while shown. */
export function useMeetings(q: MeetingQuery, enabled = true): MeetingsEntry {
  const key = keyOf(q);
  useSyncExternalStore(subscribe, () => version, () => version);
  useEffect(() => {
    if (!enabled || !LIVE) return;
    queries.set(key, q);
    watching.set(key, (watching.get(key) ?? 0) + 1);
    void read(key);
    return () => void watching.set(key, Math.max(0, (watching.get(key) ?? 1) - 1));
    // `q` is described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return entries.get(key) ?? IDLE;
}

/** Test-only: forget everything. */
export function resetMeetings(): void {
  entries.clear();
  queries.clear();
  watching.clear();
}
