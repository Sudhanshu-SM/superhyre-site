import type { RunStatus, ScheduleDetail, ScheduledItem, ScheduleRepeat, ScheduleRun } from "./api/schedules";
import { COMING_UP_HREF } from "./nav";

/**
 * What the Memory view's "Coming up", the rail's row and the approval card say about things that happen later,
 * as words. Pure, so the wording, the time zone maths and who may do what can be pinned by tests
 * without a page.
 *
 * Every time reads in the zone the item was set up in (the person's own, as their profile has it), and
 * says which zone only when that isn't the one this browser is in. Nothing here says "status code",
 * "occurrence" or "idempotency": an email waits, goes, is skipped, or didn't go.
 */

/** Coming up, filtered to one campaign. */
export const schedulesHrefFor = (campaignId: string | null): string =>
  campaignId ? `${COMING_UP_HREF}&campaignId=${encodeURIComponent(campaignId)}` : COMING_UP_HREF;

/** The campaign a "…&campaignId=…" link filters to, if it names one. */
export function campaignIdFromHash(hash: string): string | null {
  const m = /[?&]campaignId=([^&]+)/.exec(hash);
  return m ? decodeURIComponent(m[1] ?? "") || null : null;
}

/* ── the calendar, in a named zone ── */

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export type Parts = { y: number; m: number; d: number; h: number; min: number; s: number; weekday: number };

const formats = new Map<string, Intl.DateTimeFormat>();
function formatFor(timeZone: string): Intl.DateTimeFormat {
  let f = formats.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
        hour: "numeric", minute: "numeric", second: "numeric", weekday: "short",
      });
    } catch {
      /* A zone this browser doesn't know: read it as UTC rather than break the page. */
      f = formatFor("UTC");
    }
    formats.set(timeZone, f);
  }
  return f;
}

/** The wall clock in a zone at an instant. */
export function zoneParts(ms: number, timeZone: string): Parts {
  const p: Record<string, string> = {};
  for (const x of formatFor(timeZone).formatToParts(new Date(ms))) p[x.type] = x.value;
  const n = (k: string) => Number(p[k] ?? 0);
  return {
    y: n("year"), m: n("month"), d: n("day"), h: n("hour") % 24, min: n("minute"), s: n("second"),
    weekday: Math.max(0, WEEKDAY.indexOf((p.weekday ?? "Sun") as (typeof WEEKDAY)[number])),
  };
}

/** How far ahead of UTC a zone is at an instant, in ms. */
function offsetAt(ms: number, timeZone: string): number {
  const p = zoneParts(ms, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000;
}

const dayNumber = (p: Pick<Parts, "y" | "m" | "d">): number => Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000);
const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * The names the browser's own zone list still carries for zones that have since been renamed,
 * and the name the rest of the world uses: "Asia/Calcutta" is Asia/Kolkata. A person sees one
 * name for a place, and two spellings of the same zone are never read as two zones.
 */
const ZONE_ALIAS: Readonly<Record<string, string>> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Coral_Harbour": "America/Atikokan",
  "America/Godthab": "America/Nuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Mendoza": "America/Argentina/Mendoza",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Dacca": "Asia/Dhaka",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Macao": "Asia/Macau",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Thimbu": "Asia/Thimphu",
  "Asia/Ujung_Pandang": "Asia/Makassar",
  "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
};

/** The zone's usual name: "Asia/Calcutta" becomes "Asia/Kolkata", anything else stays as it is. */
export const canonicalZone = (timeZone: string): string => ZONE_ALIAS[timeZone] ?? timeZone;

/** Whether two names are the same zone. */
export const sameZone = (a: string, b: string): boolean => canonicalZone(a) === canonicalZone(b);

/** The zone this browser is in. */
export function browserZone(): string {
  try {
    return canonicalZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  } catch {
    return "UTC";
  }
}

/** "IST", "BST", "EDT": a short name for a zone, falling back to "GMT+5:30" where the browser has no abbreviation. */
export function zoneName(ms: number, timeZone: string): string {
  const pick = (locale: string): string => {
    try {
      return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" }).formatToParts(new Date(ms)).find((x) => x.type === "timeZoneName")?.value ?? "";
    } catch {
      return "";
    }
  };
  const generic = /^(GMT|UTC)[+-]/;
  const us = pick("en-US");
  if (us && !generic.test(us)) return us;
  const india = pick("en-IN");
  return india && !generic.test(india) ? india : us || timeZone;
}

/**
 * The instant a wall-clock time ("2026-10-17T10:00", as a datetime-local input holds it) means in a
 * zone, or null when it isn't a time there (nothing exists between 02:00 and 03:00 the night the
 * clocks go forward) or isn't a time at all.
 */
export function instantFromLocal(local: string, timeZone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, min] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
  const wall = Date.UTC(y, mo - 1, d, h, min);
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const next = wall - offsetAt(guess, timeZone);
    if (next === guess) break;
    guess = next;
  }
  const back = zoneParts(guess, timeZone);
  return back.y === y && back.m === mo && back.d === d && back.h === h && back.min === min ? guess : null;
}

/** A datetime-local input's value for an instant, read in a zone: "2026-10-17T10:00". */
export function localInput(ms: number, timeZone: string): string {
  const p = zoneParts(ms, timeZone);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}

/* ── when ── */

type WhenOptions = {
  now?: number;
  /** The zone the reader is in; the zone is named only when the time is in a different one. */
  viewerTz?: string;
  /** "Fri 17 Oct, 10:00" even for today and tomorrow (an approval says exactly when). */
  absolute?: boolean;
  /** Name the zone whatever the reader's is. */
  zone?: boolean;
};

/** "10 am", "3:30 pm": the one way a time of day is said everywhere (meetings say it the same way). */
const clock = (p: Parts): string => {
  const h = p.h % 12 || 12;
  return `${p.min === 0 ? h : `${h}:${pad(p.min)}`} ${p.h < 12 ? "am" : "pm"}`;
};

/**
 * "Today, 10:00", "Tomorrow, 10:00", "Yesterday, 18:30", "Mon 13 Oct, 09:30", or with the year when it
 * isn't this one ("Mon 13 Oct 2027, 09:30"), in the given zone.
 */
export function whenLabel(iso: string, timeZone: string, o: WhenOptions = {}): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const now = o.now ?? Date.now();
  const at = zoneParts(t, timeZone);
  const today = zoneParts(now, timeZone);
  const gap = dayNumber(at) - dayNumber(today);
  const named = o.zone || !sameZone(o.viewerTz ?? browserZone(), timeZone);
  const zone = named ? ` ${zoneName(t, timeZone)}` : "";
  const date = dayLabel(t, timeZone, now);
  const day = o.absolute ? date : gap === 0 ? "Today" : gap === 1 ? "Tomorrow" : gap === -1 ? "Yesterday" : date;
  return `${day}, ${clock(at)}${zone}`;
}

/** "in 2 min" for something under an hour away; nothing otherwise, so the line stays short. */
export function soonLabel(iso: string, now = Date.now()): string | null {
  const gap = Date.parse(iso) - now;
  if (Number.isNaN(gap) || gap <= 0 || gap >= 3_600_000) return null;
  return gap < 60_000 ? "in under a minute" : `in ${Math.round(gap / 60_000)} min`;
}

/**
 * "Mon 12 Oct", or "Mon 12 Oct 2027" for another year: the one way a day is written next to a
 * weekday, on Scheduled and on Home's tasks alike.
 */
export function dayLabel(ms: number, timeZone: string = browserZone(), now = Date.now()): string {
  const at = zoneParts(ms, timeZone);
  return `${WEEKDAY[at.weekday]} ${at.d} ${MONTH[at.m - 1]}${at.y === zoneParts(now, timeZone).y ? "" : ` ${at.y}`}`;
}

/** The next time something runs: its next turn if it repeats, its first otherwise. */
export const nextTime = (i: Pick<ScheduledItem, "nextRunAt" | "runAt">): string => i.nextRunAt ?? i.runAt;

/** "17 Oct", or "17 Oct 2027" for another year, in a zone. */
function dayOf(iso: string, timeZone: string, now: number): string {
  const p = zoneParts(Date.parse(iso), timeZone);
  return `${p.d} ${MONTH[p.m - 1]}${p.y === zoneParts(now, timeZone).y ? "" : ` ${p.y}`}`;
}

/** "every weekday until 31 Oct": how it repeats, in words; nothing for something that happens once. */
export function repeatWords(
  i: Pick<ScheduledItem, "repeat" | "until" | "timezone" | "nextRunAt" | "runAt">,
  now = Date.now(),
): string {
  const base: Record<ScheduleRepeat, string> = {
    none: "",
    daily: "every day",
    weekdays: "every weekday",
    weekly: `every ${WEEKDAY_LONG[zoneParts(Date.parse(nextTime(i)), i.timezone).weekday] ?? "week"}`,
  };
  const words = base[i.repeat] ?? "";
  if (!words) return "";
  return i.until ? `${words} until ${dayOf(i.until, i.timezone, now)}` : words;
}

/* ── who ── */

/**
 * "You" or a teammate's name. What the agent set up is the one who said yes to it (it did nothing without their
 * approval), so it reads "By you" or "By Priya"; only when nobody approved does it read as SuperHyre's own.
 */
export function whoLabel(i: Pick<ScheduledItem, "createdBy"> & Partial<Pick<ScheduledItem, "approvedBy">>, viewerId?: string | null): string {
  if (i.createdBy.kind === "agent") {
    if (!i.approvedBy) return "SuperHyre";
    return viewerId && i.approvedBy.id === viewerId ? "You" : (i.approvedBy.name ?? "A teammate");
  }
  if (viewerId && i.createdBy.id === viewerId) return "You";
  return i.createdBy.name ?? "A teammate";
}

/** "By you", "By Priya". */
export function byLine(i: Pick<ScheduledItem, "createdBy"> & Partial<Pick<ScheduledItem, "approvedBy">>, viewerId?: string | null): string {
  const who = whoLabel(i, viewerId);
  return `By ${who === "You" ? "you" : who}`;
}

/** Who said yes is already the "By" line, so there is nothing more to say about it. */
export function approvedLine(_i: Pick<ScheduledItem, "createdBy" | "approvedBy">, _viewerId?: string | null): string | null {
  return null;
}

/* ── what ── */

/**
 * What will happen, in the server's words. The server ends a repeating one with ", every weekday"; the
 * row says how it repeats beside the time, so it is not said twice.
 */
export function summaryText(i: Pick<ScheduledItem, "summary" | "repeat">): string {
  return i.repeat === "none" ? i.summary : i.summary.replace(/,\s*every (?:day|weekday|week)$/i, "");
}

/** The kind as a short noun: "email", "Slack message". */
export const KIND_NOUN: Readonly<Record<string, string>> = {
  email: "email",
  slack_message: "Slack message",
  notion_note: "Notion note",
  task: "task",
  reminder: "reminder",
  digest: "digest",
};

export const kindNoun = (kind: string): string => KIND_NOUN[kind] ?? "item";

/** A candidate's name, when the summary doesn't already say it. */
export function candidateNote(i: Pick<ScheduledItem, "candidate" | "summary">): string | null {
  const name = i.candidate?.fullName;
  return name && !i.summary.includes(name) ? `About ${name}` : null;
}

/** The meta line under what will happen: who set it up, the campaign, who it is about, how often it has run. */
export function metaLine(i: ScheduledItem, viewerId?: string | null): string {
  return [
    byLine(i, viewerId),
    i.campaign?.name ?? null,
    candidateNote(i),
    i.repeat !== "none" && i.occurrencesDone > 0 ? (i.occurrencesDone === 1 ? "Has run once" : `Has run ${i.occurrencesDone} times`) : null,
  ].filter(Boolean).join(" · ");
}

/* ── how it went ── */

const DONE_WORD: Readonly<Record<string, string>> = {
  email: "Sent",
  slack_message: "Posted",
  notion_note: "Added to Notion",
  task: "Task created",
  reminder: "Reminder sent",
  digest: "Sent",
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** What an email that has fired is up to: waiting for its slot, sent, refused, or withdrawn. */
export function deliveryText(i: Pick<ScheduledItem, "result" | "timezone">, now = Date.now(), viewerTz?: string, mine = true): string | null {
  const r = i.result ?? {};
  switch (r.delivery) {
    case "queued": {
      const at = str(r.scheduledFor);
      return at ? `Goes out ${whenLabel(at, i.timezone, { now, ...(viewerTz ? { viewerTz } : {}) })}` : "Waiting to go out";
    }
    case "sent":
      return "Sent";
    case "failed":
      return `Didn't send: ${failureWords(str(r.deliveryError) || "the email was refused", mine)}`;
    case "cancelled":
      return "Withdrawn before it was sent";
    default:
      return null;
  }
}

/** Why something was skipped, in the server's own sentence; "Skipped" alone when it said nothing. */
export function skipText(i: Pick<ScheduledItem, "result">): string {
  const reason = str(i.result?.reason);
  return reason ? `Skipped: ${reason}` : "Skipped";
}

/** Whether a failure is about Gmail not being connected: the one failure only the sender can fix. */
export const isGmailDown = (error: string | null | undefined): boolean => !!error && /gmail/i.test(error) && /connect/i.test(error);

/** Whether the viewer is the person it goes out as: who set it up, or who said yes to it. */
export function isSender(i: Pick<ScheduledItem, "createdBy" | "approvedBy">, viewerId?: string | null): boolean {
  return !!viewerId && (i.createdBy.id === viewerId || i.approvedBy?.id === viewerId);
}

/**
 * A failure, in words for whoever is reading it. "Connect Gmail in Settings" is for the sender; a
 * teammate cannot connect someone else's Gmail, so they are told what happened instead.
 */
export function failureWords(error: string, mine: boolean): string {
  if (!isGmailDown(error)) return error;
  return mine ? "Gmail wasn't connected." : "Gmail wasn't connected for whoever sends it.";
}

/**
 * What to say in place of the actions once there are none to take: "Sent", "Skipped: Asha has replied…",
 * "Didn't go out: Gmail isn't connected", "Cancelled". Null for something that is still waiting.
 */
export function statusText(i: ScheduledItem, now = Date.now(), viewerTz?: string, viewerId?: string | null): string | null {
  const mine = isSender(i, viewerId);
  switch (i.status) {
    case "scheduled":
      return null;
    case "running":
      return "Going out now";
    case "done": {
      if (i.kind === "email") return deliveryText(i, now, viewerTz, mine) ?? "Done";
      const word = DONE_WORD[i.kind] ?? "Done";
      return i.repeat !== "none" && i.occurrencesDone > 1 ? `${word}, ${i.occurrencesDone} times` : word;
    }
    case "failed":
      return `Didn't go out: ${failureWords(i.lastError ?? "something went wrong", mine)}`;
    case "cancelled":
      return "Cancelled";
    case "skipped":
      return skipText(i);
  }
}

/** A waiting item that hit a snag and will try again, in a line; null when all is well. */
export function retryText(i: Pick<ScheduledItem, "status" | "lastError">, mine = true): string | null {
  return i.status === "scheduled" && i.lastError ? `It will try again. Last time: ${failureWords(i.lastError, mine)}` : null;
}

/** Waiting, and its time has come: the scheduler picks it up within a moment. */
export const isDue = (i: Pick<ScheduledItem, "status" | "nextRunAt" | "runAt">, now = Date.now()): boolean =>
  i.status === "scheduled" && Date.parse(nextTime(i)) <= now;

/** The time a finished item is shown at: when it ran, or when it was due if it never did. */
export const happenedAt = (i: Pick<ScheduledItem, "lastRunAt" | "runAt">): string => i.lastRunAt ?? i.runAt;

/* ── who may do what ── */

/** A time can change only while it waits, and for a repeat only before it has run. */
export const canChangeTime = (i: Pick<ScheduledItem, "status" | "canCancel" | "repeat" | "occurrencesDone">): boolean =>
  i.status === "scheduled" && i.canCancel && !(i.repeat !== "none" && i.occurrencesDone > 0);

/** Cancel is offered when the server says this person may, which also covers an email still waiting to leave. */
export const canWithdraw = (i: Pick<ScheduledItem, "canCancel">): boolean => i.canCancel;

const WITHDRAWS: Readonly<Record<string, { once: string; repeat: string }>> = {
  email: { once: "The email will not be sent.", repeat: "The emails will not be sent." },
  slack_message: { once: "Nothing will be posted to Slack.", repeat: "Nothing more will be posted to Slack." },
  notion_note: { once: "Nothing will be added to Notion.", repeat: "Nothing more will be added to Notion." },
  task: { once: "The task will not be created.", repeat: "No more tasks will be created." },
  reminder: { once: "You won't be reminded.", repeat: "You won't be reminded again." },
  digest: { once: "The digest will not be sent.", repeat: "No more digests will be sent." },
};

/** What cancelling says it withdraws, before and after, so the confirmation names the consequence. */
export function cancelCopy(i: Pick<ScheduledItem, "kind" | "status" | "repeat">): { ask: string; confirm: string; done: string } {
  const w = WITHDRAWS[i.kind] ?? { once: "It will not run.", repeat: "It will not run again." };
  const effect = i.repeat === "none" ? w.once : w.repeat;
  const noun = kindNoun(i.kind);
  const waiting = i.kind === "email" && i.status !== "scheduled";
  return waiting
    ? { ask: `Withdraw this email? ${effect}`, confirm: "Withdraw it", done: `Withdrawn. ${effect}` }
    : { ask: `Cancel this ${noun}? ${effect}`, confirm: "Cancel it", done: `Cancelled. ${effect}` };
}

/* ── the full text, for the expanded row ── */

export type DetailLine = { label: string; text: string };

/** What a schedule will send, as labelled lines: an email's subject and message, a Slack message's words. */
export function detailLines(d: Pick<ScheduleDetail, "kind" | "payload" | "timezone">, now = Date.now(), viewerTz?: string): DetailLine[] {
  const p = d.payload;
  const line = (label: string, text: string): DetailLine[] => (text ? [{ label, text }] : []);
  switch (d.kind) {
    case "email":
      return [
        ...line("Subject", str(p.subject)),
        ...line("Message", str(p.body)),
      ];
    case "slack_message":
      return [...line("Posts to", str(p.channelName) ? `#${str(p.channelName).replace(/^#/, "")}` : ""), ...line("Message", str(p.text))];
    case "notion_note":
      return [...line("Title", str(p.title)), ...line("Goes in", str(p.parentTitle)), ...line("Text", str(p.body))];
    case "task": {
      const due = str(p.dueAt);
      return [...line("Task", str(p.title)), ...line("For", str(p.assigneeName)), ...line("Due", due ? whenLabel(due, d.timezone, { now, ...(viewerTz ? { viewerTz } : {}) }) : "")];
    }
    case "reminder":
      return line("Reminder", str(p.text));
    case "digest": {
      const to = Array.isArray(p.to) ? (p.to as unknown[]).map(String) : [];
      const where = [
        to.includes("slack") ? (str(p.channelName) ? `Slack #${str(p.channelName).replace(/^#/, "")}` : "Slack") : null,
        to.includes("app") ? "your notifications" : null,
      ].filter(Boolean).join(" and ");
      return line("Sends to", where);
    }
    default:
      return [];
  }
}

/**
 * What an expanded row adds to the sentence above it: the lines whose words that sentence doesn't
 * already say (an email's whole message, where the sentence has only its subject).
 */
export function newLines(lines: readonly DetailLine[], i: Pick<ScheduledItem, "summary" | "repeat">): DetailLine[] {
  const said = summaryText(i);
  return lines.filter((l) => !said.includes(l.text));
}

const RUN_WORD: Readonly<Record<RunStatus, string>> = {
  running: "Going out",
  done: "Done",
  skipped: "Skipped",
  failed: "Didn't go out",
  cancelled: "Cancelled",
};

/**
 * One time it ran: "Today, 10:00 · Skipped: Asha has replied, so the follow-up was not sent." An
 * email that fired is "Done" only until its message has had its own ending: the newest run says
 * how the email itself went (sent, withdrawn, refused) when the schedule knows.
 */
export function runLine(
  r: ScheduleRun,
  timeZone: string,
  now = Date.now(),
  viewerTz?: string,
  item?: Pick<ScheduledItem, "kind" | "result" | "timezone">,
  newest = false,
  mine = true,
): string {
  const when = whenLabel(r.at, timeZone, { now, ...(viewerTz ? { viewerTz } : {}) });
  const ending = item && newest && item.kind === "email" && r.status === "done" ? deliveryText(item, now, viewerTz, mine) : null;
  const head = ending ?? (r.message ? `${RUN_WORD[r.status]}: ${failureWords(r.message, mine)}` : RUN_WORD[r.status]);
  return `${when} · ${head}`;
}

/* ── choosing a time by hand ── */

const DAY = 86_400_000;

/** How far ahead the server lets anything be scheduled. */
export const HORIZON_DAYS = 90;

/**
 * A reason a time can't be used, or null when it can: at least a minute ahead (the scheduler looks
 * once a minute), and within the 90 days the server allows.
 */
export function whenProblem(ms: number | null, now = Date.now()): string | null {
  if (ms === null) return "Pick a day and a time.";
  if (ms <= now) return "Pick a time in the future.";
  if (ms < now + 60_000) return "Pick a time at least a minute from now.";
  if (ms > now + HORIZON_DAYS * DAY) return `That's more than ${HORIZON_DAYS} days away. Pick a nearer day.`;
  return null;
}

/* ── lists ── */

/** Soonest first, as the server lists what is coming up. */
export const byNextTime = (a: ScheduledItem, b: ScheduledItem): number =>
  Date.parse(nextTime(a)) - Date.parse(nextTime(b)) || a.id.localeCompare(b.id);

/** "3 coming up", "50+ coming up"; nothing for none. */
export function comingUp(count: number, more: boolean): string {
  return `${count}${more ? "+" : ""} coming up`;
}

/**
 * How long to wait before looking again: a minute normally, a little after the next thing is due so
 * it is seen going out, and often while something that should have gone is still going.
 */
export function pollDelay(items: readonly Pick<ScheduledItem, "status" | "nextRunAt" | "runAt">[], now = Date.now()): number {
  const SLOW = 60_000;
  const FAST = 10_000;
  const GRACE = 12_000;
  const GIVE_UP = 5 * 60_000;
  let delay = SLOW;
  for (const i of items) {
    if (i.status === "running") { delay = Math.min(delay, FAST); continue; }
    if (i.status !== "scheduled") continue;
    const due = Date.parse(nextTime(i));
    if (Number.isNaN(due)) continue;
    if (due >= now) delay = Math.min(delay, due + GRACE - now);
    else if (now - due < GIVE_UP) delay = Math.min(delay, FAST);
  }
  return Math.max(5_000, delay);
}
