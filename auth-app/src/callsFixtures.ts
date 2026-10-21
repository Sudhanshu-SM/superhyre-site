import type { CallDetail, CallFilters, CallGroups, CallOutcome, CallRow, CallSegment } from "./api/calls";
import type { Call } from "./campaign";
import { callsFor, ME } from "./campaign";
import { groupKey } from "./callsView";
import { CAMPAIGNS } from "./workspaces";

/**
 * The calls a console with no backend shows (design work, the prototype): the old fixtures, in the shape the
 * API serves, so the same page draws them. Nothing here is read when connected.
 */

const OUTCOME: Readonly<Record<Call["outcome"], CallOutcome>> = {
  connected: "connected",
  voicemail: "voicemail",
  "no-answer": "no_answer",
  scheduled: "call_back",
};

const first = (name: string) => name.split(/\s+/)[0] ?? name;

function rowOf(c: Call, campaignId: string, now: number): CallRow {
  const campaign = CAMPAIGNS.find((k) => k.id === campaignId);
  return {
    id: c.id,
    at: new Date(now - c.at * 60_000).toISOString(),
    durationSeconds: c.duration || null,
    direction: "outbound",
    outcome: OUTCOME[c.outcome],
    outcomeText: null,
    phone: "",
    candidate: { id: c.person.id, name: c.person.name, title: c.person.title, company: c.person.company },
    caller: { id: null, name: c.by, mine: c.by === ME },
    campaign: campaign ? { id: campaign.id, name: campaign.name, client: null } : null,
    summary: c.note || null,
    preview: null,
    summaryState: "none",
    hasRecording: false,
    hasTranscript: (c.transcript ?? []).length > 0,
  };
}

function everyCall(now = Date.now()): CallRow[] {
  return CAMPAIGNS.flatMap((k) => callsFor(k.id).map((c) => rowOf(c, k.id, now))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function matches(r: CallRow, f: CallFilters): boolean {
  if (f.outcome && r.outcome !== f.outcome) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = [r.candidate?.name, r.candidate?.company, r.summary, r.caller.name, r.campaign?.name].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function fixtureRows(f: CallFilters, page: { limit?: number; offset?: number } = {}): { calls: CallRow[]; nextCursor: null; total: number } {
  const key = f.campaignId;
  const all = everyCall().filter((r) => matches(r, f) && (key ? (key === "none" ? !r.campaign : r.campaign?.id === key) : true));
  const from = page.offset ?? 0;
  return { calls: page.limit === undefined ? all : all.slice(from, from + page.limit), nextCursor: null, total: all.length };
}

export function fixtureGroups(f: CallFilters): CallGroups {
  const rows = everyCall().filter((r) => matches(r, { ...f, campaignId: undefined }));
  const groups = new Map<string, { campaign: CallRow["campaign"]; count: number; lastAt: string }>();
  for (const r of rows) {
    const g = { campaign: r.campaign };
    const key = groupKey(g);
    const cur = groups.get(key);
    if (cur) cur.count += 1;
    else groups.set(key, { campaign: r.campaign, count: 1, lastAt: r.at });
  }
  const callers = new Map<string, { id: string; name: string | null; count: number; mine: boolean }>();
  for (const r of rows) {
    const name = r.caller.name ?? "";
    const cur = callers.get(name);
    if (cur) cur.count += 1;
    else callers.set(name, { id: name, name, count: 1, mine: r.caller.mine });
  }
  return { groups: [...groups.values()], total: rows.length, canSeeEveryone: true, callers: [...callers.values()] };
}

export function fixtureDetail(id: string): CallDetail | null {
  const now = Date.now();
  for (const k of CAMPAIGNS) {
    const c = callsFor(k.id).find((x) => x.id === id);
    if (!c) continue;
    const row = rowOf(c, k.id, now);
    const segments: CallSegment[] = (c.transcript ?? []).map((t, i, all) => ({
      start: t.at,
      end: all[i + 1]?.at ?? t.at + 4,
      role: t.who === "recruiter" ? "caller" : t.who === "candidate" ? "candidate" : "other",
      name: t.speaker ?? (t.who === "recruiter" ? first(c.by) : t.who === "candidate" ? first(c.person.name) : null),
      text: t.text,
    }));
    return {
      ...row,
      notes: c.note ?? null,
      summaryDetail: null,
      segments,
      transcript: null,
      recording: { available: false, mime: null, seconds: c.recording ?? null },
      canEdit: true,
      byHand: false,
    };
  }
  return null;
}
