import type { LooseEnds, PassOpenPreview, RemovalPreview, TiedItem } from "./api/windDown";

/**
 * The words for what leaving something behind touches. Plain functions, so the wording is pinned without a page. The
 * server's own summary line is used when it sent one; the console only builds a line when an older server did not.
 */

/** An array, or nothing: the server may send a number or an object where a list was meant, and that must never throw in a render. */
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const n = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.round(x) : 0);
const noun = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const join = (parts: readonly string[]): string => (parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);

/** How many of each thing is tied to these people. */
export function tiedCounts(x: LooseEnds | null | undefined): { meetings: number; reminders: number; sends: number; tasks: number; total: number } {
  const c = rec(x?.counts);
  const meetings = n(c.meetings) || arr(x?.meetings).length;
  const reminders = n(c.reminders) || arr(x?.reminders).length;
  const sends = n(c.sends) || arr(x?.sends).length;
  const tasks = n(c.tasks) || arr(x?.tasks).length;
  return { meetings, reminders, sends, tasks, total: n(c.total) || meetings + reminders + sends + tasks };
}

/** "2 reminders, 1 interview and 2 tasks are tied to these people and will be cancelled or closed." The server's line when it sent one. */
export function tiedLine(x: LooseEnds | null | undefined): string {
  const s = typeof x?.summary === "string" ? x.summary.trim() : "";
  if (s) return s;
  const c = tiedCounts(x);
  if (c.total === 0) return "";
  const parts = [
    ...(c.reminders ? [noun(c.reminders, "reminder", "reminders")] : []),
    ...(c.meetings ? [noun(c.meetings, "interview", "interviews")] : []),
    ...(c.sends ? [noun(c.sends, "message waiting to send", "messages waiting to send")] : []),
    ...(c.tasks ? [noun(c.tasks, "task", "tasks")] : []),
  ];
  return `${join(parts)} ${c.total === 1 ? "is" : "are"} tied to ${c.total === 1 ? "this person" : "these people"} and will be cancelled or closed.`;
}

/** Whether there is anything to say: nothing is shown for none. */
export const hasLooseEnds = (x: LooseEnds | null | undefined): boolean => tiedCounts(x).total > 0 || (typeof x?.summary === "string" && x.summary.trim() !== "");

export type TiedRow = { key: string; kind: "interview" | "reminder" | "message" | "task"; title: string; person: string; when: string };

const whenOf = (iso: string | null | undefined): string => {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).replace(/\bam\b/, "AM").replace(/\bpm\b/, "PM");
};

/**
 * The items behind the summary, as rows to list: what, who it is about (only when more than one person is involved: for
 * one, the dialog already says who), when.
 */
export function tiedRows(x: LooseEnds | null | undefined, opts: { withPerson?: boolean } = {}): TiedRow[] {
  const withPerson = opts.withPerson ?? true;
  const rows = (items: unknown, kind: TiedRow["kind"], fallback: string): TiedRow[] =>
    arr<TiedItem>(items).map((raw, k) => {
      const i = rec(raw) as TiedItem;
      const title = typeof i.title === "string" ? i.title.trim() : "";
      return { key: `${kind}-${typeof i.id === "string" ? i.id : k}`, kind, title: title || fallback, person: withPerson && typeof i.person === "string" ? i.person.trim() : "", when: whenOf(typeof i.at === "string" ? i.at : null) };
    });
  return [...rows(x?.meetings, "interview", "Interview"), ...rows(x?.reminders, "reminder", "Reminder"), ...rows(x?.sends, "message", "Message"), ...rows(x?.tasks, "task", "Task")];
}

/** The names of the people a "reject the rest" would reject. `people` may be a list of people, or only a number. */
export function peopleNames(p: PassOpenPreview | null | undefined): string[] {
  return arr<{ name?: unknown } | string>(p?.people).flatMap((x) => {
    const name = typeof x === "string" ? x : rec(x).name;
    return typeof name === "string" && name.trim() ? [name.trim()] : [];
  });
}

/** How many people: the server's count, else the list's length, else a bare number in `people`. */
export function peopleCount(p: PassOpenPreview | null | undefined): number | null {
  const c = p as (PassOpenPreview & { peopleCount?: unknown }) | null | undefined;
  if (typeof c?.peopleCount === "number" && c.peopleCount >= 0) return Math.round(c.peopleCount);
  if (Array.isArray(c?.people)) return c.people.length;
  return typeof c?.people === "number" && c.people >= 0 ? Math.round(c.people) : null;
}

/** The reason offered for "reject the rest", unless the server has its own. */
export const DEFAULT_REJECT_REASON = "Role filled";
export const reasonFor = (p: PassOpenPreview | null | undefined): string => (typeof p?.defaultReason === "string" && p.defaultReason.trim()) || DEFAULT_REJECT_REASON;

/**
 * Where a removed member's work goes, said before it happens: "Their 2 campaigns, 5 candidates, 2 open tasks and
 * 1 reminder go to Asha." Always said, even when they own nothing ("Anything else of theirs goes to Asha.").
 */
export function handoverLine(p: RemovalPreview | null | undefined, heir: string): string {
  const h = rec(p?.holdings);
  const parts = [
    ...(n(h.campaigns) ? [noun(n(h.campaigns), "campaign", "campaigns")] : []),
    ...(n(h.candidates) ? [noun(n(h.candidates), "candidate", "candidates")] : []),
    ...(n(h.openTasks) ? [noun(n(h.openTasks), "open task", "open tasks")] : []),
    ...(n(h.reminders) ? [noun(n(h.reminders), "reminder", "reminders")] : []),
  ];
  return parts.length ? `Their ${join(parts)} go to ${heir}. Choose someone else:` : `They have no work to hand over. Anything else of theirs goes to ${heir}. Choose someone else:`;
}

/** The teams they will leave, by name. */
export function teamNames(p: RemovalPreview | null | undefined): string[] {
  return arr<{ name?: unknown } | string>(p?.teams).flatMap((t) => {
    const name = typeof t === "string" ? t : rec(t).name;
    return typeof name === "string" && name.trim() ? [name.trim()] : [];
  });
}
