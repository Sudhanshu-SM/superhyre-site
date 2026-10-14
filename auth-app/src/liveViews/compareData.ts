import type { Match, SpecRow } from "../api/agent";
import { agentApi, specApi } from "../api/agent";
import { boardRows } from "../api/campaigns";
import { api } from "../api/client";
import type { CandidateDetail } from "../api/candidates";
import { getCandidate, listCandidates } from "../api/candidates";
import { candidateFromDetail, candidateFromMatch, criteriaOf } from "../liveCandidate";
import type { Criterion } from "../liveCandidate";
import { getSet } from "../liveCandidates";
import type { Candidate } from "../sourcing";
import { stageLabel } from "../chatCards";
import type { CompareSource, Entry } from "./compareLogic";
import {
  buildSource, entryFromBoard, entryFromCandidate, entryFromMatch, explicitIds, matchFromProfile, mergeEntries, plan, resolveNames,
} from "./compareLogic";

/**
 * What the comparison reads from the workspace: the people it can offer, and, once it knows who
 * and for which campaign, each person's profile with the judge's read of them.
 */

export type Dir = {
  pool: Entry[];
  /** Campaign names learned on the way, for the questions that name campaigns. */
  names: Record<string, string>;
  /** Workspace profiles already read, so a person isn't fetched twice. */
  details: Map<string, CandidateDetail>;
};

type CardIds = { campaignId: string | null; candidateIds: readonly string[]; personIds: readonly string[] };

const matchesOf = (campaignId: string) =>
  api<{ spec: SpecRow | null; rows: Match[] }>("GET", `/v1/campaigns/${campaignId}/matches`).then((r) => r.rows);

/** The campaign's board and, only when the request needs them, the people its search found. */
export async function loadDir(input: { said: string; card: CardIds; poolCampaign: string | null }): Promise<Dir> {
  const { said, card, poolCampaign } = input;
  const names: Record<string, string> = {};
  const details = new Map<string, CandidateDetail>();
  let pool: Entry[] = [];

  if (poolCampaign) {
    pool = mergeEntries(pool, (await boardRows(poolCampaign)).map((r) => entryFromBoard(r, poolCampaign)));
    // People the campaign's own search turned up are already in the console's store.
    const known = getSet(poolCampaign);
    if (known) {
      pool = mergeEntries(pool, known.candidates.map((c): Entry => ({
        id: c.id, personId: c.id, candidateId: null, name: c.name, title: c.headline || null, company: c.current.name || null,
        campaigns: [poolCampaign], stages: {}, tier: null,
      })));
    }
  }

  // Workspace people the card names that aren't on this board.
  for (const id of card.candidateIds) {
    if (pool.some((e) => e.candidateId === id)) continue;
    try {
      const d = await getCandidate(id);
      details.set(id, d);
      pool = mergeEntries(pool, [entryFromCandidate({ ...d.candidate, personId: (d.candidate as { personId?: string }).personId ?? null, campaigns: d.campaigns })]);
      for (const c of d.campaigns) names[c.id] = c.name;
    } catch { /* a person who is gone is simply not offered */ }
  }

  const needMore = () => {
    const r = resolveNames(said, pool);
    return r.unresolved.length > 0 || explicitIds(card, pool).length + r.ids.length < 2 || card.personIds.some((id) => !pool.some((e) => e.id === id));
  };

  // The sourced people (not yet on the board) only when the request reaches for them.
  if (poolCampaign && needMore()) {
    try { pool = mergeEntries(pool, (await matchesOf(poolCampaign)).map((m) => entryFromMatch(m, poolCampaign))); } catch { /* the board alone is enough to go on */ }
  }

  // A name neither knows: look it up across the workspace.
  for (const phrase of resolveNames(said, pool).unresolved.slice(0, 3)) {
    try {
      const { rows } = await listCandidates({ q: phrase, sort: "name", limit: 8 });
      pool = mergeEntries(pool, rows.map((r) => entryFromCandidate({ ...r, personId: (r as { personId?: string }).personId ?? null })));
      for (const r of rows) for (const c of r.campaigns) names[c.id] = c.name;
    } catch { /* the question will offer the people it does have */ }
  }

  // Everyone named is in how many campaigns? A board only says one; the profile says them all.
  const named = plan({ said, card: { campaignId: card.campaignId, ids: explicitIds(card, pool) }, picked: [], answeredCampaign: null, pool }).ids;
  await Promise.all(named.map(async (id) => {
    const e = pool.find((x) => x.id === id);
    if (!e?.candidateId) return;
    try {
      const d = details.get(e.candidateId) ?? await getCandidate(e.candidateId);
      details.set(e.candidateId, d);
      for (const c of d.campaigns) names[c.id] = c.name;
      pool = mergeEntries(pool.filter((x) => x !== e), [{ ...e, campaigns: d.campaigns.map((c) => c.id), stages: Object.fromEntries(d.campaigns.map((c) => [c.id, c.stage])) }]);
    } catch { /* keeps what the board said */ }
  }));
  return { pool, names, details };
}

export type Loaded = {
  people: Candidate[];
  criteria: Criterion[];
  source: CompareSource;
  /** Whose profile couldn't be read, by name. */
  missing: string[];
};

/** Each person's profile, and the judge's read of them on the campaign's criteria. */
export async function loadComparison(input: { ids: readonly string[]; dir: Dir; campaignId: string | null; campaignName: string }): Promise<Loaded> {
  const { ids, dir, campaignId, campaignName } = input;
  let spec: SpecRow | null = null;
  if (campaignId) {
    try {
      const s = await specApi.get(campaignId);
      spec = s.approved ?? s.latest;
    } catch { /* no criteria to show; the profiles still compare */ }
  }
  const criteria = criteriaOf(spec?.spec);

  const read = await Promise.all(ids.map(async (id) => {
    const e = dir.pool.find((x) => x.id === id);
    if (!e) return null;
    const status = campaignId && e.stages[campaignId] ? stageLabel(e.stages[campaignId] as string) : null;
    if (campaignId && e.personId) {
      try {
        const mp = await agentApi.matchProfile(campaignId, e.personId);
        return { c: candidateFromMatch(matchFromProfile(e.personId, mp), { criteria, profile: mp }), judgement: mp.judgement, status, name: e.name };
      } catch { /* not one of this campaign's matches: their own profile is next */ }
    }
    if (e.candidateId) {
      try {
        const d = dir.details.get(e.candidateId) ?? await getCandidate(e.candidateId);
        return { c: candidateFromDetail(d), judgement: null, status, name: e.name };
      } catch { /* below */ }
    }
    return { c: null, judgement: null, status, name: e.name };
  }));

  const got = read.filter((r): r is NonNullable<typeof r> => r !== null);
  const people = got.flatMap((r) => (r.c ? [r.c] : []));
  const source = buildSource({
    name: campaignName,
    criteria,
    people: got.flatMap((r) => (r.c ? [{ id: r.c.id, judgement: r.judgement, status: r.status }] : [])),
  });
  return { people, criteria, source, missing: got.filter((r) => !r.c).map((r) => r.name) };
}
