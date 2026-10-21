import { agentApi, specApi } from "../api/agent";
import { standingOf } from "./specView";
import type { Standing } from "./specView";
import type { RoleSpec, SpecRow } from "../api/agent";
import { LIVE } from "../api/client";
import { tidy } from "./specEdit";

/**
 * What the role spec card's buttons do, as the same calls the Role spec page makes. None of them sends a message to the
 * agent or asks for another card: the answer is the spec changing on the server, which the card reads.
 */

/** The edited spec as the next version (the existing edit API). It stays a draft until it is approved. */
export const saveSpec = (campaignId: string, edited: RoleSpec): Promise<SpecRow> => specApi.save(campaignId, tidy(edited));

/**
 * Approves the spec (saving the edits first, when there are any) and starts the search, as the page's Approve does.
 * Returns the run the search is, to follow on the card; null when there was nothing to start.
 */
/** One id per press of a button that starts work: a retry or a double delivery of the same press is the same search. */
export const pressId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

export async function approveAndFind(campaignId: string, specId: string | null, edited?: RoleSpec): Promise<{ runId: string | null }> {
  const id = edited ? (await saveSpec(campaignId, edited)).id : specId;
  if (!id) throw new Error("There's no role spec to approve yet.");
  const done = await specApi.approve(campaignId, id, { match: true, actionId: pressId() });
  const runId = done.matching?.runId ?? null;
  /* Nothing to start is fine for a new version over people already found; with nobody found it is a search that did not begin. */
  if (!runId && LIVE) {
    const status = await agentApi.sourcing(campaignId).catch(() => null);
    if (status && status.shown === 0) throw new Error("The search couldn't start just now.");
  }
  return { runId };
}

/** Reads the job description saved on the campaign again. */
export const draftAgain = (campaignId: string): Promise<SpecRow> => specApi.draft(campaignId);

/** Scores the found people who have not been read closely yet: a run of its own, which the card follows. */
export async function scoreRest(campaignId: string): Promise<{ runId: string }> {
  const { runId } = await agentApi.score(campaignId, pressId());
  return { runId };
}

/* Several cards for one campaign ask once: a read in flight is shared. */
const reading = new Map<string, Promise<Standing | null>>();

/** Where the campaign's search stands now (found, not scored yet, what is running); null when it cannot be read. */
export function readStanding(campaignId: string): Promise<Standing | null> {
  if (!LIVE) return Promise.resolve(null);
  const going = reading.get(campaignId);
  if (going) return going;
  const p = agentApi.sourcing(campaignId).then(standingOf, () => null).finally(() => reading.delete(campaignId));
  reading.set(campaignId, p);
  return p;
}
