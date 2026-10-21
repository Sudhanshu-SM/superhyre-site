import type { CallRow } from "./calls";
import { callRowOf } from "./calls";
import { api } from "./client";

/**
 * Outreach, as the API serves it (server: modules/outreach/activity): every email, WhatsApp chat and call in
 * one list, and one candidate's whole outreach as a timeline. Who sees what is the server's rule (an owner or
 * admin everything, a recruiter their own and their campaigns', Personal only the person's); nothing here
 * filters by person. Every reader below is defensive: one odd field never blanks the page.
 */

export type Channel = "email" | "whatsapp" | "call";
export const CHANNELS: readonly Channel[] = ["email", "whatsapp", "call"];

/** What an item came to: the email words first, then the call ones. */
export type ActivityStatus =
  | "replied" | "waiting" | "bounced" | "scheduled" | "failed" | "draft"
  | "connected" | "no_answer" | "voicemail" | "call_back" | "not_interested" | "in_progress";
const STATUSES: readonly ActivityStatus[] = [
  "replied", "waiting", "bounced", "scheduled", "failed", "draft",
  "connected", "no_answer", "voicemail", "call_back", "not_interested", "in_progress",
];

export type By = { id: string | null; name: string | null; mine: boolean };

export type ActivityRow = {
  id: string;
  channel: Channel;
  at: string;
  campaignId: string | null;
  campaignName: string | null;
  clientName: string | null;
  candidateId: string | null;
  candidateName: string | null;
  candidateTitle: string | null;
  candidateCompany: string | null;
  direction: "out" | "in";
  by: By | null;
  status: ActivityStatus;
  subject: string | null;
  preview: string | null;
  phone: string | null;
  durationSeconds: number | null;
};

export type ActivityFilters = {
  channel?: Channel | undefined;
  /** A campaign's id, or "none" for what is on no campaign. */
  campaignId?: string | undefined;
  client?: string | undefined;
  status?: ActivityStatus | undefined;
  /** An owner or admin's person filter. */
  person?: string | undefined;
  q?: string | undefined;
  /** YYYY-MM-DD, India time, both ends included. */
  from?: string | undefined;
  to?: string | undefined;
};

export type ActivityGroup = { campaign: { id: string; name: string; client: string | null } | null; count: number; lastAt: string };

export type ChannelCounts = { all: number; email: number; whatsapp: number; call: number; callsConnected: number };

export type ActivityGroups = {
  groups: ActivityGroup[];
  total: number;
  channels: ChannelCounts;
  canSeeEveryone: boolean;
  people: Array<{ id: string; name: string | null; count: number; mine: boolean }>;
  whatsapp: { connected: boolean };
};

export type EmailItem = {
  kind: "email";
  id: string;
  at: string;
  direction: "out" | "in";
  status: ActivityStatus;
  subject: string | null;
  body: string;
  scheduledFor: string | null;
  sentAt: string | null;
  by: By | null;
  campaignId: string | null;
  campaignName: string | null;
  canApprove: boolean;
  canCancel: boolean;
  /** Why it didn't go out, as the server stored it; null when none was kept (older rows) or it did go. */
  error: string | null;
  /** A failed email that may be sent again here (by the person who approved it, from their own Gmail). */
  canRetry: boolean;
};
export type WhatsAppItem = { kind: "whatsapp"; id: string; at: string; direction: "out" | "in"; text: string; by: By | null };
export type CallItem = { kind: "call"; id: string; at: string; call: CallRow };
export type TimelineItem = EmailItem | WhatsAppItem | CallItem;

export type CandidateOutreach = {
  candidate: { id: string; name: string; title: string | null; company: string | null };
  campaigns: Array<{ id: string; name: string; client: string | null }>;
  items: TimelineItem[];
  counts: { email: number; whatsapp: number; call: number };
  whatsapp: { connected: boolean };
};

/* ── reading what arrives ── */

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const when = (v: unknown): string | null => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? s : null;
};
const count = (v: unknown): number => Math.max(0, num(v) ?? 0);

function byOf(raw: unknown): By | null {
  const o = rec(raw);
  if (!o) return null;
  return { id: str(o.id), name: str(o.name), mine: o.mine === true };
}

const statusOf = (v: unknown): ActivityStatus => STATUSES.find((s) => s === v) ?? "waiting";
const channelOf = (v: unknown): Channel | null => CHANNELS.find((c) => c === v) ?? null;

export function activityRowOf(raw: unknown): ActivityRow | null {
  const o = rec(raw);
  const id = str(o?.id);
  const at = when(o?.at);
  const channel = channelOf(o?.channel);
  if (!o || !id || !at || !channel) return null;
  return {
    id,
    channel,
    at,
    campaignId: str(o.campaignId),
    campaignName: str(o.campaignName),
    clientName: str(o.clientName),
    candidateId: str(o.candidateId),
    candidateName: str(o.candidateName),
    candidateTitle: str(o.candidateTitle),
    candidateCompany: str(o.candidateCompany),
    direction: o.direction === "in" ? "in" : "out",
    by: byOf(o.by),
    status: statusOf(o.status),
    subject: str(o.subject),
    preview: str(o.preview),
    phone: str(o.phone),
    durationSeconds: num(o.durationSeconds),
  };
}

export function groupsOf(raw: unknown): ActivityGroups {
  const o = rec(raw) ?? {};
  const groups = Array.isArray(o.groups)
    ? o.groups.flatMap((g): ActivityGroup[] => {
        const r = rec(g);
        const last = when(r?.lastAt);
        const n = num(r?.count);
        if (!r || !last || n === null) return [];
        const c = rec(r.campaign);
        const id = str(c?.id);
        return [{ campaign: c && id ? { id, name: str(c.name) ?? "A campaign", client: str(c.client) } : null, count: n, lastAt: last }];
      })
    : [];
  const ch = rec(o.channels) ?? {};
  const people = Array.isArray(o.people)
    ? o.people.flatMap((p) => {
        const r = rec(p);
        const id = str(r?.id);
        return r && id ? [{ id, name: str(r.name), count: count(r.count), mine: r.mine === true }] : [];
      })
    : [];
  const total = num(o.total) ?? groups.reduce((n, g) => n + g.count, 0);
  const wa = rec(o.whatsapp);
  return {
    groups,
    total,
    channels: {
      all: num(ch.all) ?? total,
      email: count(ch.email),
      whatsapp: count(ch.whatsapp),
      call: count(ch.call),
      callsConnected: count(ch.callsConnected),
    },
    canSeeEveryone: o.canSeeEveryone === true,
    people,
    whatsapp: { connected: wa?.connected === true },
  };
}

function itemOf(raw: unknown): TimelineItem | null {
  const o = rec(raw);
  const id = str(o?.id);
  const at = when(o?.at);
  if (!o || !id || !at) return null;
  const direction = o.direction === "in" ? "in" : "out";
  if (o.kind === "email") {
    return {
      kind: "email", id, at, direction,
      status: statusOf(o.status),
      subject: str(o.subject),
      body: typeof o.body === "string" ? o.body : "",
      scheduledFor: when(o.scheduledFor),
      sentAt: when(o.sentAt),
      by: byOf(o.by),
      campaignId: str(o.campaignId),
      campaignName: str(o.campaignName),
      canApprove: o.canApprove === true,
      canCancel: o.canCancel === true,
      error: str(o.error),
      /* A server that does not say: a failed email can be sent again, and the send answers if it may not. */
      canRetry: typeof o.canRetry === "boolean" ? o.canRetry : statusOf(o.status) === "failed" && direction === "out",
    };
  }
  if (o.kind === "whatsapp") {
    return { kind: "whatsapp", id, at, direction, text: typeof o.text === "string" ? o.text : "", by: byOf(o.by) };
  }
  if (o.kind === "call") {
    const call = callRowOf(o.call);
    return call ? { kind: "call", id, at, call } : null;
  }
  return null;
}

export function candidateOutreachOf(raw: unknown): CandidateOutreach | null {
  const o = rec(raw);
  const c = rec(o?.candidate);
  const id = str(c?.id);
  if (!o || !c || !id) return null;
  const items = (Array.isArray(o.items) ? o.items : []).map(itemOf).filter((x): x is TimelineItem => x !== null);
  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const cc = rec(o.counts) ?? {};
  const wa = rec(o.whatsapp);
  return {
    candidate: { id, name: str(c.name) ?? "A candidate", title: str(c.title), company: str(c.company) },
    campaigns: (Array.isArray(o.campaigns) ? o.campaigns : []).flatMap((k) => {
      const r = rec(k);
      const kid = str(r?.id);
      return r && kid ? [{ id: kid, name: str(r.name) ?? "A campaign", client: str(r.client) }] : [];
    }),
    items,
    counts: {
      email: num(cc.email) ?? items.filter((i) => i.kind === "email").length,
      whatsapp: num(cc.whatsapp) ?? items.filter((i) => i.kind === "whatsapp").length,
      call: num(cc.call) ?? items.filter((i) => i.kind === "call").length,
    },
    whatsapp: { connected: wa?.connected === true },
  };
}

/* ── the calls ── */

function queryOf(f: ActivityFilters, extra: Record<string, string | number | undefined> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** `offset` reads a numbered page (the server answers with the whole `total`); `cursor` reads the rows after the last one seen. */
export async function listActivity(
  f: ActivityFilters,
  page: { limit?: number; cursor?: string | null; offset?: number } = {},
): Promise<{ rows: ActivityRow[]; nextCursor: string | null; total: number | null }> {
  const res = await api<{ rows?: unknown[]; nextCursor?: string | null; total?: unknown }>(
    "GET",
    `/v1/outreach/activity${queryOf(f, { limit: page.limit ?? 25, cursor: page.cursor ?? undefined, offset: page.offset || undefined })}`,
  );
  const total = num(res.total);
  return {
    rows: (res.rows ?? []).map(activityRowOf).filter((r): r is ActivityRow => r !== null),
    nextCursor: str(res.nextCursor),
    total: total === null ? null : Math.max(0, total),
  };
}

export async function activityGroups(f: ActivityFilters): Promise<ActivityGroups> {
  return groupsOf(await api<unknown>("GET", `/v1/outreach/activity/groups${queryOf(f)}`));
}

export async function candidateOutreach(id: string): Promise<CandidateOutreach> {
  const read = candidateOutreachOf(await api<unknown>("GET", `/v1/outreach/candidates/${encodeURIComponent(id)}`));
  if (!read) throw new Error("That person's outreach couldn't be read.");
  return read;
}
