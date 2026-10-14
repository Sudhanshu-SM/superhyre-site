import type { ActivityFilters, ActivityGroups, ActivityRow, CandidateOutreach, EmailItem, TimelineItem } from "./api/outreachActivity";
import { fixtureRows } from "./callsFixtures";
import type { CallRow } from "./api/calls";

/**
 * What a console with no backend shows on Outreach (design work, the prototype): the old call fixtures in the shape
 * the API serves, with a few emails among them. Nothing here is read when connected.
 */

const first = (name: string | null) => name?.split(/\s+/)[0] ?? null;

function callToRow(c: CallRow): ActivityRow {
  return {
    id: c.id, channel: "call", at: c.at,
    campaignId: c.campaign?.id ?? null, campaignName: c.campaign?.name ?? null, clientName: c.campaign?.client ?? null,
    candidateId: c.candidate?.id ?? null, candidateName: c.candidate?.name ?? null,
    candidateTitle: c.candidate?.title ?? null, candidateCompany: c.candidate?.company ?? null,
    direction: c.direction === "inbound" ? "in" : "out",
    by: { id: c.caller.id, name: c.caller.name, mine: c.caller.mine },
    status: c.outcome === "failed" ? "no_answer" : c.outcome,
    subject: null, preview: c.summary ?? c.preview, phone: c.phone || null, durationSeconds: c.durationSeconds,
  };
}

function emailsFrom(calls: readonly ActivityRow[]): ActivityRow[] {
  const SUBJECTS = ["A role at {c} that looks like you", "Following up on my note", "Quick question about your next move"];
  const STATUS: ActivityRow["status"][] = ["waiting", "replied", "scheduled", "bounced"];
  return calls.slice(0, 8).map((c, i) => ({
    ...c,
    id: `fx-mail-${i}`,
    channel: "email" as const,
    at: new Date(Date.parse(c.at) - (i + 1) * 3_600_000).toISOString(),
    status: STATUS[i % STATUS.length] as ActivityRow["status"],
    subject: (SUBJECTS[i % SUBJECTS.length] as string).replace("{c}", c.campaignName ?? "our client"),
    preview: (SUBJECTS[i % SUBJECTS.length] as string).replace("{c}", c.campaignName ?? "our client"),
    phone: null,
    durationSeconds: null,
    by: c.by ? { ...c.by, name: first(c.by.name) } : null,
  }));
}

function every(): ActivityRow[] {
  const calls = fixtureRows({}).calls.map(callToRow);
  return [...calls, ...emailsFrom(calls)].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function matches(r: ActivityRow, f: ActivityFilters): boolean {
  if (f.channel && r.channel !== f.channel) return false;
  if (f.status && r.status !== f.status) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = [r.candidateName, r.candidateCompany, r.preview, r.subject, r.by?.name, r.campaignName, r.clientName].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function fixtureActivity(f: ActivityFilters): { rows: ActivityRow[]; nextCursor: null } {
  const key = f.campaignId;
  return { rows: every().filter((r) => matches(r, f) && (key ? (key === "none" ? !r.campaignId : r.campaignId === key) : true)), nextCursor: null };
}

export function fixtureGroups(f: ActivityFilters): ActivityGroups {
  const rows = every().filter((r) => matches(r, { ...f, campaignId: undefined }));
  const groups = new Map<string, ActivityGroups["groups"][number]>();
  for (const r of rows) {
    const key = r.campaignId ?? "none";
    const cur = groups.get(key);
    if (cur) cur.count += 1;
    else groups.set(key, { campaign: r.campaignId ? { id: r.campaignId, name: r.campaignName ?? "A campaign", client: r.clientName } : null, count: 1, lastAt: r.at });
  }
  const all = every().filter((r) => matches(r, { ...f, channel: undefined, campaignId: undefined }));
  const of = (c: ActivityRow["channel"]) => all.filter((r) => r.channel === c);
  return {
    groups: [...groups.values()],
    total: rows.length,
    channels: { all: all.length, email: of("email").length, whatsapp: 0, call: of("call").length, callsConnected: of("call").filter((r) => r.status === "connected").length },
    canSeeEveryone: true,
    people: [],
    whatsapp: { connected: false },
  };
}

export function fixtureCandidate(id: string): CandidateOutreach | null {
  const mine = every().filter((r) => r.candidateId === id);
  const head = mine[0];
  if (!head) return null;
  const items: TimelineItem[] = mine.map((r): TimelineItem => {
    if (r.channel === "call") {
      const call = fixtureRows({}).calls.find((c) => c.id === r.id);
      return { kind: "call", id: r.id, at: r.at, call: call as CallRow };
    }
    const e: EmailItem = {
      kind: "email", id: r.id, at: r.at, direction: "out", status: r.status, subject: r.subject,
      body: `Hi ${first(r.candidateName) ?? "there"},\n\nI came across your profile and thought of a role we are hiring for. Worth a short chat this week?`,
      scheduledFor: null, sentAt: r.at, by: r.by, campaignId: r.campaignId, campaignName: r.campaignName,
      canApprove: false, canCancel: r.status === "scheduled",
    };
    return e;
  });
  return {
    candidate: { id, name: head.candidateName ?? "A candidate", title: head.candidateTitle, company: head.candidateCompany },
    campaigns: head.campaignId ? [{ id: head.campaignId, name: head.campaignName ?? "A campaign", client: head.clientName }] : [],
    items,
    counts: { email: items.filter((i) => i.kind === "email").length, whatsapp: 0, call: items.filter((i) => i.kind === "call").length },
    whatsapp: { connected: false },
  };
}
