import type { SpecRow } from "../api/agent";
import { specApi } from "../api/agent";

/**
 * Drafting a role from notes is a model call that costs the workspace a draft, so it is made
 * once per set of notes: asked again for the same notes (the view mounted twice, the page
 * reloaded) it hands back the draft that already exists instead of making another.
 */

export type Drafted = {
  row: SpecRow;
  /** The campaign's role spec in use now, if one is approved (a draft doesn't replace it until approved). */
  approved: SpecRow | null;
  /** The draft was made earlier from these same notes. */
  reused: boolean;
};

const inflight = new Map<string, Promise<Drafted>>();

/** The notes as the composer's answer field keeps them: one line, single spaces. */
export const flat = (s: string): string => s.replace(/\s+/g, " ").trim();

export function draftOnce(campaignId: string, notes: string): Promise<Drafted> {
  const key = `${campaignId}\n${notes}`;
  const have = inflight.get(key);
  if (have) return have;
  const run = (async (): Promise<Drafted> => {
    const { latest, approved } = await specApi.get(campaignId);
    if (latest?.jdText && flat(latest.jdText) === flat(notes)) return { row: latest, approved, reused: true };
    return { row: await specApi.draft(campaignId, notes), approved, reused: false };
  })();
  // A failed draft is not remembered: trying again must reach the server.
  run.catch(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}
