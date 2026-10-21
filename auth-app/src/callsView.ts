import type { NewSegment } from "./api/calls";
import type { CallCaller, CallGroup, CallGroups, CallOutcome, CallRow } from "./api/calls";
import type { ParsedTurn } from "./callMedia";
import type { Standing } from "./can";
import type { StatusTone } from "./statusTones";

/**
 * What the Calls page says, as functions: how a time reads, how a group is labelled and ordered, which one is
 * open, whose calls the page is about. Pure, so the words and the rules are tested without a screen.
 */

export const IST = "Asia/Kolkata";

const dayOf = (ms: number): string => new Date(ms).toLocaleDateString("en-CA", { timeZone: IST });
const timeOf = (ms: number): string =>
  new Date(ms).toLocaleTimeString("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();

/** "Today, 4:10 pm", "Yesterday, 11:02 am", "Mon, 3:15 pm" within the week, then "6 Oct, 3:15 pm"; always India time. */
export function whenLabel(iso: string, now = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const today = dayOf(now);
  const day = dayOf(at);
  const time = timeOf(at);
  if (day === today) return `Today, ${time}`;
  if (day === dayOf(now - 86_400_000)) return `Yesterday, ${time}`;
  const ago = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000;
  if (ago > 0 && ago < 7) {
    return `${new Date(at).toLocaleDateString("en-IN", { timeZone: IST, weekday: "short" })}, ${time}`;
  }
  const date = new Date(at).toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short" });
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return `${sameYear ? date : `${date} ${day.slice(0, 4)}`}, ${time}`;
}

/** "45 s", "4 min", "1 h 5 min"; nothing for a call with no length. */
export function lengthLabel(seconds: number | null): string {
  if (!seconds || seconds < 1) return "";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

export const OUTCOME_LABEL: Readonly<Record<CallOutcome, string>> = {
  connected: "Connected",
  voicemail: "Voicemail",
  no_answer: "No answer",
  call_back: "Call back",
  not_interested: "Not interested",
  failed: "Didn't connect",
  in_progress: "In progress",
};

export const OUTCOME_FILTERS: ReadonlyArray<{ value: CallOutcome; label: string }> = [
  { value: "connected", label: "Connected" },
  { value: "voicemail", label: "Voicemail" },
  { value: "no_answer", label: "No answer" },
  { value: "call_back", label: "Call back" },
  { value: "not_interested", label: "Not interested" },
  { value: "failed", label: "Didn't connect" },
];

export const callCount = (n: number): string => `${n} ${n === 1 ? "call" : "calls"}`;

/** An open campaign group shows this many calls; the rest are behind "View all". */
export const GROUP_ROWS = 8;
/** A campaign's own page, and "View all", show this many calls (or things) a page. */
export const ROW_PAGE = 15;
/** The top-level list shows this many campaigns a page. */
export const GROUP_PAGE = 10;

/* ── the campaign accordion's own pieces ── */

/** A campaign's chip: the first letter or digit of its first two words, "G32 Platform Engineer" being "GP". */
export function campaignInitials(name: string): string {
  const words = name.split(/\s+/).map((w) => Array.from(w).find((c) => /[\p{L}\p{N}]/u.test(c)) ?? "").filter(Boolean);
  return words.slice(0, 2).join("").toUpperCase() || "?";
}

/** `text` in pieces, the ones that match `q` marked (case ignored): the search's own words, lit where they are found. */
export function splitHits(text: string, q: string): Array<{ text: string; hit: boolean }> {
  const word = q.trim().toLowerCase();
  if (!word || !text) return [{ text, hit: false }];
  const hay = text.toLowerCase();
  if (hay.length !== text.length) return [{ text, hit: false }];
  const out: Array<{ text: string; hit: boolean }> = [];
  let at = 0;
  for (let i = hay.indexOf(word); i !== -1; i = hay.indexOf(word, at)) {
    if (i > at) out.push({ text: text.slice(at, i), hit: false });
    out.push({ text: text.slice(i, i + word.length), hit: true });
    at = i + word.length;
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out;
}

/** The share of a campaign's calls that connected, in whole percent; null when it cannot be said. */
export function connectedShare(connected: number | undefined, total: number): number | null {
  return connected === undefined || total <= 0 ? null : Math.round((connected / total) * 100);
}

export type CallsTotals = { calls: number; campaigns: number; connectedPct: number | null };

/**
 * The one plain line under the page's title: "96 calls, 10 campaigns, 48% connected". The calls on no campaign are in
 * the calls, not the campaigns; a figure that cannot be said is left out rather than made up.
 */
export function summaryLine(t: CallsTotals): string {
  return [
    `${t.calls.toLocaleString("en-IN")} ${t.calls === 1 ? "call" : "calls"}`,
    t.campaigns > 0 ? `${t.campaigns.toLocaleString("en-IN")} ${t.campaigns === 1 ? "campaign" : "campaigns"}` : "",
    t.connectedPct !== null ? `${t.connectedPct}% connected` : "",
  ].filter(Boolean).join(", ");
}

export type Band = "today" | "week" | "earlier";
export const BAND_LABEL: Readonly<Record<Band, string>> = { today: "Today", week: "This week", earlier: "Earlier" };

/** Which recency band a group's last call is in, by India's calendar. */
export function bandOf(iso: string, now = Date.now()): Band {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "earlier";
  const day = dayOf(at);
  const today = dayOf(now);
  if (day === today) return "today";
  const ago = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000;
  return ago > 0 && ago < 7 ? "week" : "earlier";
}

/**
 * How an outcome reads, in two tones of the ink and nothing else: what happened with a person (connected, to call
 * back) is the normal ink, what did not (no answer, voicemail, not interested, a call that did not connect) is the
 * muted one. The word is always there; colour is not what says it.
 */
export const OUTCOME_TONE: Readonly<Record<CallOutcome, StatusTone>> = {
  connected: "ink",
  call_back: "ink",
  voicemail: "muted",
  no_answer: "muted",
  not_interested: "muted",
  failed: "muted",
  in_progress: "ink",
};

/* ── search by campaign ── */

const fold = (s: string): string => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Whether a word names this campaign or its client: the search matches them as well as a person, a note and what was said. */
export function namesCampaign(q: string, campaign: { name: string; client?: string | null } | null | undefined): boolean {
  const word = fold(q);
  if (!word || !campaign) return false;
  return fold(campaign.name).includes(word) || (campaign.client ? fold(campaign.client).includes(word) : false);
}

/**
 * The groups a search shows: those with a call the word matched (the server's answer), plus every campaign the
 * word names (it or its client), with all its calls. `byName` are the groups whose rows are read without the
 * word, since the word did not match inside them.
 */
export function mergeNamed(
  found: readonly CallGroup[],
  all: readonly CallGroup[] | null,
  word: string,
): { groups: CallGroup[]; byName: Set<string> } {
  const byName = new Set<string>();
  if (!word.trim() || !all) return { groups: [...found], byName };
  const have = new Set(found.map(groupKey));
  const named = all.filter((g) => g.count > 0 && namesCampaign(word, g.campaign));
  const swapped = found.map((g) => named.find((n) => groupKey(n) === groupKey(g)) ?? g);
  for (const n of named) byName.add(groupKey(n));
  return { groups: [...swapped, ...named.filter((n) => !have.has(groupKey(n)))], byName };
}

/* ── a group's outcomes, in a few plain words ── */

/** Per group, how many calls connected (and, when it was asked, how many are to call back). */
export type OutcomeCounts = { connected: number; callBack?: number };

/** "3 connected, 2 to call back" for a group's header; nothing when neither happened. */
export function outcomeLine(c: OutcomeCounts | undefined): string {
  if (!c) return "";
  return [c.connected > 0 ? `${c.connected} connected` : "", (c.callBack ?? 0) > 0 ? `${c.callBack} to call back` : ""].filter(Boolean).join(", ");
}

/** Whole percent of all the calls that connected, across groups; null when there are none or a group's count is missing. */
export function connectedPercent(connected: ReadonlyArray<number | undefined>, total: number): number | null {
  if (total <= 0 || connected.length === 0 || connected.some((n) => n === undefined)) return null;
  const n = connected.reduce<number>((sum, c) => sum + (c ?? 0), 0);
  return Math.round((n / total) * 100);
}

/* ── a campaign's calls at a glance ── */

export type CallsGlance = {
  total: number;
  /** Whole percent of the calls that connected; null when it cannot be said (no calls, or one outcome is picked). */
  connectedPct: number | null;
  /** Mean length of the calls that have one, in seconds; null when none does. */
  averageSeconds: number | null;
  lastAt: string | null;
};

export function glanceOf(input: {
  total: number;
  connected: number | null;
  rows: ReadonlyArray<{ durationSeconds: number | null }>;
  lastAt: string | null;
}): CallsGlance {
  const timed = input.rows.map((r) => r.durationSeconds ?? 0).filter((s) => s > 0);
  return {
    total: input.total,
    connectedPct: input.total > 0 && input.connected !== null ? Math.round((input.connected / input.total) * 100) : null,
    averageSeconds: timed.length ? Math.round(timed.reduce((a, b) => a + b, 0) / timed.length) : null,
    lastAt: input.total > 0 ? input.lastAt : null,
  };
}

/**
 * The callers behind a page's calls, most calls first, as plain "Meera 3". For an owner or admin. A first name is
 * enough until two callers share one ("Fn3 Owner", "Fn3 Admin"): then both are told apart by their whole names.
 */
export function byCaller(callers: CallGroups["callers"]): Array<{ id: string; name: string; count: number }> {
  const first = (name: string | null) => (name ?? "A former teammate").split(/\s+/)[0] ?? "A former teammate";
  const shown = [...callers].filter((c) => c.count > 0);
  const sameFirst = new Map<string, number>();
  for (const c of shown) sameFirst.set(first(c.name).toLowerCase(), (sameFirst.get(first(c.name).toLowerCase()) ?? 0) + 1);
  return shown
    .sort((a, b) => b.count - a.count || (a.name ?? "").localeCompare(b.name ?? ""))
    .map((c) => ({
      id: c.id,
      name: (sameFirst.get(first(c.name).toLowerCase()) ?? 0) > 1 && c.name ? c.name : first(c.name),
      count: c.count,
    }));
}

/* ── whose calls ── */

/** An owner or admin sees everyone's calls; a recruiter and a Personal workspace their own. */
export const seesEveryone = (standing: Standing): boolean => standing === "owner" || standing === "admin";

export const subtitleOf = (standing: Standing): string => (seesEveryone(standing) ? "Everyone's calls" : "Your calls");

export type CallerChoice = { value: string; label: string };

/** Everyone, then me, then each person who has made a call, by how many: for an owner or admin only. */
export function callerChoices(callers: CallGroups["callers"], meId: string | undefined): CallerChoice[] {
  const others = callers.filter((c) => !c.mine && c.id !== meId);
  return [
    { value: "", label: "Everyone" },
    ...(meId ? [{ value: meId, label: "Me" }] : []),
    ...others.map((c) => ({ value: c.id, label: c.name ?? "A former teammate" })),
  ];
}

/** The caller's first name as plain muted text on a row, "You" never: the filter says whose these are. */
export function callerFirstName(caller: CallCaller): string {
  return (caller.name ?? "").split(/\s+/)[0] || "Former teammate";
}

/** "by Meera" after a name on a row; "by a former teammate" when the caller has left. */
export const byLine = (caller: CallCaller): string => `by ${caller.name ? callerFirstName(caller) : "a former teammate"}`;

/* ── a row ── */

/** What a row says about the call: the model's line, else the start of the transcript, else nothing. */
export function lineOf(row: Pick<CallRow, "summary" | "preview" | "summaryState" | "outcomeText" | "hasTranscript">): { text: string; quiet: boolean } {
  if (row.summary) return { text: row.summary, quiet: false };
  if (row.preview) return { text: row.preview, quiet: true };
  if (row.outcomeText) return { text: row.outcomeText, quiet: true };
  if (row.summaryState === "pending") return { text: "Writing a summary", quiet: true };
  return { text: "", quiet: true };
}

/** A candidate's name, or the number when the call is to someone who is not in the directory (or not theirs to see). */
export const personOf = (row: Pick<CallRow, "candidate" | "phone">): string => row.candidate?.name ?? (row.phone || "Unknown number");

/* ── groups ── */

export const NONE = "none";
export const groupKey = (g: Pick<CallGroup, "campaign">): string => g.campaign?.id ?? NONE;

/** Most recent call first, the calls on no campaign last. */
export function orderGroups<T extends CallGroup>(groups: readonly T[]): T[] {
  return [...groups].sort((a, b) => {
    if (!a.campaign !== !b.campaign) return a.campaign ? -1 : 1;
    return Date.parse(b.lastAt) - Date.parse(a.lastAt);
  });
}

export type Remembered = Readonly<Record<string, boolean>>;

/**
 * Which groups are open: what the person chose, per group; and when they have chosen nothing for any group
 * here, the most recent one only. A group they have never seen is closed.
 */
export function openGroups(groups: readonly CallGroup[], remembered: Remembered): Record<string, boolean> {
  const ordered = orderGroups(groups);
  const known = ordered.some((g) => remembered[groupKey(g)] !== undefined);
  const out: Record<string, boolean> = {};
  ordered.forEach((g, i) => {
    out[groupKey(g)] = remembered[groupKey(g)] ?? (!known && i === 0);
  });
  return out;
}

const STORE = "superhyre.calls.groups.";

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

/* ── the keyboard ── */

/** The row an arrow key lands on: one step, stopping at the ends; the first row when nothing is chosen yet. */
export function stepIndex(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return Math.max(0, Math.min(count - 1, current + delta));
}

/** What keeps its own arrow keys: a place to type, a list to pick from, the waveform. The open call's sheet does not. */
const OWN_ARROWS = "input, textarea, select, [contenteditable], [role=slider]";

/**
 * Whether Up and Down step through the calls from where focus is. They do from a row, from the page and from
 * inside the open call's sheet (reading calls in turn), but not while typing a note or picking from a list.
 */
export function arrowsStepRows(target: { closest(selector: string): unknown } | null): boolean {
  return !(target && target.closest(OWN_ARROWS));
}

/* ── who called, in the call's sheet ── */

/** "Meera Pillai" is "MP", "Meera" is "M", nothing known is "?": the chip beside a name. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = Array.from(words[0]!)[0] ?? "";
  const last = words.length > 1 ? Array.from(words[words.length - 1]!)[0] ?? "" : "";
  return (first + last).toUpperCase();
}

/** The line that says who made the call: "Called by You" for the viewer's own, else "Called by Meera Pillai". */
export function calledByLine(caller: Pick<CallCaller, "name" | "mine">): string {
  return `Called by ${caller.mine ? "You" : caller.name ?? "a former teammate"}`;
}

const ROLE_WORDS: Readonly<Record<string, string>> = { owner: "Owner", admin: "Admin", recruiter: "Recruiter" };
/** A role as words, or nothing for one this build does not know. */
export const roleWord = (role: string | null | undefined): string => (role ? ROLE_WORDS[role] ?? "" : "");

/** Which side a transcript line is on, for its colour: the caller, the candidate, or someone else. */
export const sideOfLine = (role: "caller" | "candidate" | "other" | null): "caller" | "candidate" | "other" => role ?? "other";

/* ── a link to the person ── */

/** Where "Open candidate" goes: Candidates with that person's profile open. */
export const candidateHref = (id: string): string => `#/contacts?open=${encodeURIComponent(id)}`;

/* ── dates ── */

export type RangePreset = "any" | "today" | "7d" | "30d" | "custom";

export const RANGE_LABEL: Readonly<Record<RangePreset, string>> = {
  any: "Any time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Pick dates",
};

/** The days a preset means, in India time, both ends included. */
export function rangeOf(preset: RangePreset, now = Date.now()): { from?: string; to?: string } {
  const today = dayOf(now);
  const back = (days: number) => dayOf(now - days * 86_400_000);
  if (preset === "today") return { from: today, to: today };
  if (preset === "7d") return { from: back(6), to: today };
  if (preset === "30d") return { from: back(29), to: today };
  return {};
}

/* ── a transcript someone adds by hand ── */

/**
 * Timed lines for the API from what was pasted or read: the first speaker is the caller unless said otherwise,
 * the second the candidate, anyone else by the name written. Untimed lines are spread over `seconds`.
 */
export function segmentsFromTurns(
  turns: readonly ParsedTurn[],
  options: { seconds: number; firstIsCandidate?: boolean },
): NewSegment[] {
  const speakers = [...new Set(turns.map((t) => t.speaker))];
  const role = (name: string): string | undefined => {
    const i = speakers.indexOf(name);
    if (i === 0) return options.firstIsCandidate ? "candidate" : "caller";
    if (i === 1) return options.firstIsCandidate ? "caller" : "candidate";
    return name;
  };
  const span = Math.max(1, options.seconds || turns.length * 8);
  const weight = (t: ParsedTurn) => t.text.length + 30;
  const total = turns.reduce((n, t) => n + weight(t), 0) || 1;
  let acc = 0;
  return turns.map((t) => {
    const at = t.at >= 0 ? t.at : Math.round((acc / total) * span * 10) / 10;
    acc += weight(t);
    const who = role(t.speaker);
    return { start: at, text: t.text, ...(who ? { speaker: who } : {}) };
  });
}
