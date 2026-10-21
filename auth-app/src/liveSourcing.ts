import type { Match, MatchCounts, RoleSpec, SourcingStatus, SpecRow } from "./api/agent";
import type { RunEvent } from "./api/events";
import { verdictOf } from "./agentPhases";
import type { PhaseLine } from "./agentPhases";
import { vendorWords } from "./displayText";
import { criteriaOf } from "./liveCandidate";
import type { CandidateSet } from "./liveCandidate";
import { TURN_LIMIT_MS } from "./liveChat";
import type { Filter, Phase, Verdict } from "./sourcing";
import type { StageView } from "./Stages";

/**
 * The sourcing run in the live chat: everything it says or decides that is not drawing.
 *
 * Nothing here is scripted. The filters on the search card are the approved role spec's own,
 * the pool figures are the campaign's sourcing ledger, the phases are the run's real events
 * and their durations are the gaps between the events' own timestamps. The components draw
 * what this returns (`Sourcing.tsx`'s phase blocks, search card and results, `Stages.tsx`).
 */

/* ── small words ─────────────────────────────────────────────────────────── */

export const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

const people = (n: number): string => plural(n, "person", "people");

/** "A", "A or B", "A, B or C". */
export function joinOr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/** "A", "A and B", "A, B and C". */
export function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "4 Oct", in UTC so the same instant reads the same everywhere. */
export function shortDate(iso: string | null): string | null {
  const t = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const sentence = (text: string): string => {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/* ── the spec as the search card shows it ────────────────────────────────── */

const reqs = (spec: RoleSpec, importance: RoleSpec["requirements"][number]["importance"]): string[] =>
  spec.requirements.filter((r) => r.importance === importance).map((r) => r.text.trim()).filter(Boolean);

/** "Bengaluru", "Bengaluru or remote", "Remote"; null when the spec names no place. */
export function locationLine(spec: RoleSpec): string | null {
  const places = spec.locations.map((l) => l.trim()).filter(Boolean);
  if (spec.remoteOk) return places.length ? joinOr([...places, "remote"]) : "Remote";
  return places.length ? joinOr(places) : null;
}

/** "5+ years", "3 to 12 years", "up to 12 years"; null when the spec sets no range. */
export function experienceLine(spec: RoleSpec): string | null {
  const min = spec.yearsMin && spec.yearsMin > 0 ? spec.yearsMin : null;
  const max = spec.yearsMax && spec.yearsMax > 0 ? spec.yearsMax : null;
  if (min !== null && max !== null) return min === max ? `${min} years` : `${min} to ${max} years`;
  if (min !== null) return `${min}+ years`;
  if (max !== null) return `up to ${max} years`;
  return null;
}

/**
 * The spec's own filters, as the search card reads them: the first three fill its sentence
 * ("{title} in {place} with {years} of experience"), the rest fold into "+N more filters".
 * A filter the spec doesn't set is simply absent; the card doesn't invent a placeholder.
 */
export function filterLines(spec: RoleSpec): Filter[] {
  const out: Filter[] = [{ id: "title", label: "Title", value: spec.title }];
  const where = locationLine(spec);
  const years = experienceLine(spec);
  if (where) out.push({ id: "location", label: "Location", value: where });
  if (years) out.push({ id: "experience", label: "Experience", value: years });
  const seniority = spec.seniority?.trim();
  if (seniority && !spec.title.toLowerCase().includes(seniority.toLowerCase())) {
    out.push({ id: "seniority", label: "Seniority", value: seniority });
  }
  const groups: Array<[string, string, string[]]> = [
    ["hard", "Hard requirement", reqs(spec, "knockout")],
    ["must", "Must have", reqs(spec, "must")],
    ["nice", "Nice to have", reqs(spec, "nice")],
    ["avoid", "Avoid", spec.avoid.map((a) => a.trim()).filter(Boolean)],
  ];
  for (const [id, label, items] of groups) if (items.length) out.push({ id, label, value: items.join(", ") });
  return out;
}

/** What the search ranks on, as the card's chips: the spec's strongest requirements, three at most. */
export const criteriaLines = (spec: RoleSpec): string[] => criteriaOf(spec).map((c) => c.text);

/** How many things the spec insists on: hard requirements and must-haves. */
export const mustHaveCount = (spec: RoleSpec): number => reqs(spec, "knockout").length + reqs(spec, "must").length;

/** "2 must have, 1 nice to have", for the line that says what the spec asks for. */
export function requirementCounts(spec: RoleSpec): string {
  const parts = [
    [reqs(spec, "knockout").length, "hard requirement", "hard requirements"],
    [reqs(spec, "must").length, "must have", "must have"],
    [reqs(spec, "nice").length, "nice to have", "nice to have"],
  ] as const;
  return parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(", ");
}

/* ── the pool ────────────────────────────────────────────────────────────── */

/**
 * What the campaign's search stands at. The people are the server's own count (one definition for
 * every page): `found` does not move when someone is decided, `waiting` is the part of it still
 * to review, and `ranked` is everyone the ranked list holds, decided included.
 */
export type Pool = {
  /** People found so far for this campaign. */
  found: number;
  /** Everyone in the ranked list: waiting for a call and already decided. Stable across decisions. */
  ranked: number;
  /** Ranked and waiting for a call: what leaves as people are shortlisted or rejected. */
  waiting: number;
  /** Shortlisted or passed. */
  decided: number;
  /** Found, undecided, and ruled out by a hard requirement. */
  ruledOut: number;
  /** Found, undecided, and not ranked yet on the approved spec (found before it was approved or changed). */
  unranked: number;
  /** What the next search asks Crustdata for. Zero when there's nothing left to ask. */
  nextSize: number;
  exhausted: boolean;
  crustdata: boolean;
};

/**
 * `waiting` is the number of people in the list of people to review; `counts` is the server's own
 * split when it sends one (an older server does not, and then the ledger figure and the list stand in).
 */
export function poolOf(status: SourcingStatus, waiting: number, counts?: MatchCounts | null): Pool {
  const c = counts ?? status.counts ?? null;
  const base = { nextSize: status.nextSize, exhausted: status.exhausted, crustdata: status.crustdata };
  if (!c) {
    // The ledger counts profiles with a public URL; the list can hold a few without one.
    return { found: Math.max(status.shown, waiting), ranked: waiting, waiting, decided: 0, ruledOut: 0, unranked: 0, ...base };
  }
  return {
    found: c.found,
    ranked: c.toReview + c.shortlisted + c.passed,
    waiting: c.toReview,
    decided: c.shortlisted + c.passed,
    ruledOut: c.ruledOut,
    unranked: c.unranked,
    ...base,
  };
}

export const canRun = (p: Pool): boolean => p.nextSize > 0;

/** The first search is "Run search"; any later one is a number more. */
export const runLabel = (p: Pool): string => (p.found === 0 && p.ranked === 0 ? "Run search" : `Find ${p.nextSize} more`);

/**
 * Why nobody is waiting for a call, in words that are true: everyone decided, people the spec was
 * changed under who are not ranked yet (and whether that is happening now), or people a hard
 * requirement rules out. Null when somebody is waiting, or nobody has been found.
 */
export function nobodyWaitingLine(p: Pool, matching = false): string | null {
  if (p.waiting > 0 || p.found === 0) return null;
  if (p.unranked > 0) {
    const n = p.unranked.toLocaleString("en-IN");
    return matching
      ? `Matching ${p.unranked === 1 ? "1 person" : `${n} people`} to the role now.`
      : `${p.unranked === 1 ? "1 person" : `${n} people`} found earlier ${p.unranked === 1 ? "has" : "have"} not been ranked on the latest role spec yet. The next search ranks them.`;
  }
  if (p.ruledOut > 0 && p.decided + p.ruledOut >= p.found) {
    const n = p.ruledOut.toLocaleString("en-IN");
    return p.decided > 0
      ? `Everyone else found, ${n}, ${p.ruledOut === 1 ? "does" : "do"} not meet a hard requirement.`
      : `Nobody is waiting for your call. ${n} found ${p.ruledOut === 1 ? "does" : "do"} not meet a hard requirement.`;
  }
  return "Everyone found so far has been shortlisted or rejected.";
}

/** The card's bracket: how many the next search looks for. Absent when there is no figure to give. */
export function countLine(p: Pool): string | null {
  return canRun(p) ? `up to ${people(p.nextSize)}` : null;
}

/**
 * What the search can't do right now, in plain words; null when nothing is in the way. Where people come from, and
 * what limits it, is not said here: that is for an owner or admin, in Settings > Connections.
 */
export function searchNote(p: Pool): string | null {
  const notes: string[] = [];
  if (p.exhausted) notes.push("That's everyone I could reach for these filters for now. Change the spec to widen the search.");
  else if (p.nextSize <= 0 && p.crustdata) notes.push("This campaign has no searches left for these filters. Change the spec to look further.");
  return notes.length ? notes.join(" ") : null;
}

/* ── the two plan phases ─────────────────────────────────────────────────── */

export type CampaignFacts = { name: string; department?: string; location?: string; status?: string };

export type RoleRead = { campaign: CampaignFacts | null; approved: SpecRow | null; latest: SpecRow | null };

const READ_LIVE = "Reading the role and its spec";

/** What the first phase turned up, line by line: the campaign, the spec and what it asks for. */
export function readSteps({ campaign, approved, latest }: RoleRead): string[] {
  const steps: string[] = [];
  if (campaign) {
    const where = [campaign.department, campaign.location].filter(Boolean).join(", ");
    steps.push(where ? `${campaign.name}: ${where}` : campaign.name);
  }
  if (approved) {
    const on = shortDate(approved.approvedAt);
    steps.push(`Role spec version ${approved.version}, approved${on ? ` ${on}` : ""}`);
    const counts = requirementCounts(approved.spec);
    if (counts) steps.push(`${plural(approved.spec.requirements.length, "requirement")}: ${counts}`);
    else steps.push("No requirements listed, only the title and place");
  } else if (latest) {
    steps.push(`A draft of the role spec (version ${latest.version}) is waiting for approval`);
  } else {
    steps.push("No role spec yet");
  }
  return steps;
}

/** The agent's paragraph after reading the role: what it will search for, or why it can't. */
export function readSays({ campaign, approved, latest }: RoleRead): string {
  const name = campaign?.name ?? "This campaign";
  if (!approved) {
    return latest
      ? `${name} has a draft role spec, but it hasn't been approved, so I can't search yet. Approve it and I'll start looking.`
      : `${name} has no role spec yet, so there is nothing to search on. Paste the job description here and I'll read it, draft the role spec and start the search.`;
  }
  const spec = approved.spec;
  const where = locationLine(spec);
  const first = `This is the ${spec.title} role${where ? ` in ${where}` : ""}.`;
  const must = [...reqs(spec, "knockout"), ...reqs(spec, "must")];
  const nice = reqs(spec, "nice");
  const asks = must.length
    ? `The approved spec asks for ${joinAnd(must)}${nice.length ? `, and counts ${joinAnd(nice)} in a candidate's favour` : ""}.`
    : nice.length
      ? `The approved spec has no must-haves; it counts ${joinAnd(nice)} in a candidate's favour.`
      : "The approved spec lists no skills, so the search leans on the title and place.";
  return `${first} ${asks} Building the search from it now.`;
}

export function readPhase(read: RoleRead, timed = true): Phase {
  return {
    id: "read",
    live: READ_LIVE,
    done: read.approved ? "Read the role and its spec" : "Read the role",
    ms: 0,
    steps: readSteps(read),
    says: readSays(read),
    timed,
  };
}

/** The live line of the first phase, before anything has been read. */
export const readingPhase = (): Phase => ({ id: "read", live: READ_LIVE, done: "Read the role and its spec", ms: 0, steps: [], says: "" });

/**
 * The pool in a sentence, for the paragraph that introduces the search card. It says what is
 * known about the campaign; what the next search can fetch is on the card's own line, and what
 * stands in the way is the card's note, so none of it is said twice.
 */
export function poolSentence(p: Pool): string {
  if (p.found === 0) {
    if (!canRun(p)) return "Nobody has been found for this campaign yet.";
    return "Nobody has been found for this campaign yet. The first search looks for people who fit.";
  }
  const waiting = p.waiting > 0 ? `${p.waiting.toLocaleString("en-IN")} of them ranked and waiting for your call` : "none of them waiting for your call";
  const next = canRun(p) ? " The next search looks for more." : "";
  return `${people(p.found)} found so far, ${waiting}.${next}`;
}

export const buildSays = (p: Pool): string => `Here is the search, straight from the spec. ${poolSentence(p)}`;

export function buildSteps(spec: RoleSpec): string[] {
  const steps = filterLines(spec).map((f) => `${f.label}: ${f.value}`);
  const ranked = criteriaLines(spec);
  if (ranked.length) steps.push(`Ranked by: ${ranked.join(", ")}`);
  return steps;
}

export function buildPhase(spec: RoleSpec, pool: Pool, timed = true): Phase {
  return {
    id: "build",
    live: "Building the search",
    done: "Built the search",
    ms: 0,
    steps: buildSteps(spec),
    says: buildSays(pool),
    timed,
  };
}

export const buildingPhase = (): Phase => ({ id: "build", live: "Building the search", done: "Built the search", ms: 0, steps: [], says: "" });

/* ── the run's events ────────────────────────────────────────────────────── */

export type RunState = {
  status: "idle" | "starting" | "running" | "done" | "failed";
  runId: string | null;
  /** The last event applied, so a replayed or doubled event changes nothing. */
  lastSeq: number;
  /** The events' own times (epoch ms): when the run began, each step landed and it ended. */
  startAt: number | null;
  poolAt: number | null;
  crustAt: number | null;
  scoringAt: number | null;
  endAt: number | null;
  size: number | null;
  pool: number | null;
  fresh: number | null;
  repeats: number;
  /** People the run is scoring, and how many it has scored so far. */
  people: number | null;
  scored: number;
  judged: number;
  features: number;
  ruledOut: number;
  tiers: { A: number; B: number; C: number };
  notices: string[];
  /** The people this search turned up, from its `candidate_list`. */
  items: Match[] | null;
  error: string | null;
};

export const idleRun: RunState = {
  status: "idle", runId: null, lastSeq: 0, startAt: null, poolAt: null, crustAt: null, scoringAt: null, endAt: null,
  size: null, pool: null, fresh: null, repeats: 0, people: null, scored: 0, judged: 0, features: 0, ruledOut: 0,
  tiers: { A: 0, B: 0, C: 0 }, notices: [], items: null, error: null,
};

/** The recruiter pressed Run: nothing has come back yet. */
export const startingRun = (): RunState => ({ ...idleRun, status: "starting" });

/** The request that starts a search was refused or lost: say so in the run's own words. */
export const failedRun = (message: string): RunState => ({ ...idleRun, status: "failed", error: message });

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Folds one streamed event into the run. Pure, so a replay rebuilds the run exactly. */
export function applyRunEvent(s: RunState, e: RunEvent): RunState {
  if (s.runId && e.runId !== s.runId) return s;
  if (e.seq <= s.lastSeq && s.runId) return s;
  const at = Number.isFinite(Date.parse(e.at)) ? Date.parse(e.at) : null;
  let next: RunState = {
    ...s,
    runId: e.runId,
    lastSeq: e.seq,
    startAt: s.startAt ?? at,
    status: s.status === "idle" || s.status === "starting" ? "running" : s.status,
  };
  switch (e.type) {
    case "plan":
      return { ...next, size: num(e.size) ?? next.size };
    case "progress":
      if (e.step === "pool") return { ...next, pool: num(e.found) ?? 0, poolAt: at };
      if (e.step === "crustdata") return { ...next, fresh: num(e.found) ?? 0, repeats: num(e.repeats) ?? 0, crustAt: at };
      if (e.step === "scoring") return { ...next, people: num(e.people) ?? 0, scoringAt: at };
      if (e.step === "scored") {
        const tier = str(e.tier);
        const stage = str(e.stage);
        next = { ...next, scored: next.scored + 1 };
        if (stage === "judged") next.judged += 1;
        if (stage === "features") next.features += 1;
        if (stage === "rules") next.ruledOut += 1;
        if (tier === "A" || tier === "B" || tier === "C") next.tiers = { ...next.tiers, [tier]: next.tiers[tier] + 1 };
        return next;
      }
      return next;
    case "notice": {
      const text = str(e.text)?.trim();
      return text && !next.notices.includes(text) ? { ...next, notices: [...next.notices, text] } : next;
    }
    case "artifact":
      if (e.kind !== "candidate_list") return next;
      // A list sent while the rest are still being judged: the people so far, and the search goes on.
      if (e.partial === true) return { ...next, items: Array.isArray(e.items) ? (e.items as Match[]) : [] };
      return { ...next, items: Array.isArray(e.items) ? (e.items as Match[]) : [], endAt: at ?? next.endAt };
    case "error":
      return { ...next, status: "failed", error: str(e.message) ?? "The search didn't finish.", endAt: next.endAt ?? at };
    case "done":
      return { ...next, status: "done", endAt: next.endAt ?? at };
    default:
      return next;
  }
}

/** One stored event of a run, as `GET /v1/runs/:id` lists them. */
export type EventRow = { id: number; seq: number; type: RunEvent["type"]; payload: Record<string, unknown>; createdAt: string };

/** A stored event in the shape the stream gives, so a run can be read back by either route. */
export const eventFromRow = (runId: string, row: EventRow): RunEvent => ({
  ...row.payload,
  /* The event's own id (a phase line's) stays; the stored row's number is where it came in. */
  id: typeof row.payload.id === "string" && row.payload.id !== "" ? row.payload.id : row.id,
  eventId: row.id,
  type: row.type, runId, seq: row.seq, at: row.createdAt,
});

/**
 * The run is over on the server but its stream never said so (the connection closed just
 * before the last events, or dropped): close it from what the server reports.
 */
export function settleRun(r: RunState, status: "done" | "failed" | "cancelled", message?: string | null): RunState {
  if (r.status === "done" || r.status === "failed") return r;
  if (status === "done") return { ...r, status: "done", endAt: r.endAt ?? Date.now() };
  return { ...r, status: "failed", error: status === "cancelled" ? "Stopped." : (message ?? "The search didn't finish."), endAt: r.endAt ?? Date.now() };
}

/** A run in flight: pressed, or started and not yet ended. */
export const isRunning = (r: RunState): boolean => r.status === "starting" || r.status === "running";

/** People this search put in front of the scorer. */
export const batchOf = (r: RunState): number => (r.pool ?? 0) + (r.fresh ?? 0);

/** The AI judge never answered although some people were left to judge. */
export const judgingDown = (r: RunState): boolean => r.features > 0 && r.judged === 0;

const unscoredOf = (r: RunState): number => Math.max(0, r.scored - r.ruledOut - r.tiers.A - r.tiers.B - r.tiers.C);

const gap = (from: number | null, to: number | null): number | undefined => (from !== null && to !== null ? Math.max(0, to - from) : undefined);

export type RunPhase = { phase: Phase; tookMs: number | undefined };

/**
 * The run's phases, as the phase blocks draw them: searching, then scoring. A phase is settled
 * once the next one has begun (or the run has ended); its time is the gap between the two
 * events that bracket it. A phase that was cut short by a failure isn't drawn as if it had
 * finished: the failure is said in words instead.
 */
export function runPhases(r: RunState): RunPhase[] {
  if (r.status === "idle") return [];
  const failed = r.status === "failed";
  const out: RunPhase[] = [];

  const searchEnd = r.scoringAt ?? (r.status === "done" ? r.endAt : null);
  const searchSettled = searchEnd !== null;
  const found = batchOf(r);
  /* How many, never from where. */
  const searchSteps: string[] = found > 0 ? [`${people(found)} found${r.repeats ? `, ${r.repeats} you had already seen` : ""}`] : [];
  if (searchSettled || !failed) {
    out.push({
      phase: {
        id: "search",
        live: "Finding people",
        done: found > 0 ? `Found ${people(found)}` : "Searched, and found no one new",
        ms: 0,
        steps: searchSteps.length ? searchSteps : ["Nothing came back"],
        says: "",
      },
      tookMs: searchSettled ? gap(r.startAt, searchEnd) : undefined,
    });
  }

  if (r.scoringAt !== null && (r.people ?? 0) + r.scored > 0) {
    const total = Math.max(r.people ?? 0, r.scored);
    const settled = r.status === "done";
    const steps: string[] = [];
    if (r.tiers.A) steps.push(plural(r.tiers.A, "strong fit"));
    if (r.tiers.B) steps.push(plural(r.tiers.B, "good fit"));
    if (r.tiers.C) steps.push(plural(r.tiers.C, "partial fit"));
    if (r.ruledOut) steps.push(`${r.ruledOut} ruled out on a hard requirement`);
    const unscored = unscoredOf(r);
    if (unscored && judgingDown(r)) steps.push(`${unscored} not scored yet, the AI was busy`);
    if (!failed || settled) {
      out.push({
        phase: {
          id: "score",
          live: r.scored > 0 ? `Scoring ${r.scored} of ${people(total)}` : `Scoring ${people(total)}`,
          done: judgingDown(r) ? `Listed ${people(total)} without scores` : `Scored ${people(total)}`,
          ms: 0,
          steps: steps.length ? steps : ["Nobody scored"],
          says: "",
        },
        tookMs: settled ? gap(r.scoringAt, r.endAt) : undefined,
      });
    }
  }
  return out;
}

const REACHED = "I looked through everyone I could reach for this role.";
/** What an older run said about the source being off, out of reach or over its day's limit. */
const LIMITED = /(isn.t connected|everyone (our data provider|crustdata) has|budget for new profiles|new profiles resume|limit on new profiles|own database only|data provider)/i;

/** The server's notices, in plainer words where it helps. */
export function noticeText(text: string): string {
  const t = text.trim();
  if (/meaning search is busy/i.test(t)) return "The AI that reads for meaning was busy, so I matched on titles and skills only this time. Results may be narrower.";
  /* Where people come from, and what limits it, is the admins' to read: a recruiter gets the plain result. */
  if (/contact detail/i.test(t) && /crustdata|data provider/i.test(t)) return "I couldn't get every contact detail this time. They can be looked up again later.";
  if (LIMITED.test(t)) return REACHED;
  if (/AI is busy/i.test(t)) return "The AI was busy, so these people are listed without scores. They'll be scored on the next search.";
  return sentence(vendorWords(t));
}

/** The agent's closing paragraph when a search ends: what it found, or why there is nothing. */
export function runSummary(r: RunState): string {
  if (r.status === "failed") {
    return `${r.runId ? "The search stopped before it finished." : "The search didn't start."} ${sentence(vendorWords((r.error ?? "Something went wrong.").replace(/^(Crustdata|Our data provider)\b/i, "That")))} You can try again.`;
  }
  const n = batchOf(r);
  if (n === 0) return "Nothing new turned up for these filters this time.";
  if (judgingDown(r)) return `Found ${people(n)}, but they are listed without scores because the AI was busy. They'll be scored on the next search.`;
  const tiers = [
    r.tiers.A ? plural(r.tiers.A, "strong fit") : "",
    r.tiers.B ? plural(r.tiers.B, "good fit") : "",
    r.tiers.C ? plural(r.tiers.C, "partial fit") : "",
  ].filter(Boolean);
  return tiers.length ? `Found ${people(n)}: ${joinAnd(tiers)}.` : `Found ${people(n)}.`;
}

/**
 * A search the chat follows (`liveChat.Search`) as the run's state the goal tracker reads, so a search started
 * from a message, a press or an approval is drawn with the same three legs as the sourcing view's own run.
 * Only what is known is filled: the found count, how many were scored of how many, and whether it ended.
 */
export function runStateOfSearch(s: {
  runId: string;
  status: "running" | "done" | "failed";
  error: string | null;
  size: number | null;
  pool: number | null;
  fresh: number | null;
  scored: number;
  phases: ReadonlyArray<{ phase: string; total?: number | undefined }>;
  items: readonly Match[] | null;
}): RunState {
  const match = s.phases.find((p) => p.phase === "match");
  const batch = (s.pool ?? 0) + (s.fresh ?? 0);
  const tiers = { A: 0, B: 0, C: 0 };
  for (const m of s.items ?? []) if (m.tier) tiers[m.tier] += 1;
  const scoring = match !== undefined || s.scored > 0;
  return {
    ...idleRun,
    status: s.status === "running" ? "running" : s.status,
    runId: s.runId,
    startAt: 0,
    size: s.size,
    pool: s.pool,
    fresh: s.fresh,
    scoringAt: scoring ? 1 : null,
    endAt: s.status === "running" ? null : 1,
    people: scoring ? (match?.total ?? batch) : null,
    scored: s.scored,
    tiers,
    error: s.error,
  };
}

/* ── the three legs of the goal ──────────────────────────────────────────── */

export type StageInput = {
  readDone: boolean;
  buildDone: boolean;
  /** The campaign had people before this view ran anything. */
  searched: boolean;
  run: RunState;
  found: number;
  ranked: number;
  criteria: number;
  /** The best few, best first, by person id. */
  preview: readonly string[];
  verdicts: Readonly<Record<string, Verdict>>;
};

/** Where the run stands as the goal's three legs. Derived from the data, never stored. */
export function liveStages(i: StageInput): { stages: StageView[]; reached: boolean; summary: string } {
  const r = i.run;
  const ran = r.status !== "idle";
  const failed = r.status === "failed";
  const running = isRunning(r);
  const scored = r.status === "done";
  const settledBefore = !ran && i.searched;
  const searchSettled = !failed && (r.scoringAt !== null || scored);

  const parts = [i.readDone, i.buildDone, ran || i.searched, searchSettled || settledBefore];
  const searchDone = parts.filter(Boolean).length;
  const searching: StageView = {
    id: "search",
    progress: searchDone / 4,
    state: failed ? "wait" : searchSettled || settledBefore ? "done" : !ran && i.buildDone ? "wait" : "live",
    note: failed ? "The search didn't finish"
      : settledBefore || searchSettled ? "Found"
      : !ran && i.buildDone ? "Waiting for you to run it"
      : ran ? "Looking for people who fit"
      : i.readDone ? "Building the search" : "Reading the role",
  };

  const matchDone = scored || settledBefore;
  const scoring = ran && r.scoringAt !== null && !scored && !failed;
  const matching: StageView = {
    id: "match",
    progress: matchDone ? 1 : (r.people ?? 0) > 0 ? Math.min(1, r.scored / (r.people ?? 1)) : 0,
    state: matchDone ? "done" : scoring ? "live" : "todo",
    note: matchDone ? (i.ranked > 0 ? "Done" : "Nothing to rank")
      : scoring ? `Scoring ${r.scored} of ${r.people ?? 0}`
      /* The spec's real must-have count, or no number at all when it isn't known (never "0 criteria"). */
      : i.criteria > 0 ? `Match on ${plural(i.criteria, "must-have")}` : "Matching them to the role",
  };

  const called = i.preview.filter((id) => i.verdicts[id]);
  const kept = called.filter((id) => i.verdicts[id] === "shortlisted").length;
  const atResults = matchDone && i.preview.length > 0 && !running;
  const reached = atResults && called.length === i.preview.length;
  const deciding: StageView = {
    id: "decide",
    progress: i.preview.length ? called.length / i.preview.length : 0,
    state: reached ? "done" : atResults ? "wait" : "todo",
    /* Nothing is said until it is finished: the count is the header's, once the goal is reached. */
    note: reached ? "Done" : "",
  };

  return {
    stages: [searching, matching, deciding],
    reached,
    summary: kept ? `Goal reached · ${kept} shortlisted` : "Goal reached",
  };
}

/* ── the results ─────────────────────────────────────────────────────────── */

/**
 * The words around the three best, from the real list. `found` is how many people this search found: when it is
 * given, that is the count the line says, and "ranked" is added only when the campaign's ranked list is a
 * different pool (everyone ever found for it), and says so.
 */
export function resultsCopy(i: { shown: number; total: number; unscored: number; found?: number }): { title: string; count: string; sub: string; all: string } {
  const total = i.total.toLocaleString("en-IN");
  const found = i.found !== undefined && i.found > 0 ? i.found : null;
  const wider = found !== null && i.total > found;
  return {
    title: i.shown === 1 ? "The best fit so far" : "The best fits so far",
    count: found !== null
      ? `${i.shown} shown of ${found.toLocaleString("en-IN")} found${wider ? ` · ${total} ranked in the campaign` : ""}`
      : `${i.shown} shown · ${total} ranked`,
    sub: i.unscored > 0
      ? "Some of these aren't scored yet, so they're in the order of keyword match."
      : "Shortlist the ones worth reaching out to. A rejection takes a short reason.",
    all: wider
      ? `See all ${total} ranked in the campaign`
      : `See all ${total} ranked ${i.total === 1 ? "profile" : "profiles"}`,
  };
}

/**
 * The closing line of a finished search when some of the people were not scored: how many were, and what order
 * the rest are in. Null when everyone was scored, or nobody was (the run's own line says that plainly).
 */
export function scoredLine(found: number, scored: number): { label: string; rest: string } | null {
  if (found <= 0 || scored <= 0 || scored >= found) return null;
  return {
    label: `Scored ${scored.toLocaleString("en-IN")} of ${found.toLocaleString("en-IN")}`,
    rest: "The rest are in the order of keyword match.",
  };
}

/** The run's own detail ("2 good fits, 2 partial fits, 16 not scored yet") without the part the closing line says. */
export function fitsOnly(detail: string | undefined | null): string | null {
  const t = (detail ?? "").split(",").map((p) => p.trim()).filter((p) => p && !/not scored yet|unscored/i.test(p)).join(", ");
  return t || null;
}

/**
 * The phase lines with the last one made to agree with the numbers on screen. The run says "Ready for your
 * call · 2 good fits, 16 not scored yet" at its end; where some of the people found were not scored, the line
 * says how many were, of how many, and that the rest are in the order of keyword match. Otherwise unchanged.
 */
export function closeVerdict(lines: readonly PhaseLine[], found: number, scored: number): readonly PhaseLine[] {
  const said = scoredLine(found, scored);
  const verdict = verdictOf(lines);
  if (!said || !verdict) return lines;
  const fits = fitsOnly(verdict.detail);
  const { detail: _was, ...rest } = verdict;
  return lines.map((l) => (l.id === verdict.id ? { ...rest, label: said.label, detail: fits ? `${fits}. ${said.rest}` : said.rest } : l));
}

/** People the judge hasn't read yet: no verdicts, so no fit marks to show. */
export const unscoredIds = (rows: readonly Pick<Match, "personId" | "judgement">[]): Set<string> => new Set(rows.filter((m) => !m.judgement).map((m) => m.personId));

/** How many of the first `n` rows the judge hasn't scored. */
export const unscoredIn = (rows: readonly Pick<Match, "judgement">[], n: number): number => rows.slice(0, n).filter((m) => !m.judgement).length;

/**
 * The server's notices worth showing on their own: one the closing paragraph already says
 * (the AI was busy, so people are listed unscored) isn't said twice.
 */
export const visibleNotices = (r: RunState): string[] => r.notices.filter((n) => !(judgingDown(r) && /AI is busy/i.test(n))).map(noticeText);

/**
 * A reloaded list replaces the one in the store, but a person whose profile was already
 * opened (their history loaded) keeps it, so the sheet doesn't go blank while it reloads.
 */
export function mergeSet(prev: CandidateSet | null, next: CandidateSet): CandidateSet {
  if (!prev) return next;
  const had = new Map(prev.candidates.filter((c) => c.jobs.length > 0).map((c) => [c.id, c]));
  return { ...next, candidates: next.candidates.map((c) => (c.jobs.length === 0 ? (had.get(c.id) ?? c) : c)) };
}

/* ── a chat that came back ───────────────────────────────────────────────── */

/**
 * Whether a view that is mounting belongs to a turn that was already on screen: this tab has
 * seen it before (a reload, reopening the chat), or the turn is older than a turn can run.
 * Such a view shows the campaign as it stands and starts nothing.
 */
export function cameBack(seen: boolean, startedAt: number | null, now = Date.now()): boolean {
  return seen || (startedAt !== null && now - startedAt > TURN_LIMIT_MS);
}
