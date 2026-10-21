import type { OutreachAnalytics, ProjectsAnalytics } from "./api/analytics";
import type { ApiActivity, ApiOverview } from "./api/campaigns";
import { percent, replyTimeLabel } from "./analytics";
import type { PipelinePerson } from "./campaign";
import type { DayPoint, Step } from "./orchestrator";

/**
 * The numbers and sentences behind the chat's four analytics views (campaign, report, leak,
 * digest), kept apart from the components so what a person reads is tested. Everything here is
 * derived from what the API returned: a figure the records can't support is left out rather than
 * guessed, a share is never shown above 100%, and a thing that hasn't happened is said plainly.
 */

/* ── calendar days ──────────────────────────────────────────────────────────
   Days are calendar days, never 24-hour blocks: "yesterday" is the day before today on the
   calendar, whatever the hour. */

/** The calendar day ("2026-10-06") and the minute of that day for an instant, in a time zone (the browser's when none is given). */
export function localParts(at: string | number | Date, timeZone?: string): { day: string; minutes: number } {
  const parts: Record<string, string> = {};
  const f = new Intl.DateTimeFormat("en-GB", {
    ...(timeZone ? { timeZone } : {}),
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (const p of f.formatToParts(new Date(at))) parts[p.type] = p.value;
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** A calendar day moved by whole days. */
export function addDays(day: string, n: number): string {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The last `n` calendar days, oldest first, ending today. */
export function lastDays(n: number, now: number = Date.now(), timeZone?: string): string[] {
  const today = localParts(now, timeZone).day;
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

const utcDate = (day: string) => {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/* Spelled out here rather than asked of the locale: the same label everywhere, "Sep" never "Sept". */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "Tue 6": the label a chart's axis gives a calendar day. */
export function dayLabel(day: string): string {
  const d = utcDate(day);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** "29 Sep – 5 Oct", or "1 – 7 Oct" inside one month. */
export function rangeLabel(days: readonly string[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return "";
  const a = utcDate(first);
  const b = utcDate(last);
  const short = (d: Date, month: boolean) => `${d.getUTCDate()}${month ? ` ${MONTHS[d.getUTCMonth()]}` : ""}`;
  if (first === last) return short(b, true);
  return a.getUTCMonth() === b.getUTCMonth() ? `${short(a, false)} – ${short(b, true)}` : `${short(a, true)} – ${short(b, true)}`;
}

/** Calendar days between two days (b after a is positive). */
export const daysBetween = (a: string, b: string) => Math.round((utcDate(b).getTime() - utcDate(a).getTime()) / 86_400_000);

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** A share of something, or null when it can't honestly be one: nothing to divide by, or more than the whole. */
export function shareOf(part: number, whole: number): string | null {
  return whole > 0 && part <= whole ? `${Math.round((part / whole) * 100)}%` : null;
}

/* ── what happened, from a campaign's log ───────────────────────────────── */

export type EventKind =
  | "shortlisted" | "contacted" | "drafted" | "sent" | "reply" | "interview" | "hired" | "bounce" | "spec" | "form"
  /* From elsewhere: runs and the found-per-day series. */
  | "search" | "found";

export type LogEvent = {
  key: string;
  kind: EventKind;
  /** Milliseconds since the epoch. */
  at: number;
  /** The calendar day it happened on. */
  day: string;
  minutes: number;
  /** How many it stands for: 1 for a log line, a day's total for a series. */
  n: number;
  who: string | null;
  candidateId: string | null;
};

/** What a log line is, in the words the views count; null for bookkeeping that is not worth a count. */
export function kindOf(a: Pick<ApiActivity, "subjectKind" | "verb" | "data">): EventKind | null {
  const d = a.data as Record<string, unknown>;
  if (a.subjectKind === "candidate") {
    if (a.verb === "shortlisted") return "shortlisted";
    if (a.verb === "outreach_drafted") return "drafted";
    if (a.verb === "outreach_sent") return "sent";
    if (a.verb === "outreach_logged") return d.outcome === "replied" ? "reply" : d.outcome === "bounced" ? "bounce" : null;
    /* A logged reply is written twice, as the move to "replied" and as the logged outcome. */
    if ((a.verb === "moved" || a.verb === "updated") && d.step === "replied") return "reply";
    if (a.verb === "moved") {
      if (d.to === "interviewing") return "interview";
      if (d.to === "hired") return "hired";
      if (d.to === "outreach") return "contacted";
    }
    return null;
  }
  if (a.subjectKind === "campaign" && a.verb === "spec_drafted") return "spec";
  if (a.subjectKind === "form" && a.verb === "response_received") return "form";
  return null;
}

/**
 * A campaign's log as countable events. One person counts once per kind per day, so a reply
 * (written to the log twice) is one reply, and dragging someone back and forth is one move.
 */
export function eventsOf(items: readonly ApiActivity[], timeZone?: string): LogEvent[] {
  const out: LogEvent[] = [];
  const seen = new Set<string>();
  for (const a of items) {
    const kind = kindOf(a);
    if (!kind) continue;
    const at = Date.parse(a.at);
    if (!Number.isFinite(at)) continue;
    const { day, minutes } = localParts(at, timeZone);
    const person = a.subjectKind === "candidate" ? a.subjectId : null;
    if (person && (kind === "reply" || kind === "interview" || kind === "hired" || kind === "contacted")) {
      const k = `${kind}|${person}|${day}`;
      if (seen.has(k)) continue;
      seen.add(k);
    }
    out.push({ key: a.id, kind, at, day, minutes, n: 1, who: a.subjectKind === "candidate" ? a.subjectName : null, candidateId: person });
  }
  return out;
}

/** How many of one kind on each of the given days. */
export function perDay(events: readonly LogEvent[], days: readonly string[], kind: EventKind): number[] {
  const at = new Map(days.map((d, i) => [d, i]));
  const out = days.map(() => 0);
  for (const e of events) {
    if (e.kind !== kind) continue;
    const i = at.get(e.day);
    if (i !== undefined) out[i] = (out[i] ?? 0) + e.n;
  }
  return out;
}

/* ── a campaign in charts ───────────────────────────────────────────────── */

export type Kpi = {
  label: string;
  n: number;
  /** The line under the figure; null when there is nothing honest to say. */
  sub: string | null;
  /** True only for a week that beat the last one: a figure never goes red. */
  up?: boolean;
  spark?: readonly number[];
};

export type SeriesTab = { id: string; label: string; title: string; note: string; noun: string; days: readonly DayPoint[] };

export type ChannelRow = { channel: "gmail" | "whatsapp" | "linkedin"; sent: number; replied: number; medianHours: number | null };

export type Act = { label: string; seed: string; primary?: boolean };

export type ByCampaign = {
  id: string;
  name: string;
  meta: string;
  spark: readonly number[];
  found: number;
  /** Shown as a ring and a share; null when nobody has been contacted. */
  reply: { value: number; max: number } | null;
};

/** Everything the campaign charts draw, so the same components serve the demo's fixtures and the API. */
export type CampaignChartData = {
  kpis: readonly Kpi[];
  byCampaign?: readonly ByCampaign[];
  /** What a campaign's first figure counts: "sourced" in the demo, "found" for real people. */
  foundWord?: string;
  series: readonly SeriesTab[];
  steps: readonly Step[];
  /** Said in place of the funnel when there is nobody to draw. */
  funnelEmpty?: string;
  works: {
    sub: string;
    stats: readonly ChannelRow[];
    /** The one-line finding, with the sparkle. */
    find: string | null;
    /** Said plainly when there is nothing to chart. */
    empty: string | null;
    note: string | null;
    acts: readonly Act[];
  };
};

/** The labels for a series over the given days. */
export const pointsOf = (days: readonly string[], values: readonly number[]): DayPoint[] =>
  days.map((d, i) => ({ day: dayLabel(d), n: values[i] ?? 0 }));

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** How one campaign's weekly change reads: a gain is said, anything else is just the count. */
function weekSub(thisWeek: number, lastWeek: number): { sub: string; up?: boolean } {
  if (thisWeek > lastWeek && lastWeek > 0) return { sub: `+${thisWeek - lastWeek} vs last week`, up: true };
  if (thisWeek > 0) return { sub: `${thisWeek.toLocaleString("en-IN")} this week`, ...(lastWeek === 0 ? { up: true } : {}) };
  return { sub: "None this week" };
}

export type Reach = { found: number; shortlisted: number; outreach: number; replied: number; interviewing: number; hired: number };

/** The people who reached each stage, from the overview's funnel. */
export function reachFrom(funnel: ApiOverview["funnel"]): Reach {
  const n = (s: ApiOverview["funnel"][number]["stage"]) => funnel.find((f) => f.stage === s)?.count ?? 0;
  return { found: n("found"), shortlisted: n("shortlisted"), outreach: n("outreach"), replied: n("replied"), interviewing: n("interviewing"), hired: n("hired") };
}

/** Funnel stages for the chart: each over the one before it, and no share above the whole. */
export function funnelSteps(r: Reach): Step[] {
  return [
    { id: "shortlisted", label: "Shortlisted", n: r.shortlisted, of: r.found },
    { id: "contacted", label: "Contacted", n: r.outreach, of: r.shortlisted },
    { id: "interviews", label: "Interviews", n: r.interviewing, of: r.outreach },
    { id: "hired", label: "Hired", n: r.hired, of: r.interviewing },
  ];
}

/** The four figures for one campaign, each with the line a recruiter would say aloud. */
export function campaignKpis(ov: Pick<ApiOverview, "found" | "funnel" | "sourcedPerDay">, replies: readonly number[], interviews: readonly number[]): Kpi[] {
  const r = reachFrom(ov.funnel);
  const found = weekSub(ov.found.thisWeek, ov.found.lastWeek);
  const repliedSub = r.replied > 0 ? `${shareOf(r.replied, r.outreach) ?? "–"} reply rate` : r.outreach > 0 ? "None logged yet" : null;
  return [
    { label: "Found", n: r.found, ...found, ...(ov.sourcedPerDay.some((d) => d.count > 0) ? { spark: ov.sourcedPerDay.map((d) => d.count) } : {}) },
    { label: "Contacted", n: r.outreach, sub: r.outreach > 0 && shareOf(r.outreach, r.shortlisted) ? `${shareOf(r.outreach, r.shortlisted)} of those shortlisted` : null },
    { label: "Replied", n: r.replied, sub: repliedSub, ...(sum(replies) > 0 ? { spark: replies } : {}) },
    { label: "Interviews", n: r.interviewing, sub: shareOf(r.interviewing, r.outreach) ? `${shareOf(r.interviewing, r.outreach)} of people contacted` : null, ...(sum(interviews) > 0 ? { spark: interviews } : {}) },
  ];
}

/** What email did, and what to say about it; only what the records hold. */
export function emailWorks(
  email: { sent: number; replied: number; awaiting?: number } | null,
  medianHours: number | null,
  scope: { name: string | null; days: number },
): CampaignChartData["works"] {
  const sub = `email, last ${scope.days} days`;
  const where = scope.name ? ` for ${scope.name}` : "";
  const rest = "WhatsApp and LinkedIn messages aren't counted here yet.";
  const dropOff: Act = { label: "Find the drop-off", seed: scope.name ? `Where are we losing people on ${scope.name}?` : "Where are we losing people?" };
  if (!email) {
    return { sub, stats: [], find: null, empty: "Email results didn't load just now.", note: null, acts: [dropOff] };
  }
  if (email.sent === 0) {
    return { sub, stats: [], find: null, empty: `No emails have gone out${where} in the last ${scope.days} days.`, note: rest, acts: [dropOff] };
  }
  const rate = percent(email.replied / email.sent);
  const median = replyTimeLabel(medianHours);
  const find = email.replied > 0
    ? `${email.replied} of ${plural(email.sent, "email")} got a reply${rate ? `, ${rate}` : ""}.${median ? ` Replies come ${median === "under an hour" ? "within an hour" : `about ${median} after sending`}.` : ""}`
    : `${plural(email.sent, "email")} sent${where}, none answered yet. A reply counts once someone logs it on the person's card.`;
  const quiet = email.sent - email.replied;
  const acts: Act[] = quiet > 0 && scope.name
    ? [{ label: "Follow up on the ones who haven't replied", seed: `Follow up with everyone on ${scope.name} who hasn't replied`, primary: true }, dropOff]
    : [dropOff];
  return { sub, stats: [{ channel: "gmail", sent: email.sent, replied: email.replied, medianHours: medianHours === null ? null : Math.max(1, Math.round(medianHours)) }], find, empty: null, note: rest, acts };
}

/** One campaign's charts, drawn from its overview, its log and the workspace's email results. */
export function oneCampaignCharts(input: {
  overview: ApiOverview;
  events: readonly LogEvent[];
  outreach: OutreachAnalytics | null;
}): CampaignChartData {
  const { overview: ov, events, outreach } = input;
  const days = ov.sourcedPerDay.map((d) => d.day);
  const replies = perDay(events, days, "reply");
  const interviews = perDay(events, days, "interview");
  const found = ov.sourcedPerDay.map((d) => d.count);
  const r = reachFrom(ov.funnel);
  const note = (xs: readonly number[]) => `last ${days.length} days · ${sum(xs).toLocaleString("en-IN")} total`;
  const series: SeriesTab[] = [
    { id: "found", label: "Found", title: "Found per day", note: note(found), noun: "found", days: pointsOf(days, found) },
    { id: "replies", label: "Replies", title: "Replies per day", note: note(replies), noun: "replies", days: pointsOf(days, replies) },
    { id: "interviews", label: "Interviews", title: "Moved to interviews per day", note: note(interviews), noun: "to interviews", days: pointsOf(days, interviews) },
  ];
  const mine = outreach?.byCampaign.find((c) => c.campaignId === ov.campaign.id);
  const email = outreach ? { sent: mine?.sent ?? 0, replied: mine?.replied ?? 0, awaiting: mine?.awaiting ?? 0 } : null;
  return {
    kpis: campaignKpis(ov, replies, interviews),
    series,
    steps: funnelSteps(r),
    funnelEmpty: r.shortlisted === 0 ? "Nobody is shortlisted yet, so there's no funnel to draw. Shortlist people from the search to start one." : undefined,
    works: emailWorks(email, null, { name: ov.campaign.name, days: outreach?.days ?? 30 }),
  };
}

type Project = ProjectsAnalytics["campaigns"][number];

/** The campaigns a roll-up covers: the open ones, or all of them when none is open. */
export function openProjects(all: readonly Project[]): Project[] {
  const open = all.filter((p) => p.status === "active");
  return open.length ? open : [...all];
}

/** Every campaign together: totals first, then a row per campaign. */
export function allCampaignCharts(input: {
  projects: readonly Project[];
  /** Each campaign's last fourteen days of finds, newest last, by campaign id. */
  trends: Readonly<Record<string, readonly number[]>>;
  outreach: OutreachAnalytics | null;
  now?: number;
}): CampaignChartData {
  const list = openProjects(input.projects);
  const t = (pick: (p: Project) => number) => sum(list.map(pick));
  const found = t((p) => p.found);
  const added = t((p) => p.shortlisted);
  const contacted = t((p) => p.contacted);
  const replied = t((p) => p.replied);
  const interviewed = t((p) => p.interviewed);
  const hired = t((p) => p.hired);
  const width = Math.max(0, ...list.map((p) => input.trends[p.campaignId]?.length ?? 0));
  const total = Array.from({ length: width }, (_, i) => sum(list.map((p) => input.trends[p.campaignId]?.[i] ?? 0)));
  const days = width ? lastDays(width, input.now) : [];
  const week = sum(total.slice(-7));
  const email = input.outreach
    ? { sent: input.outreach.totals.sent, replied: input.outreach.totals.replied }
    : null;
  return {
    kpis: [
      { label: "Found", n: found, sub: week > 0 ? `${week.toLocaleString("en-IN")} this week` : "None this week", ...(week > 0 ? { up: true } : {}), ...(width ? { spark: total } : {}) },
      { label: "Contacted", n: contacted, sub: shareOf(contacted, added) ? `${shareOf(contacted, added)} of those shortlisted` : null },
      { label: "Replied", n: replied, sub: replied > 0 ? `${shareOf(replied, contacted) ?? "–"} reply rate` : contacted > 0 ? "None logged yet" : null },
      { label: "Interviews", n: interviewed, sub: shareOf(interviewed, contacted) ? `${shareOf(interviewed, contacted)} of people contacted` : null },
    ],
    foundWord: "found",
    byCampaign: list.map((p) => ({
      id: p.campaignId,
      name: p.name,
      meta: p.client ?? "Open",
      spark: input.trends[p.campaignId] ?? [],
      found: p.found,
      reply: p.contacted > 0 ? { value: Math.min(p.replied, p.contacted), max: p.contacted } : null,
    })),
    series: width
      ? [{ id: "found", label: "Found", title: "Found per day", note: `last ${width} days · ${sum(total).toLocaleString("en-IN")} total`, noun: "found", days: pointsOf(days, total) }]
      : [],
    steps: [
      { id: "shortlisted", label: "Shortlisted", n: added, of: found },
      { id: "contacted", label: "Contacted", n: contacted, of: added },
      { id: "interviews", label: "Interviews", n: interviewed, of: contacted },
      { id: "hired", label: "Hired", n: hired, of: interviewed },
    ],
    funnelEmpty: added === 0 ? "Nobody is shortlisted on any campaign yet, so there's no funnel to draw." : undefined,
    works: emailWorks(email, input.outreach?.totals.medianHoursToReply ?? null, { name: null, days: input.outreach?.days ?? 30 }),
  };
}

/* ── where people drop out ──────────────────────────────────────────────── */

export type ChainStage = { id: "found" | "shortlisted" | "outreach" | "interviewing" | "hired"; label: string; n: number };

/** Everyone who got as far as each stage, widest first. */
export function chainOf(r: Reach): ChainStage[] {
  return [
    { id: "found", label: "Found", n: r.found },
    { id: "shortlisted", label: "Shortlisted", n: r.shortlisted },
    { id: "outreach", label: "Contacted", n: r.outreach },
    { id: "interviewing", label: "Interviewing", n: r.interviewing },
    { id: "hired", label: "Hired", n: r.hired },
  ];
}

/** Under this many people a drop between stages says nothing: one in three of three is not a pattern. */
export const MIN_BASE = 3;

export type Drop = { from: ChainStage; to: ChainStage; kept: number };

/**
 * The widest drop between neighbours, by the share that did not make it to the next stage.
 * Finding to shortlisting is left out: it is the recruiter choosing, not people falling away.
 * A stage with too few people to say anything is left out too; with none left there is no verdict.
 */
export function widestDrop(chain: readonly ChainStage[]): Drop | null {
  let worst: Drop | null = null;
  for (let i = 2; i < chain.length; i++) {
    const from = chain[i - 1];
    const to = chain[i];
    if (!from || !to || from.n < MIN_BASE) continue;
    const kept = Math.min(1, to.n / from.n);
    if (!worst || kept < worst.kept) worst = { from, to, kept };
  }
  return worst;
}

export type StuckKind = "shortlisted" | "waiting" | "replied" | "interviewing" | "offer";
export type Stuck = { kind: StuckKind; n: number; /** Calendar days the longest-waiting has been there. */ longest: number; who: string | null; text: string };

const STUCK_TEXT: Record<StuckKind, (n: number) => string> = {
  shortlisted: (n) => `${n} shortlisted, not contacted yet`,
  waiting: (n) => `${n} contacted, no reply yet`,
  replied: (n) => `${n} ${n === 1 ? "has" : "have"} replied and ${n === 1 ? "is" : "are"} waiting on you`,
  interviewing: (n) => `${n} in interviews`,
  offer: (n) => `${n} with an offer out`,
};

/** Who is sitting where right now, and for how long, from the board. Stages with nobody in them are left out. */
export function stuckOf(people: readonly Pick<PipelinePerson, "name" | "stage" | "step" | "inStage" | "doNotContact">[]): Stuck[] {
  const kindOfPerson = (p: Pick<PipelinePerson, "stage" | "step" | "doNotContact">): StuckKind | null => {
    // Someone who may not be written to is no one to reach out to, follow up with or answer.
    if (p.doNotContact && (p.stage === "shortlisted" || p.stage === "outreach")) return null;
    if (p.stage === "shortlisted") return "shortlisted";
    if (p.stage === "outreach") return p.step === "replied" ? "replied" : "waiting";
    if (p.stage === "interviewing") return p.step === "offer" ? "offer" : "interviewing";
    return null;
  };
  const by = new Map<StuckKind, typeof people[number][]>();
  for (const p of people) {
    const k = kindOfPerson(p);
    if (k) by.set(k, [...(by.get(k) ?? []), p]);
  }
  const order: StuckKind[] = ["replied", "shortlisted", "waiting", "interviewing", "offer"];
  return order.flatMap((kind) => {
    const list = by.get(kind);
    if (!list?.length) return [];
    const oldest = list.reduce((a, b) => (b.inStage > a.inStage ? b : a));
    return [{ kind, n: list.length, longest: oldest.inStage, who: oldest.name || null, text: STUCK_TEXT[kind](list.length) }];
  });
}

/** "since yesterday", "for 3 days": how long someone has waited, in calendar days. */
export function waitedLabel(days: number): string {
  if (days <= 0) return "since today";
  if (days === 1) return "since yesterday";
  return `for ${days} days`;
}

/** A person by their whole name: a first word is not always a name ("Imp 64"), and two people can share one. */
const firstName = (name: string | null) => name?.trim().replace(/\s+/g, " ") || null;

/** What sits beside a stuck line: who has waited longest and for how long, by calendar day. */
export function stuckAside(s: Pick<Stuck, "n" | "longest" | "who">): string | null {
  const who = firstName(s.who);
  if (s.longest <= 0 && s.n > 1) return null;
  if (s.n === 1) return `${who ? `${who}, ` : ""}${waitedLabel(s.longest)}`;
  return `Longest: ${who ? `${who}, ` : ""}${waitedLabel(s.longest)}`;
}

export type Advice = { text: string; acts: Act[] };

/**
 * What the drop means and the one thing to do about it, from the numbers: the next stage's gap
 * names the fix, and the board says how many people are waiting on it. Nothing here is a verdict
 * the numbers don't carry.
 */
export function adviceFor(drop: Drop | null, stuck: readonly Stuck[], campaign: string, reach: Reach): Advice {
  const find = (k: StuckKind) => stuck.find((s) => s.kind === k);
  const waiting = find("waiting");
  const replied = find("replied");
  const shortlisted = find("shortlisted");
  if (!drop) {
    if (reach.shortlisted === 0) {
      return { text: `Nobody is shortlisted on ${campaign} yet, so nobody has dropped out. Shortlisting people from the search starts the pipeline.`, acts: [{ label: "Show the best matches", seed: `Show me the best matches for ${campaign}`, primary: true }] };
    }
    return { text: `${plural(reach.shortlisted, "person", "people")} ${reach.shortlisted === 1 ? "is" : "are"} on the pipeline, too few at each step to say where people drop out yet.`, acts: [] };
  }
  const lead = `${drop.from.label} to ${drop.to.label.toLowerCase()} is where you lose the most: ${drop.to.n} of ${drop.from.n}.`;
  if (drop.to.id === "outreach") {
    if (!shortlisted) return { text: `${lead} Nobody is waiting for a first message right now, so the rest were rejected or moved without a message.`, acts: [] };
    const long = shortlisted.longest >= 2 ? `, the longest ${waitedLabel(shortlisted.longest)}` : "";
    return {
      text: `${lead} ${shortlisted.n} ${shortlisted.n === 1 ? "is" : "are"} shortlisted and still waiting for a first message${long}. Reaching out to them is the fastest fix.`,
      acts: [{ label: shortlisted.n === 1 ? "Reach out to them" : `Reach out to the ${shortlisted.n}`, seed: `Reach out to the shortlist for ${campaign}`, primary: true }],
    };
  }
  if (drop.to.id === "interviewing") {
    const acts: Act[] = [];
    const parts: string[] = [];
    if (replied) {
      const w = firstName(replied.who);
      parts.push(`${replied.n} ${replied.n === 1 ? "reply is" : "replies are"} waiting on an answer from you${w && replied.longest >= 1 ? `, and ${w} has waited ${waitedLabel(replied.longest).replace(/^for /, "")}` : ""}. Answering ${replied.n === 1 ? "it is" : "those is"} the fastest fix`);
      acts.push({
        label: replied.n === 1 ? "Answer the one waiting" : `Answer the ${replied.n} waiting`,
        seed: replied.n === 1
          ? `Draft an answer to the candidate waiting on me on ${campaign}`
          : `Draft answers to the ${replied.n} candidates waiting on me on ${campaign}`,
        primary: true,
      });
    }
    if (waiting) {
      parts.push(replied ? `a follow-up to the ${waiting.n} who haven't replied is the next` : `${waiting.n} ${waiting.n === 1 ? "hasn't" : "haven't"} replied yet, so a follow-up is the fastest fix`);
      acts.push({
        label: waiting.n === 1 ? "Follow up with them" : `Follow up with the ${waiting.n}`,
        seed: `Follow up with ${waiting.n === 1 ? "the one" : "everyone"} on ${campaign} who hasn't replied`,
        ...(replied ? {} : { primary: true }),
      });
    }
    return { text: parts.length ? `${lead} ${parts.join("; ")}.` : lead, acts };
  }
  const interviewing = find("interviewing");
  const offer = find("offer");
  const here = (interviewing?.n ?? 0) + (offer?.n ?? 0);
  return {
    text: `${lead}${here ? ` ${plural(here, "person", "people")} ${here === 1 ? "is" : "are"} still in interviews${interviewing && interviewing.longest >= 2 ? `, the longest ${waitedLabel(interviewing.longest)}` : ""}.` : ""}`,
    acts: here ? [{ label: "Check on the interviews", seed: `Where do the interviews stand on ${campaign}?`, primary: true }] : [],
  };
}

/* ── what the agents did: the receipt ───────────────────────────────────── */

export type RunLite = { skill: string; status: string; campaignId: string | null; createdAt: string };

/** Runs of agent work on a campaign (or any) inside the days, as events: a search that finished is one. */
export function runEvents(runs: readonly RunLite[], days: readonly string[], campaignId: string | null, timeZone?: string): LogEvent[] {
  const inside = new Set(days);
  const out: LogEvent[] = [];
  runs.forEach((r, i) => {
    if (campaignId && r.campaignId !== campaignId) return;
    if (r.skill !== "sourcing" && r.skill !== "watch") return;
    if (r.status !== "done") return;
    const at = Date.parse(r.createdAt);
    if (!Number.isFinite(at)) return;
    const { day, minutes } = localParts(at, timeZone);
    if (inside.has(day)) out.push({ key: `run-${i}-${r.createdAt}`, kind: "search", at, day, minutes, n: 1, who: null, candidateId: null });
  });
  return out;
}

/**
 * Whether the runs the API listed reach back to a moment. The list is the most recent page of runs, and
 * chat turns share it, so on a busy workspace a full page can stop short of the period asked about.
 */
export function runsReach(runs: readonly Pick<RunLite, "createdAt">[], since: number, page = 100): boolean {
  if (runs.length < page) return true;
  return Math.min(...runs.map((r) => Date.parse(r.createdAt))) <= since;
}

/** Searches that were started and didn't finish, said plainly under the receipt. */
export function unfinishedRuns(runs: readonly RunLite[], days: readonly string[], campaignId: string | null, timeZone?: string): number {
  const inside = new Set(days);
  return runs.filter((r) => (!campaignId || r.campaignId === campaignId) && (r.skill === "sourcing" || r.skill === "watch") && (r.status === "failed" || r.status === "cancelled") && inside.has(localParts(r.createdAt, timeZone).day)).length;
}

/** A day's finds, as one event in the middle of that day. */
export function foundEvents(series: readonly { day: string; count: number }[], days: readonly string[]): LogEvent[] {
  const inside = new Set(days);
  return series.filter((d) => d.count > 0 && inside.has(d.day)).map((d) => ({
    key: `found-${d.day}`, kind: "found" as const, at: Date.parse(`${d.day}T12:00:00Z`), day: d.day, minutes: 720, n: d.count, who: null, candidateId: null,
  }));
}

/** Where on the week's track an event sits: the day's index plus how far through the day it was. */
export const positionOf = (e: Pick<LogEvent, "day" | "minutes">, days: readonly string[]): number => {
  const i = days.indexOf(e.day);
  return i < 0 ? -1 : i + e.minutes / 1440;
};

export type ReceiptLine = { id: string; label: string; n: number; hot?: boolean; /** The channel it went through, for its mark. */ mark?: "gmail" };
export type ReceiptGroup = { id: "search" | "messages" | "outcomes"; title: string; lines: ReceiptLine[]; empty: string };

const LINES: readonly { kind: EventKind; group: ReceiptGroup["id"]; label: string; hot?: boolean; mark?: "gmail" }[] = [
  { kind: "search", group: "search", label: "Searches run" },
  { kind: "found", group: "search", label: "People found" },
  { kind: "shortlisted", group: "search", label: "Added to the shortlist" },
  { kind: "spec", group: "search", label: "Role specs written" },
  { kind: "drafted", group: "messages", label: "Emails drafted", mark: "gmail" },
  { kind: "sent", group: "messages", label: "Emails sent", mark: "gmail" },
  { kind: "contacted", group: "messages", label: "Moved to outreach" },
  { kind: "reply", group: "outcomes", label: "Replies", hot: true },
  { kind: "interview", group: "outcomes", label: "Moved to interviews", hot: true },
  { kind: "hired", group: "outcomes", label: "Hired", hot: true },
  { kind: "form", group: "outcomes", label: "Form responses" },
  { kind: "bounce", group: "outcomes", label: "Emails that bounced", mark: "gmail" },
];

const GROUPS: readonly { id: ReceiptGroup["id"]; title: string; empty: string }[] = [
  { id: "search", title: "Search", empty: "No searches or shortlisting in this period." },
  { id: "messages", title: "Messages", empty: "No emails drafted or sent in this period." },
  { id: "outcomes", title: "Outcomes", empty: "No replies or moves yet." },
];

export type Receipt = {
  groups: ReceiptGroup[];
  sent: number;
  replies: number;
  /** Replies over emails sent across the whole period; null when nothing was sent. */
  rate: string | null;
};

/**
 * The receipt as it stands once the marker has reached `at` (in days from the start). A line
 * is there for the whole replay if it counts for anything in the period, so lines count up
 * instead of appearing; a group with nothing in it says so. `always` names lines the records do
 * speak to even at zero (a week's replies from the home overview), so a zero is said, not left out.
 */
export function receiptAt(events: readonly (LogEvent & { pos: number })[], at: number, always: readonly EventKind[] = []): Receipt {
  const total = (k: EventKind) => sum(events.filter((e) => e.kind === k).map((e) => e.n));
  /* A line is there if it counts for anything in the period. Two are there when their absence
     would leave a question: emails drafted with none sent, and emails sent with no reply. */
  const visible = (k: EventKind) => total(k) > 0 || always.includes(k) || (k === "sent" && total("drafted") > 0) || (k === "reply" && total("sent") > 0);
  const soFar = (k: EventKind) => sum(events.filter((e) => e.kind === k && e.pos <= at).map((e) => e.n));
  const groups = GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    empty: g.empty,
    lines: LINES.filter((l) => l.group === g.id && visible(l.kind)).map((l) => ({ id: l.kind, label: l.label, n: soFar(l.kind), ...(l.hot ? { hot: true } : {}), ...(l.mark ? { mark: l.mark } : {}) })),
  }));
  const sentAll = total("sent");
  return { groups, sent: soFar("sent"), replies: soFar("reply"), rate: sentAll > 0 ? `${soFar("reply")} of ${soFar("sent")}${soFar("sent") > 0 ? ` · ${Math.round((soFar("reply") / soFar("sent")) * 100)}%` : ""}` : null };
}

/** A rolling period's totals from the home overview, as events at the start: a receipt with no track to scrub. */
export function homeEvents(h: HomeCounts): (LogEvent & { pos: number })[] {
  const ev = (kind: EventKind, n: number) => ({ key: `home-${kind}`, kind, at: 0, day: "", minutes: 0, n, who: null, candidateId: null, pos: 0 });
  return [ev("found", h.found.current), ev("reply", h.replies.current), ev("interview", h.interviews.current), ev("hired", h.hires.current)];
}

/** The dots on the week's track: only what a recruiter would want to jump to. */
export const MARKED: readonly EventKind[] = ["sent", "reply", "interview", "hired", "bounce"];

/** What a marker says when hovered. */
export function markerText(e: Pick<LogEvent, "kind" | "who" | "day">): string {
  const who = e.who ?? "Someone";
  const what = e.kind === "sent" ? `Emailed ${who}` : e.kind === "reply" ? `${who} replied` : e.kind === "interview" ? `${who} moved to interviews` : e.kind === "hired" ? `${who} was hired` : `${who}'s email bounced`;
  return `${dayLabel(e.day)} · ${what}`;
}

/* ── what happened since you looked ─────────────────────────────────────── */

export type DigestRow = {
  id: string;
  name: string;
  found: number;
  replies: number;
  interviews: number;
  hires: number;
  searches: number;
  note: string | null;
};

export type Segment = string | { b: string };

export type Digest = {
  /** The one-sentence summary, with its figures marked for bold. */
  lead: Segment[];
  rows: DigestRow[];
  /** Campaigns with nothing new, by name. */
  quiet: string[];
  /** Searches that didn't finish, across the campaigns. */
  unfinished: number;
  /** True when nothing at all happened. */
  nothing: boolean;
};

type Pair = { current: number };
type HomeCounts = { found: Pair; replies: Pair; interviews: Pair; hires: Pair };

export type DigestInput = {
  home: HomeCounts & { tasks: { open: number; dueToday: number } };
  /** Each campaign's own day, in the home overview's order. */
  camps: readonly { id: string; name: string; nextStep: string | null; day: HomeCounts | null }[];
  runs: readonly (RunLite & { campaignName?: string | null })[];
  now?: number;
};

const joinAnd = (xs: readonly Segment[]): Segment[] => {
  const out: Segment[] = [];
  xs.forEach((x, i) => {
    if (i > 0) out.push(i === xs.length - 1 ? (xs.length > 2 ? ", and " : " and ") : ", ");
    out.push(x);
  });
  return out;
};

/** The last day, across campaigns: wins first, then what needs a person, in plain words. */
export function digestOf(input: DigestInput): Digest {
  const now = input.now ?? Date.now();
  const since = now - 86_400_000;
  const recent = input.runs.filter((r) => Date.parse(r.createdAt) >= since && (r.skill === "sourcing" || r.skill === "watch"));
  const rows: DigestRow[] = input.camps.map((c) => {
    const mine = recent.filter((r) => r.campaignId === c.id);
    const row: DigestRow = {
      id: c.id,
      name: c.name,
      found: c.day?.found.current ?? 0,
      replies: c.day?.replies.current ?? 0,
      interviews: c.day?.interviews.current ?? 0,
      hires: c.day?.hires.current ?? 0,
      searches: mine.filter((r) => r.status === "done").length,
      note: null,
    };
    /* Wins first, then what is open for a person (without the campaign's name, the row has it), then the work done. */
    const next = c.nextStep?.replace(/\s*\([^)]*\)\s*$/, "").trim() || null;
    const win = row.hires > 0 ? `${row.hires} hired` : row.interviews > 0 ? `${row.interviews} moved to interviews` : null;
    row.note = [win, next].filter((x): x is string => !!x).join(" · ") || (row.searches > 0 ? `${plural(row.searches, "search", "searches")} ran` : null);
    return row;
  });
  const busy = (r: DigestRow) => r.found + r.replies + r.interviews + r.hires + r.searches;
  /* Wins first, then whatever has a next step, then the rest. */
  const wins = (r: DigestRow) => r.hires * 1000 + r.interviews * 100 + r.replies * 10 + (r.found > 0 ? 1 : 0);
  const shown = rows.filter((r) => busy(r) > 0 || r.note).sort((a, b) => wins(b) - wins(a) || a.name.localeCompare(b.name));
  const quiet = rows.filter((r) => busy(r) === 0 && !r.note).map((r) => r.name);

  const h = input.home;
  const withNews = rows.filter((r) => busy(r) > 0).length;
  const parts: Segment[] = [];
  if (h.hires.current > 0) parts.push({ b: `${h.hires.current} hired` });
  if (h.interviews.current > 0) parts.push({ b: `${h.interviews.current} moved to interviews` });
  if (h.replies.current > 0) parts.push({ b: plural(h.replies.current, "reply", "replies") });
  if (h.found.current > 0) parts.push({ b: `${h.found.current.toLocaleString("en-IN")} found` });
  const open = h.tasks.open;
  const due = h.tasks.dueToday;
  const needs = open > 0 ? `${plural(open, "task")} ${open === 1 ? "is" : "are"} open for you${due > 0 ? `, ${due} due today` : ""}.` : null;
  const across = withNews > 1 ? ` across ${withNews} campaigns` : "";
  const lead: Segment[] = parts.length
    ? ["In the last day: ", ...joinAnd(parts), `${across}.`, ...(needs ? [` ${needs}`] : [])]
    : ["Nothing new in the last day.", ...(needs ? [` ${needs}`] : [])];
  const unfinished = input.runs.filter((r) => Date.parse(r.createdAt) >= since && (r.skill === "sourcing" || r.skill === "watch") && (r.status === "failed" || r.status === "cancelled")).length;
  return { lead, rows: shown, quiet, unfinished, nothing: parts.length === 0 && shown.length === 0 };
}

/** A lead segment list as plain text, for tests and for a screen reader's label. */
export const plainOf = (segments: readonly Segment[]): string => segments.map((s) => (typeof s === "string" ? s : s.b)).join("");

/* ── the choice of scope ─────────────────────────────────────────────────── */

/** The answer to "which campaign" that means all of them. */
export const ALL = "all";

/** Whether the words ask about every campaign rather than one. */
export const asksForAll = (said: string): boolean => /\b(all|every|each)\b[^.?!]{0,16}\bcampaigns?\b|\bacross (all|every)\b|\bcampaigns\b[^.?!]{0,12}\b(together|combined|overall)\b/i.test(said);
