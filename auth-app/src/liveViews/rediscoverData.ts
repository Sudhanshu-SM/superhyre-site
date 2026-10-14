import { specApi } from "../api/agent";
import { api } from "../api/client";
import type { CandidateRow } from "../api/candidates";
import { getCandidate, listCandidates } from "../api/candidates";
import type { SearchResults } from "../api/search";
import { criteriaOf } from "../liveCandidate";
import type { Facts, PastPerson } from "./rediscoverLogic";
import { factsOf, splitPast } from "./rediscoverLogic";

/** How many of the people found have their history read (dates, why they were passed on). */
export const DETAILED = 8;

export type Found = {
  query: string;
  fresh: PastPerson[];
  here: PastPerson[];
  facts: Record<string, Facts>;
  /** Past campaigns named like the query whose people were included. */
  campaigns: string[];
  /** The query came from the campaign's top requirement, not from the request. */
  fromSpec: boolean;
};

/**
 * Looks the workspace over for the query: the candidates whose profile, skills or title answer
 * it (the candidates list), plus the people on past campaigns named like it (quick find).
 */
export async function findPast(input: { query: string | null; campaignId: string | null }): Promise<Found> {
  const { campaignId } = input;
  let query = input.query?.trim() ?? "";
  let fromSpec = false;
  if (!query && campaignId) {
    try {
      const s = await specApi.get(campaignId);
      query = criteriaOf((s.approved ?? s.latest)?.spec)[0]?.text ?? "";
      fromSpec = query !== "";
    } catch { /* no requirement to borrow: the caller says there's nothing to look for */ }
  }
  if (query.length < 2) return { query, fresh: [], here: [], facts: {}, campaigns: [], fromSpec };

  const [byPeople, named] = await Promise.all([
    listCandidates({ q: query, sort: "recent", limit: 40 }),
    api<{ results: SearchResults }>("GET", `/v1/search?q=${encodeURIComponent(query)}&kinds=campaigns&limit=5`).then((r) => r.results.campaigns).catch(() => []),
  ]);
  const rows: CandidateRow[] = [...byPeople.rows];
  const past = named.filter((c) => c.id !== campaignId).slice(0, 3);
  for (const c of past) {
    try { rows.push(...(await listCandidates({ campaignId: c.id, sort: "recent", limit: 20 })).rows); } catch { /* the people found by name still stand */ }
  }

  const { fresh, here } = splitPast(rows, campaignId);
  const facts: Record<string, Facts> = {};
  await Promise.all(fresh.slice(0, DETAILED).map(async (p) => {
    try { facts[p.id] = factsOf(await getCandidate(p.id) as unknown as Parameters<typeof factsOf>[0]); } catch { /* shown without dates */ }
  }));
  return { query, fresh, here, facts, campaigns: past.map((c) => c.name), fromSpec };
}
