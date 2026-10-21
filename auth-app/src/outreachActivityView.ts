import type { ActivityRow, ActivityStatus, CallItem, Channel, ChannelCounts, EmailItem, TimelineItem, WhatsAppItem } from "./api/outreachActivity";
import type { CallOutcome, CallRow } from "./api/calls";
import { plainReason, STATUS_FAILED } from "./outreachWords";
import type { StatusTone } from "./statusTones";
import { IST, whenLabel } from "./callsView";
import type { Band } from "./callsView";

/**
 * What the Outreach page says, as functions: the channel switch, a status's words and tone, the one line under the
 * title, a row's line, the sheet's tabs and the words of its actions. Pure, so the words and the rules are tested
 * without a screen. Times, bands, campaign chips and the open/shut memory are the Calls page's own helpers
 * (callsView.ts): one way to say "Today, 4:10 pm" across the console.
 */

/* ── time ── */

const dayOf = (ms: number): string => new Date(ms).toLocaleDateString("en-CA", { timeZone: IST });
const daysBetween = (fromDay: string, toDay: string): number => (Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000;

/**
 * A time as the Calls page says it ("Today, 4:10 pm", "Fri, 6:04 pm"), and "Tomorrow, 10:00 am" for an email that is
 * scheduled for the next day (what is lined up is in the future, which no call ever is).
 */
export function whenOf(iso: string, now = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  if (daysBetween(dayOf(now), dayOf(at)) === 1) {
    const time = new Date(at).toLocaleTimeString("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
    return `Tomorrow, ${time}`;
  }
  return whenLabel(iso, now);
}

/** What a campaign's header says about its newest line: "Last activity Today, 4:10 pm", or "Next send Tomorrow, 10:00 am" when that is still to go out. */
export function lastWord(iso: string, now = Date.now()): { word: string; when: string } {
  const at = Date.parse(iso);
  return { word: Number.isFinite(at) && at > now ? "Next send" : "Last activity", when: whenOf(iso, now) };
}

/** Which recency band a campaign's last activity is in, by India's calendar: what is still to go out is today's. */
export function bandOfActivity(iso: string, now = Date.now()): Band {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "earlier";
  const ago = daysBetween(dayOf(at), dayOf(now));
  if (ago <= 0) return "today";
  return ago < 7 ? "week" : "earlier";
}

/* ── the channel switch ── */

export type ChannelTab = "" | Channel;

export const CHANNEL_TABS: ReadonlyArray<{ value: ChannelTab; label: string }> = [
  { value: "", label: "All" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "call", label: "Calls" },
];

export const CHANNEL_NAME: Readonly<Record<Channel, string>> = { email: "Email", whatsapp: "WhatsApp", call: "Call" };

/** The number beside a tab: what the filters leave of that channel. */
export function tabCount(tab: ChannelTab, c: ChannelCounts): number {
  return tab === "" ? c.all : c[tab];
}

/* ── status ── */


/** A call that did not connect: said the same in the list, in the filter and in the call's sheet (an email that did not go is "Didn't send"). */
export const STATUS_DIDNT_CONNECT = "Didn't connect";

type StatusOption = { value: ActivityStatus; label: string };
const EMAIL_OPTIONS: readonly StatusOption[] = [
  { value: "replied", label: "Replied" },
  { value: "waiting", label: "Waiting for a reply" },
  { value: "bounced", label: "Bounced" },
  { value: "failed", label: STATUS_FAILED },
  { value: "scheduled", label: "Scheduled" },
  { value: "draft", label: "Draft" },
];
const CALL_OPTIONS: readonly StatusOption[] = [
  { value: "connected", label: "Connected" },
  { value: "voicemail", label: "Voicemail" },
  { value: "no_answer", label: "No answer" },
  { value: "call_back", label: "Call back" },
  { value: "not_interested", label: "Not interested" },
  { value: "failed", label: STATUS_DIDNT_CONNECT },
];
const WHATSAPP_OPTIONS: readonly StatusOption[] = [
  { value: "replied", label: "Replied" },
  { value: "waiting", label: "Waiting for a reply" },
];

/** Every status the filter has under All: the email words, then the call outcomes (a failure is the email's word). */
export const STATUS_FILTERS: ReadonlyArray<StatusOption> = [...EMAIL_OPTIONS, ...CALL_OPTIONS.filter((o) => o.value !== "failed")];

/** What the filter offers for a channel: its own words only, so nothing in it can come to no rows. */
export function statusFiltersFor(tab: ChannelTab): ReadonlyArray<StatusOption> {
  return tab === "email" ? EMAIL_OPTIONS : tab === "call" ? CALL_OPTIONS : tab === "whatsapp" ? WHATSAPP_OPTIONS : STATUS_FILTERS;
}

/** The filter is "Outcome" for calls, "Status" for the rest. */
export const statusFilterName = (tab: ChannelTab): string => (tab === "call" ? "Outcome" : "Status");

export const STATUS_LABEL: Readonly<Record<ActivityStatus, string>> = {
  replied: "Replied",
  waiting: "Waiting for a reply",
  bounced: "Bounced",
  scheduled: "Scheduled",
  failed: STATUS_FAILED,
  draft: "Draft",
  connected: "Connected",
  no_answer: "No answer",
  voicemail: "Voicemail",
  call_back: "Call back",
  not_interested: "Not interested",
  in_progress: "In progress",
};

/**
 * Two tones of the ink, nothing else: what is moving with a person (a reply, a connected call, a send that is lined
 * up) is the normal ink; what is waiting or did not land is the muted one. The word is always there.
 */
export const STATUS_TONE: Readonly<Record<ActivityStatus, StatusTone>> = {
  replied: "ink",
  waiting: "muted",
  bounced: "muted",
  scheduled: "ink",
  failed: "muted",
  draft: "muted",
  connected: "ink",
  no_answer: "muted",
  voicemail: "muted",
  call_back: "ink",
  not_interested: "muted",
  in_progress: "ink",
};

/** The channel a saved or typed name means ("call" and "calls" are one; anything else is All). */
export function tabOf(v: unknown): ChannelTab {
  const word = typeof v === "string" ? v.trim().toLowerCase() : "";
  return word === "email" || word === "emails" ? "email" : word === "whatsapp" ? "whatsapp" : word === "call" || word === "calls" ? "call" : "";
}

/** The status to keep when the channel changes: the same one if the new channel has it, else none. Pure, so nothing needs to correct it afterwards. */
export const statusForTab = (status: string, tab: ChannelTab): string => statusFilterOf(status, tab);

/** A status filter's value from the select: one the channel has, or nothing. */
export function statusFilterOf(v: string, tab: ChannelTab = ""): ActivityStatus | "" {
  return statusFiltersFor(tab).find((s) => s.value === v)?.value ?? "";
}

/**
 * The words on a row's status cell: the status, and under it one quiet line. A sent email reads "Sent" with "Waiting
 * for a reply" under it; a draft reads "Draft" with "Review" (the row opens it); a call that did not connect says so
 * in the call's words, the same as its sheet.
 */
export function statusWords(r: Pick<ActivityRow, "channel" | "status" | "direction">): { label: string; sub: string | null; action: boolean } {
  if (r.channel === "call" && r.status === "failed") return { label: STATUS_DIDNT_CONNECT, sub: null, action: false };
  if (r.channel === "email" && r.status === "draft") return { label: STATUS_LABEL.draft, sub: "Review", action: true };
  if (r.channel === "email" && r.status === "waiting") return { label: "Sent", sub: STATUS_LABEL.waiting, action: false };
  return { label: STATUS_LABEL[r.status], sub: null, action: false };
}

/* ── the line under the title ── */

const n = (x: number) => x.toLocaleString("en-IN");

/**
 * "412 emails, 31 WhatsApp chats, 96 calls, 38% of calls answered": the counts the filters leave, a channel with none
 * left out, and the share of the calls that were answered (answered calls over calls), left out when there are no calls.
 * Empty when there is nothing at all.
 */
export function summaryLine(c: ChannelCounts): string {
  const answered = c.call > 0 ? Math.round((c.callsConnected / c.call) * 100) : null;
  return [
    c.email > 0 ? `${n(c.email)} ${c.email === 1 ? "email" : "emails"}` : "",
    c.whatsapp > 0 ? `${n(c.whatsapp)} WhatsApp ${c.whatsapp === 1 ? "chat" : "chats"}` : "",
    c.call > 0 ? `${n(c.call)} ${c.call === 1 ? "call" : "calls"}` : "",
    answered !== null ? `${answered}% of calls answered` : "",
  ].filter(Boolean).join(", ");
}

/** A group's count in the words of the channel being looked at: "12 emails", "3 calls", "9 items" for all of them. */
export function countWord(count: number, tab: ChannelTab): string {
  const unit = tab === "email" ? ["email", "emails"] : tab === "whatsapp" ? ["chat", "chats"] : tab === "call" ? ["call", "calls"] : ["item", "items"];
  return `${n(count)} ${count === 1 ? unit[0] : unit[1]}`;
}

/* ── a row ── */

const firstOf = (name: string | null | undefined): string => (name ?? "").trim().split(/\s+/)[0] ?? "";

/** The person's name, or the number when a call is to someone who is not in the directory (or not theirs to see). */
export const personOf = (r: Pick<ActivityRow, "candidateName" | "phone">): string => r.candidateName ?? (r.phone || "Unknown number");

/** "by Meera" for what a teammate sent or called, "from Asha" for what came in, nothing when it is not known. */
export function byLine(r: Pick<ActivityRow, "direction" | "by" | "candidateName">): string {
  if (r.direction === "in") return r.candidateName ? `from ${firstOf(r.candidateName)}` : "incoming";
  if (!r.by) return "";
  const first = firstOf(r.by.name);
  return first ? `by ${first}` : "by a former teammate";
}

/** The one line a row says: what the email was about, what was last said, what the call came to. */
export function lineOf(r: Pick<ActivityRow, "preview" | "subject">): string {
  return r.preview ?? r.subject ?? "";
}

/** A call's length, "4 min": only for a call. */
export function lengthOf(r: Pick<ActivityRow, "channel" | "durationSeconds">): string {
  const s = r.channel === "call" ? r.durationSeconds : null;
  if (!s || s < 1) return "";
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

/* ── the sheet ── */

export type SheetTab = "timeline" | Channel;

export const SHEET_TABS: ReadonlyArray<{ value: SheetTab; label: string }> = [
  { value: "timeline", label: "Timeline" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "call", label: "Calls" },
];

/** What a tab lists: the timeline is everything, newest first; a channel's tab is its own items. */
export function itemsOf(items: readonly TimelineItem[], tab: SheetTab): TimelineItem[] {
  const kept = tab === "timeline" ? [...items] : items.filter((i) => i.kind === tab);
  return kept.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export const isEmail = (i: TimelineItem): i is EmailItem => i.kind === "email";
export const isCall = (i: TimelineItem): i is CallItem => i.kind === "call";
export const isWhatsApp = (i: TimelineItem): i is WhatsAppItem => i.kind === "whatsapp";

/** The words over an email in the timeline: whose it is. What became of it is the status word beside it. */
export function emailHead(e: Pick<EmailItem, "direction" | "status" | "by">): string {
  if (e.direction === "in") return "Reply";
  if (e.status === "draft") return "Draft";
  const who = e.by ? (e.by.mine ? "you" : firstOf(e.by.name) || "a former teammate") : "";
  if (e.status === "scheduled") return who ? `Going out from ${who}` : "Going out";
  // Written by them, but not sent: it never left, so it is never "Sent by".
  if (e.status === "failed") return who ? `From ${who}` : "Written here";
  return who ? `Sent by ${who}` : "Sent";
}

/** The status word beside an email: none for a reply (the head says it) or a draft (so does the head). */
export function emailStatus(e: Pick<EmailItem, "direction" | "status">): string {
  return e.direction === "in" || e.status === "draft" ? "" : STATUS_LABEL[e.status];
}

/**
 * Why an email did not go, in one plain sentence: the reason that was stored, else the default. Null for an email
 * that did (or is still to): only a failed one has a reason to give.
 */
export function failureReason(e: Pick<EmailItem, "direction" | "status" | "error">): string | null {
  if (e.direction !== "out" || e.status !== "failed") return null;
  return plainReason(e.error);
}

/** A call's card head: "Called by Meera" or "Called by you", then how it went is the card's status word. */
export function callHead(c: Pick<CallRow, "direction" | "caller">): string {
  if (c.direction === "inbound") return "Call from them";
  const who = c.caller.mine ? "you" : firstOf(c.caller.name) || "a former teammate";
  return `Called by ${who}`;
}

/** The first lines of a long email, cut at a word, for a card that opens to the rest. */
export function excerpt(text: string, max = 280): { text: string; cut: boolean } {
  const flat = text.replace(/\r\n/g, "\n").trim();
  if (flat.length <= max) return { text: flat, cut: false };
  const at = flat.lastIndexOf(" ", max);
  return { text: `${flat.slice(0, at > max * 0.6 ? at : max).trimEnd()}…`, cut: true };
}

/** What the agent is asked when "Draft a follow-up" is pressed: it opens the agent with this written for them to send. */
export function followUpPrompt(input: { name: string; campaign: string | null; lastSubject: string | null; replied: boolean }): string {
  const where = input.campaign ? ` for ${input.campaign}` : "";
  const about = input.lastSubject ? ` Their last email was "${input.lastSubject}".` : "";
  return input.replied
    ? `Draft a reply to ${input.name}${where}.${about} Keep it short and warm, and show me the draft before anything is sent.`
    : `Draft a follow-up email to ${input.name}${where}.${about} Keep it short and warm, and show me the draft before anything is sent.`;
}

export const WHATSAPP_WAITING = "WhatsApp conversations will appear here once WhatsApp is connected through Magnifi";
export const WHATSAPP_REASON = "Available once WhatsApp is connected.";

/* ── what a row opens ── */

/** A call row's own shape, from an activity row: the sheet has a name, a time and an outcome while the call is read. */
export function callRowFromActivity(r: ActivityRow): CallRow {
  const outcome: CallOutcome = (["connected", "voicemail", "no_answer", "call_back", "not_interested", "in_progress"] as const)
    .find((o) => o === r.status) ?? (r.status === "failed" ? "failed" : "connected");
  return {
    id: r.id,
    at: r.at,
    durationSeconds: r.durationSeconds,
    direction: r.direction === "in" ? "inbound" : "outbound",
    outcome,
    outcomeText: null,
    phone: r.phone ?? "",
    candidate: r.candidateId ? { id: r.candidateId, name: r.candidateName ?? "A candidate", title: r.candidateTitle, company: r.candidateCompany } : null,
    caller: { id: r.by?.id ?? null, name: r.by?.name ?? null, mine: r.by?.mine === true },
    campaign: r.campaignId ? { id: r.campaignId, name: r.campaignName ?? "A campaign", client: r.clientName } : null,
    summary: r.preview,
    preview: null,
    summaryState: "none",
    hasRecording: false,
    hasTranscript: false,
  };
}


/* ── remembered open campaigns ── */

const STORE = "superhyre.outreach.groups.";

export type Remembered = Readonly<Record<string, boolean>>;

/** The groups a person left open or shut, kept in this browser under their own id (never another person's). */
export function readRemembered(storage: Pick<Storage, "getItem"> | null, userId: string | undefined): Remembered {
  if (!storage || !userId) return {};
  try {
    const raw = JSON.parse(storage.getItem(`${STORE}${userId}`) ?? "{}") as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "boolean")) as Remembered;
  } catch {
    return {};
  }
}

export function writeRemembered(storage: Pick<Storage, "setItem"> | null, userId: string | undefined, value: Remembered): void {
  if (!storage || !userId) return;
  try {
    storage.setItem(`${STORE}${userId}`, JSON.stringify(value));
  } catch {
    /* not worth failing over */
  }
}

/** Who made a thing, as the first name a row shows; used by the person filter. */
export function personChoices(people: ReadonlyArray<{ id: string; name: string | null; mine: boolean }>, meId: string | undefined): Array<{ value: string; label: string }> {
  const others = people.filter((p) => !p.mine && p.id !== meId);
  return [
    { value: "", label: "Everyone" },
    ...(meId ? [{ value: meId, label: "Me" }] : []),
    ...others.map((p) => ({ value: p.id, label: p.name ?? "A former teammate" })),
  ];
}

