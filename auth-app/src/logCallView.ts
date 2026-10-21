import type { ChoosableOutcome, LogCallBody } from "./api/calls";
import type { ActivityFilters, ActivityRow } from "./api/outreachActivity";
import { IST, whenLabel } from "./callsView";

/**
 * Logging a call by hand, as functions: the outcome chips, the form and what it comes to (the request, the row the list
 * shows at once, the sentence that says it was done). Pure, so the words and the rules are tested without a screen. The
 * dialog (LogCallDialog.tsx) only draws them.
 */

/** What a person says a call came to, in the words the lists and filters already use. */
export const LOG_OUTCOMES: ReadonlyArray<{ value: ChoosableOutcome; label: string }> = [
  { value: "connected", label: "Connected" },
  { value: "voicemail", label: "Voicemail" },
  { value: "no_answer", label: "No answer" },
  { value: "call_back", label: "Call back" },
  { value: "not_interested", label: "Not interested" },
];

export const outcomeWord = (o: ChoosableOutcome): string => LOG_OUTCOMES.find((x) => x.value === o)?.label ?? "Connected";

export const NOTES_MAX = 1000;
export const MINUTES_MAX = 600;
/** A call cannot have happened later than this far ahead of now (clocks differ a little). */
const AHEAD_MS = 5 * 60_000;

/** Someone the call was with: a candidate of the workspace, and the campaigns they are on. */
export type PersonPick = {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  campaigns: ReadonlyArray<{ id: string; name: string }>;
};

export type LogCallForm = {
  person: PersonPick | null;
  /** A campaign the person chose among the ones they are on; empty is "their latest". */
  campaignId: string;
  outcome: ChoosableOutcome | null;
  /** A `datetime-local` value in the browser's time. */
  when: string;
  /** Minutes, as typed; empty is not known. */
  minutes: string;
  notes: string;
};

const two = (n: number): string => String(n).padStart(2, "0");

/** A `datetime-local` value for an instant, in the browser's own time. */
export function whenInput(at: number = Date.now()): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
}

export const emptyForm = (person: PersonPick | null = null, now: number = Date.now()): LogCallForm => ({
  person,
  campaignId: "",
  outcome: null,
  when: whenInput(now),
  minutes: "",
  notes: "",
});

/** When the call happened as an instant, or null when the value is not a time or is still ahead. */
export function whenOf(value: string, now: number = Date.now()): number | null {
  const at = Date.parse(value);
  return Number.isNaN(at) || at > now + AHEAD_MS ? null : at;
}

/** The minutes as a whole number from 1 to 600, or null when empty or not that. */
export function minutesOf(text: string): number | null {
  const n = Number(text.trim());
  return text.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= MINUTES_MAX ? n : null;
}

/** Why the form cannot be saved yet, in a few words; null when it can. */
export function whyNot(f: LogCallForm, now: number = Date.now()): string | null {
  if (!f.person) return "Choose who the call was with.";
  if (!f.outcome) return "Choose how it went.";
  if (whenOf(f.when, now) === null) return "That time hasn't happened yet.";
  if (f.minutes.trim() !== "" && minutesOf(f.minutes) === null) return "Length is in whole minutes.";
  return null;
}

/** The request for a form that can be saved. `key` makes asking twice one call. */
export function bodyOf(f: LogCallForm, key: string, now: number = Date.now()): LogCallBody {
  const at = whenOf(f.when, now) ?? now;
  const minutes = minutesOf(f.minutes);
  const notes = f.notes.trim();
  return {
    key,
    candidateId: f.person?.id ?? "",
    ...(f.campaignId ? { campaignId: f.campaignId } : {}),
    outcome: f.outcome ?? "connected",
    startedAt: new Date(at).toISOString(),
    ...(minutes !== null ? { durationMinutes: minutes } : {}),
    ...(notes ? { notes: notes.slice(0, NOTES_MAX) } : {}),
  };
}

/** Which campaign a form's call is expected to land on: the one chosen, the only one they are on, else their first. */
export function campaignOfForm(f: LogCallForm, fixed?: { id: string; name: string } | null): { id: string; name: string } | null {
  if (fixed) return fixed;
  const on = f.person?.campaigns ?? [];
  return on.find((c) => c.id === f.campaignId) ?? on[0] ?? null;
}

/** The line the list shows for a call at once, before the server has answered: the row it will be. */
export function pendingRow(
  f: LogCallForm,
  key: string,
  me: { id: string | null; name: string | null },
  fixed?: { id: string; name: string; client?: string | null } | null,
  now: number = Date.now(),
): ActivityRow {
  const campaign = campaignOfForm(f, fixed);
  const minutes = minutesOf(f.minutes);
  const notes = f.notes.trim();
  return {
    id: key,
    channel: "call",
    at: new Date(whenOf(f.when, now) ?? now).toISOString(),
    campaignId: campaign?.id ?? null,
    campaignName: campaign?.name ?? null,
    clientName: fixed?.client ?? null,
    candidateId: f.person?.id ?? null,
    candidateName: f.person?.name ?? null,
    candidateTitle: f.person?.title ?? null,
    candidateCompany: f.person?.company ?? null,
    direction: "out",
    by: { id: me.id, name: me.name, mine: true },
    status: f.outcome ?? "connected",
    subject: null,
    preview: notes ? notes.slice(0, 110) : null,
    phone: null,
    durationSeconds: minutes !== null ? minutes * 60 : null,
  };
}

const dayIn = (ms: number): string => new Date(ms).toLocaleDateString("en-CA", { timeZone: IST });

/**
 * Whether the list as it is filtered would hold this row. A row that would not appear is saved all the same and is
 * simply not drawn; the next read of the list is the one that decides.
 */
export function fitsFilters(row: ActivityRow, f: ActivityFilters): boolean {
  if (f.channel && f.channel !== "call") return false;
  if (f.status && f.status !== row.status) return false;
  if (f.q) return false;
  if (f.person && f.person !== row.by?.id) return false;
  if (f.client) return false;
  const day = dayIn(Date.parse(row.at));
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;
  return true;
}

/** The sentence that says it is done: "Logged. Voicemail with Priya, Thu, 3:10 pm." */
export function loggedLine(f: LogCallForm, now: number = Date.now()): string {
  const first = (f.person?.name ?? "").trim().split(/\s+/)[0] ?? "";
  const when = whenLabel(new Date(whenOf(f.when, now) ?? now).toISOString(), now);
  const how = f.outcome ? outcomeWord(f.outcome) : "Call";
  return `Logged. ${how}${first ? ` with ${first}` : ""}, ${when}.`;
}

/** A fresh key for one logging: its id, so asking twice (a double click, a retry) is one call. */
export function newKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

/** The empty-state words of the Calls tab. */
export const NO_CALLS_TITLE = "No calls yet.";
export const NO_CALLS_LINE = "Log a call, or calls you place with the extension show up here.";
