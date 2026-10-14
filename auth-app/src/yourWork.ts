import type { Call, PipelinePerson, StageId } from "./campaign";

/**
 * One recruiter's own contribution to one campaign, for the Overview's
 * "Your work on this campaign" card.
 *
 * Computed only from what the data records, never estimated:
 *   - reached out: their people (owner = them) who have been contacted,
 *     that is, anyone at outreach or beyond, passed included (passed people
 *     were contacted first, see plan() in campaign.ts);
 *   - calls: calls they placed (`by` = them);
 *   - moved forward: their people now at interviews or hired, plus the
 *     forward moves made in this session (the session's moves are theirs);
 *   - replied: their people who replied, including those who went on to
 *     interviews or a hire, as the funnel counts replies;
 *   - hires: their people who were hired.
 *
 * Weeks come from days-in-stage for people and minutes-ago for calls. The
 * comparison is to their own last week, and is returned only when it went up.
 */

export type MoveLike = { person: Pick<PipelinePerson, "id" | "stage">; to: StageId };

export type Work = {
  reachedOut: number;
  calls: number;
  moved: number;
  replied: number;
  hires: PipelinePerson[];
  /** The one figure that went up against their own last week, if any. */
  up: { what: "moved" | "calls" | "reachedOut"; by: number } | null;
};

const RANK: Readonly<Record<StageId, number>> = { passed: -1, shortlisted: 0, outreach: 1, interviewing: 2, hired: 3 };
const DAY = 1440;

export function yourWork(people: readonly PipelinePerson[], calls: readonly Call[], moves: readonly MoveLike[], name: string): Work {
  const mine = people.filter((p) => p.owner === name);
  const contacted = mine.filter((p) => p.stage !== "shortlisted");
  const myCalls = calls.filter((c) => c.by === name);

  const fwdMoves = moves.filter((mv) => RANK[mv.to] > RANK[mv.person.stage]);
  const moved = new Set<string>(fwdMoves.map((mv) => mv.person.id));
  for (const p of mine) if (RANK[p.stage] >= RANK.interviewing) moved.add(p.id);
  /* a person moved forward and then passed on is no longer "moved forward" */
  const live = new Map(people.map((p) => [p.id, p]));
  const movedN = [...moved].filter((id) => live.get(id)?.stage !== "passed").length;

  const replied = mine.filter((p) => p.step === "replied" || p.stage === "interviewing" || p.stage === "hired").length;
  const hires = mine.filter((p) => p.stage === "hired").sort((a, b) => a.inStage - b.inStage);

  /* this week (0-6 days) against last week (7-13 days) */
  const week = (d: number) => (d < 7 ? 0 : d < 14 ? 1 : 2);
  const fwdNow = mine.filter((p) => RANK[p.stage] >= RANK.interviewing);
  const movedWeeks = [
    fwdNow.filter((p) => week(p.inStage) === 0).length + fwdMoves.filter((mv) => !fwdNow.some((p) => p.id === mv.person.id)).length,
    fwdNow.filter((p) => week(p.inStage) === 1).length,
  ];
  const callWeeks = [myCalls.filter((c) => week(c.at / DAY) === 0).length, myCalls.filter((c) => week(c.at / DAY) === 1).length];
  const waiting = mine.filter((p) => p.stage === "outreach");
  const outWeeks = [waiting.filter((p) => week(p.inStage) === 0).length, waiting.filter((p) => week(p.inStage) === 1).length];

  const ups: Work["up"][] = [
    movedWeeks[0]! > movedWeeks[1]! ? { what: "moved", by: movedWeeks[0]! - movedWeeks[1]! } : null,
    callWeeks[0]! > callWeeks[1]! ? { what: "calls", by: callWeeks[0]! - callWeeks[1]! } : null,
    outWeeks[0]! > outWeeks[1]! ? { what: "reachedOut", by: outWeeks[0]! - outWeeks[1]! } : null,
  ];

  return {
    reachedOut: contacted.length,
    calls: myCalls.length,
    moved: movedN,
    replied,
    hires,
    up: ups.find(Boolean) ?? null,
  };
}

/** The comparison, worded for a sub-line under its row, or null when nothing went up. */
export function upLine(up: Work["up"]): string | null {
  if (!up) return null;
  const n = up.by;
  return `${n} more than last week`;
}
