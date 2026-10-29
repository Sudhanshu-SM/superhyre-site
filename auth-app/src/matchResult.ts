import type { Match, MatchDisplay, MatchFit, MatchProfile, RequirementResult, Tier } from "./api/agent";
import { TIER_LABEL } from "./chatCards";

/**
 * What a match says about fit, as words. Every figure comes from the server (modules/matching/results.ts): the console
 * never works out a score, a coverage, a tier or a status, it only chooses how to say what the server sent.
 *
 * Calm on purpose. "Not scored yet" and "Needs more evidence" are about what we know, never about the person, and no
 * number is shown for a result that is not a valid fit.
 */

/** The server's fit fields with the tier in force (a recruiter's override included). */
export type MatchResultView = MatchFit & { tier: Tier | null };

/** The fit fields of a match or a profile; null from a server that does not send them yet (the older list). */
export function resultOf(m: Pick<Match, "tier"> & Partial<MatchFit> & { status?: MatchFit["status"] }): MatchResultView | null {
  if (!m.status) return null;
  return {
    display: m.display ?? displayFrom(m.status, m.tier),
    score: m.score ?? null,
    coverage: m.coverage ?? null,
    status: m.status,
    fit: m.fit ?? null,
    toVerify: m.toVerify ?? [],
    requirements: m.requirements ?? [],
    strengths: m.strengths ?? [],
    concerns: m.concerns ?? [],
    missing: m.missing ?? [],
    note: m.note ?? null,
    knockout: m.knockout ?? null,
    override: m.override ?? null,
    policyVersion: m.policyVersion ?? "v1",
    rubricVersion: m.rubricVersion ?? 0,
    evaluatedAt: m.evaluatedAt ?? null,
    tier: m.tier,
  };
}

export const resultOfProfile = (mp: MatchProfile): MatchResultView | null => resultOf(mp as Parameters<typeof resultOf>[0]);

/** What an older server's result says in the one resolved form (the server sends `display` itself from now on). */
export function displayFrom(status: MatchFit["status"], tier: Tier | null): MatchDisplay {
  if (tier) return { label: TIER_LABEL[tier], tone: tier === "A" ? "strong" : tier === "B" ? "good" : "partial", note: null };
  if (status === "knocked_out") return { label: "Ruled out", tone: "ruled_out", note: null };
  if (status === "insufficient_evidence") return { label: "Needs more evidence", tone: "needs_evidence", note: null };
  return { label: "Not scored yet", tone: "not_scored", note: null };
}

/**
 * The state in a few words, the server's own: "Strong fit · 82", "Needs more evidence", "Not scored yet", "Ruled out". The score is
 * added only when the whole role could be checked; when only part of it could, `coverageLine` says the score and what it covers.
 */
export function stateLabel(r: Pick<MatchResultView, "status" | "tier" | "score"> & { display?: MatchDisplay; coverage?: number | null }): string {
  const label = (r.display ?? displayFrom(r.status, r.tier)).label;
  const whole = r.coverage === undefined || r.coverage === null || r.coverage >= 99.95;
  return r.status === "scored" && r.tier && r.score !== null && whole ? `${label} · ${Math.round(r.score)}` : label;
}

export type StateTone = "hired" | "ink" | "muted" | "interviewing" | "passed";

/** The tone a state is written in (text colour only; see statusTones.ts). */
export function stateTone(r: Pick<MatchResultView, "status" | "tier"> & { display?: MatchDisplay }): StateTone {
  const tone = (r.display ?? displayFrom(r.status, r.tier)).tone;
  return tone === "strong" ? "hired" : tone === "good" ? "ink" : tone === "partial" ? "muted" : tone === "needs_evidence" ? "interviewing" : tone === "ruled_out" ? "passed" : "muted";
}

/**
 * What a score covers, in plain words: "100 on the 56% we could check" when only part of the role could be checked, "35% could be
 * checked" when that is too little for a score; nothing when the whole role was checked or nobody has read them.
 */
export function coverageLine(r: Pick<MatchResultView, "status" | "coverage"> & { score?: number | null }): string | null {
  if (r.coverage === null || r.status === "not_scored_yet" || r.status === "knocked_out") return null;
  const part = Math.round(r.coverage);
  if (r.status === "insufficient_evidence") return `${part}% of what the role asks could be checked`;
  if (r.coverage >= 99.95) return null;
  return r.score === null || r.score === undefined ? `Checked ${part}% of what the role asks` : `${Math.round(r.score)} on the ${part}% we could check`;
}

/** Said when some of what the role asks could not be checked from the profile yet. */
export const PARTLY_CHECKED = "Some requirements couldn't be checked from the profile yet.";

/** The one line under a name in the ranked list: why they rank where they do, or what is still to learn. */
export function reasonLine(r: MatchResultView | null, fallback: string): string {
  if (!r) return fallback;
  if (r.override) return `Tier set by ${firstName(r.override.by)}: ${r.override.reason}`;
  switch (r.status) {
    case "not_scored_yet":
      return "Not read closely yet, so there is no score. This says nothing about them.";
    case "insufficient_evidence": {
      const first = r.toVerify[0]?.text;
      return first
        ? `Too little on the profile to say yet. Still to check: ${first}${r.toVerify.length > 1 ? ` and ${r.toVerify.length - 1} more` : ""}.`
        : "Too little on the profile to say yet.";
    }
    case "knocked_out":
      return r.knockout?.reason ?? fallback;
    default:
      return r.strengths[0] ?? fallback;
  }
}

const firstName = (name: string | null): string => (name ?? "a teammate").trim().split(/\s+/)[0] ?? "a teammate";

export const VERDICT_WORD: Readonly<Record<RequirementResult["verdict"], string>> = {
  met: "Met",
  partial: "Partly",
  not_met: "Not met",
  unknown: "To check",
};

export const VERDICT_TONE: Readonly<Record<RequirementResult["verdict"], StateTone>> = {
  met: "hired",
  partial: "interviewing",
  not_met: "passed",
  unknown: "muted",
};

export const IMPORTANCE_WORD: Readonly<Record<RequirementResult["importance"], string>> = {
  must: "Must have",
  nice: "Nice to have",
  knockout: "Required",
};

/** "12 Oct, 14:20" in the viewer's time. */
export function whenLine(iso: string | null, now = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const opts: Intl.DateTimeFormatOptions = d.getFullYear() === now.getFullYear()
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" };
  return d.toLocaleString("en-IN", opts);
}

/** How the fit was made, for the footer: "Role spec v3 · scored 12 Oct, 14:20 · scoring v2". */
export function provenanceLine(r: Pick<MatchResultView, "rubricVersion" | "evaluatedAt" | "policyVersion">): string {
  return [r.rubricVersion ? `Requirements v${r.rubricVersion}` : null, whenLine(r.evaluatedAt) ? `scored ${whenLine(r.evaluatedAt)}` : null, `scoring ${r.policyVersion}`]
    .filter(Boolean)
    .join(" · ");
}
