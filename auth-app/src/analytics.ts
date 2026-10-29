import type { OutreachAnalytics, ProjectsAnalytics, UsageAnalytics } from "./api/analytics";
import { calendarDaysSince } from "./api/campaigns";

/**
 * Wording and shaping for the Analytics pages, kept apart from the components so the
 * numbers a person reads are tested: a rate is never shown above 100%, a missing number
 * is left out rather than shown as zero, and every sentence is plain.
 */

/** 0.333 → "33%"; nothing to divide by → null, so the page shows no rate rather than 0%. */
export function percent(rate: number | null): string | null {
  if (rate === null || !Number.isFinite(rate)) return null;
  return `${Math.round(Math.min(1, Math.max(0, rate)) * 100)}%`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How long replies take, the way a person says it. */
export function replyTimeLabel(hours: number | null): string | null {
  if (hours === null) return null;
  if (hours < 1) return "under an hour";
  if (hours < 48) return plural(Math.round(hours), "hour");
  return plural(Math.round(hours / 24), "day");
}

/** Where outreach is stuck right now, as sentences; empty when nothing is. */
export function stallLines(stalls: OutreachAnalytics["stalls"]): string[] {
  const lines: string[] = [];
  if (stalls.draftsWaiting > 0) {
    lines.push(
      `${plural(stalls.draftsWaiting, "draft")} ${stalls.draftsWaiting === 1 ? "has" : "have"} waited more than 2 days to be approved.`,
    );
  }
  if (stalls.unlogged > 0) {
    lines.push(
      `${plural(stalls.unlogged, "sent email")} ${stalls.unlogged === 1 ? "has" : "have"} had nothing logged for 4 days or more.`,
    );
  }
  return lines;
}

export const TOUCH_LABEL: Record<OutreachAnalytics["byTouch"][number]["touch"], string> = {
  first: "First email",
  second: "First follow-up",
  later: "Later follow-ups",
};

/** 0 → "12 am", 13 → "1 pm". */
export function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? "am" : "pm"}`;
}

/** Hours that had sends, in order, with their reply rate. */
export function sendingHours(byHour: OutreachAnalytics["byHour"]) {
  return byHour
    .filter((h) => h.sent > 0)
    .map((h) => ({ ...h, label: hourLabel(h.hour), rate: h.replied / h.sent }));
}

/** A daily limit as a meter: how much is used, how much is left, the share 0 to 1. */
export function meterOf(item: UsageAnalytics["today"][number]) {
  const share = item.limit > 0 ? Math.min(1, item.used / item.limit) : 0;
  const left = Math.max(0, item.limit - item.used);
  return {
    ...item,
    share,
    left,
    text: `${item.used.toLocaleString("en-IN")} of ${item.limit.toLocaleString("en-IN")}`,
    note: left === 0 ? "Used up for today" : share >= 0.8 ? `${left.toLocaleString("en-IN")} left today` : null,
  };
}

export type UsageKey = "messages" | "searches" | "specs" | "profiles" | "exports";
export const USAGE_LABEL: Record<UsageKey, string> = {
  messages: "Agent messages",
  searches: "Searches",
  specs: "Requirements drafted",
  profiles: "New profiles bought",
  exports: "Exports",
};

/** Totals over the period, per kind of use. */
/** Nothing at all was used in the period (so there is no chart worth drawing). */
export const usageIsIdle = (daily: UsageAnalytics["daily"]): boolean =>
  Object.values(usageTotals(daily)).every((n) => n === 0);

export function usageTotals(daily: UsageAnalytics["daily"]): Record<UsageKey, number> {
  const out: Record<UsageKey, number> = { messages: 0, searches: 0, specs: 0, profiles: 0, exports: 0 };
  for (const d of daily) for (const k of Object.keys(out) as UsageKey[]) out[k] += d[k];
  return out;
}

/** One kind of use as the series the Area chart draws. */
export const seriesOf = (daily: UsageAnalytics["daily"], key: UsageKey) =>
  daily.map((d) => ({ day: d.day, n: d[key] }));

type Project = ProjectsAnalytics["campaigns"][number];

/** How far a campaign has got: people who ever reached each step. */
export function progressOf(p: Project) {
  return [
    { id: "found", label: "Found", n: p.found },
    { id: "added", label: "Added", n: p.shortlisted },
    { id: "contacted", label: "Contacted", n: p.contacted },
    { id: "replied", label: "Replied", n: p.replied },
    { id: "interviewed", label: "Interviewed", n: p.interviewed },
    { id: "hired", label: "Hired", n: p.hired },
  ];
}

const DAY = 86_400_000;

/** When anything last happened, or how long it has been quiet. */
export function lastActivityLabel(p: Project, quietAfterDays: number, now = Date.now()): string {
  if (!p.lastActivityAt) {
    return p.quiet ? `Nothing yet in ${plural(p.daysOpen, "day")}` : "Nothing yet";
  }
  const days = calendarDaysSince(p.lastActivityAt, now);
  if (p.quiet) return `Quiet for ${plural(Math.max(days, quietAfterDays), "day")}`;
  if (days <= 0) return "Active today";
  return days === 1 ? "Active yesterday" : `Active ${days} days ago`;
}

/** "Open 12 days" while running; "Ran 30 days" once finished. */
export function openLabel(p: Project, now = Date.now()): string {
  const finished = p.status === "closed";
  // "Opened today" only on the calendar day it opened; 21 hours ago may be yesterday.
  if (!finished && p.daysOpen === 0 && p.openedAt && calendarDaysSince(p.openedAt, now) > 0) return "Opened yesterday";
  if (p.daysOpen === 0) return finished ? "Ran less than a day" : "Opened today";
  return finished ? `Ran ${plural(p.daysOpen, "day")}` : `Open ${plural(p.daysOpen, "day")}`;
}

/** "First hire in 10 days", or nothing before a hire. */
export const firstHireLabel = (p: Project): string | null =>
  p.daysToFirstHire === null
    ? null
    : p.daysToFirstHire === 0
      ? "First hire the day it opened"
      : `First hire in ${plural(p.daysToFirstHire, "day")}`;

/* ── fixtures, for the console without an API ───────────────────────────── */

const dayStr = (back: number) => new Date(Date.now() - back * DAY).toISOString().slice(0, 10);

export const OUTREACH_FIXTURE: OutreachAnalytics = {
  days: 30,
  timeZone: "Asia/Kolkata",
  totals: {
    drafted: 64,
    sent: 58,
    replied: 17,
    noReply: 21,
    bounced: 2,
    awaiting: 18,
    failedToSend: 0,
    medianHoursToReply: 19,
    replyRate: 17 / 58,
  },
  byCampaign: [
    { campaignId: "backend-snr", name: "Senior Backend Engineers", drafted: 31, sent: 29, replied: 10, awaiting: 7, replyRate: 10 / 29 },
    { campaignId: "platform-sre", name: "Platform SRE", drafted: 21, sent: 19, replied: 5, awaiting: 8, replyRate: 5 / 19 },
    { campaignId: "ios", name: "iOS Engineers", drafted: 12, sent: 10, replied: 2, awaiting: 3, replyRate: 2 / 10 },
  ],
  byTouch: [
    { touch: "first", sent: 41, replied: 11, replyRate: 11 / 41 },
    { touch: "second", sent: 13, replied: 5, replyRate: 5 / 13 },
    { touch: "later", sent: 4, replied: 1, replyRate: 1 / 4 },
  ],
  byHour: Array.from({ length: 24 }, (_, hour) =>
    hour === 9 ? { hour, sent: 21, replied: 8 } : hour === 11 ? { hour, sent: 19, replied: 5 }
      : hour === 15 ? { hour, sent: 12, replied: 3 } : hour === 18 ? { hour, sent: 6, replied: 1 }
        : { hour, sent: 0, replied: 0 },
  ),
  stalls: { draftsWaiting: 3, unlogged: 5 },
};

export const USAGE_FIXTURE: UsageAnalytics = {
  days: 30,
  timeZone: "Asia/Kolkata",
  today: [
    { id: "messages", label: "Agent messages", used: 142, limit: 800 },
    { id: "yourMessages", label: "Your agent messages", used: 38, limit: 200 },
    { id: "searches", label: "Searches", used: 21, limit: 150 },
    { id: "profiles", label: "New profiles bought", used: 330, limit: 400 },
  ],
  daily: Array.from({ length: 30 }, (_, i) => {
    const back = 29 - i;
    const weekend = new Date(Date.now() - back * DAY).getDay() % 6 === 0;
    const k = weekend ? 0.2 : 1;
    return {
      day: dayStr(back),
      messages: Math.round((90 + ((i * 37) % 60)) * k),
      searches: Math.round((12 + ((i * 7) % 9)) * k),
      specs: weekend ? 0 : i % 4 === 0 ? 2 : 1,
      profiles: Math.round((180 + ((i * 53) % 150)) * k),
      exports: weekend ? 0 : i % 3,
    };
  }),
  people: [
    { userId: "p1", name: "Punith S", messages: 640, searches: 88, specs: 9, exports: 12 },
    { userId: "p2", name: "Riya Kapoor", messages: 512, searches: 71, specs: 6, exports: 7 },
    { userId: "p3", name: "Dev Menon", messages: 301, searches: 40, specs: 4, exports: 3 },
  ],
};

export const PROJECTS_FIXTURE: ProjectsAnalytics = {
  quietAfterDays: 7,
  campaigns: [
    {
      campaignId: "backend-snr", name: "Senior Backend Engineers", status: "active", client: "Razorpay", target: 3,
      openedAt: new Date(Date.now() - 34 * DAY).toISOString(), closedAt: null,
      found: 412, shortlisted: 38, contacted: 29, replied: 10, interviewed: 6, hired: 1,
      firstHireAt: new Date(Date.now() - 6 * DAY).toISOString(), lastActivityAt: new Date().toISOString(),
      daysOpen: 34, daysToFirstHire: 28, quiet: false,
    },
    {
      campaignId: "platform-sre", name: "Platform SRE", status: "active", client: "Zerodha", target: 2,
      openedAt: new Date(Date.now() - 21 * DAY).toISOString(), closedAt: null,
      found: 233, shortlisted: 24, contacted: 19, replied: 5, interviewed: 2, hired: 0,
      firstHireAt: null, lastActivityAt: new Date(Date.now() - 2 * DAY).toISOString(),
      daysOpen: 21, daysToFirstHire: null, quiet: false,
    },
    {
      campaignId: "ios", name: "iOS Engineers", status: "active", client: null, target: 1,
      openedAt: new Date(Date.now() - 40 * DAY).toISOString(), closedAt: null,
      found: 96, shortlisted: 12, contacted: 10, replied: 2, interviewed: 0, hired: 0,
      firstHireAt: null, lastActivityAt: new Date(Date.now() - 11 * DAY).toISOString(),
      daysOpen: 40, daysToFirstHire: null, quiet: true,
    },
  ],
};
