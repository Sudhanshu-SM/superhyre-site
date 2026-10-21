import { useEffect, useSyncExternalStore } from "react";
import { ApiError, LIVE, messageOf } from "./api/client";
import { onWorkspaceChange } from "./api/identity";
import * as memoryApi from "./api/memory";
import type { MemoryItem, MemoryScope, MemoryStats } from "./api/memory";
import { matchesFilters, NO_FILTERS, snippet } from "./memoryView";
import type { MemoryFilters } from "./memoryView";
import { reportProblem } from "./problems";

/**
 * What the agent remembers, as live state: the notes waiting for review, the list the filters ask
 * for, and the counts the Agent page's rail shows.
 *
 * One store because the Settings page and the rail must agree. A confirm, a correction or a
 * "forget" shows on screen at once and the API's answer replaces the guess; a refusal puts exactly
 * that note back and says why in one short line (`reportProblem`). Each change keeps its own undo,
 * so two rows changed close together never undo each other.
 *
 * A server without the memory routes answers 404: that reads as "couldn't load" on the page, and
 * the rail leaves its row out rather than showing an error that will never clear.
 */

type Phase = "idle" | "loading" | "ready" | "failed";

export type MemoryState = {
  /** The list the filters ask for. While a new one loads, the old one stays on screen. */
  list: Phase;
  items: readonly MemoryItem[];
  next: string | null;
  more: "idle" | "loading" | "failed";
  filters: MemoryFilters;
  /** The review queue: notes waiting for someone to confirm, whatever the filters say. */
  queue: Phase;
  pending: readonly MemoryItem[];
  /** Notes the agent has stopped opening with, because answers that leaned on them were turned down: kept or forgotten from here. */
  doubts: Phase;
  doubted: readonly MemoryItem[];
  /** The counts; null until they arrive. */
  stats: MemoryStats | null;
  statsPhase: Phase;
  /** The server has no memory routes. */
  unavailable: boolean;
  /** Notes with a change on its way to the server. */
  working: readonly string[];
  /** Notes forgotten while the page was open: a replaced note that points at one of them has no newer note left. */
  forgotten: readonly string[];
  /** Clients and campaigns the notes seen so far belong to, kept while a filter narrows the list, so the choice stays. */
  known: { clients: readonly { id: string; name: string }[]; campaigns: readonly { id: string; name: string }[] };
};

const EMPTY: MemoryState = {
  list: "idle", items: [], next: null, more: "idle", filters: NO_FILTERS,
  queue: "idle", pending: [],
  doubts: "idle", doubted: [],
  stats: null, statsPhase: "idle", unavailable: false, working: [], forgotten: [],
  known: { clients: [], campaigns: [] },
};

let state: MemoryState = EMPTY;
const listeners = new Set<() => void>();

function set(patch: Partial<MemoryState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

const PAGE = 50;
const QUEUE_MAX = 100;
const FRESH_MS = 20_000;

const missing = (err: unknown): boolean => err instanceof ApiError && err.status === 404;

/** What the filters ask the server for. "This campaign" and "this client" are the one chosen, at any level. */
function queryOf(f: MemoryFilters): Pick<memoryApi.MemoryQuery, "scope" | "campaignId" | "clientId"> {
  return {
    scope: f.scope === "mine" ? "mine" : f.scope === "org" ? "org" : "all",
    ...(f.scope === "campaign" && f.campaignId ? { campaignId: f.campaignId } : {}),
    ...(f.scope === "client" && f.clientId ? { clientId: f.clientId } : {}),
  };
}

/** The clients and campaigns these notes belong to, added to what was known. */
function learn(known: MemoryState["known"], items: readonly MemoryItem[]): MemoryState["known"] {
  const clients = new Map(known.clients.map((c) => [c.id, c.name]));
  const campaigns = new Map(known.campaigns.map((c) => [c.id, c.name]));
  for (const i of items) {
    if (i.clientId && i.clientName) clients.set(i.clientId, i.clientName);
    if (i.campaignId && i.campaignName) campaigns.set(i.campaignId, i.campaignName);
  }
  const list = (m: Map<string, string>) =>
    [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  return { clients: list(clients), campaigns: list(campaigns) };
}

/* ── the counts ── */

let statsInflight: Promise<void> | null = null;
let statsAt = 0;

/** The counts, loaded once and again when they have gone stale or `force` says so. */
export function ensureMemoryStats(force = false): Promise<void> {
  if (!LIVE) return Promise.resolve();
  if (statsInflight) return statsInflight;
  if (!force && state.statsPhase === "ready" && Date.now() - statsAt < FRESH_MS) return Promise.resolve();
  // A refresh is not a blank: what is on screen stays while it runs.
  if (state.statsPhase !== "ready") set({ statsPhase: "loading" });
  statsInflight = memoryApi.memoryStats()
    .then((stats) => { statsAt = Date.now(); set({ stats, statsPhase: "ready", unavailable: false }); })
    .catch((err: unknown) => {
      set({ statsPhase: state.statsPhase === "ready" ? "ready" : "failed", ...(missing(err) ? { unavailable: true } : {}) });
    })
    .finally(() => { statsInflight = null; });
  return statsInflight;
}

/** The counts again, and the doubted notes too when a card has them on screen (any change to memory moves both). */
export const reloadMemoryStats = (): Promise<void> => {
  if (state.doubts !== "idle") void loadDoubts();
  return ensureMemoryStats(true);
};

/** Moves the counts without asking: a change just shown, or put back. */
function bump(stats: MemoryStats | null, by: { active?: number; pending?: number; scope?: MemoryScope; inScope?: number }): MemoryStats | null {
  if (!stats) return stats;
  const floor = (n: number) => Math.max(0, n);
  return {
    active: floor(stats.active + (by.active ?? 0)),
    pending: floor(stats.pending + (by.pending ?? 0)),
    byScope: by.scope ? { ...stats.byScope, [by.scope]: floor(stats.byScope[by.scope] + (by.inScope ?? 0)) } : stats.byScope,
  };
}

/* ── the list ── */

let listToken = 0;

function loadList(): Promise<void> {
  const filters = state.filters;
  const token = ++listToken;
  // Keeps the old list on screen while a new one loads; an empty one says "loading".
  set({ list: "loading", more: "idle" });
  return memoryApi
    .listMemory({
      ...queryOf(filters),
      status: filters.history ? "all" : "active",
      ...(filters.q.trim() ? { q: filters.q } : {}),
      limit: PAGE,
    })
    .then((page) => {
      if (token !== listToken) return;
      // Waiting notes live in the review queue, not among the ones the agent already uses.
      const items = page.items.filter((i) => i.status !== "pending");
      set({ list: "ready", items, next: page.nextCursor, unavailable: false, known: learn(state.known, items) });
    })
    .catch((err: unknown) => {
      if (token !== listToken) return;
      set({ list: "failed", items: [], next: null, ...(missing(err) ? { unavailable: true } : {}) });
    });
}

let queueToken = 0;
let doubtToken = 0;

function loadQueue(): Promise<void> {
  const token = ++queueToken;
  if (state.queue !== "ready") set({ queue: "loading" });
  return memoryApi
    .listMemory({ status: "pending", limit: QUEUE_MAX })
    .then((page) => {
      if (token !== queueToken) return;
      const pending = page.items.filter((i) => i.status === "pending");
      set({ queue: "ready", pending, known: learn(state.known, pending) });
    })
    .catch(() => {
      if (token !== queueToken) return;
      // A failed refresh keeps what the queue showed; a first failure says so.
      set({ queue: state.queue === "ready" ? "ready" : "failed" });
    });
}

/**
 * The notes the agent has stopped opening with, for the chat's card: the list is asked for whenever a card is shown,
 * and what is on screen stays while it is (a first look shows a ghost, a failed look keeps the list).
 */
function loadDoubts(): Promise<void> {
  const token = ++doubtToken;
  if (state.doubts !== "ready") set({ doubts: "loading" });
  return memoryApi
    .listMemory({ status: "doubted", limit: QUEUE_MAX })
    .then((page) => {
      if (token !== doubtToken) return;
      const doubted = page.items.filter((i) => i.status === "active" && i.doubted);
      set({ doubts: "ready", doubted, known: learn(state.known, doubted) });
    })
    .catch(() => {
      if (token !== doubtToken) return;
      // A failed refresh keeps what the section showed; a first failure says so.
      set({ doubts: state.doubts === "ready" ? "ready" : "failed" });
    });
}

/** The card of doubted notes was shown: read them again. */
export function refreshDoubts(): Promise<void> {
  return LIVE ? loadDoubts() : Promise.resolve();
}

/** The Memory page opened: load the list, the queue and the counts afresh. */
export function openMemory(): Promise<void> {
  if (!LIVE) return Promise.resolve();
  return Promise.all([loadList(), loadQueue(), ensureMemoryStats(true)]).then(() => undefined);
}

/** Tries everything again (the page's "Try again"). */
export const retryMemory = (): Promise<void> => openMemory();

/** A search, a different scope or the history switch: the list is asked for again. */
export function setMemoryFilters(patch: Partial<MemoryFilters>): Promise<void> {
  const next = { ...state.filters, ...patch };
  // Choosing "this campaign" or "this client" with nothing chosen yet picks the first one that is known.
  if (next.scope === "campaign" && !next.campaignId) next.campaignId = state.known.campaigns[0]?.id ?? null;
  if (next.scope === "client" && !next.clientId) next.clientId = state.known.clients[0]?.id ?? null;
  const same = (a: MemoryFilters, b: MemoryFilters) =>
    a.scope === b.scope && a.q === b.q && a.history === b.history && a.campaignId === b.campaignId && a.clientId === b.clientId;
  if (same(next, state.filters)) return Promise.resolve();
  set({ filters: next });
  return loadList();
}

/** The next page, appended; a failure keeps what is shown and offers to try again. */
export function loadMoreMemory(): Promise<void> {
  const cursor = state.next;
  if (!cursor || state.more === "loading") return Promise.resolve();
  const filters = state.filters;
  const token = listToken;
  set({ more: "loading" });
  return memoryApi
    .listMemory({
      ...queryOf(filters),
      status: filters.history ? "all" : "active",
      ...(filters.q.trim() ? { q: filters.q } : {}),
      limit: PAGE,
      cursor,
    })
    .then((page) => {
      if (token !== listToken) return;
      const have = new Set(state.items.map((i) => i.id));
      const items = [...state.items, ...page.items.filter((i) => i.status !== "pending" && !have.has(i.id))];
      set({ more: "idle", items, next: page.nextCursor, known: learn(state.known, items) });
    })
    .catch(() => {
      if (token === listToken) set({ more: "failed" });
    });
}

/* ── changes ── */

const sameId = (id: string) => (i: MemoryItem) => i.id !== id;

function working(id: string, on: boolean): void {
  set({ working: on ? [...state.working, id] : state.working.filter((x) => x !== id) });
}

/** Puts a note back where it was in a list. */
function putBack(list: readonly MemoryItem[], item: MemoryItem, at: number): MemoryItem[] {
  const without = list.filter(sameId(item.id));
  without.splice(Math.min(Math.max(at, 0), without.length), 0, item);
  return without;
}

/** A refusal: the line saying so, and a fresh look when the note turned out to be gone or replaced. */
function refused(what: string, err: unknown): void {
  reportProblem(`${what} ${messageOf(err)}`);
  if (err instanceof ApiError && (err.status === 404 || err.status === 409) && LIVE) {
    void openMemory();
    if (state.doubts !== "idle") void loadDoubts();
  }
}

export type Change = { ok: true } | { ok: false; message: string };

/**
 * Pending to active, or a doubted note trusted again. The note leaves its section and joins the list at once;
 * a doubted one was already counted, so the counts do not move for it.
 */
export async function confirmMemory(id: string): Promise<Change> {
  const waiting = state.pending.find((i) => i.id === id);
  const item = waiting ?? state.doubted.find((i) => i.id === id);
  if (!item || state.working.includes(id)) return { ok: false, message: "That note has already changed." };
  const at = (waiting ? state.pending : state.doubted).indexOf(item);
  const active: MemoryItem = { ...item, status: "active", doubted: null };
  // A list nobody has loaded has nothing to join (the doubted notes are shown by a card, with no list beside it).
  const listed = state.list !== "idle" && matchesFilters(active, state.filters);
  working(id, true);
  set({
    ...(waiting ? { pending: state.pending.filter(sameId(id)) } : { doubted: state.doubted.filter(sameId(id)) }),
    /* Newest first, as the server lists them: a note just confirmed is the newest change. */
    ...(listed ? { items: [active, ...state.items.filter(sameId(id))] } : {}),
    ...(waiting ? { stats: bump(state.stats, { pending: -1, active: 1, scope: item.scope, inScope: 1 }) } : {}),
  });
  try {
    const saved = await memoryApi.confirmMemory(id);
    if (saved && saved.status === "active") {
      set({ items: state.items.map((i) => (i.id === id ? saved : i)) });
    }
    return { ok: true };
  } catch (err) {
    set({
      ...(waiting
        ? { pending: putBack(state.pending, item, at), stats: bump(state.stats, { pending: 1, active: -1, scope: item.scope, inScope: -1 }) }
        : { doubted: putBack(state.doubted, item, at) }),
      items: state.items.filter(sameId(id)),
    });
    refused(`"${snippet(item.text)}" wasn't confirmed.`, err);
    return { ok: false, message: messageOf(err) };
  } finally {
    working(id, false);
  }
}

/** Soft delete: gone from the screen at once, back with a line if the server refuses. */
export async function forgetMemory(id: string): Promise<Change> {
  const item = state.items.find((i) => i.id === id) ?? state.pending.find((i) => i.id === id) ?? state.doubted.find((i) => i.id === id);
  if (!item || state.working.includes(id)) return { ok: false, message: "That note has already changed." };
  const inList = state.items.findIndex((i) => i.id === id);
  const inQueue = state.pending.findIndex((i) => i.id === id);
  const inDoubts = state.doubted.findIndex((i) => i.id === id);
  const wasActive = item.status === "active";
  const wasPending = item.status === "pending";
  working(id, true);
  set({
    items: state.items.filter(sameId(id)),
    pending: state.pending.filter(sameId(id)),
    doubted: state.doubted.filter(sameId(id)),
    stats: bump(state.stats, wasActive
      ? { active: -1, scope: item.scope, inScope: -1 }
      : wasPending ? { pending: -1 } : {}),
  });
  try {
    await memoryApi.forgetMemory(id);
    set({ forgotten: [...state.forgotten, id] });
    return { ok: true };
  } catch (err) {
    set({
      items: inList >= 0 ? putBack(state.items, item, inList) : state.items,
      pending: inQueue >= 0 ? putBack(state.pending, item, inQueue) : state.pending,
      doubted: inDoubts >= 0 ? putBack(state.doubted, item, inDoubts) : state.doubted,
      stats: bump(state.stats, wasActive
        ? { active: 1, scope: item.scope, inScope: 1 }
        : wasPending ? { pending: 1 } : {}),
    });
    refused(`"${snippet(item.text)}" wasn't forgotten.`, err);
    return { ok: false, message: messageOf(err) };
  } finally {
    working(id, false);
  }
}

/**
 * Corrects a note. The new words show at once; the server answers with a new note (the old one stays
 * as replaced history, which the list shows only when asked to).
 */
export async function correctMemory(id: string, text: string): Promise<Change> {
  const item = state.items.find((i) => i.id === id);
  const words = text.trim();
  if (!item || state.working.includes(id)) return { ok: false, message: "That note has already changed." };
  working(id, true);
  const edited: MemoryItem = { ...item, text: words, quote: null, source: "recruiter", trust: "user", updatedAt: new Date().toISOString() };
  set({ items: state.items.map((i) => (i.id === id ? edited : i)) });
  try {
    const saved = await memoryApi.correctMemory(id, words);
    if (!saved) {
      // An answer this console can't read: the change happened, so look again rather than guess.
      void loadList();
      return { ok: true };
    }
    const at = state.items.findIndex((i) => i.id === id);
    if (at >= 0) {
      const next = [...state.items];
      next[at] = saved;
      if (state.filters.history) next.splice(at + 1, 0, { ...item, status: "superseded", supersededBy: saved.id });
      set({ items: next });
    }
    return { ok: true };
  } catch (err) {
    set({ items: state.items.map((i) => (i.id === id ? item : i)) });
    refused(`Your change to "${snippet(item.text)}" wasn't saved.`, err);
    return { ok: false, message: messageOf(err) };
  } finally {
    working(id, false);
  }
}

/* ── lifecycle ── */

/** Test-only, and when the workspace changes: nothing carries over from the last one. */
export function resetMemory(): void {
  listToken += 1;
  queueToken += 1;
  doubtToken += 1;
  statsInflight = null;
  statsAt = 0;
  set(EMPTY);
}
onWorkspaceChange(resetMemory);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

/** The Memory page's state; opening it loads everything afresh. */
export function useMemory(): MemoryState {
  useEffect(() => { void openMemory(); }, []);
  return useSyncExternalStore(subscribe, () => state);
}

/** The doubted notes, for the chat's card; showing it reads them again. */
export function useDoubts(): Pick<MemoryState, "doubts" | "doubted" | "working"> {
  useEffect(() => { void refreshDoubts(); }, []);
  return useSyncExternalStore(subscribe, () => state);
}

/** The counts, for the rail. */
export function useMemoryStats(): Pick<MemoryState, "stats" | "statsPhase" | "unavailable"> {
  useEffect(() => { void ensureMemoryStats(); }, []);
  return useSyncExternalStore(subscribe, () => state);
}

/** Outside React. */
export const memoryNow = (): MemoryState => state;
