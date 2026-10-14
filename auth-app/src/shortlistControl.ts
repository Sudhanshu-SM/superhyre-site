import type { CandidateDetail, CandidateRow } from "./api/candidates";
import { stageLabel, statusKey } from "./chatCards";

/**
 * What the Candidates page's shortlist control says. A person on a campaign's board is on it at some stage,
 * and only the first stage is "Shortlisted": someone who was passed reads "Passed", someone in outreach reads
 * "In outreach". The control used to treat any board row as shortlisted.
 */

/** The stage of each person on each campaign (person id, then campaign id), from the rows on the page and any opened profile. */
export function stagesFrom(
  rows: readonly Pick<CandidateRow, "id" | "campaigns">[],
  details: Readonly<Record<string, { detail: Pick<CandidateDetail, "campaigns"> }>>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  /* Outreach at its replied step reads as "replied": the control says Replied, not In outreach. */
  for (const r of rows) out[r.id] = Object.fromEntries(r.campaigns.map((c) => [c.id, statusKey(c.stage, c.step)]));
  for (const [id, d] of Object.entries(details)) {
    out[id] = Object.fromEntries(d.detail.campaigns.map((c) => [c.id, statusKey(c.stage, c.step)]));
  }
  return out;
}

/**
 * The words and the state for someone on `on` (campaign ids), where `stages` says where they are on each (one
 * not named is at the first stage, as it is for a change just made on the page).
 */
export function controlState(
  on: readonly string[],
  stages: Readonly<Record<string, string>>,
): { label: string; shortlisted: readonly string[]; active: boolean } {
  const at = (campaign: string) => stages[campaign] ?? "shortlisted";
  const shortlisted = on.filter((c) => at(c) === "shortlisted");
  if (shortlisted.length) return { label: "Shortlisted", shortlisted, active: true };
  if (on.length) return { label: stageLabel(at(on[0] ?? "")), shortlisted, active: true };
  return { label: "Shortlist", shortlisted, active: false };
}
