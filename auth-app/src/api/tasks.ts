import type { TaskState } from "../orchestrator";
import { api } from "./client";

/**
 * Tasks (server: modules/tasks): the caller's own, typed by people or kept by
 * the agent's rules, and notifications, which tell someone a task is theirs.
 */

export type ApiTask = {
  id: string;
  title: string;
  kind: "manual" | "agent" | "system";
  status: "todo" | "doing" | "blocked" | "done" | "dismissed";
  dueAt: string | null;
  assigneeId: string | null;
  /** Names the server resolved: who it is for, and who made it (null for the agent and rules). */
  assigneeName?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  createdByKind?: "user" | "agent" | "system";
  campaign: { id: string; name: string } | null;
  candidate: { id: string; fullName: string } | null;
  action: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
};

/** Which tasks: mine; the ones I handed to others ("assigned"); or everyone's, for admins ("team"). */
export type TaskView = "mine" | "assigned" | "team";

export const listTasks = (status: "open" | "done", view: TaskView = "mine") =>
  api<{ tasks: ApiTask[] }>("GET", `/v1/tasks?status=${status}${view === "mine" ? "" : `&view=${view}`}`).then((r) => r.tasks);
/**
 * One campaign's tasks, everyone's, for whoever may see that campaign (the server's `view=campaign`: a recruiter
 * gets the tasks of the campaigns they are on, never of one they cannot open).
 */
export const listCampaignTasks = (campaignId: string, status: "open" | "done") =>
  api<{ tasks: ApiTask[] }>("GET", `/v1/tasks?status=${status}&view=campaign&campaignId=${encodeURIComponent(campaignId)}`).then((r) => r.tasks);
/** Gives a task to someone else (or back to myself). */
export const reassignTask = (id: string, assigneeId: string) => api<ApiTask>("PATCH", `/v1/tasks/${id}`, { assigneeId });
export const createTask = (body: { title: string; campaignId: string | null; dueAt: string | null; assigneeId?: string; candidateId?: string | null }) =>
  api<ApiTask>("POST", "/v1/tasks", body);
export const setTaskStatus = (id: string, status: ApiTask["status"]) => api<ApiTask>("PATCH", `/v1/tasks/${id}`, { status });
/** Changes what a task says or when it is due; `dueAt: null` takes the date off. */
export const updateTask = (id: string, body: { title?: string; dueAt?: string | null }) => api<ApiTask>("PATCH", `/v1/tasks/${id}`, body);
export const deleteTask = (id: string) => api<void>("DELETE", `/v1/tasks/${id}`);

/** A task as Home's list shows it. */
export type DayTask = {
  id: string;
  title: string;
  state: TaskState;
  campaignId: string | null;
  campaign: string | null;
  /** Days until due from today: 0 today, negative overdue; null when it has no date. */
  dueInDays: number | null;
  /** When it is due, as the server has it, for editing. */
  dueAt?: string | null;
  /** When it was finished, as the server has it; null while it is open. */
  resolvedAt?: string | null;
  /** Where the task is done, as a console hash ("#/campaign/shortlisted?campaign=…"); tasks
      the agent's rules keep (review applicants, log replies, reconnect Gmail) carry one. */
  open?: string | null;
  /** Typed by a person, so it can be deleted; tasks the agent's rules keep close themselves. */
  removable?: boolean;
  /** Who it's for, when that's someone named (Home shows "for <name>" unless it's you). */
  assigneeId?: string | null;
  assigneeName?: string | null;
  /** Who made it, by name; null when the agent or a rule did. */
  createdById?: string | null;
  createdByName?: string | null;
};

/** The console address a task's action points at, if it has one we can open. */
export function taskLink(action: ApiTask["action"]): string | null {
  if (!action || action.kind !== "open" || typeof action.path !== "string") return null;
  return action.path.startsWith("/") ? `#${action.path}` : null;
}

const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Whole calendar days from today to a due time, in the browser's own time zone. */
export function daysUntil(iso: string, now = Date.now()): number {
  return Math.round((dayStart(Date.parse(iso)) - dayStart(now)) / 86400000);
}

export function dayTask(t: ApiTask, now = Date.now()): DayTask {
  return {
    id: t.id,
    title: t.title,
    /* Dismissed reads as finished: it has left the list either way. */
    state: t.status === "dismissed" ? "done" : t.status,
    campaignId: t.campaign?.id ?? null,
    campaign: t.campaign?.name ?? null,
    dueInDays: t.dueAt ? daysUntil(t.dueAt, now) : null,
    dueAt: t.dueAt,
    resolvedAt: t.resolvedAt,
    open: taskLink(t.action),
    removable: t.kind === "manual",
    assigneeId: t.assigneeId,
    assigneeName: t.assigneeName ?? null,
    createdById: t.createdById ?? null,
    createdByName: t.createdByName ?? null,
  };
}

/**
 * The day's progress, as plain facts: what was finished today, and out of how many. The day holds the tasks that are due
 * today or late and still open, and the ones finished today; a task finished on an earlier day, or due later, is not in it.
 * Only the person's own tasks are given here (Home asks for the ones assigned to them).
 */
export function dayProgress(tasks: readonly Pick<DayTask, "state" | "dueInDays" | "resolvedAt">[], now = Date.now()): { finished: number; total: number } {
  const today = dayStart(now);
  const finished = tasks.filter((t) => t.state === "done" && (!t.resolvedAt || dayStart(Date.parse(t.resolvedAt)) === today)).length;
  const open = tasks.filter((t) => t.state !== "done" && t.dueInDays !== null && t.dueInDays <= 0).length;
  return { finished, total: finished + open };
}

/** The header over the day's tasks: "3 of 5 done today", and "All done for today" once nothing due is left. */
export const dayHeading = ({ finished, total }: { finished: number; total: number }): string =>
  total === 0 ? "" : finished >= total ? "All done for today" : `${finished} of ${total} done today`;

/** The end of today, local time: when a task typed on Home is due. */
export function endOfToday(now = Date.now()): string {
  const d = new Date(now);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

/** The end of the day `days` from today, local time (1 is tomorrow). */
export function endOfDayAhead(days: number, now = Date.now()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

/** The end of a calendar day a date input holds ("2026-10-17"), local time; null when it isn't a day. */
export function endOfDate(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 0, 0);
  return Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 ? null : d.toISOString();
}

/** A date input's value for a due time, in the browser's own zone: "2026-10-17". */
export function dateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ── notifications ── */

export type ApiNotification = {
  id: string;
  kind: string;
  text: string;
  link: string | null;
  subjectKind: string | null;
  subjectId: string | null;
  readAt: string | null;
  createdAt: string;
  /** Still waiting for an answer: an invitation not answered, a request to join not decided. */
  open?: boolean;
  /** A request to join that was answered: how, and by whom. */
  outcome?: "approved" | "declined" | null;
  decidedByName?: string | null;
  /** The organisation a note is about, for the ones that follow a person between workspaces. */
  organisationId?: string | null;
  /** An invitation, whole: it needs no second call to be answered. `blockedBy` is the organisation they are in. */
  invitation?: {
    id: string;
    organisationId: string;
    organisationName: string;
    logoUrl: string | null;
    inviterName: string | null;
    role: "admin" | "recruiter";
    expiresAt: string;
    blockedBy: string | null;
    /** What they are in the organisation that blocks it: an owner has to hand it over before they can leave. */
    blockedByRole?: "owner" | "admin" | "recruiter" | null;
  };
};

export const listNotifications = () => api<{ notifications: ApiNotification[]; unread: number }>("GET", "/v1/notifications?limit=30");
export const markNotificationsRead = (body: { ids: string[] } | { all: true }) => api<{ updated: number }>("POST", "/v1/notifications/read", body);
