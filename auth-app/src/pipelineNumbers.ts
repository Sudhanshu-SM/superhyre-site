import type { PipelinePerson } from "./campaign";
import { STAGES } from "./campaign";
import type { CampaignRates, CampaignReached } from "./campaignsData";

/**
 * The numbers in the Pipeline's header. A live campaign says what every page says: how many people
 * were contacted and replied, and the conversions between steps, come from the server's one
 * definition (server: modules/pipeline/counts.ts), never from counting the cards on the board. The
 * board holds passed people who were never written to and people dragged straight to Hired, so a
 * count taken from it moved when someone was passed and disagreed with the Overview.
 *
 * Without the server's numbers (the demo's fixtures) they are read from the people shown.
 */

export type PipelineNumbers = {
  contacted: number;
  replied: number;
  /** Whole percent of the people contacted who replied; 0 while nobody was contacted. */
  repliedPct: number;
  /** Step to step, null where there is nothing to say. Keyed by the stage a person moved into. */
  conv: { outreach: number | null; interviewing: number | null; hired: number | null };
};

const pct = (n: number, of: number): number | null => (of > 0 ? Math.round((n / of) * 100) : null);

/**
 * The header's Replied tile. Nobody contacted is not "0% · 0 of 0": there is nothing to take a share of, and
 * the Overview and the campaign list say a dash for it, so this does too.
 */
export function repliedTile(n: Pick<PipelineNumbers, "contacted" | "replied" | "repliedPct">): { figure: string; sub: string } {
  if (n.contacted <= 0) return { figure: "–", sub: "Nobody contacted yet" };
  return { figure: `${n.repliedPct}%`, sub: `${n.replied} of ${n.contacted}` };
}

/**
 * The step-to-step chip under a stage. "0%" is left off a stage that has people in it: they reached it without
 * going through the step before (added straight to interviewing, say), which is true and reads as a mistake.
 */
export const shownConversion = (conv: number | null, inStage: number): number | null =>
  conv === 0 && inStage > 0 ? null : conv;

export function pipelineNumbers(
  people: readonly PipelinePerson[],
  reach?: CampaignReached,
  rates?: CampaignRates,
): PipelineNumbers {
  if (reach && rates) {
    return {
      contacted: reach.outreach,
      replied: reach.replied,
      repliedPct: rates.replied ?? 0,
      conv: { outreach: rates.reachedOut, interviewing: rates.interviewing, hired: rates.hired },
    };
  }
  // At or beyond a stage, passed people left out: how many got that far.
  const reached = (i: number) => people.filter((p) => p.stage !== "passed" && STAGES.findIndex((s) => s.id === p.stage) >= i).length;
  const contacted = people.filter((p) => p.stage !== "shortlisted").length;
  // Only an actual reply counts: moving someone to interviewing doesn't mean they wrote back.
  const replied = people.filter((p) => p.replied ?? p.step === "replied").length;
  return {
    contacted,
    replied,
    repliedPct: contacted ? Math.round((replied / contacted) * 100) : 0,
    conv: {
      outreach: pct(reached(1), reached(0)),
      interviewing: pct(reached(2), reached(1)),
      hired: pct(reached(3), reached(2)),
    },
  };
}
