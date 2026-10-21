import type { CandidateDetail, CandidateRow } from "./api/candidates";
import { statusKey } from "./chatCards";

/**
 * What the Candidates page's shortlist control says. It is only for shortlisting someone into a campaign, so it
 * names no stage: "Shortlist" when they are on no campaign's board, "Shortlisted" (with how many) when they are
 * on one or more and not rejected there. The stage is kept only to tell a rejected person from the rest.
 */

/** The stage of each person on each campaign (person id, then campaign id), from the rows on the page, and an opened profile for someone not on it. */
export function stagesFrom(
  rows: readonly Pick<CandidateRow, "id" | "campaigns">[],
  details: Readonly<Record<string, { detail: Pick<CandidateDetail, "campaigns"> }>>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  /* Outreach at its replied step reads as "replied": the control says Replied, not In outreach. */
  for (const r of rows) out[r.id] = Object.fromEntries(r.campaigns.map((c) => [c.id, statusKey(c.stage, c.step)]));
  /* A profile opened earlier is only for someone the list does not carry: the list is the newer read after a rejection or a removal. */
  for (const [id, d] of Object.entries(details)) {
    if (out[id]) continue;
    out[id] = Object.fromEntries(d.detail.campaigns.map((c) => [c.id, statusKey(c.stage, c.step)]));
  }
  return out;
}

/** What a change just made on the page says about one person (campaign id to stage; null: off the campaign), until the server's list replaces it. */
export type StageOverlay = Readonly<Record<string, Readonly<Record<string, string | null>>>>;

/** `stages` with the changes just made laid over them. */
export function withOverlay(
  stages: Record<string, Record<string, string>>,
  overlay: StageOverlay,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = { ...stages };
  for (const [person, was] of Object.entries(overlay)) {
    const next = { ...(out[person] ?? {}) };
    for (const [campaign, stage] of Object.entries(was)) {
      if (stage === null) delete next[campaign];
      else next[campaign] = stage;
    }
    out[person] = next;
  }
  return out;
}

/**
 * The words and the state for someone on `on` (campaign ids), where `stages` says where they are on each (one
 * not named is at the first stage, as it is for a change just made on the page). A campaign where they are
 * rejected is not one they are on: `live` is the ones that count (the ticks, the number), `rejected` the rest.
 */
export function controlState(
  on: readonly string[],
  stages: Readonly<Record<string, string>>,
): { label: "Shortlist" | "Shortlisted"; live: readonly string[]; rejected: readonly string[]; count: number; active: boolean } {
  const at = (campaign: string) => stages[campaign] ?? "shortlisted";
  const live = on.filter((c) => at(c) !== "passed");
  const rejected = on.filter((c) => at(c) === "passed");
  return { label: live.length ? "Shortlisted" : "Shortlist", live, rejected, count: live.length, active: live.length > 0 };
}
