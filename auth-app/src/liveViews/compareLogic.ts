import type { Match, MatchProfile, Verdict as JudgeVerdict } from "../api/agent";
import type { ApiBoardRow } from "../api/campaigns";
import { stageLabel } from "../chatCards";
import type { Criterion } from "../liveCandidate";

/**
 * The comparison's decisions, in code a test can read: who a request names, which campaign's
 * criteria apply, what the judge said about each person on each criterion, and the one line
 * that says who leads. Nothing here draws or fetches.
 */

/* ── who ─────────────────────────────────────────────────────────────────── */

/** Someone the comparison can use: from a campaign's board or matches, or found by name. */
export type PoolEntry = {
  /** The id the console's surfaces know this person by (the sourced person's, else the candidate's). */
  id: string;
  name: string;
  /** The campaigns this person is known to be in. */
  campaigns: readonly string[];
};

/** A person as the comparison knows them before any profile is read. */
export type Entry = PoolEntry & {
  personId: string | null;
  candidateId: string | null;
  title: string | null;
  company: string | null;
  /** Where they stand on each campaign's board, by campaign id. */
  stages: Readonly<Record<string, string>>;
  tier: "A" | "B" | "C" | null;
};

export const entryFromBoard = (r: ApiBoardRow, campaignId: string): Entry => ({
  id: r.personId,
  personId: r.personId,
  candidateId: r.candidateId,
  name: r.fullName,
  title: r.currentTitle,
  company: r.currentCompanyName,
  campaigns: [campaignId],
  stages: { [campaignId]: r.stage },
  tier: r.tier,
});

export const entryFromMatch = (m: Match, campaignId: string): Entry => ({
  id: m.personId,
  personId: m.personId,
  candidateId: null,
  name: m.fullName,
  title: m.currentTitle,
  company: m.currentCompanyName,
  campaigns: [campaignId],
  stages: {},
  tier: m.tier,
});

/** A candidate row (the workspace list or a profile) with the campaigns they are on. */
export function entryFromCandidate(r: {
  id: string;
  personId?: string | null;
  fullName: string;
  currentTitle: string | null;
  currentCompanyName: string | null;
  campaigns: readonly { id: string; stage: string }[];
}): Entry {
  return {
    id: r.personId ?? r.id,
    personId: r.personId ?? null,
    candidateId: r.id,
    name: r.fullName,
    title: r.currentTitle,
    company: r.currentCompanyName,
    campaigns: r.campaigns.map((c) => c.id),
    stages: Object.fromEntries(r.campaigns.map((c) => [c.id, c.stage])),
    tier: null,
  };
}

/** The same person seen twice (a board and the matches): their facts join. */
export function mergeEntries(into: Entry[], more: readonly Entry[]): Entry[] {
  const out = [...into];
  for (const e of more) {
    const at = out.findIndex((x) => x.id === e.id || (x.candidateId !== null && x.candidateId === e.candidateId));
    if (at < 0) {
      out.push(e);
      continue;
    }
    const x = out[at] as Entry;
    out[at] = {
      ...x,
      personId: x.personId ?? e.personId,
      candidateId: x.candidateId ?? e.candidateId,
      campaigns: [...new Set([...x.campaigns, ...e.campaigns])],
      stages: { ...e.stages, ...x.stages },
      tier: x.tier ?? e.tier,
    };
  }
  return out;
}

const STAGE_RANK: Readonly<Record<string, number>> = { shortlisted: 0, interviewing: 1, outreach: 2, hired: 8, passed: 9 };

/** Who to offer first: the shortlist, then the rest of the board, then the sourced people by fit. */
export function poolRank(e: Entry, campaignId: string | null): number {
  const stage = campaignId ? e.stages[campaignId] : undefined;
  if (stage) return STAGE_RANK[stage] ?? 5;
  return 3 + (e.tier === "A" ? 0 : e.tier === "B" ? 1 : e.tier === "C" ? 2 : 3);
}

/** The choices for a "who" question: best first, nobody already picked, never someone passed on. */
export function whoOptions(
  pool: readonly Entry[], campaignId: string | null, skip: readonly string[], limit = 16, names: Readonly<Record<string, string>> = {},
): { id: string; label: string; meta: string }[] {
  return pool
    .filter((e) => !skip.includes(e.id) && (campaignId ? e.stages[campaignId] !== "passed" : true))
    .map((e, i) => ({ e, i, rank: poolRank(e, campaignId) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, limit)
    .map(({ e }) => optionOf(e, campaignId, names));
}

/**
 * A person as a tile: their name, then their role and where they stand, on this campaign's
 * board or else on the first campaign they are on (named, so two people alike can be told apart).
 */
export function optionOf(e: Entry, campaignId: string | null, names: Readonly<Record<string, string>> = {}): { id: string; label: string; meta: string } {
  const here = campaignId ? e.stages[campaignId] : undefined;
  const elsewhere = here ? undefined : Object.entries(e.stages)[0];
  const stage = here
    ? stageLabel(here)
    : elsewhere
      ? [stageLabel(elsewhere[1]), names[elsewhere[0]]].filter(Boolean).join(" in ")
      : "";
  return { id: e.id, label: e.name, meta: [[e.title, e.company].filter(Boolean).join(" at "), stage].filter(Boolean).join(" · ") };
}

/** The ids a card names (people or candidates), as the pool knows them; ones it can't find are dropped. */
export function explicitIds(card: { personIds: readonly string[]; candidateIds: readonly string[] }, pool: readonly Entry[]): string[] {
  const out: string[] = [];
  for (const id of card.personIds) if (pool.some((e) => e.id === id)) out.push(id);
  for (const id of card.candidateIds) {
    const hit = pool.find((e) => e.candidateId === id);
    if (hit) out.push(hit.id);
  }
  return [...new Set(out)];
}

const fold = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();

/** Words that are never a name, so a sentence around the names isn't searched for. */
const NOT_A_NAME = new Set([
  "them", "these", "those", "both", "everyone", "everybody", "all", "it", "us", "me", "who", "which", "whom", "better", "best", "the", "two",
  "three", "four", "shortlist", "shortlisted", "candidates", "candidate", "people", "profiles", "profile", "side", "by", "please", "is", "are",
  "should", "hire", "first", "second", "top", "my", "our", "their", "a", "an", "of", "to",
]);

/** The part of a request that names people: after "compare", before "for <campaign>". */
export function nameZone(said: string): string {
  let s = said.trim().replace(/[?!.]+$/, "");
  s = s.replace(/^(?:please\s+|can you\s+|could you\s+|let'?s\s+)*(?:compare|contrast|put)\s+/i, "");
  s = s.replace(/\s+side[- ]by[- ]side\b.*$/i, "");
  return s.replace(/\s+(?:for|in|on|across|against the|within)\s+.*$/i, "");
}

/**
 * The names a request puts side by side: "Compare Asha Sharma and Ravi for fn3 Android" gives
 * ["Asha Sharma", "Ravi"]. What follows "for", "in" or "on" is the campaign, not a person.
 */
export function nameMentions(said: string): string[] {
  return nameZone(said)
    .split(/\s*(?:,|&|\band\b|\bvs\.?(?=\s|$)|\bversus\b|\bwith\b|\bagainst\b|\bor\b)\s*/i)
    .map((part) => part.trim())
    .filter((part) => {
      const words = part.split(/\s+/);
      if (words.length < 1 || words.length > 4) return false;
      if (!words.every((w) => /^[\p{L}][\p{L}'.-]*$/u.test(w))) return false;
      return !words.every((w) => NOT_A_NAME.has(w.toLowerCase()));
    });
}

const tokensOf = (s: string): string[] => fold(s).split(" ").filter(Boolean);

/** Whether every word of the phrase is a word of the person's name. */
const nameHas = (phrase: string, name: string): boolean => {
  const want = tokensOf(phrase);
  const have = new Set(tokensOf(name));
  return want.length > 0 && want.every((w) => have.has(w));
};

export type Resolved = {
  /** People named once and unmistakably, in the order the request names them. */
  ids: string[];
  /** A name that fits several people: the recruiter picks. */
  ambiguous: { phrase: string; ids: string[] }[];
  /** Names nobody in the pool answers to, for a search of the whole workspace. */
  unresolved: string[];
};

/** Matches the names in a request against the people at hand. */
export function resolveNames(said: string, pool: readonly PoolEntry[]): Resolved {
  const ids: string[] = [];
  const ambiguous: { phrase: string; ids: string[] }[] = [];
  const unresolved: string[] = [];
  const add = (id: string) => { if (!ids.includes(id)) ids.push(id); };
  const mentions = nameMentions(said);
  for (const phrase of mentions) {
    const hits = pool.filter((p) => nameHas(phrase, p.name));
    const exact = hits.filter((p) => fold(p.name) === fold(phrase));
    if (exact.length === 1) add(exact[0]!.id);
    else if (hits.length === 1) add(hits[0]!.id);
    else if (hits.length > 1) ambiguous.push({ phrase, ids: hits.map((h) => h.id) });
    else unresolved.push(phrase);
  }
  if (!mentions.length) {
    // The words didn't split into names: any first or last name said aloud still counts.
    const spoken = new Set(tokensOf(nameZone(said)));
    for (const p of pool) {
      const t = tokensOf(p.name);
      const first = t[0];
      const last = t[t.length - 1];
      if ((first && first.length >= 3 && spoken.has(first)) || (last && t.length > 1 && last.length >= 3 && spoken.has(last))) add(p.id);
    }
  }
  return { ids, ambiguous, unresolved };
}

/* ── which campaign's criteria ───────────────────────────────────────────── */

/** The campaigns every person is in, in the first person's order. */
export function sharedCampaigns(lists: readonly (readonly string[])[]): string[] {
  const [first, ...rest] = lists;
  if (!first) return [];
  return first.filter((id, i) => first.indexOf(id) === i && rest.every((l) => l.includes(id)));
}

export type CampaignChoice = { kind: "use"; id: string } | { kind: "ask"; options: string[] } | { kind: "none" };

/**
 * Which campaign's criteria to compare on. The agent's named campaign wins when the people are
 * in it; otherwise the one campaign they share; several shared campaigns are the recruiter's
 * to choose (each ranks on different criteria); none shared means there is nothing to rank on.
 */
export function chooseCampaign(input: { named: string | null; shared: readonly string[]; answered?: string | null }): CampaignChoice {
  const { named, shared, answered } = input;
  if (answered) return { kind: "use", id: answered };
  if (named && (shared.includes(named) || shared.length === 0)) return { kind: "use", id: named };
  if (shared.length === 1) return { kind: "use", id: shared[0] as string };
  if (shared.length > 1) return { kind: "ask", options: [...shared] };
  return { kind: "none" };
}

/** What a request still needs before it can be drawn. */
export type Plan = {
  ids: string[];
  ambiguous: { phrase: string; ids: string[] }[];
  need: "which" | "who" | "campaign" | null;
  campaign: CampaignChoice;
};

export const MAX_PEOPLE = 4;

/**
 * The whole decision, from what the agent sent, what the recruiter has answered so far, and
 * the people on hand. Questions chain: a name that fits two people first, then who, then which
 * campaign; each answer is folded into `picked`.
 */
export function plan(input: {
  said: string;
  card: { campaignId: string | null; ids: readonly string[] };
  picked: readonly string[];
  answeredCampaign: string | null;
  pool: readonly PoolEntry[];
}): Plan {
  const { said, card, picked, answeredCampaign, pool } = input;
  const named = resolveNames(said, pool);
  const ambiguous = named.ambiguous.filter((group) => !group.ids.some((id) => picked.includes(id) || named.ids.includes(id)));
  const ids = [...new Set([...card.ids, ...named.ids, ...picked])].slice(0, MAX_PEOPLE);
  if (ambiguous.length) return { ids, ambiguous, need: "which", campaign: { kind: "none" } };
  if (ids.length < 2) return { ids, ambiguous: [], need: "who", campaign: { kind: "none" } };
  const people = ids.map((id) => pool.find((p) => p.id === id));
  const shared = sharedCampaigns(people.map((p) => p?.campaigns ?? []));
  const campaign = chooseCampaign({ named: card.campaignId, shared, answered: answeredCampaign });
  return { ids, ambiguous: [], need: campaign.kind === "ask" ? "campaign" : null, campaign };
}

/* ── the judge's read, per criterion ─────────────────────────────────────── */

/** Which criteria a person meets, and the judge's evidence for each. Absent: they were not judged. */
export type CompareSource = {
  /** The campaign the fit is for, as it reads in headings. */
  name: string;
  criteria: readonly string[];
  meets: Readonly<Record<string, readonly boolean[]>>;
  evidence: Readonly<Record<string, readonly string[]>>;
  /** Where someone stands on this campaign's board, for those already on it. */
  status?: Readonly<Record<string, string>>;
};

type Judgement = NonNullable<Match["judgement"]>;

const sentence = (s: string): string => {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > 140 ? `${t.slice(0, 137).trimEnd()}…` : t;
};

/** What the judge said about one criterion, in a line a recruiter can read at a glance. */
export function evidenceLine(v: JudgeVerdict | undefined): string {
  if (!v) return "Not judged";
  const why = sentence(v.evidence ?? "");
  switch (v.verdict) {
    case "met":
      return why || "Yes";
    case "partial":
      return why ? `Partly: ${why}` : "Partly";
    case "not_met":
      return why || "Not found";
    default:
      return why || "Not clear from the profile";
  }
}

/** The fit of one person on the campaign's criteria; null when nobody judged them. */
export function fitOf(judgement: Judgement | null | undefined, criteria: readonly Pick<Criterion, "id">[]): { meets: boolean[]; evidence: string[] } | null {
  if (!judgement) return null;
  const by = new Map(judgement.verdicts.map((v) => [v.requirementId, v]));
  return {
    meets: criteria.map((c) => by.get(c.id)?.verdict === "met"),
    evidence: criteria.map((c) => evidenceLine(by.get(c.id))),
  };
}

/** The campaign's criteria and every judged person's fit, for the dialog and the summary. */
export function buildSource(input: {
  name: string;
  criteria: readonly Criterion[];
  people: readonly { id: string; judgement: Judgement | null | undefined; status?: string | null }[];
}): CompareSource {
  const meets: Record<string, readonly boolean[]> = {};
  const evidence: Record<string, readonly string[]> = {};
  const status: Record<string, string> = {};
  for (const p of input.people) {
    const fit = fitOf(p.judgement, input.criteria);
    if (fit) {
      meets[p.id] = fit.meets;
      evidence[p.id] = fit.evidence;
    }
    if (p.status) status[p.id] = p.status;
  }
  return { name: input.name, criteria: input.criteria.map((c) => c.text), meets, evidence, status };
}

/** A sourced person's profile as the match the candidate surfaces are built from. */
export function matchFromProfile(personId: string, mp: MatchProfile): Match {
  const p = mp.profile;
  return {
    personId,
    fullName: p.fullName,
    headline: p.headline,
    currentTitle: p.currentTitle,
    currentCompanyName: p.currentCompanyName,
    city: p.city,
    linkedinUrl: p.linkedinUrl,
    profileImageUrl: mp.profileImageUrl,
    yearsOfExperience: p.yearsOfExperience,
    source: "ours",
    stage: mp.stage ?? "judged",
    score: mp.score,
    tier: mp.tier,
    knockedOut: null,
    judgement: mp.judgement,
  };
}

/* ── the line that says who leads ────────────────────────────────────────── */

type Rated = { id: string; name: string; totalYears: number; avgTenure: number };

/** A person is named in full: a first word alone is not always a name ("Imp 64"), and two people can share one. */
const called = (name: string): string => name.trim() || name;
const years = (n: number): string => `${n} ${n === 1 ? "year" : "years"}`;
const list = (xs: readonly string[]): string => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * Who leads and why, from what is on record: the criteria the judge found met, then years of
 * experience, with tenure alongside. Someone nobody judged is never ranked on fit, and with no
 * fit for anyone the line says it is going on experience alone and names no pick.
 */
export function compareVerdict(people: readonly Rated[], source: CompareSource | null): { leadId: string | null; line: string } {
  const criteria = source?.criteria ?? [];
  const judged = source && criteria.length ? people.filter((p) => source.meets[p.id]) : [];
  const metOf = (p: Rated) => (source?.meets[p.id] ?? []).filter(Boolean).length;

  if (source && judged.length) {
    const ranked = [...judged].sort((a, b) => metOf(b) * 100 + b.totalYears - (metOf(a) * 100 + a.totalYears));
    const top = ranked[0] as Rated;
    const next = ranked[1];
    const n = criteria.length;
    const unjudged = people.filter((p) => !judged.includes(p));
    const unjudgedLine = unjudged.length
      ? `${list(unjudged.map((p) => called(p.name)))} ${unjudged.length === 1 ? "hasn't" : "haven't"} been judged on these criteria yet.`
      : "";
    if (next && metOf(next) === metOf(top) && next.totalYears === top.totalYears) {
      const level = ranked.filter((p) => metOf(p) === metOf(top) && p.totalYears === top.totalYears);
      return {
        leadId: null,
        line: `${list(level.map((p) => called(p.name)))} are level: each meets ${metOf(top)} of ${n} ${source.name} criteria with ${years(top.totalYears)}. ${unjudgedLine}`.trim(),
      };
    }
    const tenure = top.avgTenure > 0 ? ` and ${years(top.avgTenure)} average tenure` : "";
    // What each of the others lacks that the leader has; the same criteria met, said plainly.
    const others = ranked.slice(1).map((o) => {
      const miss = criteria.filter((_, i) => source.meets[top.id]?.[i] && !source.meets[o.id]?.[i]);
      return miss.length ? `${called(o.name)} misses ${list(miss)}` : `${called(o.name)} meets the same criteria with ${years(o.totalYears)}`;
    });
    const lead = `${called(top.name)} meets ${metOf(top)} of ${n} ${source.name} criteria with ${years(top.totalYears)}${tenure}.`;
    const rest = others.length ? ` ${others.join("; ")}.` : "";
    return { leadId: judged.length >= 2 ? top.id : null, line: `${lead}${rest} ${unjudgedLine}`.trim() };
  }

  const byYears = [...people].sort((a, b) => b.totalYears - a.totalYears);
  const top = byYears[0] as Rated;
  const why = source?.name ? `None of them has been judged on the ${source.name} criteria yet, so this is on experience alone.` : "They aren't on a campaign together, so this is on experience alone.";
  if (byYears.length > 1 && byYears[1]?.totalYears === top.totalYears) {
    return { leadId: null, line: `${why} They are level at ${years(top.totalYears)}.` };
  }
  const tenure = top.avgTenure > 0 ? `, ${years(top.avgTenure)} average tenure` : "";
  const rest = byYears.slice(1).map((o) => `${called(o.name)} has ${years(o.totalYears)}`);
  return { leadId: null, line: `${why} ${called(top.name)} has the most at ${years(top.totalYears)}${tenure}; ${rest.join(", ")}.` };
}
