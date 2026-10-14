import { useEffect, useSyncExternalStore } from "react";
import { ApiError, LIVE, messageOf } from "./api/client";
import { onWorkspaceChange } from "./api/identity";
import * as api from "./api/suppressions";
import type { Suppression } from "./api/suppressions";
import { reportProblem } from "./problems";

/**
 * The do-not-contact list, as live state: who the workspace must not email, as Settings shows it.
 *
 * Adding someone shows at once and the API's answer replaces the guess; a refusal says why where the
 * form is. Taking someone off (owner or admin only) goes at once and comes back, with a line saying
 * why, if the API refuses. Adding someone already on the list answers with the entry as it was, so
 * nobody appears twice.
 */

type Phase = "idle" | "loading" | "ready" | "failed";

export type DncState = {
  phase: Phase;
  items: readonly Suppression[];
  next: string | null;
  more: "idle" | "loading" | "failed";
  /** The server has no do-not-contact routes. */
  unavailable: boolean;
  /** Entries with a change on its way to the server. */
  working: readonly string[];
};

const EMPTY: DncState = { phase: "idle", items: [], next: null, more: "idle", unavailable: false, working: [] };

let state: DncState = EMPTY;
const listeners = new Set<() => void>();

function set(patch: Partial<DncState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

const PAGE = 50;
let token = 0;

const missing = (err: unknown): boolean => err instanceof ApiError && err.status === 404;

/** The list, read afresh (the page opened, or "Try again"). */
export function openDnc(): Promise<void> {
  if (!LIVE) return Promise.resolve();
  const mine = ++token;
  // A refresh is not a blank: what is on screen stays while it runs.
  if (state.phase !== "ready") set({ phase: "loading", more: "idle" });
  return api
    .listSuppressions({ limit: PAGE })
    .then((page) => {
      if (mine !== token) return;
      set({ phase: "ready", items: page.items, next: page.nextCursor, more: "idle", unavailable: false });
    })
    .catch((err: unknown) => {
      if (mine !== token) return;
      set({ phase: state.phase === "ready" ? "ready" : "failed", ...(missing(err) ? { unavailable: true } : {}) });
    });
}

/** The next page, appended; a failure keeps what is shown and offers to try again. */
export function loadMoreDnc(): Promise<void> {
  const cursor = state.next;
  if (!cursor || state.more === "loading") return Promise.resolve();
  const mine = token;
  set({ more: "loading" });
  return api
    .listSuppressions({ limit: PAGE, cursor })
    .then((page) => {
      if (mine !== token) return;
      const have = new Set(state.items.map((i) => i.id));
      set({ more: "idle", items: [...state.items, ...page.items.filter((i) => !have.has(i.id))], next: page.nextCursor });
    })
    .catch(() => {
      if (mine === token) set({ more: "failed" });
    });
}

export type Change = { ok: true } | { ok: false; message: string };

/** Puts a new or unchanged entry at the top of the list the page shows. */
function show(entry: Suppression): void {
  if (state.phase !== "ready") return;
  set({ items: [entry, ...state.items.filter((i) => i.id !== entry.id)] });
}

/** Adds an address to the list; the answer says why when it can't (not an address, or not a person). */
export async function addByEmail(email: string, note?: string): Promise<Change> {
  const words = note?.trim();
  try {
    const typed = email.trim();
    const entry = await api.addSuppression({ email: typed, ...(words ? { note: words } : {}) });
    /* The API keeps only a masked address; what was typed is shown for the rest of this visit, so two
       addresses at one domain are not "p***@acme.com" twice. */
    if (entry) show({ ...entry, address: entry.address ?? typed });
    else void openDnc();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: messageOf(err) };
  }
}

/** Adds a candidate (from the pipeline). Shown in the list too, if the list is open. */
export async function addForCandidate(candidateId: string): Promise<Change> {
  try {
    const entry = await api.addSuppression({ candidateId });
    if (entry) show(entry);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: messageOf(err) };
  }
}

/**
 * Takes a person off from their own menu on a board (owners and admins; the server decides): the one live
 * entry that carries their name. Two entries with one name are not guessed between.
 */
export async function allowContactAgain(name: string): Promise<Change> {
  try {
    const page = await api.listSuppressions({ limit: 200 });
    const want = name.trim().toLowerCase();
    const hits = page.items.filter((i) => !i.expired && i.label.trim().toLowerCase() === want);
    if (hits.length === 0) return { ok: false, message: `${name} isn't on the list.` };
    if (hits.length > 1) return { ok: false, message: `More than one entry is called ${name}, so none was changed. Ask an admin to check the list.` };
    const [hit] = hits;
    if (!hit) return { ok: false, message: `${name} isn't on the list.` };
    await api.removeSuppression(hit.id);
    if (state.phase === "ready") set({ items: state.items.filter((i) => i.id !== hit.id) });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: messageOf(err) };
  }
}

/** Takes someone off. Gone from the list at once, back with a line saying why if refused. */
export async function removeEntry(id: string): Promise<Change> {
  const entry = state.items.find((i) => i.id === id);
  if (!entry || state.working.includes(id)) return { ok: false, message: "That has already changed." };
  const at = state.items.indexOf(entry);
  set({ working: [...state.working, id], items: state.items.filter((i) => i.id !== id) });
  try {
    await api.removeSuppression(id);
    return { ok: true };
  } catch (err) {
    const items = state.items.filter((i) => i.id !== id);
    items.splice(Math.min(at, items.length), 0, entry);
    set({ items });
    const message = messageOf(err);
    reportProblem(`${entry.label} wasn't taken off the list. ${message}`);
    if (err instanceof ApiError && err.status === 404 && LIVE) void openDnc();
    return { ok: false, message };
  } finally {
    set({ working: state.working.filter((x) => x !== id) });
  }
}

/** Test-only, and when the workspace changes: nothing carries over from the last one. */
export function resetDnc(): void {
  token += 1;
  set(EMPTY);
}
onWorkspaceChange(resetDnc);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

/** The list for the Settings tab; opening it reads the list afresh. */
export function useDnc(): DncState {
  useEffect(() => { void openDnc(); }, []);
  return useSyncExternalStore(subscribe, () => state);
}

/** Outside React. */
export const dncNow = (): DncState => state;
