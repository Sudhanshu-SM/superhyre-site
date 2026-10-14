import type {
  BestHour,
  CallsAnalytics,
  CampaignStats,
  CampaignsAnalytics,
  Envelope,
  Median,
  OutreachAnalytics,
  OutreachExtras,
  OutreachHub,
  OverviewAnalytics,
  PersonRow,
  PipelineAnalytics,
  Ratio,
} from "./api/analytics";
import { periodDays, periodLabel, previousLabel, shortDay, type Filters, type Period } from "./analyticsFilters";
import type { Cell, Table } from "./xlsx";

/**
 * Wording and shaping for the five Analytics pages, apart from the components so what a person reads is
 * tested: a share of fewer than 5 is a count ("2 of 4"), a median of fewer than 3 is "Not enough yet", a
 * change is a sentence, a missing number is a dash and never a zero, and no table ranks anyone.
 */

/* ── numbers ── */

/** Fewer than this many in the whole and a percentage is noise: the page says "2 of 4". */
export const SMALL_N = 5;
/** Fewer values than this and a median is not a number worth printing. */
export const MIN_FOR_MEDIAN = 3;

export const smallN = (of: number): boolean => of < SMALL_N;

/** n of `of`, the way the API sends it: a whole percent, and no percent at all when `of` is under 5. */
export function toRatio(n: number, of: number): Ratio {
  const small = smallN(of);
  return { n, of, rate: small ? null : Math.min(100, Math.max(0, Math.round((n / of) * 100))), smallN: small };
}

/** "29%", "2 of 4", or "–" when there was nothing to divide. A count under 5 is never shown as a percentage. */
export function ratioText(r: Ratio | null | undefined): string {
  if (!r || r.of === 0) return "–";
  if (r.smallN || r.of < SMALL_N || r.rate === null) return `${r.n} of ${r.of}`;
  return `${Math.min(100, Math.max(0, Math.round(r.rate)))}%`;
}

/** "17 of 58" beside a percentage; "" when the share is already a count. */
export function ratioDetail(r: Ratio | null | undefined): string {
  if (!r || r.of === 0 || r.smallN || r.of < SMALL_N || r.rate === null) return "";
  return `${fmt(r.n)} of ${fmt(r.of)}`;
}

export const fmt = (n: number): string => n.toLocaleString("en-IN");

/** A median's value in days (or hours), null when there are fewer than 3 values behind it. */
export function medianValue(m: Median | null | undefined, unit: "days" | "hours" = "days"): number | null {
  if (!m || m.n < MIN_FOR_MEDIAN) return null;
  const v = unit === "days" ? m.days : m.hours;
  return v === null || v === undefined || !Number.isFinite(v) ? null : v;
}

/** A median of days: "4 days", "1 day", "Same day", or "Not enough yet" (fewer than 3 values). */
export function medianDays(m: Median | null | undefined): string {
  const days = medianValue(m, "days");
  if (days === null) return "Not enough yet";
  if (days < 0.5) return "Same day";
  const d = Math.round(days * 10) / 10;
  return `${d % 1 === 0 ? d : d.toFixed(1)} ${d === 1 ? "day" : "days"}`;
}

/** Seconds of talk time: "45 min", "2 h 15 min", "–" for none. */
export function talkTime(seconds: number): string {
  if (!(seconds > 0)) return "–";
  const mins = Math.round(seconds / 60);
  if (mins < 1) return "Under a minute";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** A single call's length: "4 min 44 s". */
export function callLength(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !(seconds > 0)) return "–";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m} min${s ? ` ${s} s` : ""}` : `${s} s`;
}

/** The median time to a reply, the way a person says it. */
export function replyTime(m: Median | null | undefined): string {
  const hours = medianValue(m, "hours");
  if (hours === null) return "Not enough yet";
  if (hours < 1) return "Under an hour";
  if (hours < 48) return `${Math.round(hours)} ${Math.round(hours) === 1 ? "hour" : "hours"}`;
  return `${Math.round(hours / 24)} days`;
}

/**
 * How this period compares with the one before it, as a sentence with no colour in it:
 * "12 more than the 30 days before", "Same as the 30 days before".
 */
export function changeLine(n: number, prev: number, period: Period | { days: number }): string {
  const before = "kind" in period ? previousLabel(period) : `the ${period.days} days before`;
  if (n === prev) return `Same as ${before}`;
  const diff = Math.abs(n - prev);
  return `${fmt(diff)} ${n > prev ? "more" : "fewer"} than ${before}`;
}

/** A change as a glyph, a number and a sentence: up, down or level, never a colour. "↑ 12" and "12 more than the 30 days before". */
export function deltaOf(n: number, prev: number, period: { days: number }): { glyph: "↑" | "↓" | "→"; short: string; text: string } {
  return { glyph: n === prev ? "→" : n > prev ? "↑" : "↓", short: fmt(Math.abs(n - prev)), text: changeLine(n, prev, period) };
}

/** "6 Oct" for a day or the Monday a week starts on. */
export const dayLabel = (isoDay: string): string => shortDay(isoDay);

const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
export { plural };

/* ── empty states ── */

export type EmptyCopy = { head: string; text: string; action: { label: string; href: string } | null };

/** The one calm sentence a page says when there is nothing to draw, by why (the API says which). */
export function emptyCopy(page: "overview" | "recruiters" | "outreach" | "pipeline" | "campaigns", reason: Envelope["emptyReason"], o: { days: number; mine?: boolean }): EmptyCopy {
  const start = { label: "Start a campaign", href: "#/campaigns" };
  const longer = `Try a longer range or open a campaign to pick things up.`;
  if (reason === "no_campaigns") {
    switch (page) {
      case "pipeline":
        return { head: "No one is in a pipeline yet", text: "Shortlist someone from a campaign and you'll see how long people wait at each step.", action: start };
      case "campaigns":
        return { head: "No campaigns yet", text: "Start one from Campaigns and its progress shows up here.", action: start };
      case "recruiters":
        return o.mine
          ? { head: "Nothing logged yet", text: "Send an email, place a call or move someone forward and your week shows up here.", action: start }
          : { head: "It's just you so far", text: "Invite your team and their work shows up side by side.", action: { label: "Invite your team", href: "#/settings/members" } };
      case "outreach":
        return { head: "No emails sent yet", text: "Draft outreach from a campaign's shortlist, approve it, and replies and timing show up here.", action: start };
      default:
        return { head: "Nothing to measure yet", text: "Start a campaign and this page fills in as people move through it.", action: start };
    }
  }
  /* no_activity, or anything else that left the page with nothing to draw */
  switch (page) {
    case "recruiters":
      return o.mine
        ? { head: "Nothing logged yet this period", text: "Send an email, place a call or move someone forward and your week shows up here.", action: null }
        : { head: `No activity in these ${o.days} days`, text: "Work people do in a campaign shows up here as soon as there is some.", action: null };
    case "outreach":
      return { head: `No emails sent in the last ${o.days} days`, text: "Draft outreach from a campaign's shortlist, approve it, and replies and timing show up here.", action: null };
    case "pipeline":
      return { head: "No one is in a pipeline yet", text: "Shortlist someone from a campaign and you'll see how long people wait at each step.", action: start };
    case "campaigns":
      return { head: "No campaigns in this view", text: "Try All, or start a campaign and its progress shows up here.", action: start };
    default:
      return { head: "A quiet stretch", text: `Nothing moved in the last ${o.days} days. ${longer}`, action: null };
  }
}

/* ── Overview ── */

/** The funnel's rate ids as the API names them, for the step each one leads into. */
const RATE_FOR_STEP: Readonly<Record<string, string>> = {
  shortlisted: "kept",
  contacted: "reachedOut",
  replied: "replied",
  interviewing: "interviewing",
  hired: "hired",
};

/**
 * What the API's own rate for a step counts, in words. It is a different population on purpose ("a person who
 * skipped a step is never read as having taken it"), so it is never printed beside the counts as if it were
 * their ratio: it is kept for the tooltip, with this definition.
 */
const COHORT_TEXT: Readonly<Record<string, (n: number, of: number) => string>> = {
  shortlisted: (n, of) => `Counting only people found by a search: ${fmt(n)} of ${fmt(of)} are on a shortlist. The shortlist also holds people added another way.`,
  contacted: (n, of) => `Of ${fmt(of)} on a shortlist, ${fmt(n)} were contacted.`,
  replied: (n, of) => `Of ${fmt(of)} contacted, ${fmt(n)} replied.`,
  interviewing: (n, of) => `Counting only people who were contacted: ${fmt(n)} of ${fmt(of)} moved to interview. Some reach an interview without a reply being noted.`,
  hired: (n, of) => `Counting only people who reached an interview: ${fmt(n)} of ${fmt(of)} were hired.`,
};

export type FunnelRow = {
  id: string;
  label: string;
  n: number;
  /** 0 to 1 of the widest step: the height of its level. */
  share: number;
  /**
   * The share of the step before that is on this one: this count over that count, the same two numbers the page
   * shows. One definition, so a printed percentage can always be checked against the counts beside it. Null on
   * the first step, and a count under 5 stays a count ("2 of 4").
   */
  fromPrev: Ratio | null;
  /** The share of everyone found, for the tooltip. Null on the first step. */
  ofFirst: Ratio | null;
  /** The API's own rate for this step, only when it counts a different population; for the tooltip. */
  cohort: { ratio: Ratio; text: string } | null;
};

/** The funnel as rows: label, count, level height, and what share of the step before reached it. */
export function funnelRows(f: OverviewAnalytics["funnel"]): FunnelRow[] {
  const top = Math.max(1, ...f.steps.map((s) => s.n));
  const first = f.steps[0];
  return f.steps.map((s, i) => {
    const prev = f.steps[i - 1];
    const fromPrev = prev ? toRatio(Math.min(s.n, prev.n), prev.n) : null;
    const rate = f.rates.find((r) => r.id === RATE_FOR_STEP[s.id]);
    const same = rate && fromPrev && rate.n === fromPrev.n && rate.of === fromPrev.of;
    const text = COHORT_TEXT[s.id];
    return {
      id: s.id,
      label: s.label,
      n: s.n,
      share: Math.min(1, s.n / top),
      fromPrev,
      ofFirst: first && i > 0 ? toRatio(Math.min(s.n, first.n), first.n) : null,
      cohort: rate && text && rate.of > 0 && !same ? { ratio: rate, text: text(rate.n, rate.of) } : null,
    };
  });
}

/** What a funnel step prints under its label: "38%", "2 of 4", or "–" on the first step. */
export const stepRate = (row: Pick<FunnelRow, "fromPrev">): string => (row.fromPrev ? ratioText(row.fromPrev) : "–");

/** The words for a screen reader, and the tooltip: "46% of the 223 on the shortlist reached Contacted". */
export function stepSentence(row: FunnelRow, prev: FunnelRow | undefined): string {
  if (!prev || !row.fromPrev) return `${fmt(row.n)} ${row.label.toLowerCase()}`;
  const share = ratioText(row.fromPrev);
  return `${fmt(row.n)} ${row.label.toLowerCase()}: ${share === `${row.fromPrev.n} of ${row.fromPrev.of}` ? share : `${share} (${fmt(row.fromPrev.n)} of ${fmt(row.fromPrev.of)})`} of ${prev.label.toLowerCase()}`;
}

/** The funnel as rows of a table, for "View as table" and the download. */
export function funnelTable(rows: readonly FunnelRow[]): Table {
  return table(
    ["Step", "People", "Share of the step before", "Share of everyone found"],
    rows.map((r) => [r.label, r.n, r.fromPrev ? ratioCell(r.fromPrev) : "", r.ofFirst ? ratioCell(r.ofFirst) : ""]),
  );
}

/** The step where the fewest of the step before carried on, in words; null when no step has 5 or more behind it. */
export function biggestDrop(rows: readonly FunnelRow[]): string | null {
  let worst: { from: FunnelRow; to: FunnelRow; rate: number } | null = null;
  for (let i = 1; i < rows.length; i += 1) {
    const to = rows[i] as FunnelRow;
    const from = rows[i - 1] as FunnelRow;
    const r = to.fromPrev;
    if (!r || r.smallN || r.rate === null) continue;
    if (!worst || r.rate < worst.rate) worst = { from, to, rate: r.rate };
  }
  return worst ? `Biggest drop: ${worst.from.label.toLowerCase()} to ${worst.to.label.toLowerCase()}.` : null;
}

/* ── Recruiters ── */

export type PersonColumn =
  | "name" | "emails" | "replies" | "replyRate" | "calls" | "connected" | "talk"
  | "shortlisted" | "interviews" | "hires" | "onTime" | "overdue" | "inProgress" | "waiting" | "campaigns";

export const PERSON_COLUMNS: ReadonlyArray<{ id: PersonColumn; label: string; group: string }> = [
  { id: "name", label: "Person", group: "" },
  { id: "emails", label: "Emails sent", group: "Reach" },
  { id: "replies", label: "Replies", group: "Reach" },
  { id: "replyRate", label: "Reply rate", group: "Reach" },
  { id: "calls", label: "Calls placed", group: "Reach" },
  { id: "connected", label: "Connected", group: "Reach" },
  { id: "talk", label: "Talk time", group: "Reach" },
  { id: "shortlisted", label: "Added to shortlists", group: "Movement" },
  { id: "interviews", label: "Moved to interview", group: "Movement" },
  { id: "hires", label: "Hires", group: "Movement" },
  { id: "onTime", label: "Tasks on time", group: "Follow-through" },
  { id: "overdue", label: "Overdue now", group: "Follow-through" },
  { id: "inProgress", label: "In progress", group: "Load now" },
  { id: "waiting", label: "Waiting too long", group: "Load now" },
  { id: "campaigns", label: "Campaigns", group: "Load now" },
];

/** The value a column sorts on. A missing share sorts below any real one. */
export function personValue(p: PersonRow, col: PersonColumn): number | string {
  switch (col) {
    case "name": return p.name.toLowerCase();
    case "emails": return p.emails.sent;
    case "replies": return p.emails.replied;
    case "replyRate": return p.emails.sent > 0 ? p.emails.replied / p.emails.sent : -1;
    case "calls": return p.calls.placed;
    case "connected": return p.calls.connected;
    case "talk": return p.calls.talkSeconds;
    case "shortlisted": return p.moves.shortlisted;
    case "interviews": return p.moves.interviews;
    case "hires": return p.moves.hires;
    case "onTime": return p.tasks.due > 0 ? p.tasks.onTime / p.tasks.due : -1;
    case "overdue": return p.tasks.overdue;
    case "inProgress": return p.load.inProgress;
    case "waiting": return p.load.waiting;
    case "campaigns": return p.load.campaigns;
  }
}

/**
 * Rows in the order a person asked for, with name as the tie-break so equal rows never shuffle.
 * Sorting is a way to look, not a ranking: there are no rank numbers anywhere in the table.
 */
export function sortPeople(rows: readonly PersonRow[], col: PersonColumn, dir: "asc" | "desc"): PersonRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = personValue(a, col);
    const y = personValue(b, col);
    const c = x < y ? -1 : x > y ? 1 : 0;
    return c !== 0 ? c * sign : a.name.localeCompare(b.name);
  });
}

/** Whether a person did nothing in the period (the row is muted, never hidden). */
export const isIdle = (p: PersonRow): boolean =>
  p.emails.sent === 0 && p.calls.placed === 0 && p.moves.shortlisted === 0 && p.moves.interviews === 0 && p.moves.hires === 0;

/** Tasks done on time of those due, as a share that follows the small-n rule. */
export const onTimeRatio = (t: PersonRow["tasks"]): Ratio => toRatio(t.onTime, t.due);

/** The team's numbers, so a table's total row reconciles with its rows. */
export function totalOf(rows: readonly PersonRow[]) {
  const t = { sent: 0, replied: 0, placed: 0, connected: 0, talkSeconds: 0, shortlisted: 0, interviews: 0, hires: 0, due: 0, onTime: 0, overdue: 0, inProgress: 0, waiting: 0, campaigns: 0 };
  for (const p of rows) {
    t.sent += p.emails.sent; t.replied += p.emails.replied;
    t.placed += p.calls.placed; t.connected += p.calls.connected; t.talkSeconds += p.calls.talkSeconds;
    t.shortlisted += p.moves.shortlisted; t.interviews += p.moves.interviews; t.hires += p.moves.hires;
    t.due += p.tasks.due; t.onTime += p.tasks.onTime; t.overdue += p.tasks.overdue;
    t.inProgress += p.load.inProgress; t.waiting += p.load.waiting; t.campaigns += p.load.campaigns;
  }
  return t;
}

/** Each of the six tiles a recruiter sees, with this period, the one before and the quiet team-typical figure. */
export type MineTile = { id: string; label: string; n: number; prev: number | null; typical: number | null; text: string };

export function mineTiles(me: PersonRow, typical: PersonRow | Omit<PersonRow, "userId" | "name"> | null): MineTile[] {
  const prev = me.prev;
  const t = typical;
  return [
    { id: "emails", label: "Emails sent", n: me.emails.sent, prev: prev?.emailsSent ?? null, typical: t ? t.emails.sent : null, text: fmt(me.emails.sent) },
    { id: "replies", label: "Replies", n: me.emails.replied, prev: prev?.replies ?? null, typical: t ? t.emails.replied : null, text: fmt(me.emails.replied) },
    { id: "calls", label: "Calls placed", n: me.calls.placed, prev: prev?.callsPlaced ?? null, typical: t ? t.calls.placed : null, text: fmt(me.calls.placed) },
    { id: "talk", label: "Talk time", n: me.calls.talkSeconds, prev: prev?.talkSeconds ?? null, typical: t ? t.calls.talkSeconds : null, text: talkTime(me.calls.talkSeconds) },
    { id: "interviews", label: "Moved to interview", n: me.moves.interviews, prev: prev?.interviews ?? null, typical: t ? t.moves.interviews : null, text: fmt(me.moves.interviews) },
    { id: "hires", label: "Hires", n: me.moves.hires, prev: prev?.hires ?? null, typical: t ? t.moves.hires : null, text: fmt(me.moves.hires) },
  ];
}

/** The quiet team-typical line for a tile; null when the API sent none (it holds it back below 3 others). */
export function typicalLine(tile: Pick<MineTile, "id" | "typical">): string | null {
  const v = tile.typical;
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return `Team typical ${tile.id === "talk" ? talkTime(v) : fmt(Math.round(v))}`;
}

/* ── Outreach ── */

export const TOUCH_LABEL: Readonly<Record<"first" | "second" | "later", string>> = {
  first: "First email",
  second: "First follow-up",
  later: "Later follow-ups",
};

export const OUTCOME_LABEL: Readonly<Record<string, string>> = {
  connected: "Connected",
  voicemail: "Voicemail",
  no_answer: "No answer",
  call_back: "Call back",
  not_interested: "Not interested",
};

/** The call outcomes, in a steady order (the API always lists the five). */
export function outcomeBars(outcomes: CallsAnalytics["outcomes"]): Array<{ id: string; label: string; n: number }> {
  const order = Object.keys(OUTCOME_LABEL);
  return order.map((id) => ({ id, label: OUTCOME_LABEL[id]!, n: outcomes.find((o) => o.outcome === id)?.n ?? 0 }));
}

/** Hours that had sends, with their label and share, for the by-hour chart. */
export function sendingHours(byHour: OutreachAnalytics["byHour"]) {
  return byHour.filter((h) => h.sent > 0).map((h) => ({ ...h, label: hourLabel(h.hour), ratio: toRatio(h.replied, h.sent) }));
}

export const hourLabel = (hour: number): string => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "am" : "pm"}`;

/* ── Pipeline ── */

export const STAGE_LABEL: Readonly<Record<string, string>> = {
  shortlisted: "Shortlisted",
  outreach: "In outreach",
  interviewing: "Interviewing",
  hired: "Hired",
  passed: "Passed",
};

/** A person's place as the page says it: "Waiting for a reply", else the stage. */
export const stageText = (stage: string, label?: string | null): string => label || STAGE_LABEL[stage] || stage;

/** The ageing bar's text: how many people, how many have waited longer than usual. */
export function ageingText(s: { n: number; waiting: number }): string {
  if (s.n === 0) return "No one";
  const people = plural(s.n, "person", "people");
  return s.waiting > 0 ? `${people}, ${s.waiting} waiting longer than usual` : people;
}

/** "Over 7 days, 14 in interviews" from the API's thresholds. */
export function thresholdLine(t: PipelineAnalytics["thresholds"]): string {
  return t.shortlisted === t.outreach
    ? `Waiting longer than usual means more than ${t.shortlisted} days in shortlist or outreach, ${t.interviewing} in interviews.`
    : `Waiting longer than usual means more than ${t.shortlisted} days shortlisted, ${t.outreach} in outreach, ${t.interviewing} in interviews.`;
}

/** The step with the fewest people carrying on, in words (the API names it; this only dresses it). */
export function leakLine(p: Pick<PipelineAnalytics, "conversion" | "weakestStep">): string | null {
  if (!p.weakestStep) return null;
  const row = p.conversion.find((c) => c.id === p.weakestStep);
  if (!row || row.smallN) return null;
  return `The step where the fewest people carry on is "${row.label.toLowerCase()}" (${ratioText(row)}).`;
}

/** Whether there is anything to draw in "where people are now". */
export const pipelineHasPeople = (p: Pick<PipelineAnalytics, "stages" | "totals">): boolean =>
  p.totals.inProgress > 0 || p.stages.some((s) => s.n > 0);

/** Where people were added from, as at most four slices: the three biggest sources, then everything else together. */
export function sourceSlices(rows: PipelineAnalytics["sources"]): Array<{ id: string; label: string; n: number }> {
  const real = rows.filter((r) => r.added > 0).sort((a, b) => b.added - a.added);
  const head = real.slice(0, 3).map((r) => ({ id: r.source, label: r.label, n: r.added }));
  const rest = real.slice(3).reduce((n, r) => n + r.added, 0);
  return rest > 0 ? [...head, { id: "other", label: "Other sources", n: rest }] : head;
}

/* ── Campaigns ── */

export const daysToFillText = (c: Pick<CampaignStats, "daysToFill" | "hired" | "target" | "status">): string => {
  if (c.daysToFill !== null && c.daysToFill !== undefined) return `${c.daysToFill} ${c.daysToFill === 1 ? "day" : "days"}`;
  return c.target > 0 ? "Not filled yet" : "–";
};

export const firstHireText = (c: Pick<CampaignStats, "daysToFirstHire">): string =>
  c.daysToFirstHire === null ? "–" : c.daysToFirstHire === 0 ? "Same day" : `${c.daysToFirstHire} ${c.daysToFirstHire === 1 ? "day" : "days"}`;

/** "Quiet for 9 days" in muted text, or when it last moved; plain words, no pill. */
export function activityText(c: Pick<CampaignStats, "quiet" | "quietDays" | "lastActivityAt" | "status">, now = Date.now()): string {
  if (c.status === "closed") return "Closed";
  if (c.quiet) return c.quietDays ? `Quiet for ${plural(c.quietDays, "day")}` : "Quiet for a while";
  if (!c.lastActivityAt) return "Nothing yet";
  const days = Math.max(0, Math.round((now - Date.parse(c.lastActivityAt)) / 86_400_000));
  return days === 0 ? "Active today" : days === 1 ? "Active yesterday" : `Active ${days} days ago`;
}

/** One campaign's people per step, in the order they move. */
export function campaignSteps(c: CampaignStats) {
  return [
    { id: "found", label: "Found", n: c.found },
    { id: "shortlisted", label: "Shortlisted", n: c.shortlisted },
    { id: "contacted", label: "Contacted", n: c.contacted },
    { id: "replied", label: "Replied", n: c.replied },
    { id: "interviewing", label: "Interviewing", n: c.interviewed },
    { id: "hired", label: "Hired", n: c.hired },
  ];
}

/* ── CSV: tables from the rows already on the page ── */

const table = (headers: string[], rows: Cell[][]): Table => ({ headers, rows, widths: headers.map((h) => Math.max(12, h.length + 2)) });

/** A small table of rows already on the page, for "View as table" and the download. */
export const simpleTable = (headers: string[], rows: Cell[][]): Table => table(headers, rows);

/** A share as a spreadsheet cell: the percentage as text, or "2 of 4". */
export const ratioCell = (r: Ratio | null | undefined): Cell => (r && r.of > 0 ? ratioText(r) : "");

export function peopleTable(rows: readonly PersonRow[]): Table {
  return table(
    ["Person", "Emails sent", "Replies", "Reply rate", "Calls placed", "Connected", "Talk time (minutes)", "Added to shortlists",
      "Moved to interview", "Hires", "Tasks due", "Done on time", "Overdue now", "In progress", "Waiting too long", "Campaigns"],
    rows.map((p) => [
      p.name, p.emails.sent, p.emails.replied, ratioCell(toRatio(p.emails.replied, p.emails.sent)), p.calls.placed, p.calls.connected,
      Math.round(p.calls.talkSeconds / 60), p.moves.shortlisted, p.moves.interviews, p.moves.hires, p.tasks.due, p.tasks.onTime,
      p.tasks.overdue, p.load.inProgress, p.load.waiting, p.load.campaigns,
    ]),
  );
}

export function emailsByCampaignTable(rows: OutreachAnalytics["byCampaign"]): Table {
  return table(
    ["Campaign", "Emails sent", "Replies", "Reply rate", "Waiting for a reply"],
    rows.map((c) => [c.name, c.sent, c.replied, ratioCell(toRatio(c.replied, c.sent)), c.awaiting]),
  );
}

export function callsByCampaignTable(rows: CallsAnalytics["byCampaign"]): Table {
  return table(
    ["Campaign", "Calls placed", "Connected", "Connect rate", "Talk time (minutes)"],
    rows.map((c) => [c.name, c.placed, c.connected, ratioCell(toRatio(c.connected, c.placed)), Math.round(c.talkSeconds / 60)]),
  );
}

/**
 * Who looks after a person, as a line of text. An owner or admin sees names (and "Not assigned" for nobody); a
 * recruiter or a personal workspace is never told a peer's name, so it is "You" or nothing at all.
 */
export function lookedAfterBy(w: PipelineAnalytics["waitingLongest"][number], seesTeam: boolean): string | null {
  if (w.ownerName === undefined && w.mine === undefined) return null;
  if (seesTeam) return w.ownerName ?? "Not assigned";
  return w.mine ? "You" : null;
}

export function waitingTable(rows: PipelineAnalytics["waitingLongest"], seesTeam = true): Table {
  return table(
    ["Person", "Campaign", "Stage", "Days at this stage", "Looked after by"],
    rows.map((w) => [w.name, w.campaign, stageText(w.stage), w.days, lookedAfterBy(w, seesTeam) ?? ""]),
  );
}

export function sourcesTable(rows: PipelineAnalytics["sources"]): Table {
  return table(["Source", "Added", "Moved to interview", "Hired"], rows.map((s) => [s.label, s.added, s.interviewed, s.hired]));
}

export function velocityTable(rows: PipelineAnalytics["velocity"]): Table {
  return table(
    ["Step", "Median days", "People", "Median days in the period before"],
    rows.map((v) => [STAGE_LABEL[v.stage] ?? v.stage, medianValue(v.median) ?? "", v.median.n, medianValue(v.prev) ?? ""]),
  );
}

export function campaignsTable(rows: readonly CampaignStats[]): Table {
  return table(
    ["Campaign", "Client", "Owner", "Status", "Hired", "Planned", "Found", "Shortlisted", "Contacted", "Replied", "Interviewing",
      "Days open", "Days to first hire", "Days to fill"],
    rows.map((c) => [
      c.name, c.client ?? "", c.ownerName ?? "", c.status === "closed" ? "Closed" : "Active", c.hired, c.target, c.found,
      c.shortlisted, c.contacted, c.replied, c.interviewed, c.daysOpen, c.daysToFirstHire ?? "", c.daysToFill ?? "",
    ]),
  );
}

export function clientsTable(rows: CampaignsAnalytics["clients"]): Table {
  return table(
    ["Client", "Campaigns", "Active", "Hired", "Planned", "Median days to first hire", "Replied", "Contacted"],
    rows.map((c) => [c.name, c.campaigns, c.active, c.hired, c.planned, medianValue(c.medianDaysToFirstHire) ?? "", c.replied.n, c.replied.of]),
  );
}

export function weeklyTable(rows: ReadonlyArray<{ start: string; interviews: number; hires: number }>): Table {
  return table(["Starting", "Moved to interview", "Hired"], rows.map((w) => [w.start.slice(0, 10), w.interviews, w.hires]));
}

/** "recruiters-last-30-days.csv" or "pipeline-2026-09-01-to-2026-09-30.csv". */
export function csvName(page: string, f: Pick<Filters, "period">): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const when = f.period.kind === "days" ? `last-${f.period.days}-days` : `${f.period.from}-to-${f.period.to}`;
  return `${slug(page)}-${when}.csv`;
}


/* ── Outreach by channel ── */

export type ChannelTab = "all" | "email" | "calls" | "whatsapp";
export const CHANNEL_TABS: readonly ChannelTab[] = ["all", "email", "calls", "whatsapp"];
export const parseChannel = (v: string | null | undefined): ChannelTab => (CHANNEL_TABS.includes(v as ChannelTab) ? (v as ChannelTab) : "all");

export const CHANNEL_LABEL: Readonly<Record<ChannelTab, string>> = { all: "All", email: "Email", calls: "Calls", whatsapp: "WhatsApp" };

/** The one calm line where WhatsApp's results will be. */
export const WHATSAPP_LINE = "WhatsApp results will appear here once WhatsApp is connected through Magnifi.";

/** The email steps, in the order a person is written to. "Later" is the third email and after. */
export const EMAIL_STEP_LABEL: Readonly<Record<"first" | "second" | "later", string>> = {
  first: "First email",
  second: "Follow-up 1",
  later: "Follow-up 2 or later",
};

/** How calls ended, in the order that reads best: the good ones first. */
export const CALL_OUTCOME_ORDER = ["connected", "call_back", "no_answer", "voicemail", "not_interested"] as const;

/** Call outcomes in reading order, one row each (a missing one is zero). */
export function outcomesInOrder(outcomes: ReadonlyArray<{ outcome: string; n: number }>): Array<{ id: string; label: string; n: number }> {
  return CALL_OUTCOME_ORDER.map((id) => ({ id, label: OUTCOME_LABEL[id] ?? id, n: outcomes.find((o) => o.outcome === id)?.n ?? 0 }));
}

/** A share as the length of a bar: whole percent, zero when there was nothing to divide. */
export const shareValue = (r: Ratio): number => (r.of > 0 ? Math.round((r.n / r.of) * 100) : 0);

/** The hour of the day as people say it, "9 am". */
export const hourName = (h: number): string => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;

/** The hour with the best share of replies from at least five sent; null when no hour has five. */
export function bestEmailHour(byHour: OutreachAnalytics["byHour"]): BestHour | null {
  const ok = byHour.filter((h) => h.sent >= SMALL_N).sort((a, b) => b.replied / b.sent - a.replied / a.sent || b.sent - a.sent)[0];
  return ok ? { hour: ok.hour, n: ok.sent, answered: ok.replied, answer: toRatio(ok.replied, ok.sent) } : null;
}

/**
 * The Outreach page's figures in one shape. A server that sends the channels is read as it is; an older one
 * (emails on one endpoint, calls on another) is put together here, with the period before left unknown and the
 * person-by-person list left out, since the two answers cannot be paired by person.
 */
export function hubOf(emails: OutreachAnalytics & Partial<OutreachExtras>, calls: CallsAnalytics | null): OutreachHub {
  if (emails.hub) return emails.hub;
  const t = emails.totals;
  const reply = emails.reply ?? toRatio(t.replied, t.sent);
  const placed = calls?.totals.placed ?? 0;
  const connected = calls?.totals.connected ?? 0;
  const connect = calls?.totals.connect ?? toRatio(connected, placed);
  const answered = t.replied + connected;
  const sent = t.sent + placed;
  const rows = new Map<string, OutreachHub["campaigns"][number]>();
  const rowOf = (id: string | null, name: string) => {
    const key = id ?? "none";
    const have = rows.get(key);
    if (have) return have;
    const fresh: OutreachHub["campaigns"][number] = {
      campaignId: id,
      name,
      email: { sent: 0, replied: 0, bounced: 0, scheduled: 0, awaiting: 0, reply: toRatio(0, 0) },
      calls: { placed: 0, connected: 0, talkSeconds: 0, avgSeconds: null, connect: toRatio(0, 0) },
      whatsapp: { connected: false, sent: 0, replied: 0 },
      sent: 0,
      answered: 0,
      answer: toRatio(0, 0),
    };
    rows.set(key, fresh);
    return fresh;
  };
  for (const c of emails.byCampaign) {
    const row = rowOf(c.campaignId, c.name);
    row.email = { sent: c.sent, replied: c.replied, bounced: 0, scheduled: 0, awaiting: c.awaiting, reply: toRatio(c.replied, c.sent) };
  }
  for (const c of calls?.byCampaign ?? []) {
    const row = rowOf(c.campaignId, c.name);
    row.calls = {
      placed: c.placed,
      connected: c.connected,
      talkSeconds: c.talkSeconds,
      avgSeconds: c.avgSeconds ?? (c.connected > 0 ? Math.round(c.talkSeconds / c.connected) : null),
      connect: toRatio(c.connected, c.placed),
    };
  }
  const campaigns = [...rows.values()]
    .map((r) => {
      const n = r.email.sent + r.calls.placed;
      const a = r.email.replied + r.calls.connected;
      return { ...r, sent: n, answered: a, answer: toRatio(a, n) };
    })
    .sort((a, b) => b.sent - a.sent || a.name.localeCompare(b.name));
  return {
    fromServer: false,
    channels: {
      email: {
        sent: t.sent,
        replied: t.replied,
        bounced: t.bounced,
        scheduled: 0,
        awaiting: emails.waiting ?? t.awaiting,
        reply,
        bounce: toRatio(t.bounced, t.sent),
        previous: { sent: 0, replied: 0 },
      },
      calls: {
        placed,
        connected,
        talkSeconds: calls?.totals.talkSeconds ?? 0,
        avgSeconds: calls?.totals.avgSeconds ?? null,
        connect,
        previous: calls?.totals.previous ?? { placed: 0, connected: 0 },
        outcomes: calls?.outcomes ?? [],
        withRecording: calls?.records?.withRecording ?? 0,
        withSummary: calls?.records?.withSummary ?? 0,
        bestHour: calls?.bestHour ?? null,
      },
      whatsapp: { connected: false, sent: 0, replied: 0, reply: toRatio(0, 0), previous: { sent: 0, replied: 0 } },
    },
    all: { sent, answered, answer: toRatio(answered, sent), previous: { sent: 0, answered: 0 } },
    campaigns,
    byPerson: null,
    email: {
      timeToFirstReply: emails.timeToReply ?? { hours: t.medianHoursToReply, n: t.replied },
      bounce: toRatio(t.bounced, t.sent),
      bestHour: bestEmailHour(emails.byHour),
    },
  };
}

/** What the tabs say after their names: touches sent on each; WhatsApp has none until it is connected. */
export function channelCounts(h: OutreachHub): Record<ChannelTab, number | null> {
  return {
    all: h.all.sent || null,
    email: h.channels.email.sent || null,
    calls: h.channels.calls.placed || null,
    whatsapp: h.channels.whatsapp.connected ? h.channels.whatsapp.sent || null : null,
  };
}

/** Whether the period before is known (a server that sends the channels also sends it). */
export const hasBefore = (h: OutreachHub): boolean => h.fromServer;

/* ── the one factual line under a page's title ── */

/** "30 days, all campaigns. 5 hires, 46 replies, 30 moved to interview." Said plainly, from the page's own figures. */
export function summaryLine(period: Period, scope: string, parts: readonly string[]): string {
  const head = `${periodLabel(period)}, ${scope}.`;
  const body = parts.filter(Boolean).join(", ");
  return body ? `${head} ${body}.` : head;
}

/** "4 more than before", "3 fewer than before", "Same as before": the short comparison under a figure. */
export function againstBefore(n: number, prev: number): string {
  if (n === prev) return "Same as before";
  return `${fmt(Math.abs(n - prev))} ${n > prev ? "more" : "fewer"} than before`;
}

export { periodDays, periodLabel };
