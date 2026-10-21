import type { RoleSpec, RoleSpecCardData, SourcingStatus, SpecRow } from "../api/agent";
import { specMeta } from "./specEdit";

/**
 * What the role spec card draws, from the spec as the server has it now (so a reload, an edit in the popup and an approval
 * somewhere else all show), and from what the card showed when it was made until that has been read.
 */

export type SpecState =
  /** A draft is on its way. */
  | "drafting"
  /** Drafted, waiting for the person's yes. */
  | "draft"
  | "approved"
  /** Nothing was drafted: the card offers to try again. */
  | "missing";

export type SpecView = {
  state: SpecState;
  specId: string | null;
  version: number | null;
  title: string;
  /** "Senior · Bengaluru, Remote is fine · 4+ years" */
  meta: string;
  mustCount: number;
  niceCount: number;
  /** The first few must-haves, and how many more there are. */
  musts: string[];
  more: number;
  avoid: string[];
  /** The whole spec, when it has been read from the server (the popup edits this). */
  full: RoleSpec | null;
};

/** How many must-haves the card lists before "+N more". */
export const LISTED = 4;

const musts = (s: RoleSpec) => s.requirements.filter((r) => r.importance !== "nice");

export function specView(
  card: Pick<RoleSpecCardData, "spec" | "specId" | "version" | "approved"> & { status?: RoleSpecCardData["status"] },
  live: { ready: boolean; latest: SpecRow | null; drafting: boolean },
): SpecView {
  if (live.latest) {
    const s = live.latest.spec;
    const must = musts(s);
    return {
      state: live.latest.approvedAt ? "approved" : "draft",
      specId: live.latest.id,
      version: live.latest.version,
      title: s.title,
      meta: specMeta(s),
      mustCount: must.length,
      niceCount: s.requirements.length - must.length,
      musts: must.slice(0, LISTED).map((r) => r.text),
      more: Math.max(0, must.length - LISTED),
      avoid: s.avoid.slice(0, LISTED),
      full: s,
    };
  }
  /* Still being read: on the card from the start, until the draft that replaces it (or the spec itself) arrives. */
  if (live.drafting || card.status === "drafting") return { state: "drafting", specId: null, version: null, title: "", meta: "", mustCount: 0, niceCount: 0, musts: [], more: 0, avoid: [], full: null };
  const c = card.spec;
  /* Before the server has answered (or with no server), the card shows what it was made with. */
  if (c && (!live.ready || card.specId)) {
    return {
      state: card.approved ? "approved" : "draft",
      specId: card.specId,
      version: card.version,
      title: c.title,
      meta: specMeta(c),
      mustCount: c.mustCount,
      niceCount: c.niceCount,
      musts: c.musts.slice(0, LISTED),
      more: Math.max(0, c.mustCount - LISTED),
      avoid: c.avoid,
      full: null,
    };
  }
  return { state: "missing", specId: null, version: null, title: "", meta: "", mustCount: 0, niceCount: 0, musts: [], more: 0, avoid: [], full: null };
}

/** "Draft v2", "Approved": the status word, which is coloured text and nothing more. */
export function statusWord(v: Pick<SpecView, "state" | "version">, busy: "approve" | "save" | "draft" | "score" | null): string {
  if (busy === "approve") return "Approving";
  if (busy === "draft" || v.state === "drafting") return "Drafting";
  if (v.state === "approved") return "Approved";
  if (v.state === "draft") return v.version ? `Draft v${v.version}` : "Draft";
  return "Not drafted";
}

/** "9 must-haves, 3 nice-to-haves" */
export function countsLine(mustCount: number, niceCount: number): string {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return [n(mustCount, "must-have", "must-haves"), niceCount > 0 ? n(niceCount, "nice-to-have", "nice-to-haves") : ""].filter(Boolean).join(", ");
}

/** The found people by where they stand: the one set of numbers every line about them is made from. */
export type Buckets = { found: number; strong: number; good: number; partial: number; needsEvidence: number; notScored: number; ruledOut: number };

/** Where the search stands, from one read of the server, so the numbers on the card always add up. */
export type Standing = {
  found: number;
  /** Found people not yet read closely against the spec (what "Score the rest" scores). */
  unscored: number;
  buckets: Buckets;
  /** A search or a scoring going now. */
  running: { runId: string; kind: "search" | "rescore" } | null;
};

export const standingOf = (s: Pick<SourcingStatus, "shown" | "counts" | "unscored" | "running" | "standing">): Standing => {
  const found = s.standing?.found ?? s.counts?.found ?? s.shown;
  const unscored = Math.min(s.unscored ?? 0, found);
  return {
    found,
    unscored,
    /* An older server sends no buckets: everyone not waiting to be read is taken as matched. */
    buckets: s.standing ?? { found, strong: 0, good: Math.max(0, found - unscored), partial: 0, needsEvidence: 0, notScored: unscored, ruledOut: 0 },
    running: s.running ?? null,
  };
};

/** The same buckets from the rows a list draws (a search's people, a campaign's ranked list). */
export function bucketsOfRows(rows: ReadonlyArray<{ status?: string | null | undefined; tier?: string | null | undefined; knockedOut?: string | null | undefined; judgement?: unknown }>): Buckets {
  const b: Buckets = { found: rows.length, strong: 0, good: 0, partial: 0, needsEvidence: 0, notScored: 0, ruledOut: 0 };
  for (const r of rows) {
    const status = r.status ?? (r.knockedOut ? "knocked_out" : r.judgement ? "scored" : "not_scored_yet");
    if (status === "knocked_out") b.ruledOut += 1;
    else if (r.tier === "A") b.strong += 1;
    else if (r.tier === "B") b.good += 1;
    else if (r.tier === "C") b.partial += 1;
    else if (status === "insufficient_evidence") b.needsEvidence += 1;
    else b.notScored += 1;
  }
  return b;
}

const people = (k: number) => `${k.toLocaleString("en-IN")} ${k === 1 ? "person" : "people"}`;
const num = (k: number) => k.toLocaleString("en-IN");

/**
 * THE line about who was found, for every place that says it: "30 found. 11 matched closely, 19 need more evidence." Only
 * the parts that are more than nothing; "20 people found." when there is nothing to qualify.
 */
export function bucketsLine(b: Buckets): string {
  if (b.found === 0) return "Nobody found yet.";
  const matched = b.strong + b.good + b.partial;
  const parts = [
    matched > 0 ? `${num(matched)} matched closely` : "",
    b.needsEvidence > 0 ? `${num(b.needsEvidence)} ${b.needsEvidence === 1 ? "needs" : "need"} more evidence` : "",
    b.notScored > 0 ? `${num(b.notScored)} not scored yet` : "",
    b.ruledOut > 0 ? `${num(b.ruledOut)} ruled out` : "",
  ].filter(Boolean);
  if (matched === b.found || parts.length === 0) return `${people(b.found)} found.`;
  return `${num(b.found)} found. ${parts.join(", ")}.`;
}

export const standingLine = (st: Standing): string => bucketsLine(st.buckets);
