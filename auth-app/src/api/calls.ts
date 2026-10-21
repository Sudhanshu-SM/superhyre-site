import { API_URL, api } from "./client";

/**
 * Calls, as the API serves them (server: modules/calls). Who sees which call is the server's rule: an
 * organisation's owner and admins see everyone's, a recruiter and a Personal workspace their own. Nothing here
 * filters by person; a row that is not the viewer's is simply not sent.
 */

export type CallOutcome = "connected" | "voicemail" | "no_answer" | "call_back" | "not_interested" | "failed" | "in_progress";
/** What a person may say a call came to; the rest are what the dialer reports. */
export const CHOOSABLE_OUTCOMES = ["connected", "voicemail", "no_answer", "call_back", "not_interested"] as const;
export type ChoosableOutcome = (typeof CHOOSABLE_OUTCOMES)[number];
const OUTCOMES: readonly CallOutcome[] = [...CHOOSABLE_OUTCOMES, "failed", "in_progress"];

export type CallCandidate = { id: string; name: string; title: string | null; company: string | null };
export type CallCampaign = { id: string; name: string; client: string | null };
export type CallCaller = { id: string | null; name: string | null; mine: boolean };
export type SummaryState = "ready" | "pending" | "none";

export type CallRow = {
  id: string;
  at: string;
  durationSeconds: number | null;
  direction: "outbound" | "inbound";
  outcome: CallOutcome;
  outcomeText: string | null;
  phone: string;
  candidate: CallCandidate | null;
  caller: CallCaller;
  campaign: CallCampaign | null;
  summary: string | null;
  preview: string | null;
  summaryState: SummaryState;
  hasRecording: boolean;
  hasTranscript: boolean;
};

export type CallSegment = {
  start: number;
  end: number;
  role: "caller" | "candidate" | "other" | null;
  name: string | null;
  text: string;
};

export type CallDetail = CallRow & {
  notes: string | null;
  summaryDetail: { text: string | null; points: string[]; nextStep: string | null; at: string } | null;
  segments: CallSegment[];
  transcript: string | null;
  recording: { available: boolean; mime: string | null; seconds: number | null };
  canEdit: boolean;
  /** Logged by hand (a call from the person's own phone), not placed through the dialer: there is nothing to play. */
  byHand: boolean;
};

export type CallGroup = { campaign: CallCampaign | null; count: number; lastAt: string };
export type CallGroups = {
  groups: CallGroup[];
  total: number;
  canSeeEveryone: boolean;
  callers: Array<{ id: string; name: string | null; count: number; mine: boolean }>;
};

export type CallFilters = {
  /** A campaign's id, or "none" for the calls on no campaign. */
  campaignId?: string | undefined;
  outcome?: CallOutcome | undefined;
  q?: string | undefined;
  /** YYYY-MM-DD, India time, both ends included. */
  from?: string | undefined;
  to?: string | undefined;
  callerId?: string | undefined;
};

/* ── reading what arrives, so one odd field never blanks the page ── */

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const when = (v: unknown): string | null => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? s : null;
};

function candidateOf(raw: unknown): CallCandidate | null {
  const o = rec(raw);
  const id = str(o?.id);
  if (!o || !id) return null;
  return { id, name: str(o.name) ?? "A candidate", title: str(o.title), company: str(o.company) };
}

function campaignOf(raw: unknown): CallCampaign | null {
  const o = rec(raw);
  const id = str(o?.id);
  if (!o || !id) return null;
  return { id, name: str(o.name) ?? "A campaign", client: str(o.client) };
}

export function callRowOf(raw: unknown): CallRow | null {
  const o = rec(raw);
  const id = str(o?.id);
  const at = when(o?.at);
  if (!o || !id || !at) return null;
  const caller = rec(o.caller);
  const state = o.summaryState;
  return {
    id,
    at,
    durationSeconds: num(o.durationSeconds),
    direction: o.direction === "inbound" ? "inbound" : "outbound",
    outcome: OUTCOMES.find((x) => x === o.outcome) ?? "connected",
    outcomeText: str(o.outcomeText),
    phone: str(o.phone) ?? "",
    candidate: candidateOf(o.candidate),
    caller: { id: str(caller?.id), name: str(caller?.name), mine: caller?.mine === true },
    campaign: campaignOf(o.campaign),
    summary: str(o.summary),
    preview: str(o.preview),
    summaryState: state === "ready" || state === "pending" ? state : "none",
    hasRecording: o.hasRecording === true,
    hasTranscript: o.hasTranscript === true,
  };
}

function segmentOf(raw: unknown): CallSegment | null {
  const o = rec(raw);
  const text = str(o?.text);
  const start = num(o?.start);
  if (!o || !text || start === null) return null;
  const role = o.role === "caller" || o.role === "candidate" || o.role === "other" ? o.role : null;
  return { start, end: num(o.end) ?? start, role, name: str(o.name), text };
}

export function callDetailOf(raw: unknown): CallDetail | null {
  const o = rec(raw);
  const row = callRowOf(o);
  if (!o || !row) return null;
  const sum = rec(o.summaryDetail);
  const recording = rec(o.recording);
  return {
    ...row,
    notes: str(o.notes),
    summaryDetail: sum
      ? {
          text: str(sum.text),
          points: Array.isArray(sum.points) ? sum.points.filter((p): p is string => typeof p === "string" && p.trim() !== "") : [],
          nextStep: str(sum.nextStep),
          at: when(sum.at) ?? row.at,
        }
      : null,
    segments: Array.isArray(o.segments) ? o.segments.map(segmentOf).filter((s): s is CallSegment => s !== null) : [],
    transcript: str(o.transcript),
    recording: { available: recording?.available === true, mime: str(recording?.mime), seconds: num(recording?.seconds) },
    canEdit: o.canEdit === true,
    byHand: o.byHand === true,
  };
}

export function groupsOf(raw: unknown): CallGroups {
  const o = rec(raw) ?? {};
  const groups = Array.isArray(o.groups)
    ? o.groups.flatMap((g): CallGroup[] => {
        const r = rec(g);
        const last = when(r?.lastAt);
        const count = num(r?.count);
        if (!r || !last || count === null) return [];
        return [{ campaign: campaignOf(r.campaign), count, lastAt: last }];
      })
    : [];
  const callers = Array.isArray(o.callers)
    ? o.callers.flatMap((c) => {
        const r = rec(c);
        const id = str(r?.id);
        return r && id ? [{ id, name: str(r.name), count: num(r.count) ?? 0, mine: r.mine === true }] : [];
      })
    : [];
  return { groups, total: num(o.total) ?? groups.reduce((n, g) => n + g.count, 0), canSeeEveryone: o.canSeeEveryone === true, callers };
}

/* ── calls ── */

function queryOf(f: CallFilters, extra: Record<string, string | number | undefined> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** `offset` reads a numbered page (the server answers with the whole `total`); `cursor` reads the rows after the last one seen. */
export async function listCalls(
  f: CallFilters,
  page: { limit?: number; cursor?: string | null; offset?: number } = {},
): Promise<{ calls: CallRow[]; nextCursor: string | null; total: number | null }> {
  const res = await api<{ calls?: unknown[]; nextCursor?: string | null; total?: unknown }>(
    "GET",
    `/v1/calls${queryOf(f, { limit: page.limit ?? 25, cursor: page.cursor ?? undefined, offset: page.offset || undefined })}`,
  );
  const calls = (res.calls ?? []).map(callRowOf).filter((c): c is CallRow => c !== null);
  const total = num(res.total);
  return { calls, nextCursor: str(res.nextCursor), total: total === null ? null : Math.max(0, total) };
}

/**
 * The campaigns the calls fall under. The server leaves the campaign filter out of the groups themselves (every
 * campaign with calls is listed) and applies it to the callers, so a campaign's own page names its own callers.
 */
export async function callGroups(f: CallFilters): Promise<CallGroups> {
  return groupsOf(await api<unknown>("GET", `/v1/calls/groups${queryOf(f)}`));
}

export async function getCall(id: string): Promise<CallDetail> {
  const detail = callDetailOf((await api<{ call?: unknown }>("GET", `/v1/calls/${encodeURIComponent(id)}`)).call);
  if (!detail) throw new Error("That call couldn't be read.");
  return detail;
}

export type CallPatch = { notes?: string | null; outcome?: ChoosableOutcome | null; campaignId?: string | null };

export async function patchCall(id: string, patch: CallPatch): Promise<CallDetail> {
  const res = await api<{ call?: unknown }>("PATCH", `/v1/calls/${encodeURIComponent(id)}`, patch);
  const detail = callDetailOf(res.call);
  if (!detail) throw new Error("That call couldn't be read.");
  return detail;
}

/** What a call logged by hand says (server: `POST /v1/calls`). `key` is the call's own id: asking again with it is the same call. */
export type LogCallBody = {
  key: string;
  candidateId: string;
  /** Left out: their latest campaign that the person is on too. */
  campaignId?: string | undefined;
  outcome: ChoosableOutcome;
  direction?: "outbound" | "inbound";
  /** ISO time with an offset. Left out: now. */
  startedAt?: string | undefined;
  durationMinutes?: number | undefined;
  notes?: string | undefined;
};

export type LoggedCall = { call: CallDetail; created: boolean; offerDoNotContact: boolean };

export async function logCall(body: LogCallBody): Promise<LoggedCall> {
  const res = await api<{ call?: unknown; created?: unknown; offerDoNotContact?: unknown }>("POST", "/v1/calls", body);
  const call = callDetailOf(res.call);
  if (!call) throw new Error("That call couldn't be read.");
  return { call, created: res.created !== false, offerDoNotContact: res.offerDoNotContact === true };
}

/** Takes back a call logged by hand; the server refuses any other. */
export const removeLoggedCall = (id: string): Promise<void> => api<void>("DELETE", `/v1/calls/${encodeURIComponent(id)}`);

export type NewSegment = { start: number; end?: number; speaker?: string; text: string };

export async function attachTranscript(id: string, segments: NewSegment[]): Promise<CallDetail> {
  const res = await api<{ call?: unknown }>("POST", `/v1/calls/${encodeURIComponent(id)}/transcript`, { segments });
  const detail = callDetailOf(res.call);
  if (!detail) throw new Error("That call couldn't be read.");
  return detail;
}

export async function uploadRecording(id: string, file: Blob, seconds: number | null): Promise<CallDetail> {
  const q = seconds && seconds > 0 ? `?seconds=${Math.round(seconds)}` : "";
  const res = await api<{ call?: unknown }>("PUT", `/v1/calls/${encodeURIComponent(id)}/recording${q}`, file, {
    headers: { "content-type": file.type || "audio/mpeg" },
  });
  const detail = callDetailOf(res.call);
  if (!detail) throw new Error("That call couldn't be read.");
  return detail;
}

export type RecordingLink = { url: string; expiresAt: number; bytes: number };

/** The address to play a recording at: short-lived, so ask again when it runs out. */
export async function recordingLink(id: string): Promise<RecordingLink> {
  const res = await api<{ url?: string; expiresAt?: string; bytes?: number }>("GET", `/v1/calls/${encodeURIComponent(id)}/recording`);
  const url = str(res.url);
  if (!url) throw new Error("That recording isn't available.");
  return {
    // The local store's address is the API's own, relative to it; a storage provider's is absolute.
    url: /^https?:\/\//.test(url) ? url : `${API_URL ?? ""}${url}`,
    expiresAt: Date.parse(res.expiresAt ?? "") || Date.now() + 5 * 60_000,
    bytes: num(res.bytes) ?? 0,
  };
}
