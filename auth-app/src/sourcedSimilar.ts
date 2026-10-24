/**
 * Rejecting someone for experience, when they are past the most years the role asks for, is a call about everyone like
 * them: the others still to review who are past it too. This works out who, so the page can offer them in one press
 * instead of the recruiter finding and rejecting each.
 */

export type YearsPerson = { id: string; totalYears: number };

/** Whether a rejection reason is about experience ("Experience", "too senior", "10 years"). */
export const isAboutExperience = (reason: string | undefined): boolean => Boolean(reason && /experience|senior|years/i.test(reason));

/**
 * The ids to offer: people not yet decided, past `yearsMax`, other than the one just rejected. Empty when the reason is not
 * about experience, the role sets no ceiling, or the rejected person was within it (then it is not about the ceiling).
 */
export function similarToReject(
  people: readonly YearsPerson[],
  decided: Readonly<Record<string, unknown>>,
  yearsMax: number | null,
  rejected: YearsPerson | undefined,
  reason: string | undefined,
): string[] {
  if (yearsMax === null || !rejected || !isAboutExperience(reason) || rejected.totalYears <= yearsMax) return [];
  return people.filter((p) => p.id !== rejected.id && !decided[p.id] && p.totalYears > yearsMax).map((p) => p.id);
}
