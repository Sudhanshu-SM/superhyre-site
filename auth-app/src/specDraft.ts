import { useCallback, useEffect, useSyncExternalStore } from "react";
import { specApi } from "./api/agent";
import type { SpecRow } from "./api/agent";
import { LIVE, api, messageOf } from "./api/client";
import { onWorkspaceChange } from "./api/identity";
import { refreshCampaign } from "./campaignStore";

/**
 * A campaign's role spec as live state: what has been drafted and approved, and whether a
 * draft is still on its way.
 *
 * Mind drafts the role in the background (the set-up, a chat, a pasted JD), and that is a run
 * of its own. The Role spec dialog and the Overview both read this one store, so a draft in
 * flight reads "Mind is drafting the role" in both and the spec appears where it was waited
 * for, without a reload. While a draft is on its way the store asks again every few seconds,
 * and only while something on screen is watching.
 */

/** The newest spec run for a campaign, as `GET /v1/runs` lists it. */
export type SpecRun = { id: string; status: string; createdAt: string };

type Specs = { latest: SpecRow | null; approved: SpecRow | null };

const IN_FLIGHT = new Set(["queued", "running", "waiting"]);
/** A run that has been "running" this long is not a draft anyone should keep waiting for. */
const STUCK_MS = 10 * 60_000;

export const runInFlight = (run: SpecRun | null | undefined): boolean => !!run && IN_FLIGHT.has(run.status);

/**
 * A draft is on its way: a spec run is in flight and no spec newer than that run has landed
 * (the row is written a moment before the run is marked done).
 */
export function draftingNow(run: SpecRun | null | undefined, latest: SpecRow | null | undefined, now = Date.now()): boolean {
  if (!run || !runInFlight(run)) return false;
  const started = Date.parse(run.createdAt);
  if (Number.isFinite(started) && now - started > STUCK_MS) return false;
  if (!latest) return true;
  const made = Date.parse(latest.createdAt);
  return !Number.isFinite(started) || !Number.isFinite(made) || started > made;
}

/** The last draft ended without a spec: the page can say so and offer to try again. */
export function draftFailed(run: SpecRun | null | undefined, latest: SpecRow | null | undefined): boolean {
  return !!run && !latest && (run.status === "failed" || run.status === "cancelled");
}

/** Gentle: quick at first, easing off the longer a draft takes. */
export function pollDelay(attempt: number): number {
  return [3000, 3000, 5000, 5000][attempt] ?? 8000;
}

/* ── the store ── */

type Entry = { specs: Specs | null; run: SpecRun | null; error: string | null };
const EMPTY: Entry = { specs: null, run: null, error: null };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const watchers = new Map<string, number>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const attempts = new Map<string, number>();
const loading = new Map<string, Promise<void>>();
let epoch = 0;

const emit = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const entryOf = (id: string): Entry => entries.get(id) ?? EMPTY;
const drafting = (e: Entry) => draftingNow(e.run, e.specs?.latest);

async function newestRun(campaignId: string): Promise<SpecRun | null> {
  try {
    const { runs } = await api<{ runs: SpecRun[] }>("GET", `/v1/runs?campaignId=${encodeURIComponent(campaignId)}&skill=spec&limit=1`);
    return runs[0] ?? null;
  } catch {
    // An older server, or a run list this person can't read: the spec itself still loads.
    return null;
  }
}

/** Reads the spec and the newest spec run now. Resolves once the store has them. */
export function reloadSpec(campaignId: string): Promise<void> {
  const have = loading.get(campaignId);
  if (have) return have;
  const asked = epoch;
  const was = entryOf(campaignId);
  const run = (async () => {
    const [specs, latestRun] = await Promise.all([
      specApi.get(campaignId).then((s) => ({ ok: true as const, s }), (err: unknown) => ({ ok: false as const, err })),
      newestRun(campaignId),
    ]);
    if (asked !== epoch) return;
    const next: Entry = specs.ok
      ? { specs: specs.s, run: latestRun, error: null }
      : { specs: was.specs, run: latestRun ?? was.run, error: messageOf(specs.err) };
    entries.set(campaignId, next);
    emit();
    /* A draft that was on its way has landed (or ended): the campaign's log and figures catch up. */
    if (drafting(was) && !drafting(next)) refreshCampaign(campaignId);
    askAgainSoon(campaignId);
  })().finally(() => { if (loading.get(campaignId) === run) loading.delete(campaignId); });
  loading.set(campaignId, run);
  return run;
}

/** While something is watching and a draft is on its way, the next read is already booked. */
function askAgainSoon(campaignId: string) {
  clearTimeout(timers.get(campaignId));
  timers.delete(campaignId);
  if (!(watchers.get(campaignId) ?? 0) || !drafting(entryOf(campaignId))) {
    attempts.delete(campaignId);
    return;
  }
  const attempt = attempts.get(campaignId) ?? 0;
  attempts.set(campaignId, attempt + 1);
  timers.set(campaignId, setTimeout(() => { timers.delete(campaignId); void reloadSpec(campaignId); }, pollDelay(attempt)));
}

function watch(campaignId: string): () => void {
  watchers.set(campaignId, (watchers.get(campaignId) ?? 0) + 1);
  attempts.delete(campaignId);
  void reloadSpec(campaignId);
  return () => {
    const n = (watchers.get(campaignId) ?? 1) - 1;
    if (n > 0) { watchers.set(campaignId, n); return; }
    watchers.delete(campaignId);
    clearTimeout(timers.get(campaignId));
    timers.delete(campaignId);
    attempts.delete(campaignId);
  };
}

/** Test-only, and when the workspace changes: nothing carries over from the last one. */
export function resetSpecDrafts(): void {
  epoch += 1;
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  attempts.clear();
  entries.clear();
  loading.clear();
  emit();
  /* Whatever is still on screen asks again, in the workspace it is in now. */
  for (const id of watchers.keys()) void reloadSpec(id);
}
onWorkspaceChange(resetSpecDrafts);

export type CampaignSpec = {
  /** The first answer has arrived. */
  ready: boolean;
  latest: SpecRow | null;
  approved: SpecRow | null;
  /** Mind is drafting the role right now. */
  drafting: boolean;
  /** The last draft ended without a spec. */
  failed: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/** The campaign's role spec, kept fresh while a draft is on its way. Nothing is asked on fixtures. */
export function useCampaignSpec(campaignId: string): CampaignSpec {
  useEffect(() => (LIVE && campaignId ? watch(campaignId) : undefined), [campaignId]);
  const e = useSyncExternalStore(subscribe, () => entryOf(campaignId));
  const reload = useCallback(() => reloadSpec(campaignId), [campaignId]);
  return {
    ready: !LIVE || e.specs !== null || e.error !== null,
    latest: e.specs?.latest ?? null,
    approved: e.specs?.approved ?? null,
    drafting: LIVE && drafting(e),
    failed: draftFailed(e.run, e.specs?.latest),
    error: e.error,
    reload,
  };
}
