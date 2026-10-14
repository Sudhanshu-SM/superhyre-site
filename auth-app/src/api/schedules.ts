import { api } from "./client";

/**
 * Things set up to happen later, as the API serves them (server: modules/schedules, `GET /v1/schedules`).
 *
 * The agent (shown as "Mind") and people schedule an email to a candidate, a Slack message, a Notion
 * note, a task, a reminder or a recurring pipeline digest. Each is one row here: what will happen,
 * when, and, once it has run, how it went.
 */

export type ScheduleKind = "email" | "slack_message" | "notion_note" | "task" | "reminder" | "digest";
export type ScheduleStatus = "scheduled" | "running" | "done" | "failed" | "cancelled" | "skipped";
export type ScheduleRepeat = "none" | "daily" | "weekdays" | "weekly";
/** What a run of a repeating or one-off schedule came to. */
export type RunStatus = "running" | "done" | "skipped" | "failed" | "cancelled";

export const KINDS: readonly ScheduleKind[] = ["email", "slack_message", "notion_note", "task", "reminder", "digest"];
const STATUSES: readonly ScheduleStatus[] = ["scheduled", "running", "done", "failed", "cancelled", "skipped"];
const REPEATS: readonly ScheduleRepeat[] = ["none", "daily", "weekdays", "weekly"];
const RUN_STATUSES: readonly RunStatus[] = ["running", "done", "skipped", "failed", "cancelled"];

export type ScheduledItem = {
  id: string;
  /** A string, not the union above, so a kind a newer server adds still shows. */
  kind: string;
  title: string;
  status: ScheduleStatus;
  runAt: string;
  nextRunAt: string | null;
  /** An IANA zone: the time reads in it. */
  timezone: string;
  repeat: ScheduleRepeat;
  until: string | null;
  occurrencesDone: number;
  /** What will happen, in a sentence (the server's own words). */
  summary: string;
  campaign: { id: string; name: string } | null;
  candidate: { id: string; fullName: string } | null;
  createdBy: { kind: "user" | "agent"; id: string | null; name: string | null };
  approvedBy: { id: string; name: string | null } | null;
  lastError: string | null;
  lastRunAt: string | null;
  /** What the last run recorded: `reason` for a skip, `delivery` for an email that fired. */
  result: Record<string, unknown> | null;
  canCancel: boolean;
  /** An email still waiting to someone on the do-not-contact list: it will not go. Why, in the server's sentence. */
  doNotContact?: string | null;
};

export type ScheduleRun = {
  runId: string;
  at: string;
  finishedAt: string | null;
  status: RunStatus;
  message: string | null;
  result: Record<string, unknown> | null;
};

export type ScheduleDetail = ScheduledItem & {
  /** What it sends, as stored (an email's subject and body, a Slack message's text). */
  payload: Record<string, unknown>;
  history: ScheduleRun[];
};

export type SchedulePage = { items: ScheduledItem[]; nextCursor: string | null };

export type ScheduleQuery = {
  status?: "upcoming" | "history" | "all";
  campaignId?: string | null;
  kind?: string | null;
  limit?: number;
  cursor?: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** A time the server sent, or null when it isn't one a page can show. */
const when = (v: unknown): string | null => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? s : null;
};

/**
 * One scheduled item from the API's answer, or null when it isn't one. Reads defensively: a server a
 * little older or newer than this console should drop a row it can't read, not break the page.
 */
export function scheduledItemOf(raw: unknown): ScheduledItem | null {
  const o = rec(raw);
  if (!o) return null;
  const id = str(o.id);
  const runAt = when(o.runAt) ?? when(o.nextRunAt);
  if (!id || !runAt) return null;
  const by = rec(o.createdBy);
  const campaign = rec(o.campaign);
  const candidate = rec(o.candidate);
  const approved = rec(o.approvedBy);
  const campaignId = str(campaign?.id);
  const candidateId = str(candidate?.id);
  const summary = str(o.summary) ?? str(o.title) ?? "Something scheduled";
  return {
    id,
    kind: str(o.kind) ?? "reminder",
    title: str(o.title) ?? summary,
    status: STATUSES.find((s) => s === o.status) ?? "done",
    runAt,
    nextRunAt: when(o.nextRunAt),
    timezone: str(o.timezone) ?? "UTC",
    repeat: REPEATS.find((r) => r === o.repeat) ?? "none",
    until: when(o.until),
    occurrencesDone: typeof o.occurrencesDone === "number" && o.occurrencesDone > 0 ? Math.floor(o.occurrencesDone) : 0,
    summary,
    campaign: campaignId ? { id: campaignId, name: str(campaign?.name) ?? "A campaign" } : null,
    candidate: candidateId ? { id: candidateId, fullName: str(candidate?.fullName) ?? "A candidate" } : null,
    createdBy: {
      kind: by?.kind === "agent" ? "agent" : "user",
      id: str(by?.id),
      name: str(by?.name),
    },
    approvedBy: approved && str(approved.id) ? { id: str(approved.id) ?? "", name: str(approved.name) } : null,
    lastError: str(o.lastError),
    lastRunAt: when(o.lastRunAt),
    result: rec(o.result),
    canCancel: o.canCancel === true,
    ...(str(o.doNotContact) ? { doNotContact: str(o.doNotContact) } : {}),
  };
}

export function schedulePageOf(raw: unknown): SchedulePage {
  const o = rec(raw) ?? {};
  const items = Array.isArray(o.items) ? o.items.map(scheduledItemOf).filter((i): i is ScheduledItem => i !== null) : [];
  return { items, nextCursor: str(o.nextCursor) };
}

export function scheduleRunOf(raw: unknown): ScheduleRun | null {
  const o = rec(raw);
  const at = when(o?.at);
  if (!o || !at) return null;
  return {
    runId: str(o.runId) ?? at,
    at,
    finishedAt: when(o.finishedAt),
    status: RUN_STATUSES.find((s) => s === o.status) ?? "done",
    message: str(o.message),
    result: rec(o.result),
  };
}

export function scheduleDetailOf(raw: unknown): ScheduleDetail | null {
  const item = scheduledItemOf(raw);
  if (!item) return null;
  const o = rec(raw) ?? {};
  return {
    ...item,
    payload: rec(o.payload) ?? {},
    history: Array.isArray(o.history) ? o.history.map(scheduleRunOf).filter((r): r is ScheduleRun => r !== null) : [],
  };
}

export function queryString(q: ScheduleQuery): string {
  const p = new URLSearchParams();
  if (q.status && q.status !== "upcoming") p.set("status", q.status);
  if (q.campaignId) p.set("campaignId", q.campaignId);
  if (q.kind && q.kind !== "all") p.set("kind", q.kind);
  if (q.limit) p.set("limit", String(q.limit));
  if (q.cursor) p.set("cursor", q.cursor);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const listSchedules = (q: ScheduleQuery = {}): Promise<SchedulePage> =>
  api<unknown>("GET", `/v1/schedules${queryString(q)}`).then(schedulePageOf);

export const getSchedule = (id: string): Promise<ScheduleDetail | null> =>
  api<unknown>("GET", `/v1/schedules/${encodeURIComponent(id)}`).then(scheduleDetailOf);

/** The time only changes while it is waiting; the answer is the updated item. */
export const rescheduleSchedule = (id: string, runAt: string): Promise<ScheduledItem | null> =>
  api<unknown>("PATCH", `/v1/schedules/${encodeURIComponent(id)}`, { runAt }).then(scheduledItemOf);

/** Cancels it (204). Cancelling twice is fine; something that has already run is a 409. */
export const cancelSchedule = (id: string): Promise<void> =>
  api<void>("DELETE", `/v1/schedules/${encodeURIComponent(id)}`);
