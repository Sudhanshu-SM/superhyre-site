import { useEffect, useSyncExternalStore } from "react";
import { ApiError, LIVE, messageOf } from "./api/client";
import { onWorkspaceChange } from "./api/identity";
import * as api from "./api/schedules";
import type { ScheduledItem } from "./api/schedules";
import { reportProblem } from "./problems";
import { byNextTime, pollDelay } from "./schedulesView";

/**
 * What is scheduled, as live state: the lists the Scheduled screen shows, the one the Agent page's
 * rail counts, and the one a campaign's chat view lists.
 *
 * A list is a "feed": upcoming or history, for one kind and one campaign (or all). Feeds are kept
 * side by side, so the screen, the rail and a chat view agree on what they hold. A cancel or a new
 * time shows on screen at once, in every feed that has the item, and the API's answer replaces the
 * guess; a refusal puts exactly that item back and says why in one short line (`reportProblem`). An
 * item that turned out to be gone or already run (404, 409) makes the lists be read again.
 *
 * Feeds being looked at are read again every minute while the page is visible, and a little after
 * the next thing is due, so something going out is seen going out without a reload.
 *
 * A server without the schedule routes answers 404: that reads as "couldn't load" on the screen, and
 * the rail leaves its row out rather than showing an error that will never clear.
 */

type Phase = "idle" | "loading" | "ready" | "failed";

export type FeedQuery = {
  status: "upcoming" | "history";
  /** A kind, or "all". */
  kind: string;
  campaignId: string | null;
};

export type Feed = {
  /** "loading" only before anything has been read; a refresh keeps what is on screen. */
  phase: Phase;
  items: readonly ScheduledItem[];
  next: string | null;
  more: "idle" | "loading" | "failed";
  /** When the last good answer arrived (ms); 0 marks it as needing another look. */
  at: number;
};

export type SchedulesState = {
  feeds: Readonly<Record<string, Feed>>;
  /** The server has no schedule routes. */
  unavailable: boolean;
  /** Items with a change on its way to the server. */
  working: readonly string[];
};

export const EMPTY_FEED: Feed = { phase: "idle", items: [], next: null, more: "idle", at: 0 };
const EMPTY: SchedulesState = { feeds: {}, unavailable: false, working: [] };

/** Everything coming up, for any kind and any campaign: what the rail counts. */
export const UPCOMING: FeedQuery = { status: "upcoming", kind: "all", campaignId: null };

export const feedKey = (q: FeedQuery): string => `${q.status}|${q.kind}|${q.campaignId ?? ""}`;

export function feedQuery(key: string): FeedQuery {
  const [status, kind, campaignId] = key.split("|");
  return { status: status === "history" ? "history" : "upcoming", kind: kind || "all", campaignId: campaignId || null };
}

let state: SchedulesState = EMPTY;
const listeners = new Set<() => void>();

function set(patch: Partial<SchedulesState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function setFeed(key: string, patch: Partial<Feed>): void {
  const was = state.feeds[key] ?? EMPTY_FEED;
  set({ feeds: { ...state.feeds, [key]: { ...was, ...patch } } });
}

const PAGE = 50;
const FRESH_MS = 15_000;
/** The most feeds kept at once; the ones looked at longest ago go first. */
const KEEP = 12;

const missing = (err: unknown): boolean => err instanceof ApiError && err.status === 404;

/** Whether an item belongs in a feed's filters. */
function fits(item: ScheduledItem, q: FeedQuery): boolean {
  return (q.kind === "all" || item.kind === q.kind) && (!q.campaignId || item.campaign?.id === q.campaignId);
}

/* ── reading a feed ── */

const tokens = new Map<string, number>();
const inflight = new Map<string, Promise<void>>();

function trim(): void {
  const keys = Object.keys(state.feeds);
  if (keys.length <= KEEP) return;
  const keep = new Set([...watching.keys(), feedKey(UPCOMING)]);
  const drop = keys.filter((k) => !keep.has(k)).sort((a, b) => (state.feeds[a]?.at ?? 0) - (state.feeds[b]?.at ?? 0)).slice(0, keys.length - KEEP);
  if (!drop.length) return;
  const feeds = { ...state.feeds };
  for (const k of drop) delete feeds[k];
  set({ feeds });
}

function read(q: FeedQuery): Promise<void> {
  const key = feedKey(q);
  const token = (tokens.get(key) ?? 0) + 1;
  tokens.set(key, token);
  const was = state.feeds[key];
  // A refresh is not a blank: what is on screen stays while it runs.
  if (!was || was.phase !== "ready") setFeed(key, { phase: "loading", more: "idle" });
  const p = api
    .listSchedules({ status: q.status, kind: q.kind, campaignId: q.campaignId, limit: PAGE })
    .then((page) => {
      if (tokens.get(key) !== token) return;
      setFeed(key, { phase: "ready", items: page.items, next: page.nextCursor, more: "idle", at: Date.now() });
      if (state.unavailable) set({ unavailable: false });
      trim();
    })
    .catch((err: unknown) => {
      if (tokens.get(key) !== token) return;
      const had = state.feeds[key]?.phase === "ready";
      setFeed(key, { phase: had ? "ready" : "failed" });
      if (missing(err)) set({ unavailable: true });
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/** A feed's first page, loaded once and again when it has gone stale or `force` says so. */
export function ensureFeed(q: FeedQuery, force = false): Promise<void> {
  if (!LIVE) return Promise.resolve();
  const key = feedKey(q);
  const running = inflight.get(key);
  if (running && !force) return running;
  const feed = state.feeds[key];
  if (!force && feed?.phase === "ready" && Date.now() - feed.at < FRESH_MS) return Promise.resolve();
  return read(q);
}

/** Tries a feed again (the screen's "Try again"). */
export const reloadFeed = (q: FeedQuery): Promise<void> => ensureFeed(q, true);

/** The next page, appended; a failure keeps what is shown and offers to try again. */
export function loadMore(q: FeedQuery): Promise<void> {
  const key = feedKey(q);
  const feed = state.feeds[key];
  if (!feed?.next || feed.more === "loading") return Promise.resolve();
  const token = tokens.get(key) ?? 0;
  setFeed(key, { more: "loading" });
  return api
    .listSchedules({ status: q.status, kind: q.kind, campaignId: q.campaignId, limit: PAGE, cursor: feed.next })
    .then((page) => {
      if (tokens.get(key) !== token) return;
      const now = state.feeds[key] ?? EMPTY_FEED;
      const have = new Set(now.items.map((i) => i.id));
      setFeed(key, { more: "idle", items: [...now.items, ...page.items.filter((i) => !have.has(i.id))], next: page.nextCursor });
    })
    .catch(() => {
      if (tokens.get(key) === token) setFeed(key, { more: "failed" });
    });
}

/* ── looking again ── */

const watching = new Map<string, number>();
let refreshedAt = 0;

/**
 * Reads again every feed that is being looked at, and marks the others as needing a look when they
 * are next opened. Called by the poll, after something is approved in chat, and when a refused change
 * turns out to mean the lists have moved.
 */
export function refreshSchedules(): Promise<void> {
  if (!LIVE) return Promise.resolve();
  refreshedAt = Date.now();
  const reads: Promise<void>[] = [];
  const feeds = { ...state.feeds };
  let stale = false;
  for (const key of Object.keys(feeds)) {
    if (watching.has(key)) reads.push(ensureFeed(feedQuery(key), true));
    else if ((feeds[key]?.at ?? 0) > 0) {
      feeds[key] = { ...(feeds[key] ?? EMPTY_FEED), at: 0 };
      stale = true;
    }
  }
  if (stale) set({ feeds });
  // What came back may change when to look next (something new is due soon, something has gone).
  return Promise.all(reads).then(() => rearm());
}

/** Something was just scheduled (an approval in chat, a form): everything is read again. */
export const schedulesChanged = (): Promise<void> => refreshSchedules();

let timer: ReturnType<typeof setTimeout> | null = null;
let pollers = 0;

function watchedItems(): ScheduledItem[] {
  return [...watching.keys()].flatMap((k) => (feedQuery(k).status === "upcoming" ? [...(state.feeds[k]?.items ?? [])] : []));
}

function visible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function arm(): void {
  if (timer || pollers === 0) return;
  timer = setTimeout(() => {
    timer = null;
    // A refresh ends by arming the next look; a tab nobody is looking at just waits.
    if (visible()) void refreshSchedules();
    else arm();
  }, pollDelay(watchedItems()));
}

/** Looks again at the pace the latest answers call for. */
function rearm(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  arm();
}

function onVisible(): void {
  if (!visible() || Date.now() - refreshedAt < 5_000) return;
  void refreshSchedules();
}

/** Keeps the lists in view fresh while something on screen needs them. Returns the way to stop. */
export function startPolling(): () => void {
  pollers += 1;
  if (pollers === 1 && typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  arm();
  return () => {
    pollers = Math.max(0, pollers - 1);
    if (pollers === 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

/* ── changes ── */

export type Change = { ok: true } | { ok: false; message: string };

function working(id: string, on: boolean): void {
  set({ working: on ? [...state.working, id] : state.working.filter((x) => x !== id) });
}

/** The item as any feed holds it. */
export function findItem(id: string): ScheduledItem | undefined {
  for (const f of Object.values(state.feeds)) {
    const hit = f.items.find((i) => i.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** Puts an item's new form into every feed that holds it, keeping each upcoming list in order. */
function replaceEverywhere(item: ScheduledItem): void {
  const feeds: Record<string, Feed> = {};
  for (const [key, f] of Object.entries(state.feeds)) {
    if (!f.items.some((i) => i.id === item.id)) { feeds[key] = f; continue; }
    const items = f.items.map((i) => (i.id === item.id ? item : i));
    feeds[key] = { ...f, items: feedQuery(key).status === "upcoming" ? [...items].sort(byNextTime) : items };
  }
  set({ feeds });
}

/** A refusal: the line saying so, and a fresh look when the item turned out to be gone or already run. */
function refused(what: string, err: unknown): string {
  const message = messageOf(err);
  reportProblem(`${what} ${message}`);
  if (err instanceof ApiError && (err.status === 404 || err.status === 409) && LIVE) void refreshSchedules();
  return message;
}

const short = (i: ScheduledItem): string => {
  const t = i.title.trim();
  return t.length > 40 ? `${t.slice(0, 40).trimEnd()}…` : t;
};

type Position = { key: string; at: number };

/**
 * Cancels, or withdraws an email that has gone to the sending queue. Gone from what is coming up at
 * once, listed in the history as cancelled; back where it was, with a line saying why, if refused.
 */
export async function cancelItem(id: string): Promise<Change> {
  const item = findItem(id);
  if (!item || state.working.includes(id)) return { ok: false, message: "That has already changed." };
  const waiting = item.status === "scheduled" || item.status === "running";
  const cancelled: ScheduledItem = {
    ...item,
    status: waiting ? "cancelled" : item.status,
    canCancel: false,
    result: waiting ? item.result : { ...(item.result ?? {}), delivery: "cancelled" },
  };

  const removed: Position[] = [];
  const added: string[] = [];
  const changed: string[] = [];
  const feeds: Record<string, Feed> = {};
  for (const [key, f] of Object.entries(state.feeds)) {
    const q = feedQuery(key);
    const at = f.items.findIndex((i) => i.id === id);
    if (q.status === "upcoming" && at >= 0) {
      removed.push({ key, at });
      feeds[key] = { ...f, items: f.items.filter((i) => i.id !== id) };
    } else if (q.status === "history" && at >= 0) {
      changed.push(key);
      feeds[key] = { ...f, items: f.items.map((i) => (i.id === id ? cancelled : i)) };
    } else if (q.status === "history" && waiting && f.phase === "ready" && fits(item, q)) {
      added.push(key);
      feeds[key] = { ...f, items: [cancelled, ...f.items] };
    } else feeds[key] = f;
  }
  working(id, true);
  set({ feeds });
  try {
    await api.cancelSchedule(id);
    return { ok: true };
  } catch (err) {
    const undone: Record<string, Feed> = {};
    for (const [key, f] of Object.entries(state.feeds)) {
      let items = [...f.items];
      const out = removed.find((r) => r.key === key);
      if (out && !items.some((i) => i.id === id)) items.splice(Math.min(out.at, items.length), 0, item);
      if (changed.includes(key)) items = items.map((i) => (i.id === id ? item : i));
      if (added.includes(key)) items = items.filter((i) => i.id !== id);
      undone[key] = { ...f, items };
    }
    set({ feeds: undone });
    return { ok: false, message: refused(`"${short(item)}" wasn't cancelled.`, err) };
  } finally {
    working(id, false);
  }
}

/** A new time for something that is waiting. It shows at once; the API's answer replaces the guess. */
export async function rescheduleItem(id: string, runAt: string): Promise<Change> {
  const item = findItem(id);
  if (!item || state.working.includes(id)) return { ok: false, message: "That has already changed." };
  working(id, true);
  replaceEverywhere({ ...item, runAt, nextRunAt: runAt });
  try {
    const saved = await api.rescheduleSchedule(id, runAt);
    if (saved) replaceEverywhere(saved);
    else void refreshSchedules();
    return { ok: true };
  } catch (err) {
    replaceEverywhere(item);
    return { ok: false, message: refused(`The new time for "${short(item)}" wasn't saved.`, err) };
  } finally {
    working(id, false);
  }
}

/**
 * Starts looking at a feed: it is loaded, and read again whenever the lists are. Returns the way to
 * stop. What a screen does while it shows one.
 */
export function watchFeed(q: FeedQuery): () => void {
  const key = feedKey(q);
  watching.set(key, (watching.get(key) ?? 0) + 1);
  void ensureFeed(q);
  return () => {
    const n = (watching.get(key) ?? 1) - 1;
    if (n <= 0) watching.delete(key);
    else watching.set(key, n);
  };
}

/* ── lifecycle ── */

/** Test-only, and when the workspace changes: nothing carries over from the last one. */
export function resetSchedules(): void {
  tokens.clear();
  inflight.clear();
  refreshedAt = 0;
  set(EMPTY);
}
onWorkspaceChange(resetSchedules);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

/**
 * A feed for a screen: loaded when it opens and when the filters change, read again while it is on
 * screen when `poll` says so.
 */
export function useFeed(q: FeedQuery, opts: { poll?: boolean } = {}): Feed {
  const key = feedKey(q);
  const poll = opts.poll === true;
  useEffect(() => watchFeed(feedQuery(key)), [key]);
  useEffect(() => (poll ? startPolling() : undefined), [poll]);
  const s = useSyncExternalStore(subscribe, () => state);
  return s.feeds[key] ?? EMPTY_FEED;
}

/** Whether the server has the schedule routes at all. */
export function useSchedulesUnavailable(): boolean {
  return useSyncExternalStore(subscribe, () => state, () => state).unavailable;
}

/** Items with a change on its way. */
export function useWorking(): readonly string[] {
  return useSyncExternalStore(subscribe, () => state, () => state).working;
}

/** What the rail says about what is coming up: how many, and the next one's time. */
export type UpcomingSummary = {
  phase: Phase;
  count: number;
  /** More than the first page holds. */
  more: boolean;
  next: ScheduledItem | null;
};

export function upcomingSummary(feed: Feed): UpcomingSummary {
  const first = [...feed.items].sort(byNextTime)[0] ?? null;
  return { phase: feed.phase, count: feed.items.length, more: feed.next !== null, next: first };
}

/** Everything coming up, for the rail; read again every minute while the Agent page is open. */
export function useUpcomingSummary(): UpcomingSummary & { unavailable: boolean } {
  const feed = useFeed(UPCOMING, { poll: true });
  const unavailable = useSchedulesUnavailable();
  return { ...upcomingSummary(feed), unavailable };
}

/** Outside React. */
export const schedulesNow = (): SchedulesState => state;
