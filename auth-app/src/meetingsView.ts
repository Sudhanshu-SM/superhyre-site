import type { Meeting } from "./api/meetings";

/**
 * How a meeting reads on the page, as plain functions: the time in the organiser's own zone, short when it is soon,
 * and the few words a candidate's card carries ("Interview Tue 3 pm"). Nothing here fetches or stores.
 */

const DAY = 86_400_000;

/** The calendar day an instant falls on in a zone, as a number of days (for "how many days from today"). */
function dayIn(t: number, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  );
  return Math.round(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / DAY);
}

const part = (t: number, timeZone: string, o: Intl.DateTimeFormatOptions): Record<string, string> =>
  Object.fromEntries(new Intl.DateTimeFormat("en-IN", { timeZone, ...o }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));

/** "3 pm", or "3:30 pm" when it is not on the hour. */
export function clock(iso: string, timeZone: string): string {
  const p = part(Date.parse(iso), timeZone, { hour: "numeric", minute: "2-digit", hour12: true });
  const hm = p.minute === "00" ? p.hour : `${p.hour}:${p.minute}`;
  return `${hm} ${String(p.dayPeriod).toLowerCase()}`;
}

/** "Tue 21 Oct" */
export function dayWords(iso: string, timeZone: string): string {
  const p = part(Date.parse(iso), timeZone, { weekday: "short", day: "numeric", month: "short" });
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "IST", "GMT-4": the zone's short name, as the person's calendar would show it. */
export function zoneName(iso: string, timeZone: string): string {
  return part(Date.parse(iso), timeZone, { timeZoneName: "short" }).timeZoneName ?? timeZone;
}

/** "Thu 22 Oct, 2:00 pm IST": the one way a meeting's time is said, on a card and in the agent's words. */
export function fullWhen(iso: string, timeZone: string): string {
  const p = part(Date.parse(iso), timeZone, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${dayWords(iso, timeZone)}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()} ${zoneName(iso, timeZone)}`;
}

/**
 * The short form for a list: "Today, 3 pm", "Tomorrow, 11:30 am", "Tue 3 pm" within the week, else "Tue 21 Oct, 3 pm".
 * `now` is the moment it is read at.
 */
export function shortWhen(iso: string, timeZone: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  const ahead = dayIn(t, timeZone) - dayIn(now, timeZone);
  const at = clock(iso, timeZone);
  if (ahead === 0) return `Today, ${at}`;
  if (ahead === 1) return `Tomorrow, ${at}`;
  if (ahead > 1 && ahead < 7) return `${part(t, timeZone, { weekday: "short" }).weekday} ${at}`;
  return `${dayWords(iso, timeZone)}, ${at}`;
}

/** An all-day event's date (`2026-10-25`) said as a list says a day: "Today", "Tomorrow", "Tue", else "Sat 25 Oct". */
export function dateWhen(date: string, timeZone: string, now: number = Date.now()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const noon = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  const ahead = Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY) - dayIn(now, timeZone);
  if (ahead === 0) return "Today";
  if (ahead === 1) return "Tomorrow";
  if (ahead > 1 && ahead < 7) return part(noon, "UTC", { weekday: "short" }).weekday ?? date;
  return dayWords(new Date(noon).toISOString(), "UTC");
}

/** Whether the meeting is an interview: its title says so. Nothing else on the record tells a call from an interview. */
export const isInterview = (m: Pick<Meeting, "title">): boolean => /\binterview\b/i.test(m.title);

/** What a candidate's card says about their next meeting: "Interview Tue 3 pm". Null when they have none coming. */
export function cardLine(meetings: readonly Meeting[], now: number = Date.now()): string | null {
  const next = meetings
    .filter((m) => m.status === "scheduled" && Date.parse(m.endsAt) >= now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
  if (!next) return null;
  return `${isInterview(next) ? "Interview" : "Meeting"} ${shortWhen(next.startsAt, next.timezone, now).replace(/^Today, /, "today ").replace(/^Tomorrow, /, "tomorrow ")}`;
}

/** Meetings still ahead, soonest first. */
export const upcoming = (meetings: readonly Meeting[], now: number = Date.now()): Meeting[] =>
  meetings
    .filter((m) => m.status === "scheduled" && Date.parse(m.endsAt) >= now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

/** Who it is with, in a few words: the candidate's name, else the first guest, else nothing. */
export function withWhom(m: Pick<Meeting, "candidateName" | "attendees">): string | null {
  if (m.candidateName) return m.candidateName;
  const first = m.attendees.find((a) => a.name);
  return first?.name ?? null;
}
