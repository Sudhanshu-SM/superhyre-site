import type { PipelinePerson } from "./campaign";

/**
 * Who on the shortlist is still to be written to. A person on the do-not-contact list is shortlisted
 * but never "waiting to be contacted": every number and name list that says who is left to reach
 * reads this, so the Overview caption, the Shortlisted header and the Agents panel agree with the
 * Outreach review (the server's one rule marks them on the board as `doNotContact`).
 */
export function shortlistSplit<T extends Pick<PipelinePerson, "stage" | "doNotContact">>(
  people: readonly T[],
): { shortlisted: T[]; toContact: T[]; listed: T[] } {
  const shortlisted = people.filter((p) => p.stage === "shortlisted");
  return {
    shortlisted,
    toContact: shortlisted.filter((p) => !p.doNotContact),
    listed: shortlisted.filter((p) => p.doNotContact),
  };
}

/** The Shortlisted column's first tooltip line: how many are on the shortlist, who is left to contact and who is held back. */
export function shortlistTip(total: number, toContact: number, names: string, listed: number): string {
  if (!total) return "Nobody is shortlisted yet";
  const left = `${toContact} still waiting to be contacted${toContact && names ? `: ${names}` : ""}`;
  return `${total} shortlisted in all, ${left}${listed ? `, ${listed} on the do-not-contact list` : ""}`;
}

/** The Shortlisted header's count of people not contacted yet: only those who can be. */
export const notContactedYet = (people: readonly Pick<PipelinePerson, "stage" | "doNotContact">[]): number =>
  shortlistSplit(people).toContact.length;
