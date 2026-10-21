import type { ReviewCandidate } from "./api/stages";

/**
 * What the client's review page says, as plain functions: how a person's years, work and schooling read, what is
 * remembered about the reviewer, and how an answer is told back. The page itself (ReviewPage.tsx) only lays it out.
 *
 * The server sends a profile's work and schooling as it has them, in a few shapes; they are read tolerantly and
 * whatever is not a row of words is left out. No contact detail is ever read here: the page is never sent any.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2021-03-01" as "Mar 2021", "2019" as "2019"; anything else is nothing. */
export function whenLabel(raw: unknown): string {
  if (typeof raw === "number") return String(raw);
  if (typeof raw !== "string") return "";
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(raw.trim());
  if (!m) return "";
  const month = m[2] ? Number(m[2]) - 1 : -1;
  return month >= 0 && month < 12 ? `${MONTHS[month]} ${m[1]}` : m[1]!;
}

const text = (o: Record<string, unknown>, ...keys: string[]): string => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
};

const span = (from: string, to: string, current: boolean): string => {
  if (!from && !to && !current) return "";
  return [from, current ? "Present" : to].filter(Boolean).join(" – ");
};

/** "2019 to now", "2016 to 2018", "from 2020": the years a job ran, as a person would say them. */
const jobYears = (from: string, to: string, current: boolean): string => {
  const y = (s: string) => /\d{4}/.exec(s)?.[0] ?? "";
  const a = y(from);
  const b = current ? "now" : y(to);
  return a && b ? (a === b ? a : `${a} to ${b}`) : a ? `from ${a}` : b && b !== "now" ? `until ${b}` : "";
};

export type WorkRow = { title: string; company: string; when: string; about: string };
export type SchoolRow = { school: string; detail: string; when: string };

/** Work history rows, newest first as the server sent them: a title, where, when, and a line about the role when there is one. */
export function workRows(raw: readonly unknown[] | null | undefined): WorkRow[] {
  const out: WorkRow[] = [];
  for (const item of raw ?? []) {
    if (typeof item === "string" && item.trim()) { out.push({ title: item.trim(), company: "", when: "", about: "" }); continue; }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = text(o, "title", "role", "position");
    const company = text(o, "company", "employer", "organisation", "organization", "org");
    if (!title && !company) continue;
    const current = o.isCurrent === true || o.current === true;
    out.push({
      title: title || company, company: title ? company : "",
      when: jobYears(whenLabel(o.startDate ?? o.start_date ?? o.start), whenLabel(o.endDate ?? o.end_date ?? o.end), current),
      about: text(o, "description", "summary"),
    });
  }
  return out;
}

/** Schooling rows: the school, the degree and field, the years. */
export function schoolRows(raw: readonly unknown[] | null | undefined): SchoolRow[] {
  const out: SchoolRow[] = [];
  for (const item of raw ?? []) {
    if (typeof item === "string" && item.trim()) { out.push({ school: item.trim(), detail: "", when: "" }); continue; }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const school = text(o, "school", "institute", "institution", "name");
    if (!school) continue;
    out.push({
      school,
      detail: [text(o, "degree"), text(o, "field", "fieldOfStudy", "field_of_study")].filter(Boolean).join(", "),
      when: span(whenLabel(o.startYear ?? o.start_year ?? o.startDate ?? o.start), whenLabel(o.endYear ?? o.end_year ?? o.endDate ?? o.end), false),
    });
  }
  return out;
}

/** "6 years of experience"; nothing for a profile that does not say. */
export function yearsLine(years: number | null | undefined): string {
  if (years == null || !Number.isFinite(years) || years < 0) return "";
  const n = Math.round(years);
  return n < 1 ? "Under a year of experience" : n === 1 ? "1 year of experience" : `${n} years of experience`;
}

/** Where they are and how long they have worked, on one line. */
export const metaLine = (c: Pick<ReviewCandidate, "location" | "yearsExperience">): string =>
  [c.location?.trim(), yearsLine(c.yearsExperience)].filter(Boolean).join(" · ");

/** The skills as one quiet line. */
export const skillsLine = (skills: readonly string[]): string => skills.map((s) => s.trim()).filter(Boolean).join(" · ");

/** Screening answers with something in them. */
export const answeredOnly = (rows: readonly { question: string; answer: string }[]): { question: string; answer: string }[] =>
  rows.filter((r) => r.question.trim() && r.answer.trim()).map((r) => ({ question: r.question.trim(), answer: r.answer.trim() }));

/* ── the reviewer ── */

const NAME_KEY = "superhyre.review.name";
type Store = Pick<Storage, "getItem" | "setItem">;
const session = (): Store | null => {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
};

/** The name given earlier in this tab, if any. A store that cannot be read is no name. */
export function rememberedName(store: Store | null = session()): string {
  try { return store?.getItem(NAME_KEY)?.slice(0, 80) ?? ""; } catch { return ""; }
}
/** Keeps the name for this tab, so it is asked once. */
export function rememberName(name: string, store: Store | null = session()): void {
  try { store?.setItem(NAME_KEY, name.trim().slice(0, 80)); } catch { /* asked again next time */ }
}

/** The note and name as they go: trimmed, empty ones left out, the note held to the 500 the server takes. */
export function verdictBody(verdict: "approved" | "declined", note: string, name: string): { verdict: "approved" | "declined"; note?: string; reviewerName?: string } {
  const n = note.trim().slice(0, 500);
  const who = name.trim().slice(0, 80);
  return { verdict, ...(n ? { note: n } : {}), ...(who ? { reviewerName: who } : {}) };
}

/** What the card says once an answer is in. */
export const answerLine = (v: "approved" | "declined"): string => (v === "approved" ? "You approved this person." : "You marked this person as not for you.");

export const NOTE_MAX = 500;

/** The line under the title: how many there are to look at, and how many are still to answer. */
export function progressLine(total: number, answered: number): string {
  if (total <= 0) return "";
  const left = total - answered;
  if (left <= 0) return "Thank you. You have answered everyone.";
  if (answered === 0) return total === 1 ? "One person to look at." : `${total} people to look at.`;
  return left === 1 ? "One person still to look at." : `${left} people still to look at.`;
}

/** A link worth opening in a new tab: web addresses only. */
export const safeLink = (url: string | null | undefined): string | null => (url && /^https?:\/\//i.test(url) ? url : null);
