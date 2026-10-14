import type { Suppression, SuppressionReason } from "./api/suppressions";

/**
 * What the Do not contact list and the notices around it say, as words. Pure, so the wording and who
 * may do what can be pinned by tests without a page.
 */

const REASON: Readonly<Record<SuppressionReason, string>> = {
  do_not_contact: "Asked not to be contacted",
  unsubscribed: "Unsubscribed",
  bounced: "Email address bounced",
  manual: "Added by hand",
};

export const reasonWords = (r: SuppressionReason): string => REASON[r] ?? REASON.do_not_contact;

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const DAY = 86_400_000;

const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** "8 Oct", or "8 Oct 2025" for another year. */
export function dateLabel(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t) || t <= 0) return "";
  const d = new Date(t);
  return `${d.getDate()} ${MONTH[d.getMonth()]}${d.getFullYear() === new Date(now).getFullYear() ? "" : ` ${d.getFullYear()}`}`;
}

/** "today", "yesterday", or the date: how long ago something was added, mid-sentence. */
export function sinceLabel(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t) || t <= 0) return "";
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  return days === 0 ? "today" : days === 1 ? "yesterday" : dateLabel(iso, now);
}

/** "Added by you", "Added by Priya", "Added by Mind", "Added automatically". */
export function addedBy(s: Pick<Suppression, "source" | "createdBy">, viewerId?: string | null): string {
  if (s.source === "agent") return "Added by Mind";
  if (s.source === "system") return "Added automatically";
  if (viewerId && s.createdBy.id === viewerId) return "Added by you";
  return s.createdBy.name ? `Added by ${s.createdBy.name}` : "Added by a teammate";
}

/** "Until 4 Jan" while it lasts, "Ended 4 Jan" once it has; nothing when it stays until someone lifts it. */
export function untilLabel(s: Pick<Suppression, "until" | "expired">, now = Date.now()): string | null {
  const day = s.until ? dateLabel(s.until, now) : "";
  return day ? `${s.expired ? "Ended" : "Until"} ${day}` : null;
}

/** The meta line of an entry: why, since when, by whom, until when. */
export function metaLine(s: Suppression, viewerId?: string | null, now = Date.now()): string {
  const since = sinceLabel(s.createdAt, now);
  return [reasonWords(s.reason), since ? `Since ${since}` : null, addedBy(s, viewerId), untilLabel(s, now)].filter(Boolean).join(" · ");
}

/** Only an owner or admin can lift one. */
export const canRemove = (viewer: { manages: boolean }): boolean => viewer.manages;

/** What a person who cannot lift one is told instead of a button. */
export const removeHelp = (viewer: { manages: boolean }): string | null => (viewer.manages ? null : "Ask an admin to remove");

/** "3 people", "1 person". */
export const peopleLabel = (n: number): string => `${n} ${n === 1 ? "person" : "people"}`;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A reason an address can't be added, or null when it can. */
export function emailProblem(email: string): string | null {
  const e = email.trim();
  if (!e) return "Type the email address.";
  if (e.length > 320 || !EMAIL.test(e)) return "That doesn't look like an email address.";
  return null;
}

/**
 * The line after approving outreach when some people were left out because they are on the list.
 * The server says how many and why for each; the count is what the recruiter needs.
 */
export function suppressedNotice(held: ReadonlyArray<{ reason: string }>): string | null {
  const n = held.length;
  if (n === 0) return null;
  return n === 1
    ? "1 person is on the do-not-contact list, so they were left out."
    : `${n} people are on the do-not-contact list, so they were left out.`;
}
