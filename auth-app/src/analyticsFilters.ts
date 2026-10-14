import type { AnalyticsQuery } from "./api/analytics";

/**
 * The Analytics filter bar, as data: what is in the address, what goes to the API, and what a person has
 * chosen before. Pure, so the rules (one clamp, one default, a recruiter can never ask for someone else) are
 * tested and every page uses the same ones.
 *
 * The filters live in the hash query ("#/analytics/pipeline?days=90&campaignId=...") so a link carries them.
 * The names are the API's own; `campaign=` is not used because that parameter already means "open this campaign".
 */

export const PRESET_DAYS = [7, 30, 90] as const;
export const DEFAULT_DAYS = 30;
/** The longest custom range, in days (inclusive of both ends). */
export const MAX_RANGE_DAYS = 365;

export type Period =
  | { kind: "days"; days: number }
  | { kind: "custom"; from: string; to: string };

export type Filters = {
  period: Period;
  campaignId: string | null;
  clientId: string | null;
  /** Only an owner or admin may name one; a recruiter's own id is the single exception, and means "me". */
  userId: string | null;
  /** A recruiter's switch on Overview and Outreach: their own work, or the totals of the campaigns they can see. */
  view: "mine" | "campaigns";
};

export const DEFAULT_FILTERS: Filters = {
  period: { kind: "days", days: DEFAULT_DAYS },
  campaignId: null,
  clientId: null,
  userId: null,
  view: "mine",
};

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** A date as YYYY-MM-DD in the viewer's own time zone (not UTC: "today" must be their today). */
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** YYYY-MM-DD to a local date at noon (so a daylight-saving change never moves it to another day); null when not a date. */
export function parseYmd(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return ymd(d) === s ? d : null;
}

/** Days from `a` to `b`, both YYYY-MM-DD, counting both ends. */
export function inclusiveDays(a: string, b: string): number {
  const da = parseYmd(a);
  const db = parseYmd(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / DAY_MS) + 1;
}

/**
 * A custom range that can be asked for: both ends real dates, in order, not after today, and no longer than a year.
 * Returns the range as it will be sent (an end in the future is brought back to today), or null.
 */
export function clampRange(from: string | null | undefined, to: string | null | undefined, today: Date = new Date()): { from: string; to: string } | null {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return null;
  const now = ymd(today);
  const end = ymd(b) > now ? now : ymd(b);
  const start = ymd(a);
  if (start > end) return null;
  if (inclusiveDays(start, end) > MAX_RANGE_DAYS) return null;
  return { from: start, to: end };
}

/** How many days a period covers (what "the 30 days before" means). */
export function periodDays(p: Period): number {
  return p.kind === "days" ? p.days : inclusiveDays(p.from, p.to);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "6 Oct": fixed, so it reads the same in every browser and locale. */
export function shortDay(ymdString: string): string {
  const d = parseYmd(ymdString.slice(0, 10));
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : ymdString;
}

/** "30 days", or "3 Oct to 12 Oct" for a custom range. */
export function periodLabel(p: Period): string {
  return p.kind === "days" ? `${p.days} days` : `${shortDay(p.from)} to ${shortDay(p.to)}`;
}

/** "the 30 days before" or "the period before". */
export const previousLabel = (p: Period): string => `the ${periodDays(p)} days before`;

/**
 * The filters an address or a remembered value names, made safe.
 *
 * Anything unreadable falls back to the default rather than failing: an address is hand-editable. `canPickPerson`
 * is false for a recruiter and for a personal workspace; for them `userId` is dropped unless it is their own.
 */
export function parseFilters(
  query: string | URLSearchParams,
  opts: { canPickPerson: boolean; selfId?: string | null; today?: Date } = { canPickPerson: false },
): Filters {
  const p = typeof query === "string" ? new URLSearchParams(query.replace(/^[#?]/, "")) : query;
  const today = opts.today ?? new Date();
  let period: Period = DEFAULT_FILTERS.period;
  const range = clampRange(p.get("from"), p.get("to"), today);
  if (range) {
    period = { kind: "custom", ...range };
  } else {
    const d = Number(p.get("days"));
    if (PRESET_DAYS.includes(d as (typeof PRESET_DAYS)[number])) period = { kind: "days", days: d };
  }
  const id = (k: string) => {
    const v = p.get(k)?.trim();
    return v ? v : null;
  };
  const wanted = id("userId");
  const userId = wanted && (opts.canPickPerson || (opts.selfId && wanted === opts.selfId)) ? wanted : null;
  return { period, campaignId: id("campaignId"), clientId: id("clientId"), userId, view: p.get("view") === "campaigns" ? "campaigns" : "mine" };
}

/** The address's query for a set of filters. Defaults are left out, so the plain address stays plain. */
export function filtersToHashQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.period.kind === "custom") {
    p.set("from", f.period.from);
    p.set("to", f.period.to);
  } else if (f.period.days !== DEFAULT_DAYS) {
    p.set("days", String(f.period.days));
  }
  if (f.campaignId) p.set("campaignId", f.campaignId);
  if (f.clientId) p.set("clientId", f.clientId);
  if (f.userId) p.set("userId", f.userId);
  if (f.view === "campaigns") p.set("view", "campaigns");
  return p.toString();
}

/** What the API is asked, for these filters. */
export function filtersToParams(f: Filters): AnalyticsQuery {
  const q: AnalyticsQuery =
    f.period.kind === "custom"
      ? { period: "custom", from: f.period.from, to: f.period.to }
      : { period: String(f.period.days) as "7" | "30" | "90" };
  if (f.campaignId) q.campaign = f.campaignId;
  if (f.clientId) q.client = f.clientId;
  if (f.userId) q.recruiter = f.userId;
  if (f.view === "campaigns") q.view = "campaigns";
  return q;
}

/** A stable string for "have the filters changed", used to refetch. */
export const filtersKey = (f: Filters): string => JSON.stringify(filtersToParams(f));

/** Whether anything narrows the view beyond the period. */
export const isNarrowed = (f: Filters): boolean => !!(f.campaignId || f.clientId || f.userId);

/* ── remembered per person ── */

export const storageKey = (userId: string | null | undefined): string => `sh.analytics.filters.${userId || "me"}`;

/** What was chosen last time, as the address's query string; empty when nothing was. Never throws. */
export function readRemembered(userId: string | null | undefined, store: Pick<Storage, "getItem"> | null = safeStore()): string {
  try {
    return store?.getItem(storageKey(userId)) ?? "";
  } catch {
    return "";
  }
}

export function remember(userId: string | null | undefined, f: Filters, store: Pick<Storage, "setItem" | "removeItem"> | null = safeStore()): void {
  try {
    const q = filtersToHashQuery(f);
    if (q) store?.setItem(storageKey(userId), q);
    else store?.removeItem(storageKey(userId));
  } catch {
    /* a browser that refuses storage just forgets */
  }
}

function safeStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The query part of a hash, "#/analytics/pipeline?days=7" to "days=7"; empty when there is none. */
export function queryOfHash(hash: string): string {
  const i = hash.indexOf("?");
  return i < 0 ? "" : hash.slice(i + 1);
}

/** The path part of a hash without its `#` and query: "#/analytics/pipeline?days=7" to "/analytics/pipeline". */
export function pathOfHash(hash: string): string {
  const raw = hash.replace(/^#/, "");
  const i = raw.indexOf("?");
  return i < 0 ? raw : raw.slice(0, i);
}
