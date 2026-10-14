import { useCallback, useMemo, useSyncExternalStore } from "react";
import { api, ApiError, LIVE, messageOf } from "./api/client";
import { onWorkspaceChange } from "./api/identity";
import { campaignRow, pipelineNow, resolveCampaignId } from "./campaignStore";
import type {
  ContactMode, ContactPerson, ContactsManyResult, ContactsResult, ContactsStatus, ContactSide,
} from "./contactsModel";
import { flippedToFound, mergeResult, POLL_MS, pollRule, recount } from "./contactsModel";
import { invalidate, onInvalidate } from "./invalidate";
import { pollWhileVisible } from "./livePoll";

/**
 * Contact details for shortlisted people: the API calls, and one store per campaign that the Shortlisted table,
 * a person's sheet and the profile sidebar all read, so a person is never one thing in the table and another
 * in the sheet.
 *
 * A phone can take minutes to arrive. While anyone on a campaign is "looking", the status is asked again every
 * few seconds (only while the tab is in front, only ten minutes), and when something flips to found the board
 * and Candidates are read again too.
 */

/* ── the API ──────────────────────────────────────────────────────────────── */

export const fetchContactsStatus = (campaignId: string) =>
  api<ContactsStatus>("GET", `/v1/campaigns/${campaignId}/contacts/status`);

export const fetchContacts = (campaignId: string, body: { campaignCandidateIds?: string[]; candidateIds?: string[]; mode: ContactMode }) =>
  api<ContactsResult>("POST", `/v1/campaigns/${campaignId}/contacts`, body);

/** Everyone shortlisted who lacks the side asked for, in the campaigns named (or all the person can see). */
export const fetchContactsMany = (body: { campaignIds?: string[]; all?: true; mode: ContactMode }) =>
  api<ContactsManyResult>("POST", "/v1/contacts/fetch", body);

/** What a failed request says: the server's own calm sentence, never a provider's name. */
export function errorLine(err: unknown): string {
  const said = err instanceof ApiError ? messageOf(err) : "";
  return (said || "Couldn't get contact details. Try again in a moment.")
    .replace(/\b(salesql|apollo|contactout|crustdata|prospeo)\b/gi, "our data provider");
}

/* ── the store ────────────────────────────────────────────────────────────── */

type Entry = {
  status: ContactsStatus | null;
  load: "idle" | "loading" | "ready" | "failed";
  /** People a request is in flight for, and what it asks. */
  busy: ReadonlyMap<string, ContactMode>;
  /** When someone was first seen "looking" in this stretch; null while nobody is. */
  lookingSince: number | null;
  /** Still looking after the wait we promised. */
  stalled: boolean;
  at: number;
};

const EMPTY: Entry = { status: null, load: "idle", busy: new Map(), lookingSince: null, stalled: false, at: 0 };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const watching = new Map<string, number>();
const inFlight = new Map<string, Promise<void>>();
const pollers = new Map<string, () => void>();
/** A status younger than this is not asked for again just because another screen mounted. */
const FRESH_MS = 20_000;

function put(id: string, patch: Partial<Entry>): void {
  entries.set(id, { ...(entries.get(id) ?? EMPTY), ...patch });
  for (const l of listeners) l();
  syncPoll(id);
}

/** Where the "looking" clock stands after a new status: it starts when someone is first seen looking. */
function clock(prev: Entry | undefined, people: readonly ContactPerson[], now = Date.now()): Pick<Entry, "lookingSince" | "stalled"> {
  const looking = recount(people).looking;
  if (looking === 0) return { lookingSince: null, stalled: false };
  return { lookingSince: prev?.lookingSince ?? now, stalled: prev?.stalled ?? false };
}

function syncPoll(id: string): void {
  const e = entries.get(id);
  const looking = e?.status ? recount(e.status.people).looking : 0;
  const want = (watching.get(id) ?? 0) > 0 && looking > 0 && e?.stalled === false;
  const has = pollers.get(id);
  if (want && !has) {
    pollers.set(id, pollWhileVisible(() => {
      const cur = entries.get(id);
      const n = cur?.status ? recount(cur.status.people).looking : 0;
      const rule = pollRule(n, cur?.lookingSince ?? null, Date.now());
      if (rule === "stalled") { put(id, { stalled: true }); return; }
      if (rule === "poll") void load(id);
    }, POLL_MS));
  } else if (!want && has) {
    has();
    pollers.delete(id);
  }
}

/** The status, read again; quiet: what is shown stays until the answer replaces it. */
export function load(id: string): Promise<void> {
  const running = inFlight.get(id);
  if (running) return running;
  const before = entries.get(id);
  if (!before || before.load === "idle" || before.load === "failed") put(id, { load: "loading" });
  const run = (async () => {
    try {
      const status = LIVE ? await fetchContactsStatus(id) : await fixtureStatus(id);
      const prev = entries.get(id);
      const flipped = flippedToFound(prev?.status ?? null, status);
      put(id, { status, load: "ready", at: Date.now(), ...clock(prev, status.people) });
      // The people carry what was found now: the board, Candidates and the figures read it too.
      if (flipped) invalidate(["pipeline", "candidates"], { campaignId: id });
    } catch {
      const prev = entries.get(id);
      put(id, { load: prev?.status ? "ready" : "failed" });
    }
  })().finally(() => { inFlight.delete(id); });
  inFlight.set(id, run);
  return run;
}

/** Starts reading a campaign's contact state for `listener` (a screen that shows it); returns the way to stop. */
export function watchContacts(id: string, listener: () => void): () => void {
  listeners.add(listener);
  watching.set(id, (watching.get(id) ?? 0) + 1);
  const e = entries.get(id);
  if (!e || e.load === "idle" || e.load === "failed" || Date.now() - e.at > FRESH_MS) void load(id);
  syncPoll(id);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    listeners.delete(listener);
    const n = (watching.get(id) ?? 1) - 1;
    if (n <= 0) watching.delete(id); else watching.set(id, n);
    syncPoll(id);
  };
}

/**
 * Ask for contact details for these people (campaign candidate ids) on this campaign. The table moves at
 * once from the answer; the server's own figures follow. Resolves with what the server said, or throws its
 * calm sentence for the caller to show.
 */
export async function getContacts(campaignId: string, ids: readonly string[], mode: ContactMode): Promise<ContactsResult> {
  const id = resolveCampaignId(campaignId);
  const asked = [...new Set(ids)];
  const working = (on: boolean) => {
    const busy = new Map(entries.get(id)?.busy ?? []);
    for (const x of asked) { if (on) busy.set(x, mode); else busy.delete(x); }
    put(id, { busy });
  };
  working(true);
  try {
    const result = LIVE
      ? await fetchContacts(id, { campaignCandidateIds: asked, mode })
      : await fixtureFetch(id, asked, mode);
    const e = entries.get(id);
    if (e?.status) {
      const status = mergeResult(e.status, result);
      put(id, { status, at: Date.now(), ...clock(e, status.people) });
    }
    return result;
  } finally {
    working(false);
  }
}

/** Another write, or the agent, changed who has details: the status of every campaign on screen is read again. */
onInvalidate((effects, campaigns) => {
  if (!effects.has("candidates") && !effects.has("pipeline")) return;
  for (const id of watching.keys()) {
    if (campaigns.has(null) || campaigns.has(id)) void load(id);
  }
});

/** A different workspace shows none of this one's people. */
export function resetContacts(): void {
  for (const stop of pollers.values()) stop();
  pollers.clear();
  entries.clear();
  inFlight.clear();
  for (const l of listeners) l();
}
onWorkspaceChange(resetContacts);

/* ── reading it ───────────────────────────────────────────────────────────── */

export type ContactsView = {
  ready: boolean;
  failed: boolean;
  closed: boolean;
  /** Phone lookups left; null until the status has arrived. */
  creditsLeft: number | null;
  perRequest: number;
  available: { email: boolean; phone: boolean };
  stalled: boolean;
  people: readonly ContactPerson[];
  of: (campaignCandidateId: string) => ContactPerson | undefined;
  ofCandidate: (candidateId: string) => ContactPerson | undefined;
  /** What a request in flight asks for this person, or null. */
  busy: (campaignCandidateId: string) => ContactMode | null;
  anyBusy: boolean;
};

const NO_PEOPLE: readonly ContactPerson[] = [];

/** What a screen reads for a campaign right now, outside React. */
export const contactsNow = (campaignId: string): ContactsView => viewOf(entries.get(resolveCampaignId(campaignId)) ?? EMPTY);

export function viewOf(entry: Entry): ContactsView {
  const s = entry.status;
  const people = s?.people ?? NO_PEOPLE;
  const byCc = new Map(people.map((p) => [p.campaignCandidateId, p]));
  const byCandidate = new Map(people.map((p) => [p.candidateId, p]));
  return {
    ready: s !== null,
    failed: s === null && entry.load === "failed",
    closed: s?.closed ?? false,
    creditsLeft: s ? s.creditsLeft : null,
    perRequest: s?.perRequest ?? 50,
    available: s?.available ?? { email: true, phone: true },
    stalled: entry.stalled,
    people,
    of: (id) => byCc.get(id),
    ofCandidate: (id) => byCandidate.get(id),
    busy: (id) => entry.busy.get(id) ?? null,
    anyBusy: entry.busy.size > 0,
  };
}

/** A campaign's contact state. Without a campaign (a candidate on none) it is simply not ready. */
export function useContacts(campaignId: string | null | undefined): ContactsView {
  const id = campaignId ? resolveCampaignId(campaignId) : null;
  const subscribe = useCallback((l: () => void) => (id ? watchContacts(id, l) : () => {}), [id]);
  const read = () => (id ? entries.get(id) ?? EMPTY : EMPTY);
  const entry = useSyncExternalStore(subscribe, read, read);
  return useMemo(() => viewOf(entry), [entry]);
}

/* ── fixtures: the console without a server shows the states and lets the buttons work ───────────────────── */

type Sim = Map<string, { email: ContactSide; phone: ContactSide }>;
const sims = new Map<string, Sim>();
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function simFor(id: string): Sim {
  let sim = sims.get(id);
  if (sim) return sim;
  sim = new Map();
  for (const p of pipelineNow(id)) {
    if (p.stage === "passed") continue;
    const h = hash(p.id);
    const hasEmail = !!p.email || !!p.reach?.email;
    const hasPhone = !!p.phone || !!p.reach?.phone;
    sim.set(p.id, {
      email: hasEmail ? "found" : h % 6 === 0 ? "not_found" : "none",
      phone: hasPhone ? "found" : h % 5 === 0 ? "not_found" : h % 7 === 1 ? "looking" : "none",
    });
  }
  sims.set(id, sim);
  for (const [cc, side] of sim) if (side.phone === "looking") later(id, cc);
  return sim;
}

async function fixtureStatus(id: string): Promise<ContactsStatus> {
  const sim = simFor(id);
  const people: ContactPerson[] = pipelineNow(id)
    .filter((p) => p.stage !== "passed" && sim.has(p.id))
    .map((p) => ({
      campaignCandidateId: p.id,
      candidateId: p.candidateId ?? p.id,
      personId: p.id,
      stage: p.stage as ContactPerson["stage"],
      email: sim.get(p.id)!.email,
      phone: sim.get(p.id)!.phone,
      lookupable: hash(p.id) % 11 !== 0,
    }));
  return { campaignId: id, closed: campaignRow(id)?.status === "closed", creditsLeft: 38, perRequest: 50, available: { email: true, phone: true }, people, counts: recount(people) };
}

async function fixtureFetch(id: string, ids: readonly string[], mode: ContactMode): Promise<ContactsResult> {
  const sim = simFor(id);
  await new Promise((r) => setTimeout(r, 700));
  const out: ContactsResult["people"] = [];
  let emails = 0, phones = 0, notFound = 0, looking = 0, had = 0;
  for (const cc of ids) {
    const cur = sim.get(cc);
    if (!cur) continue;
    const h = hash(cc);
    let email: ContactsResult["people"][number]["email"] = "none";
    let phone: ContactsResult["people"][number]["phone"] = "none";
    if (mode !== "phone") {
      if (cur.email === "none") {
        const ok = h % 4 !== 0;
        cur.email = ok ? "found" : "not_found";
        email = ok ? "found" : "not_found";
        if (ok) emails++; else notFound++;
      } else email = cur.email === "found" ? "had" : "skipped";
    }
    if (mode !== "email") {
      if (cur.phone === "none") {
        const r = h % 5;
        cur.phone = r === 0 ? "not_found" : r === 1 ? "looking" : "found";
        phone = cur.phone === "found" ? "found" : cur.phone === "looking" ? "looking" : "not_found";
        if (cur.phone === "found") phones++; else if (cur.phone === "looking") { looking++; later(id, cc); } else notFound++;
      } else phone = cur.phone === "found" ? "had" : "skipped";
    }
    if (email === "had" || phone === "had") had++;
    out.push({ campaignCandidateId: cc, candidateId: cc, personId: cc, email, phone });
  }
  const asked = out.length;
  return {
    campaignId: id, mode, people: out,
    counts: { asked, emails, phones, notFound, looking, had, skipped: 0, failed: 0 },
    creditsUsed: phones, creditsLeft: Math.max(0, 38 - phones), remaining: 0, notice: null,
    summary: "",
  };
}

/** A phone "looking" in the fixtures arrives a few seconds later, so the live update can be seen. */
function later(id: string, cc: string): void {
  setTimeout(() => {
    const cur = simFor(id).get(cc);
    if (cur?.phone === "looking") cur.phone = hash(cc) % 2 ? "found" : "not_found";
  }, 9000);
}
