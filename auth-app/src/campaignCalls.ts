import { useEffect, useState } from "react";
import { listCalls } from "./api/calls";
import type { CallOutcome as ApiOutcome, CallRow } from "./api/calls";
import { hueFor } from "./candidateImport";
import type { Call, CallOutcome } from "./campaign";

/**
 * A campaign's real calls, in the shape the Overview's cards were built on ("Call X back" under Needs you,
 * "Calls you made" under Your work). Those cards read `Call`; the API's rows are `CallRow`.
 */

const OUTCOME: Readonly<Partial<Record<ApiOutcome, CallOutcome>>> = {
  connected: "connected",
  not_interested: "connected",
  voicemail: "voicemail",
  no_answer: "no-answer",
  call_back: "scheduled",
};

/**
 * One row as a call the cards read, or null for what is not a call yet (still ringing, or the dialer failed) or
 * has no person (a number that is not on anyone). `me` is the signed-in person's name: their own calls say it,
 * which is what "Calls you made" counts.
 */
export function callFromRow(row: CallRow, me: string, now = Date.now()): Call | null {
  const outcome = OUTCOME[row.outcome];
  if (!outcome || !row.candidate) return null;
  const at = Date.parse(row.at);
  return {
    id: row.id,
    person: {
      id: row.candidate.id,
      name: row.candidate.name,
      hue: hueFor(row.candidate.name),
      title: row.candidate.title ?? "",
      company: row.candidate.company ?? "",
    },
    by: row.caller.mine ? me : (row.caller.name ?? "Someone"),
    outcome,
    duration: row.durationSeconds ?? 0,
    at: Number.isFinite(at) ? Math.max(0, Math.round((now - at) / 60_000)) : 0,
  };
}

const FORTNIGHT = 14 * 24 * 60;

/**
 * The calls the Overview's cards should weigh: the last fortnight, and a voicemail or a call back that someone
 * has since spoken to the person about is not "call back" any more.
 */
export function recentCalls(calls: readonly Call[]): Call[] {
  const kept = calls.filter((c) => c.at <= FORTNIGHT);
  return kept.filter(
    (c) => !(c.outcome === "voicemail" || c.outcome === "scheduled")
      || !kept.some((o) => o.person.id === c.person.id && o.outcome === "connected" && o.at < c.at),
  );
}

/** The calls on one campaign the person may see (their own, or everyone's for an owner or admin), newest first. */
export function useCampaignCalls(campaignId: string, enabled: boolean, me: string): readonly Call[] {
  const [rows, setRows] = useState<readonly CallRow[]>([]);
  useEffect(() => {
    if (!enabled || !campaignId) return;
    let gone = false;
    listCalls({ campaignId }, { limit: 50 }).then(
      (r) => { if (!gone) setRows(r.calls); },
      () => { /* the cards read nothing rather than a failure: calls are a part of the overview, not the page */ },
    );
    return () => { gone = true; };
  }, [campaignId, enabled]);
  return recentCalls(rows.map((r) => callFromRow(r, me)).filter((c): c is Call => c !== null));
}
