import type { DayTask } from "./api/tasks";
import { browserZone, dayLabel, whenLabel } from "./schedulesView";

/**
 * What the Overview's Tasks panel says about a task, as plain functions (the panel itself is TasksPanel.tsx).
 *
 * Voice: the due day is a word or a date, never a count of days; a task that is past its day says so once, with
 * the date, and nothing else about it is alarmed. Nothing here is a status badge: the due day is plain text and
 * only its colour changes.
 */

/** How many pending tasks the panel lists before "View all". */
export const PANEL_ROWS = 5;

export type DueText = {
  /** "Today", "Tomorrow", "Thu 16 Oct", "Overdue 5 Oct", "No date". */
  text: string;
  /** Amber when it is due today, red-brown once its day has passed; plain otherwise. */
  tone: "today" | "late" | "";
  /** The exact time, for a tooltip ("Today, 18:30"). */
  title: string;
};

/** "5 Oct": the weekday dropped, because a task past its day is named by the date it was due. */
const shortDate = (ms: number) => dayLabel(ms).replace(/^[A-Za-z]{3} /, "");

export function dueText(t: Pick<DayTask, "dueAt" | "dueInDays">, now = Date.now()): DueText {
  const at = t.dueAt ? Date.parse(t.dueAt) : Number.NaN;
  const exact = Number.isNaN(at) ? "" : whenLabel(t.dueAt!, browserZone(), { now });
  const d = t.dueInDays;
  if (d === null || Number.isNaN(at)) return { text: "No date", tone: "", title: "" };
  if (d < 0) return { text: `Overdue ${shortDate(at)}`, tone: "late", title: exact };
  if (d === 0) return { text: "Today", tone: "today", title: exact };
  if (d === 1) return { text: "Tomorrow", tone: "", title: exact };
  return { text: dayLabel(at, undefined, now), tone: "", title: exact };
}

/* ── a new task's day: tomorrow at nine, as the picker holds it ── */

const pad = (n: number) => String(n).padStart(2, "0");

/** A `datetime-local` value ("2026-10-14T09:00") for tomorrow at nine, in the browser's own zone. */
export function tomorrowNine(now = Date.now()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

/** The instant a `datetime-local` value holds, as the API wants it; null for an empty or unreadable value. */
export function dueFromInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, da, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const d = new Date(y, mo - 1, da, h, mi, 0, 0);
  return Number.isNaN(d.getTime()) || d.getMonth() !== mo - 1 ? null : d.toISOString();
}

/* ── who sees what ── */

export type Standing = { mayManage: boolean; myId: string | undefined };

/** The server's rule (`updateTask`): the person it is for, whoever made it, or an admin. */
export function mayChange(t: Pick<DayTask, "assigneeId" | "createdById">, who: Standing): boolean {
  if (who.mayManage) return true;
  return !!who.myId && (t.assigneeId === who.myId || t.createdById === who.myId);
}

export type Scope = "everyone" | "mine";

/** The tasks a filter keeps: all of them, or the ones that are for this person. */
export function inScope<T extends Pick<DayTask, "assigneeId">>(list: readonly T[], scope: Scope, myId: string | undefined): T[] {
  return scope === "mine" ? list.filter((t) => !!myId && t.assigneeId === myId) : [...list];
}

/** "3 open", "1 open": the one line the panel's header keeps; nothing when there are none. */
export const openLine = (n: number): string => (n > 0 ? `${n} open` : "");
