import type { ApiBoardRow } from "../api/campaigns";
import { stageLabel } from "../chatCards";
import { resolveNames } from "./compareLogic";

/**
 * Who a scheduling request is about, from the campaign's real board, and the one message the
 * console can offer without a calendar: a request for times, put in the composer to be sent.
 */

export type Group = { stage: string; label: string; rows: ApiBoardRow[] };

const WAITING: readonly string[] = ["interviewing", "shortlisted"];

/**
 * The people to schedule. Named people are shown wherever they stand; otherwise those in
 * interviews, then the shortlist (people who haven't been contacted yet, or have no reply
 * logged, are not ready for a time).
 */
export function whoToSchedule(rows: readonly ApiBoardRow[], said: string, ids: readonly string[] = []): { groups: Group[]; named: boolean } {
  const pool = rows.map((r) => ({ id: r.candidateId, name: r.fullName, campaigns: [] as string[] }));
  const spoken = resolveNames(said, pool).ids;
  const wanted = new Set([...ids, ...spoken]);
  const named = wanted.size > 0 && rows.some((r) => wanted.has(r.candidateId) || wanted.has(r.personId));
  const picked = named ? rows.filter((r) => wanted.has(r.candidateId) || wanted.has(r.personId)) : rows.filter((r) => WAITING.includes(r.stage));
  const stages = named ? [...new Set(picked.map((r) => r.stage))] : [...WAITING];
  return {
    named,
    groups: stages
      .map((stage) => ({ stage, label: stageLabel(stage), rows: picked.filter((r) => r.stage === stage) }))
      .filter((g) => g.rows.length > 0),
  };
}

const first = (name: string) => name.split(" ")[0] ?? name;

/** A message to one person asking when they can talk; only ever put in the composer. */
export function askForTimes(name: string, role: string): string {
  return `Write a short message to ${first(name)} asking which times this week or next suit them for an interview for ${role}.`;
}

/** The same ask for several people, one message each. */
export function askEveryone(names: readonly string[], role: string): string {
  return `Write a short message for each of ${names.map(first).join(", ")} asking which times this week or next suit them for an interview for ${role}.`;
}
