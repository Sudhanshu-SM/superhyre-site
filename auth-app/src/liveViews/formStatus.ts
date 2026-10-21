import type { ResponseMeta } from "../api/forms";
import type { Form, FormResponse } from "../campaign";
import { missedMustHaves } from "../campaign";
import { shortTitle } from "../formKit";

/**
 * What to say about a campaign's forms and the people who answered, wins first. Pure: the view
 * fetches the counts and the responses; the words and the order are decided here, and tested.
 */

export type FormState = "draft" | "live" | "closed";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-12-31" as "31 Dec"; empty for anything else. */
export function shortDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  const month = m ? Number(m[2]) - 1 : -1;
  return m && month >= 0 && month < 12 ? `${Number(m[3])} ${MONTHS[month]}` : "";
}

/** How a form stands, in plain words (no badge): live and until when, a draft nobody can open yet, or closed. */
export function stateLine(status: FormState, closesOn?: string | null): string {
  if (status === "closed") return "Closed to new applications";
  if (status === "draft") return "A draft, not published yet";
  const until = shortDate(closesOn);
  return until ? `Live, takes applications until ${until}` : "Live";
}

export type Counts = {
  /** Everyone who answered. */
  total: number;
  /** Answered and met every must-have. */
  met: number;
  /** Missed at least one must-have. */
  missed: number;
  /** Not on the board and not yet decided on: waiting for the recruiter's call. */
  waiting: number;
  /** Whether the form has any must-have to meet. */
  hasMust: boolean;
};

/** "2 answered, both met every must-have", "3 answered, 2 met every must-have, 1 missed one". */
export function answeredLine(c: Counts): string {
  if (c.total === 0) return "No answers yet";
  const head = `${c.total} answered`;
  const tail = c.waiting > 0 ? `, ${c.waiting} waiting for your call` : "";
  if (!c.hasMust) return head + tail;
  if (c.missed === 0) return `${head}, ${c.total === 1 ? "and they met" : c.total === 2 ? "both met" : "all met"} every must-have${tail}`;
  if (c.met === 0) return `${head}, none met every must-have${tail}`;
  return `${head}, ${c.met} met every must-have, ${c.missed} missed ${c.missed === 1 ? "one" : "some"}${tail}`;
}

/** One line over several forms that have answers: "5 answered across 3 forms, 3 met every must-have." Null when one form (or none) has answers. */
export function totalsLine(forms: readonly Pick<Counts, "total" | "met" | "hasMust">[]): string | null {
  const answered = forms.filter((f) => f.total > 0);
  if (answered.length < 2) return null;
  const total = answered.reduce((t, f) => t + f.total, 0);
  const met = answered.reduce((t, f) => t + (f.hasMust ? f.met : 0), 0);
  const anyMust = answered.some((f) => f.hasMust);
  return `${total} answered across ${answered.length} forms${anyMust && met > 0 ? `, ${met} met every must-have` : ""}.`;
}

const SUBJECT = [/^have you worked hands-on with (.+?)\?$/i, /^does this describe you: (.+?)\??$/i];

/** The must-have a question asks about, in a few words: "Kotlin", "notice period". */
export function missLabel(q: Parameters<typeof shortTitle>[0]): string {
  for (const re of SUBJECT) {
    const subject = re.exec(q.title.trim())?.[1];
    if (subject) return subject;
  }
  return shortTitle(q);
}

/** What a response says about the must-haves: a win first, else what was missed. */
export function responseLine(r: Pick<FormResponse, "answers" | "flagged">, form: Pick<Form, "questions">, hasMust: boolean): string {
  if (!hasMust) return "Answered";
  if (!r.flagged) return "Met every must-have";
  const misses = missedMustHaves(form, r.answers).map((m) => missLabel(m.q));
  if (!misses.length) return "Missed a must-have";
  const named = [...new Set(misses)].slice(0, 2);
  return `Missed ${named.join(" and ")}${misses.length > named.length ? " and more" : ""}`;
}

export type Standing = "waiting" | "passed" | "on-board";

/** Where a response stands with the recruiter: on the board already, passed on, or waiting for a call. */
export function standingOf(meta: Pick<ResponseMeta, "decision" | "stage"> | undefined): Standing {
  if (meta?.stage) return "on-board";
  return meta?.decision === "passed" ? "passed" : "waiting";
}

/** The people to show first: those waiting for a call, then the rest, each newest first; at most `limit`. */
export function inView<T extends { id: string }>(
  rows: readonly T[],
  metaOf: (id: string) => Pick<ResponseMeta, "decision" | "stage"> | undefined,
  limit: number,
): { shown: T[]; hidden: number } {
  const waiting = rows.filter((r) => standingOf(metaOf(r.id)) === "waiting");
  const rest = rows.filter((r) => standingOf(metaOf(r.id)) !== "waiting");
  const all = [...waiting, ...rest];
  return { shown: all.slice(0, limit), hidden: Math.max(0, all.length - limit) };
}

const STAGE_WORDS: Readonly<Record<string, string>> = {
  shortlisted: "On the shortlist", outreach: "In outreach", interviewing: "Interviewing", hired: "Hired", passed: "Rejected",
};

/** Where someone already on the board is, in words. */
export const stageWords = (stage: string): string => STAGE_WORDS[stage] ?? stage;

const RANK: Readonly<Record<FormState, number>> = { live: 0, draft: 1, closed: 2 };

/** Live forms first, then drafts, then closed ones; within each, the most answered first, else as they came. */
export function orderForms<F extends { id: string }>(
  forms: readonly F[],
  facts: (f: F) => { status: FormState; answered: number },
): F[] {
  return forms
    .map((f, i) => ({ f, i, ...facts(f) }))
    .sort((a, b) => RANK[a.status] - RANK[b.status] || b.answered - a.answered || a.i - b.i)
    .map((x) => x.f);
}

/** The form to open the "who answered" list on by itself: one with people waiting, else the one with most answers. */
export function defaultOpen<F extends { id: string }>(
  forms: readonly F[],
  facts: (f: F) => { answered: number; waiting: number },
): string | null {
  const withAnswers = forms.filter((f) => facts(f).answered > 0);
  const waiting = withAnswers.find((f) => facts(f).waiting > 0);
  return (waiting ?? withAnswers[0])?.id ?? null;
}
