import type { ApiBoardRow } from "../api/campaigns";
import type { Thread } from "../api/outreach";

/**
 * Who an outreach run in the chat is for, and what to say about it. Pure: the view fetches the
 * campaign's people and threads and this decides the rest, so the rules are tested without a browser.
 */

/** Everyone the run could reach: the board row as far as outreach needs it. */
export type ScopePerson = {
  campaignCandidateId: string;
  candidateId: string;
  personId: string | null;
  fullName: string;
  currentTitle: string | null;
  currentCompanyName: string | null;
  city: string | null;
  yearsOfExperience: number | null;
  linkedinUrl: string | null;
  stage: ApiBoardRow["stage"];
  hasEmail: boolean;
  /** On the do-not-contact list: not written to, whatever is on file. */
  suppressed?: boolean;
};

export type Scope = {
  people: ScopePerson[];
  /** Who they were chosen as: the people the agent named, or the campaign's shortlist. */
  basis: "named" | "shortlist";
  /** People the agent named who aren't on this campaign, so can't be written to from here. */
  missing: number;
  /** The agent named people but none are on this campaign, so this is the shortlist instead. */
  fellBack: boolean;
};

export type Named = { candidateIds: readonly string[]; personIds: readonly string[] };

const personOf = (r: ApiBoardRow): ScopePerson => ({
  /* The server says who is on the do-not-contact list (its one rule), so a listing by address counts too. */
  ...(r.doNotContact ? { suppressed: true } : {}),
  campaignCandidateId: r.campaignCandidateId,
  candidateId: r.candidateId,
  personId: r.personId ?? null,
  fullName: r.fullName,
  currentTitle: r.currentTitle,
  currentCompanyName: r.currentCompanyName,
  city: r.city,
  yearsOfExperience: r.yearsOfExperience,
  linkedinUrl: r.linkedinUrl,
  stage: r.stage,
  hasEmail: r.hasEmail,
});

/** Stages whose people a first email can still go to. Passed and hired people are never written to. */
const REACHABLE = new Set<ApiBoardRow["stage"]>(["shortlisted", "outreach", "interviewing"]);

/**
 * The people named, when the agent named some and any are on the campaign; otherwise the
 * shortlist (shortlisted, and those already in outreach). Someone passed on is never in scope.
 */
export function scopeOf(rows: readonly ApiBoardRow[], named: Named = { candidateIds: [], personIds: [] }): Scope {
  const asked = new Set([...named.candidateIds, ...named.personIds]);
  if (asked.size) {
    const hit = rows.filter((r) => (asked.has(r.candidateId) || asked.has(r.personId)) && REACHABLE.has(r.stage));
    const found = new Set(hit.flatMap((r) => [r.candidateId, r.personId]));
    const missing = [...asked].filter((id) => !found.has(id)).length;
    if (hit.length) return { people: hit.map(personOf), basis: "named", missing, fellBack: false };
    return { people: shortlistOf(rows), basis: "shortlist", missing, fellBack: true };
  }
  return { people: shortlistOf(rows), basis: "shortlist", missing: 0, fellBack: false };
}

const shortlistOf = (rows: readonly ApiBoardRow[]): ScopePerson[] =>
  rows.filter((r) => r.stage === "shortlisted" || r.stage === "outreach").map(personOf);

/**
 * The names on the do-not-contact list that are a person's own (an entry added from a candidate is
 * labelled with their name; one added by address is a masked address, which names nobody).
 */
export function listedNames(labels: readonly string[]): Set<string> {
  return new Set(labels.filter((l) => !l.includes("***@")).map((l) => l.trim().toLowerCase()).filter(Boolean));
}

/** The people in scope with those on the list marked, so what is counted is what would be drafted. */
export function flagSuppressed<P extends Pick<ScopePerson, "fullName">>(people: readonly P[], names: ReadonlySet<string>): Array<P & { suppressed?: boolean }> {
  return people.map((p) => (names.has(p.fullName.trim().toLowerCase()) ? { ...p, suppressed: true } : p));
}

/** The threads that belong to the people in scope: someone passed on since being drafted drops out. */
export function threadsInScope(threads: readonly Thread[], people: readonly Pick<ScopePerson, "campaignCandidateId">[]): Thread[] {
  const ids = new Set(people.map((p) => p.campaignCandidateId));
  return threads.filter((t) => ids.has(t.campaignCandidateId));
}

/** In scope with an email and no thread yet: who a first draft can go to. The rest are counted, not dropped. */
export function unreachedOf<P extends Pick<ScopePerson, "campaignCandidateId" | "hasEmail">>(
  people: readonly P[],
  threads: readonly Pick<Thread, "campaignCandidateId">[],
): { withEmail: P[]; withoutEmail: P[] } {
  const has = new Set(threads.map((t) => t.campaignCandidateId));
  const fresh = people.filter((p) => !has.has(p.campaignCandidateId));
  return { withEmail: fresh.filter((p) => p.hasEmail), withoutEmail: fresh.filter((p) => !p.hasEmail) };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * One sentence on who this is for and who can be reached, wins first. `emailable` counts everyone in
 * scope with an email on file who may be written to (including those already drafted or sent to);
 * `listed` counts those left out because they are on the do-not-contact list.
 */
export function scopeLine(scope: Pick<Scope, "basis" | "missing" | "fellBack">, total: number, emailable: number, listed = 0): string {
  if (total === 0) {
    return scope.basis === "named"
      ? "Nobody you named is on this campaign yet."
      : "Nobody is on the shortlist yet, so there is nobody to write to.";
  }
  const who = scope.basis === "named"
    ? `You named ${total} ${plural(total, "person", "people")}`
    : `The shortlist has ${total} ${plural(total, "person", "people")}`;
  const left = listed === 1 ? "1 is on the do-not-contact list, so they are left out." : `${listed} are on the do-not-contact list, so they are left out.`;
  const reach = emailable === 0
    ? listed === total
      ? `${total === 1 ? "They are" : "All of them are"} on the do-not-contact list, so there is nothing to send.`
      : listed > 0
        ? `${left} The rest have no email on file, so there is nothing to send.`
        : "None has an email on file yet, so there is nothing to send."
    : emailable === total
      ? total === 1 ? "They can be emailed." : `All ${total} can be emailed.`
      : `${emailable} can be emailed.${listed > 0 ? ` ${left}` : ""}`;
  const extra = [
    scope.fellBack ? "I couldn't find the people you named on this campaign, so this is the shortlist." : "",
    !scope.fellBack && scope.missing > 0
      ? `${scope.missing === 1 ? "One person you named isn't" : `${scope.missing} people you named aren't`} on this campaign, so I left them out.`
      : "",
  ].filter(Boolean);
  return [`${who}. ${reach}`, ...extra].join(" ");
}

/** "Deepa Rao, Rashmi Sen and 8 more": the first few by name, the rest counted. */
export function namesLine(names: readonly string[], show = 3): { shown: string[]; more: number } {
  return { shown: names.slice(0, show), more: Math.max(0, names.length - show) };
}

/**
 * A first email, short and plain, for the recruiter to read and edit before anything goes out.
 * Uses only what is on file: their name, and their current role when there is one.
 */
export function composeFirstEmail(
  p: Pick<ScopePerson, "fullName" | "currentTitle" | "currentCompanyName">,
  campaign: string,
): { subject: string; body: string } {
  const first = p.fullName.trim().split(/\s+/)[0] ?? p.fullName;
  const work = p.currentTitle
    ? `your work as ${p.currentCompanyName ? `${p.currentTitle} at ${p.currentCompanyName}` : p.currentTitle}`
    : p.currentCompanyName ? `your work at ${p.currentCompanyName}` : null;
  const why = work
    ? `I'm hiring for ${campaign}, and ${work} looks like a good fit.`
    : `I'm hiring for ${campaign} and your background looks like a good fit.`;
  return {
    subject: `${campaign}: would you be open to a chat?`,
    body: `Hi ${first},\n\n${why} Would you be open to a short call this week?\n\nThanks`,
  };
}
